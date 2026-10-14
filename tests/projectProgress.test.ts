import { it, expect, beforeEach, afterEach, vi } from "vitest";
import "fake-indexeddb/auto";
import Dexie from "dexie";
import {
    db,
    Database,
    create,
    setBranchCompletion,
    setProjectCompletion,
    remove,
    undo,
    reorder,
    update,
    snapshot,
    importBackup,
} from "../app/db";
import { validateBackup } from "../app/model";
beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-18T09:00:00Z"));
    await db.transaction("rw", db.tables, async () => {
        for (const t of db.tables) await t.clear();
    });
});
afterEach(() => vi.useRealTimers());
async function fixture() {
    const p = await create("project", "رؤى"),
        steps: string[] = [];
    for (let i = 0; i < 4; i++)
        steps.push(await create("step", `خطوة ${i}`, "", p));
    return { p, steps };
}
it("يسجل التغير الحقيقي مرة واحدة وبترتيب ثابت ولو تشابه الوقت", async () => {
    const { p, steps } = await fixture();
    for (const step of steps) {
        await setBranchCompletion(step, true);
        await setBranchCompletion(step, true);
    }
    const rows = await db.projectProgress
        .where("projectId")
        .equals(p)
        .toArray();
    expect(
        rows.filter((r) => r.reason === "completion").map((r) => r.after),
    ).toEqual([25, 50, 75, 100]);
    expect(rows.map((r) => r.order)).toEqual([1, 2, 3, 4, 5]);
    await db.close();
    await db.open();
    expect(await db.projectProgress.count()).toBe(5);
    const old = await snapshot();
    await setProjectCompletion(p, false);
    await setProjectCompletion(p, true);
    expect((await snapshot()).projectProgress).toEqual(old.projectProgress);
});
it("التراجع وتعديل الهيكل والحذف والاستعادة منفصلة عن تقدم العمل", async () => {
    const { p, steps } = await fixture();
    await setBranchCompletion(steps[0], true);
    await setBranchCompletion(steps[0], false);
    await setBranchCompletion(steps[0], true);
    const extra = await create("step", "زيادة", "", p),
        deleted = (await remove("step", extra))!;
    await undo(deleted);
    await undo(deleted);
    const rows = await db.projectProgress
        .where("projectId")
        .equals(p)
        .sortBy("order");
    expect(rows.slice(-3).map((r) => [r.reason, r.before, r.after])).toEqual([
        ["step_added", 25, 20],
        ["step_deleted", 20, 25],
        ["restore", 25, 20],
    ]);
    expect(rows.some((r) => r.reason === "reopen" && r.after === 0)).toBe(true);
    const count = rows.length;
    await reorder(steps[0], 1);
    await update("step", steps[0], { notes: "لا تغير النسبة" });
    expect(await db.projectProgress.count()).toBe(count);
});
it("إنجاز الفرع كله يسجل تغيرًا واحدًا ويتراجع ذريًا عند فشل السجل", async () => {
    const p = await create("project", "ذرية"),
        stage = await create("step", "مرحلة", "", p, null, true);
    await create("step", "واحد", "", p, stage);
    await create("step", "اثنان", "", p, stage);
    const before = await snapshot(),
        fail = () => {
            throw new Error("فشل سجل التقدم");
        };
    db.projectProgress.hook("creating", fail);
    try {
        await expect(setBranchCompletion(stage, true)).rejects.toThrow(
            "فشل سجل التقدم",
        );
    } finally {
        db.projectProgress.hook("creating").unsubscribe(fail);
    }
    const after = await snapshot();
    expect(after.steps).toEqual(before.steps);
    expect(after.projects).toEqual(before.projects);
    expect(after.projectProgress).toEqual(before.projectProgress);
    expect(after.events).toEqual(before.events);
    await setBranchCompletion(stage, true);
    expect(
        (await db.projectProgress.toArray()).filter(
            (r) => r.reason === "completion",
        ),
    ).toHaveLength(1);
});
it("حذف المشروع واستعادته يحتفظان بسجل التقدم ونقطة التتبع", async () => {
    const { p, steps } = await fixture();
    await setBranchCompletion(steps[0], true);
    const old = await snapshot();
    const d = (await remove("project", p))!;
    expect(await db.projectProgress.count()).toBe(0);
    expect(await db.projectTracking.count()).toBe(0);
    await undo(d);
    await undo(d);
    const restored = await snapshot();
    expect(restored.projectProgress).toEqual(old.projectProgress);
    expect(restored.projectTracking).toEqual(old.projectTracking);
});
it("النسخة الجديدة تحفظ السجل وتمنع السلسلة التالفة قبل الاستبدال", async () => {
    const { steps } = await fixture();
    await setBranchCompletion(steps[0], true);
    const old = await snapshot();
    expect(old.version).toBe(3);
    await importBackup(JSON.parse(JSON.stringify(old)));
    expect((await snapshot()).projectProgress).toEqual(old.projectProgress);
    for (const mutate of [
        (d: typeof old) => {
            d.projectProgress![1].before = 99;
        },
        (d: typeof old) => {
            d.projectTracking![0].lastOrder = 50;
        },
        (d: typeof old) => {
            d.projectProgress![0].projectId = "missing";
        },
    ]) {
        const bad = structuredClone(old);
        mutate(bad);
        expect(() => validateBackup(bad)).toThrow("غير صالحة");
        await expect(importBackup(bad)).rejects.toThrow();
        expect((await snapshot()).projectProgress).toEqual(old.projectProgress);
    }
});
it("استعادة v2 تسجل نقطة الحالة الحالية فقط دون اختلاق تاريخ", async () => {
    const { steps } = await fixture();
    await setBranchCompletion(steps[0], true);
    const old = await snapshot();
    const legacy = {
        ...old,
        version: 2 as const,
        projectProgress: undefined,
        projectTracking: undefined,
    };
    vi.setSystemTime(new Date("2026-10-19T09:00:00Z"));
    await importBackup(legacy);
    expect(await db.projectProgress.count()).toBe(0);
    expect((await db.projectTracking.toArray())[0]).toMatchObject({
        origin: "existing",
        initialPercent: 25,
        since: "2026-10-19T09:00:00.000Z",
    });
});
it("ترحيل Dexie2 إلى4 يحافظ على الحقول والدورات ويبدأ التتبع من اليوم", async () => {
    const data = await fixture();
    const before = await snapshot(),
        name = "history-migration-" + crypto.randomUUID(),
        old = new Dexie(name);
    old.version(2).stores({
        projects: "id,updatedAt,status,archived",
        steps: "id,projectId,parentId,order,status",
        tasks: "id,status,completedAt,schedule.repeat",
        ideas: "id,archived,updatedAt",
        events: "id,entityId,at,action",
        taskCycles:
            "id,taskId,[taskId+revision+start],[status+end],end,status,completedAt",
    });
    await old.table("projects").bulkAdd(before.projects);
    await old.table("steps").bulkAdd(before.steps);
    old.close();
    const next = new Database(name);
    try {
        await next.open();
        expect(await next.projects.toArray()).toEqual(before.projects);
        expect(await next.steps.toArray()).toEqual(before.steps);
        expect(await next.projectProgress.count()).toBe(0);
        expect(await next.projectTracking.get(data.p)).toMatchObject({
            origin: "existing",
            initialPercent: 0,
            lastOrder: 0,
        });
        expect(next.verno).toBe(4);
    } finally {
        await next.delete();
    }
});

