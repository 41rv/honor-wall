import { it, expect, beforeEach, afterEach, vi } from "vitest";
import "fake-indexeddb/auto";
import Dexie from "dexie";
import {
    currentCycle,
    projectTask,
    validateTaskOptions,
    cycleBatch,
} from "../app/taskSchedule";
import {
    db,
    Database,
    create,
    updateTaskOptions,
    reconcileTaskCycles,
    setCycleStatus,
    changeStatus,
    snapshot,
    importBackup,
    remove,
    undo,
} from "../app/db";
import { base, validateBackup } from "../app/model";
import { priorities, type TaskSchedule } from "../app/taskTypes";
import type { Task } from "../app/model";
import {
    rememberCompletion,
    restoreCompletions,
} from "../app/completionRecovery";
const zone = "Asia/Riyadh";
const schedule = (
    repeat: TaskSchedule["repeat"],
    extra: Partial<TaskSchedule> = {},
): TaskSchedule => ({
    date: "2026-10-17",
    timeZone: zone,
    repeat,
    leadDays: 3,
    ...extra,
});
function task(s: TaskSchedule, since = "2026-10-16T09:00:00Z"): Task {
    return {
        ...base("مهمة"),
        createdAt: since,
        updatedAt: since,
        id: "t",
        status: "todo",
        schedule: s,
        scheduleSince: since,
        scheduleRevision: 1,
    };
}
function clock(at: string) {
    vi.setSystemTime(new Date(at));
    return new Date(at);
}
beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    clock("2026-10-16T09:00:00Z");
    await db.transaction("rw", db.tables, async () => {
        for (const table of db.tables) await table.clear();
    });
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});
it.each([
    "2026-10-17T07:00:00Z",
    "2026-10-18T12:00:00Z",
    "2026-10-23T19:00:00Z",
])("دورة السبت تظل قابلة للإنجاز طبيعيًا في %s", async (at) => {
    const id = await create("task", "السبت", "", undefined, null, false, {
        schedule: schedule("weekly", { weekdays: [6] }),
    });
    const now = clock(at);
    await reconcileTaskCycles(now);
    const original = (await db.tasks.get(id))!;
    const cycle = currentCycle(original, now)!;
    expect(cycle.scheduledAt).toBe("2026-10-16T21:00:00.000Z");
    expect(cycle.end).toBe("2026-10-23T21:00:00.000Z");
    await setCycleStatus(cycle.id, "done");
    expect((await db.taskCycles.get(cycle.id))?.status).toBe("completed");
    expect((await db.tasks.get(id))!.status).toBe("todo");
    expect(
        projectTask(
            original,
            new Map((await db.taskCycles.toArray()).map((c) => [c.id, c])),
            now,
        )._dueState,
    ).toBe("cycle");
});
it("دورة السبت السابقة غير مكتملة في بداية السبت التالي، ولا تتراكم المهام", async () => {
    const id = await create("task", "السبت", "", undefined, null, false, {
        schedule: schedule("weekly", { weekdays: [6] }),
    });
    const now = clock("2026-10-23T21:00:00Z");
    await reconcileTaskCycles(now);
    await reconcileTaskCycles(now);
    const rows = await db.taskCycles.toArray();
    expect(rows).toHaveLength(2);
    expect(rows.filter((c) => c.status === "incomplete")).toHaveLength(1);
    expect(rows.filter((c) => c.status === "current")).toHaveLength(1);
    expect(await db.tasks.count()).toBe(1);
    expect(currentCycle((await db.tasks.get(id))!, now)!.start).toBe(
        now.toISOString(),
    );
});
it("اليومية ذات وقت تنتهي منتصف الليل المحلي لا في اليوم التالي عند الساعة نفسها", async () => {
    const id = await create("task", "يومية", "", undefined, null, false, {
        schedule: schedule("daily", { time: "20:00" }),
    });
    const before = clock("2026-10-17T20:59:59Z");
    await reconcileTaskCycles(before);
    const cycle = currentCycle((await db.tasks.get(id))!, before)!;
    expect(cycle.end).toBe("2026-10-17T21:00:00.000Z");
    await setCycleStatus(cycle.id, "done");
    const next = clock("2026-10-17T21:00:00Z");
    await reconcileTaskCycles(next);
    expect(currentCycle((await db.tasks.get(id))!, next)!.id).not.toBe(
        cycle.id,
    );
    await expect(setCycleStatus(cycle.id, "done")).rejects.toThrow(
        "انتهت هذه الدورة",
    );
    expect(
        (await db.taskCycles.toArray()).filter((c) => c.status === "completed"),
    ).toHaveLength(1);
});
it("اليومية الفائتة تسجل مرة واحدة بعد إغلاق طويل ولو اكتملت الحالية قبل استكمال السجل", async () => {
    const id = await create("task", "يومية", "", undefined, null, false, {
        schedule: schedule("daily", { date: "2026-10-16" }),
    });
    const now = clock("2027-10-16T09:00:00Z");
    const cycle = currentCycle((await db.tasks.get(id))!, now)!;
    await setCycleStatus(cycle.id, "done");
    await reconcileTaskCycles(now);
    await reconcileTaskCycles(now);
    expect(await db.taskCycles.count()).toBe(366);
    expect((await db.taskCycles.get(cycle.id))!.status).toBe("completed");
    expect(await db.tasks.count()).toBe(1);
});
it("أيام أسبوعية متعددة تنهي كل دورة عند اليوم والساعة التاليين", () => {
    const t = task(schedule("weekly", { weekdays: [2, 6], time: "20:00" }));
    const sat = currentCycle(t, new Date("2026-10-18T12:00:00Z"))!;
    expect(sat.start).toBe("2026-10-17T17:00:00.000Z");
    expect(sat.end).toBe("2026-10-20T17:00:00.000Z");
    expect(currentCycle(t, new Date("2026-10-20T16:59:59Z"))!.id).toBe(sat.id);
    expect(currentCycle(t, new Date("2026-10-20T17:00:00Z"))!.id).not.toBe(
        sat.id,
    );
});
it.each([29, 30, 31])(
    "الشهرية يوم %s تستعمل آخر يوم في فبراير ثم تعود لليوم الأصلي",
    (day) => {
        const t = task(
            schedule("monthly", {
                date: "2027-01-01",
                monthDay: day,
                time: "20:00",
            }),
            "2027-01-01T00:00:00Z",
        );
        const jan = currentCycle(t, new Date("2027-02-01T00:00:00Z"))!;
        expect(jan.end).toBe("2027-02-28T17:00:00.000Z");
        const feb = currentCycle(t, new Date("2027-03-01T00:00:00Z"))!;
        expect(feb.end).toBe(`2027-03-${day}T17:00:00.000Z`);
    },
);
it("الشهرية تعبر السنة وتراعي السنة الكبيسة", () => {
    const t = task(
        schedule("monthly", { date: "2027-12-01", monthDay: 31 }),
        "2027-12-01T00:00:00Z",
    );
    expect(currentCycle(t, new Date("2028-01-15T00:00:00Z"))!.end).toBe(
        "2028-01-30T21:00:00.000Z",
    );
    expect(currentCycle(t, new Date("2028-02-10T00:00:00Z"))!.end).toBe(
        "2028-02-28T21:00:00.000Z",
    );
});
it("الدورات اليومية تراعي تغيير التوقيت الصيفي: ٢٣ و٢٥ ساعة", () => {
    const t = task(
        schedule("daily", { date: "2026-03-07", timeZone: "America/New_York" }),
        "2026-03-07T05:00:00Z",
    );
    const spring = currentCycle(t, new Date("2026-03-08T16:00:00Z"))!;
    expect(Date.parse(spring.end) - Date.parse(spring.start)).toBe(
        23 * 3600000,
    );
    const fall = currentCycle(t, new Date("2026-11-01T16:00:00Z"))!;
    expect(Date.parse(fall.end) - Date.parse(fall.start)).toBe(25 * 3600000);
});
it("الساعة غير الموجودة تنتقل للأمام والساعة المكررة تختار الظهور الأول", () => {
    const t = task(
        schedule("weekly", {
            date: "2026-03-01",
            weekdays: [0],
            time: "02:30",
            timeZone: "America/New_York",
        }),
        "2026-03-01T00:00:00Z",
    );
    expect(currentCycle(t, new Date("2026-03-08T08:00:00Z"))!.start).toBe(
        "2026-03-08T07:30:00.000Z",
    );
    t.schedule!.time = "01:30";
    expect(currentCycle(t, new Date("2026-11-01T07:00:00Z"))!.start).toBe(
        "2026-11-01T05:30:00.000Z",
    );
});
it.each([0, 1, 3, 7])(
    "فترة الاقتراب %s أيام تظهر في حدودها وتخفي الاقتراب قبلها",
    (days) => {
        const t = task(
            schedule("none", {
                date: "2026-10-20",
                leadDays: days as 0 | 1 | 3 | 7,
            }),
        );
        const now = new Date(
            `2026-10-${String(20 - days).padStart(2, "0")}T09:00:00Z`,
        );
        expect(projectTask(t, new Map(), now)._dueState).toBe(
            days === 0 ? "today" : "near",
        );
        const earlier = new Date(now.getTime() - 86400000);
        expect(projectTask(t, new Map(), earlier)._dueState).toBe("future");
    },
);
it("بدون موعد لا تتأخر، والتاريخ وحده يتأخر في بداية اليوم التالي، والوقت بعد تجاوزه", () => {
    const general: Task = { ...base("عامة"), status: "todo" };
    expect(
        projectTask(general, new Map(), new Date("2099-01-01T00:00:00Z"))
            ._dueState,
    ).toBe("general");
    const t = task(schedule("none"));
    expect(
        projectTask(t, new Map(), new Date("2026-10-17T20:59:59Z"))._dueState,
    ).toBe("today");
    expect(
        projectTask(t, new Map(), new Date("2026-10-17T21:00:00Z"))._dueState,
    ).toBe("overdue");
    t.schedule!.time = "17:00";
    expect(
        projectTask(t, new Map(), new Date("2026-10-17T14:00:00Z"))._dueState,
    ).toBe("today");
    expect(
        projectTask(t, new Map(), new Date("2026-10-17T14:00:01Z"))._dueState,
    ).toBe("overdue");
});
it("لا ينشئ تواريخ قبل وجود المهمة، ويسمح بالدورة الجزئية في يوم إنشائها", () => {
    const t = task(
        schedule("weekly", { weekdays: [6] }),
        "2026-10-17T09:00:00Z",
    );
    expect(currentCycle(t, new Date("2026-10-17T12:00:00Z"))!.start).toBe(
        "2026-10-17T09:00:00.000Z",
    );
    expect(
        cycleBatch(t, new Date("2026-10-24T00:00:00Z"), undefined),
    ).toHaveLength(2);
});
it.each([
    { schedule: schedule("weekly", { weekdays: [] }) },
    { schedule: schedule("weekly", { weekdays: [6, 6] }) },
    { schedule: schedule("monthly", { monthDay: 32 }) },
    { schedule: schedule("none", { date: "2026-02-30" }) },
    { schedule: schedule("daily", { time: "25:00" }) },
    { schedule: schedule("daily", { timeZone: "invalid" }) },
    { priority: "invalid" },
])("يرفض إعدادات غير صالحة %j", (input) =>
    expect(() => validateTaskOptions(input as never)).toThrow(),
);
it("الألوان الأربعة ثابتة والتصنيف اختياري", () => {
    expect(Object.values(priorities).map((p) => p.color)).toEqual([
        "#DC5757",
        "#3988D7",
        "#E6A33D",
        "#8B929D",
    ]);
    expect(validateTaskOptions({})).toEqual({ priority: undefined });
});
it("تعديل الموعد لمهمة عامة مكتملة يحافظ على الإنجاز والملاحظات والمعرف", async () => {
    const id = await create("task", "عامة", "ملاحظات");
    await changeStatus("task", id, "done");
    const old = (await db.tasks.get(id))!;
    await updateTaskOptions(id, {
        schedule: schedule("none"),
        priority: "important",
    });
    const updated = (await db.tasks.get(id))!;
    expect(updated.completedAt).toBe(old.completedAt);
    expect(updated.id).toBe(id);
    expect(updated.notes).toBe(old.notes);
    await updateTaskOptions(id, {});
    expect((await db.tasks.get(id))!.status).toBe("done");
});
it("تغيير التكرار يحفظ الدورات السابقة ويبدأ نسخة جديدة دون مضاعفتها", async () => {
    const id = await create(
        "task",
        "متكررة",
        "ملاحظات",
        undefined,
        null,
        false,
        { schedule: schedule("daily", { date: "2026-10-16" }) },
    );
    clock("2026-10-17T09:00:00Z");
    await reconcileTaskCycles();
    const t = (await db.tasks.get(id))!;
    const c = currentCycle(t)!;
    await setCycleStatus(c.id, "done");
    await updateTaskOptions(id, {
        schedule: schedule("weekly", { date: "2026-10-17", weekdays: [6] }),
    });
    const rows = await db.taskCycles.toArray();
    expect(rows.find((x) => x.id === c.id)!.status).toBe("completed");
    expect(rows.find((x) => x.id === c.id)!.closedReason).toBe(
        "schedule_changed",
    );
    expect((await db.tasks.get(id))!.scheduleRevision).toBe(2);
    await reconcileTaskCycles();
    expect(await db.taskCycles.count()).toBe(rows.length);
    await updateTaskOptions(id, {});
    expect((await db.tasks.get(id))!.schedule).toBeUndefined();
    expect((await db.tasks.get(id))!.notes).toBe("ملاحظات");
});
it("تحويل مهمة مكتملة إلى متكررة يحفظ إنجازها ولو خلت النسخة القديمة من الأحداث", async () => {
    const id = await create("task", "قديمة");
    await changeStatus("task", id, "done");
    await db.events.clear();
    await updateTaskOptions(id, {
        schedule: schedule("daily", { date: "2026-10-16" }),
    });
    expect(
        (await db.taskCycles.toArray()).find((c) => c.source === "legacy")!
            .completedAt,
    ).toBe("2026-10-16T09:00:00.000Z");
});
it("الضغط المتكرر والتراجع لا يضاعفان الدورة أو أحداث الحالة نفسها", async () => {
    const id = await create("task", "متكررة", "", undefined, null, false, {
        schedule: schedule("daily", { date: "2026-10-16" }),
    });
    const c = currentCycle((await db.tasks.get(id))!)!;
    await Promise.all(
        Array.from({ length: 12 }, () => setCycleStatus(c.id, "done")),
    );
    expect(await db.taskCycles.count()).toBe(1);
    expect(await db.events.where("action").equals("completed").count()).toBe(1);
    await setCycleStatus(c.id, "todo");
    expect((await db.taskCycles.get(c.id))!.completedAt).toBeUndefined();
    expect((await db.tasks.get(id))!.status).toBe("todo");
});
it("فشل الحفظ الذري لا يترك إنجازًا أو حدثًا جزئيًا", async () => {
    const id = await create("task", "متكررة", "", undefined, null, false, {
        schedule: schedule("daily", { date: "2026-10-16" }),
    });
    const c = currentCycle((await db.tasks.get(id))!)!;
    const fail = () => {
        throw new Error("فشل تجريبي");
    };
    db.events.hook("creating", fail);
    try {
        await expect(setCycleStatus(c.id, "done")).rejects.toThrow("فشل");
    } finally {
        db.events.hook("creating").unsubscribe(fail);
    }
    expect((await db.taskCycles.get(c.id))!.status).toBe("current");
});
it("الحذف والتراجع يستعيدان السجل والمعرف مرة واحدة", async () => {
    const id = await create("task", "متكررة", "", undefined, null, false, {
        schedule: schedule("daily", { date: "2026-10-16" }),
    });
    const old = await snapshot();
    const deleted = (await remove("task", id))!;
    expect(await db.taskCycles.count()).toBe(0);
    await undo(deleted);
    await undo(deleted);
    expect((await snapshot()).taskCycles).toEqual(old.taskCycles);
});
it("نسخة v2 تحفظ الدورة والأولوية والموعد وتستعاد، وv1 القديمة تظل مدعومة", async () => {
    const id = await create(
        "task",
        "متكررة",
        "ملاحظات",
        undefined,
        null,
        false,
        {
            schedule: schedule("daily", { date: "2026-10-16" }),
            priority: "urgent",
        },
    );
    await setCycleStatus(currentCycle((await db.tasks.get(id))!)!.id, "done");
    const data = await snapshot();
    expect(data.version).toBe(5);
    expect(
        validateBackup(JSON.parse(JSON.stringify(data))).taskCycles,
    ).toHaveLength(1);
    await importBackup(data);
    expect((await snapshot()).taskCycles).toEqual(data.taskCycles);
    const bad = structuredClone(data);
    bad.taskCycles![0].taskId = "missing";
    await expect(importBackup(bad)).rejects.toThrow("النسخة غير صالحة");
    expect(await db.tasks.count()).toBe(1);
    await importBackup({
        version: 1,
        exportedAt: new Date().toISOString(),
        projects: [],
        steps: [],
        tasks: [{ ...base("قديمة"), status: "todo" }],
        ideas: [],
        events: [],
    });
    expect(await db.taskCycles.count()).toBe(0);
    expect((await db.tasks.toArray())[0].title).toBe("قديمة");
});
it("ترحيل Dexie 1 إلى 2 يحافظ على الصفوف القديمة حرفيًا", async () => {
    const name = "migration-" + crypto.randomUUID();
    const old = new Dexie(name);
    old.version(1).stores({
        projects: "id,updatedAt,status,archived",
        steps: "id,projectId,parentId,order,status",
        tasks: "id,status,completedAt",
        ideas: "id,archived,updatedAt",
        events: "id,entityId,at,action",
    });
    const item = {
        ...base("مهمة قديمة", "ملاحظات أصلية"),
        status: "done",
        completedAt: new Date().toISOString(),
    };
    await old.table("tasks").add(item);
    old.close();
    const migrated = new Database(name);
    await migrated.open();
    expect(await migrated.tasks.get(item.id)).toEqual(item);
    expect(await migrated.taskCycles.count()).toBe(0);
    expect(migrated.verno).toBe(db.verno);
    await migrated.delete();
});
it("استعادة نية الإنجاز بعد منتصف الليل تبقى في دورتها الأصلية", async () => {
    const storage: Record<string, unknown> = {};
    Object.assign(storage, {
        setItem: (k: string, v: string) => {
            storage[k] = v;
        },
        getItem: (k: string) => storage[k] ?? null,
        removeItem: (k: string) => {
            delete storage[k];
        },
    });
    vi.stubGlobal("localStorage", storage);
    const id = await create("task", "يومية", "", undefined, null, false, {
        schedule: schedule("daily", { date: "2026-10-16" }),
    });
    clock("2026-10-16T20:59:59Z");
    const c = currentCycle((await db.tasks.get(id))!)!;
    rememberCompletion("taskCycle/" + c.id, true, new Date().toISOString());
    clock("2026-10-16T21:00:00Z");
    await reconcileTaskCycles();
    await restoreCompletions();
    expect((await db.taskCycles.get(c.id))!.status).toBe("completed");
    expect(
        (await db.taskCycles.get(currentCycle((await db.tasks.get(id))!)!.id))!
            .status,
    ).toBe("current");
});
it("النسخة الجديدة ترفض مؤشرًا تالفًا أو دورة متداخلة دون تعديل البيانات", async () => {
    const id = await create("task", "يومية", "", undefined, null, false, {
        schedule: schedule("daily", { date: "2026-10-16" }),
    });
    const data = await snapshot();
    for (const change of [
        (d: typeof data) => {
            d.tasks[0].scheduleCursor = "invalid";
        },
        (d: typeof data) => {
            d.tasks[0].scheduleCursor = "2028-01-01T00:00:00.000Z";
        },
        (d: typeof data) => {
            d.taskCycles![0].end = "2026-10-18T21:00:00.000Z";
        },
        (d: typeof data) => {
            d.taskCycles![0].timeZone = "";
        },
    ]) {
        const bad = structuredClone(data);
        change(bad);
        await expect(importBackup(bad)).rejects.toThrow("النسخة غير صالحة");
        expect((await db.tasks.get(id))!.title).toBe("يومية");
    }
});
it("تغيير الأولوية أو فترة الاقتراب لا يغلق دورة التكرار ولا ينشئ مراجعة جديدة", async () => {
    const id = await create("task", "يومية", "", undefined, null, false, {
        schedule: schedule("daily", { date: "2026-10-16" }),
    });
    const original = (await db.tasks.get(id))!;
    const rows = await db.taskCycles.toArray();
    await updateTaskOptions(id, {
        schedule: { ...original.schedule!, leadDays: 7 },
        priority: "important-urgent",
    });
    expect((await db.tasks.get(id))!.scheduleRevision).toBe(
        original.scheduleRevision,
    );
    expect(await db.taskCycles.toArray()).toEqual(rows);
});
it("إعادة الحساب المتزامنة لا تضاعف الدورات", async () => {
    await create("task", "يومية", "", undefined, null, false, {
        schedule: schedule("daily", { date: "2026-10-16" }),
    });
    clock("2026-10-19T09:00:00Z");
    await Promise.all(Array.from({ length: 6 }, () => reconcileTaskCycles()));
    expect(await db.taskCycles.count()).toBe(4);
});
it("معرف دورة تالف يُرفض برسالة واضحة", async () => {
    for (const key of ["null", "{}", "[]", "[1,2,3]"])
        await expect(setCycleStatus(key, "done")).rejects.toThrow(
            "الدورة غير موجودة",
        );
    expect(await db.taskCycles.count()).toBe(0);
});
it("التغيير الفاشل يحافظ على الجدول والسجل كاملًا", async () => {
    const id = await create("task", "يومية", "", undefined, null, false, {
        schedule: schedule("daily", { date: "2026-10-16" }),
    });
    const before = await snapshot();
    const fail = () => {
        throw new Error("فشل تجريبي");
    };
    db.taskCycles.hook("creating", fail);
    try {
        await expect(
            updateTaskOptions(id, {
                schedule: schedule("weekly", {
                    date: "2026-10-16",
                    weekdays: [5],
                }),
            }),
        ).rejects.toThrow("فشل");
    } finally {
        db.taskCycles.hook("creating").unsubscribe(fail);
    }
    const after = await snapshot();
    expect(after.tasks).toEqual(before.tasks);
    expect(after.taskCycles).toEqual(before.taskCycles);
});
it("الدورة اليومية المستقبلية تعرض موعد الساعة المختارة لا منتصف الليل", () => {
    const t = task(schedule("daily", { date: "2026-10-17", time: "20:00" }));
    const view = projectTask(t, new Map(), new Date("2026-10-16T09:00:00Z"));
    expect(view._available).toBe(false);
    expect(view._dueState).toBe("future");
    expect(view._next).toBe("2026-10-17T17:00:00.000Z");
});

