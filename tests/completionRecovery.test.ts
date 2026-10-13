import { beforeEach, afterEach, it, expect, vi } from "vitest";
import "fake-indexeddb/auto";
import { db, create, changeStatus } from "../app/db";
import { createCompletionQueue } from "../app/completionQueue";
import {
    rememberCompletion,
    settleCompletion,
    restoreCompletions,
} from "../app/completionRecovery";
const key = (entity: string) =>
    "masar-pending-completion/" + encodeURIComponent(entity);
beforeEach(async () => {
    const storage: Record<string, unknown> = {};
    Object.assign(storage, {
        setItem: (name: string, value: string) => {
            storage[name] = value;
        },
        getItem: (name: string) =>
            typeof storage[name] === "string" ? storage[name] : null,
        removeItem: (name: string) => {
            delete storage[name];
        },
    });
    vi.stubGlobal("localStorage", storage);
    await db.transaction("rw", db.tables, async () => {
        for (const table of db.tables) await table.clear();
    });
});
afterEach(() => vi.unstubAllGlobals());
it("لا يمحو إنهاء كتابة قديمة طلبًا أحدث مختلفًا", () => {
    rememberCompletion("task/a", true);
    rememberCompletion("task/a", false);
    settleCompletion("task/a", true);
    expect(JSON.parse(localStorage.getItem(key("task/a"))!).desired).toBe(
        false,
    );
    settleCompletion("task/a", false);
    expect(localStorage.getItem(key("task/a"))).toBeNull();
});
it("يستعيد آخر طلب بعد إعادة التشغيل دون تكرار أحداث الإنجاز أو إعادة الفتح", async () => {
    const id = await create("task", "مهمة");
    await changeStatus("task", id, "done");
    rememberCompletion(`task/${id}`, false);
    await restoreCompletions();
    expect((await db.tasks.get(id))?.status).toBe("todo");
    expect((await db.tasks.get(id))?.completedAt).toBeUndefined();
    const count = await db.events.count();
    await restoreCompletions();
    expect(await db.events.count()).toBe(count);
    expect(localStorage.getItem(key(`task/${id}`))).toBeNull();
});
it("يفهم معرفًا عربيًا يحتوي على شرطة مائلة ورمز النسبة", async () => {
    const id = "مهمة/مسودة%";
    const at = new Date().toISOString();
    await db.tasks.put({
        id,
        title: "نص",
        notes: "محفوظ",
        createdAt: at,
        updatedAt: at,
        status: "todo",
    });
    rememberCompletion(`task/${id}`, true);
    await restoreCompletions();
    expect((await db.tasks.get(id))?.status).toBe("done");
    expect((await db.tasks.get(id))?.notes).toBe("محفوظ");
});
it("لا يعيد إنشاء عنصر محذوف ويتجاهل المسودة التالفة", async () => {
    rememberCompletion("task/missing", true);
    localStorage.setItem(key("step/invalid"), "broken");
    await restoreCompletions();
    expect(await db.tasks.count()).toBe(0);
    expect(await db.steps.count()).toBe(0);
    expect(localStorage.getItem(key("task/missing"))).toBeNull();
    expect(localStorage.getItem(key("step/invalid"))).toBeNull();
});
it("الاستعادة الفاشلة لا تغير البيانات وتبقى قابلة لإعادة المحاولة", async () => {
    const id = await create("task", "قبل الفشل");
    rememberCompletion(`task/${id}`, true);
    const fail = () => {
        throw new Error("فشل تجريبي");
    };
    db.events.hook("creating", fail);
    try {
        await expect(restoreCompletions()).rejects.toThrow("فشل تجريبي");
    } finally {
        db.events.hook("creating").unsubscribe(fail);
    }
    expect((await db.tasks.get(id))?.status).toBe("todo");
    expect(localStorage.getItem(key(`task/${id}`))).not.toBeNull();
    await restoreCompletions();
    expect((await db.tasks.get(id))?.status).toBe("done");
});
it("تجميع نيات تنتهي بالحالة نفسها يمحو المسودة بعد الكتابة المشتركة", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    const persist = vi.fn(() => gate);
    const queue = createCompletionQueue({
        intent: rememberCompletion,
        settled: settleCompletion,
    });
    for (let i = 0; i < 3; i++) queue.toggle("task/a", false, persist);
    release();
    await queue.flush();
    expect(persist).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(key("task/a"))).toBeNull();
});
it("الفشل المعلن لا يعاد تنفيذه بصمت عند فتح التطبيق", async () => {
    const queue = createCompletionQueue({
        intent: rememberCompletion,
        settled: settleCompletion,
    });
    queue.toggle("task/a", false, async () => {
        throw new Error("رفض الكتابة");
    });
    await queue.flush();
    expect(queue.state("task/a").desired).toBeNull();
    expect(localStorage.getItem(key("task/a"))).toBeNull();
});