it("تغيير البنية بالتداخل يعيد تعريف الأوراق ويُسجل كهيكل دون إنجاز عمل", async () => {
    const p = await create("project", "تداخل"),
        parent = await create("step", "أصل", "", p);
    await setBranchCompletion(parent, true);
    await create("step", "فرع جديد", "", p, parent);
    expect(
        (
            await db.projectProgress
                .where("projectId")
                .equals(p)
                .sortBy("order")
        ).at(-1),
    ).toMatchObject({ before: 100, after: 0, reason: "step_added" });
    expect(validateBackup(await snapshot()).projectProgress).toHaveLength(3);
});

it("وقت سجل الإنجاز يطابق حدث العمل عند عبور منتصف الليل أثناء المعاملة", async () => {
    const { steps } = await fixture();
    vi.setSystemTime(new Date("2026-10-18T20:59:59.999Z"));
    const jump = () => {
        vi.setSystemTime(new Date("2026-10-18T21:00:00.000Z"));
    };
    db.steps.hook("updating", jump);
    try {
        await setBranchCompletion(steps[0], true);
    } finally {
        db.steps.hook("updating").unsubscribe(jump);
    }
    const record = (await db.projectProgress.toArray()).find(
        (r) => r.reason === "completion",
    )!;
    expect(record.at).toBe((await db.steps.get(steps[0]))!.completedAt);
    expect(record.at).toBe("2026-10-18T20:59:59.999Z");
});