it.each(["completedAt", "startedAt"] as const)(
    "النسخة ترفض %s عند نهاية دورة عادية دون استبدال بيانات المستخدم",
    async (field) => {
        const id = await create(
            "task",
            "دورة آمنة",
            "ملاحظات",
            undefined,
            null,
            false,
            {
                schedule: schedule("daily", { date: "2026-10-16" }),
            },
        );
        const original = await snapshot();
        for (const timestamp of [
            original.taskCycles![0].end,
            new Date(
                Date.parse(original.taskCycles![0].start) - 1,
            ).toISOString(),
        ]) {
            const malformed = structuredClone(original);
            const cycle = malformed.taskCycles![0];
            cycle[field] = timestamp;
            if (field === "completedAt") cycle.status = "completed";
            await expect(importBackup(malformed)).rejects.toThrow(
                "النسخة غير صالحة",
            );
        }
        expect(await db.tasks.get(id)).toEqual(original.tasks[0]);
        expect(await db.taskCycles.toArray()).toEqual(original.taskCycles);
    },
);

it("إغلاق الجدول في نفس لحظة الإنجاز يبقى نسخة صالحة دون فقد السجل", async () => {
    const id = await create("task", "تغيير فوري", "", undefined, null, false, {
        schedule: schedule("daily", { date: "2026-10-16" }),
    });
    const cycle = currentCycle((await db.tasks.get(id))!)!;
    await setCycleStatus(cycle.id, "doing");
    await setCycleStatus(cycle.id, "done");
    await updateTaskOptions(id, {});
    const data = await snapshot();
    expect(data.taskCycles![0].end).toBe(data.taskCycles![0].completedAt);
    await importBackup(JSON.parse(JSON.stringify(data)));
    expect((await snapshot()).taskCycles).toEqual(data.taskCycles);
});

it("استعادة جارٍ العمل تحفظ وقت الطلب وتستمر مرة واحدة بعد إعادة الفتح", async () => {
    const storage: Record<string, unknown> = {};
    Object.assign(storage, {
        setItem: (k: string, v: string) => {
            storage[k] = v;
        },
        getItem: (k: string) => storage[k] ?? null,
        removeItem: (k: string) => {
            delete storage[k];
        },
    });
    vi.stubGlobal("localStorage", storage);
    const id = await create(
        "task",
        "استعادة العمل",
        "",
        undefined,
        null,
        false,
        {
            schedule: schedule("daily", { date: "2026-10-16" }),
        },
    );
    const at = clock("2026-10-16T10:00:00Z").toISOString();
    const cycle = currentCycle((await db.tasks.get(id))!)!;
    rememberCompletion("taskCycle/" + cycle.id, false, at, "doing");
    clock("2026-10-16T11:00:00Z");
    await restoreCompletions();
    const recovered = (await db.taskCycles.get(cycle.id))!;
    expect(recovered.workStatus).toBe("doing");
    expect(recovered.startedAt).toBe(at);
    expect(recovered.status).toBe("current");
    const events = await db.events.toArray();
    await restoreCompletions();
    expect(await db.events.toArray()).toEqual(events);
    expect(validateBackup(await snapshot()).taskCycles![0]).toEqual(recovered);
});

it("تعديل أيام الأسبوع بترتيب مختلف والأولوية فقط يحافظ على الدورة المكتملة", async () => {
    const id = await create("task", "أسبوعية", "", undefined, null, false, {
        schedule: schedule("weekly", { date: "2026-10-16", weekdays: [5, 2] }),
    });
    const original = (await db.tasks.get(id))!;
    await setCycleStatus(currentCycle(original)!.id, "done");
    const cycles = await db.taskCycles.toArray();
    await updateTaskOptions(id, {
        schedule: { ...original.schedule!, weekdays: [5, 2], leadDays: 7 },
        priority: "important",
    });
    expect((await db.tasks.get(id))!.scheduleRevision).toBe(
        original.scheduleRevision,
    );
    expect(await db.taskCycles.toArray()).toEqual(cycles);
});

it("تغيير منطقة الجدول يحفظ تاريخ المنطقة السابقة ولا ينسب طلبًا قديمًا للجديدة", async () => {
    const id = await create("task", "مناطق", "", undefined, null, false, {
        schedule: schedule("daily", { date: "2026-10-16" }),
    });
    const oldCycle = currentCycle((await db.tasks.get(id))!)!;
    clock("2026-10-16T10:00:00Z");
    await setCycleStatus(oldCycle.id, "done");
    const changedAt = clock("2026-10-16T11:00:00Z");
    await updateTaskOptions(id, {
        schedule: schedule("daily", {
            date: "2026-10-16",
            timeZone: "America/New_York",
        }),
    });
    const newCycle = currentCycle((await db.tasks.get(id))!, changedAt)!;
    expect(newCycle.timeZone).toBe("America/New_York");
    expect((await db.taskCycles.get(oldCycle.id))!.timeZone).toBe(zone);
    await expect(setCycleStatus(oldCycle.id, "done")).rejects.toThrow(
        "انتهت هذه الدورة",
    );
    expect((await db.taskCycles.get(newCycle.id))!.status).toBe("current");
    expect(validateBackup(await snapshot()).taskCycles).toHaveLength(2);
});
