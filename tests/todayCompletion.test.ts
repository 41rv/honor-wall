import "fake-indexeddb/auto";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
    db,
    create,
    selectTaskToday,
    changeStatus,
    setCycleStatus,
    snapshot,
    importBackup,
    reconcileTaskCycles,
} from "../app/db";
import { orderedToday } from "../app/dailyPlanning";
import { projectTask, type TaskView } from "../app/taskSchedule";
import type { TaskSchedule } from "../app/taskTypes";
const zone = "Asia/Riyadh";
const start = "2026-10-17T09:00:00Z";
const at = () => new Date();
const ordered = (rows: TaskView[]) =>
    orderedToday(rows, at(), zone).map(({ task }) => task);
async function views() {
    const cycles = new Map(
        (await db.taskCycles.toArray()).map((c) => [c.id, c]),
    );
    return (await db.tasks.toArray()).map((t) => projectTask(t, cycles, at()));
}
async function general(title: string, priority?: TaskView["priority"]) {
    const id = await create(
        "task",
        title,
        "ملاحظات ثابتة",
        undefined,
        null,
        false,
        { priority },
    );
    await selectTaskToday(id, true, at(), zone);
    return id;
}
async function scheduled(title: string, options: Partial<TaskSchedule>) {
    return create("task", title, "", undefined, null, false, {
        schedule: {
            date: "2026-10-17",
            repeat: "none",
            leadDays: 1,
            timeZone: zone,
            ...options,
        },
    });
}
beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(start));
    await db.transaction("rw", db.tables, async () => {
        for (const table of db.tables) await table.clear();
    });
});
afterEach(() => vi.useRealTimers());
it("الإضافة والإزالة لا تمسان أي خصائص أو سجل أو مشروع", async () => {
    const id = await general("مختارة", "urgent");
    const before = await snapshot();
    await selectTaskToday(id, false);
    await selectTaskToday(id, true, at(), zone);
    const after = await snapshot();
    expect(after.tasks).toEqual(before.tasks);
    expect(after.events).toEqual(before.events);
    expect(after.projects).toEqual(before.projects);
    expect(after.taskCycles).toEqual(before.taskCycles);
});
it("ينقل المكتمل بعد جميع المفتوح ويعيده لموضعه بالأولوية عند التراجع", async () => {
    const first = await general("أولى", "important-urgent");
    const second = await general("ثانية", "low");
    const third = await general("ثالثة");
    await changeStatus("task", first, "done");
    expect(ordered(await views()).map((t) => t.id)).toEqual([
        second,
        third,
        first,
    ]);
    await changeStatus("task", first, "todo");
    expect(ordered(await views()).map((t) => t.id)).toEqual([
        first,
        second,
        third,
    ]);
});
it("يرتب إنجازات اليوم بالوقت ثم المعرف ترتيبًا ثابتًا دون تعديل المصدر", async () => {
    const a = await general("أ", "important-urgent");
    const b = await general("ب", "low");
    await changeStatus("task", b, "done");
    vi.setSystemTime(new Date("2026-10-17T10:00:00Z"));
    await changeStatus("task", a, "done");
    const rows = await views();
    expect(ordered(rows).map((t) => t.id)).toEqual([b, a]);
    expect(ordered([...rows].reverse()).map((t) => t.id)).toEqual([b, a]);
    expect(rows.every((t) => t.status === "done")).toBe(true);
});
it("المختصر يخصص المقاعد الثلاثة للمفتوح قبل أي إنجاز مهما علت أولويته", async () => {
    const done = await general("مكتملة", "important-urgent");
    for (let n = 0; n < 4; n++) await general(String(n));
    await changeStatus("task", done, "done");
    const rows = ordered(await views());
    expect(rows.slice(0, 3).every((t) => t.status !== "done")).toBe(true);
    expect(rows.at(-1)!.id).toBe(done);
});
it("يبقى إنجاز المتأخرة اليوم بعد استعادة نسخة وإعادة فتح DB ويختفي غدًا دون تغيير سجلها", async () => {
    const late = await scheduled("قديمة", { date: "2026-10-16" });
    await changeStatus("task", late, "done");
    const backup = await snapshot();
    await importBackup(JSON.parse(JSON.stringify(backup)));
    db.close();
    await db.open();
    expect(ordered(await views()).map((t) => t.id)).toEqual([late]);
    vi.setSystemTime(new Date("2026-10-17T21:00:00Z"));
    expect(ordered(await views())).toEqual([]);
    expect((await db.tasks.get(late))!.status).toBe("done");
    expect(
        (await db.events.toArray()).filter((e) => e.action === "completed"),
    ).toHaveLength(1);
});
it("تبقى المتأخرة المفتوحة والعامة غير متأخرة عند اليوم التالي", async () => {
    const generalId = await general("عامة");
    const late = await scheduled("متأخرة", { date: "2026-10-16" });
    vi.setSystemTime(new Date("2026-10-17T21:00:00Z"));
    expect(ordered(await views()).map((t) => t.id)).toEqual([late]);
    expect((await views()).find((t) => t.id === generalId)!._dueState).toBe(
        "general",
    );
});
it.each(["daily", "weekly", "monthly"] as const)(
    "دورة %s: الإنجاز والتراجع وتكرار الحفظ لا ينشئان نسخة من المهمة أو الدورة",
    async (repeat) => {
        const id = await scheduled("دورية", {
            repeat,
            weekdays: repeat === "weekly" ? [6] : undefined,
            monthDay: repeat === "monthly" ? 17 : undefined,
        });
        await reconcileTaskCycles(at());
        const cycle = (await views())[0]._cycleId!;
        await setCycleStatus(cycle, "done");
        await setCycleStatus(cycle, "done");
        expect(ordered(await views())[0]).toMatchObject({
            id,
            status: "done",
            _cycleId: cycle,
        });
        expect(await db.taskCycles.count()).toBe(1);
        expect(
            (await db.events.toArray()).filter((e) => e.action === "completed"),
        ).toHaveLength(1);
        await setCycleStatus(cycle, "todo");
        expect(ordered(await views())[0].status).toBe("todo");
        expect((await db.tasks.get(id))!.status).toBe("todo");
        expect(await db.tasks.count()).toBe(1);
    },
);
it("الدورة الأسبوعية المنجزة أمس لا تبقى اليوم، والتراجع يعيد فترة السماح المفتوحة", async () => {
    await scheduled("السبت", { repeat: "weekly", weekdays: [6] });
    await reconcileTaskCycles(at());
    const cycle = (await views())[0]._cycleId!;
    await setCycleStatus(cycle, "done");
    vi.setSystemTime(new Date("2026-10-18T09:00:00Z"));
    expect(ordered(await views())).toEqual([]);
    await setCycleStatus(cycle, "todo");
    expect(ordered(await views())[0]).toMatchObject({
        status: "todo",
        _cycleId: cycle,
    });
    expect(orderedToday(await views(), at(), zone)[0].category).toBe(
        "available",
    );
});
it("منتصف الليل يفتح الدورة اليومية الصحيحة حتى لو وصل عرض الدورة السابقة متأخرًا", async () => {
    await scheduled("يومية", { repeat: "daily", time: "20:00" });
    await reconcileTaskCycles(at());
    await setCycleStatus((await views())[0]._cycleId!, "done");
    const oldRows = await views();
    vi.setSystemTime(new Date("2026-10-17T21:00:00Z"));
    const fresh = ordered(oldRows)[0];
    expect(fresh.status).toBe("todo");
    expect(fresh._cycleId).not.toBe(oldRows[0]._cycleId);
    expect(fresh.completedAt).toBeUndefined();
    await reconcileTaskCycles(at());
    expect(ordered(await views())[0]._cycleId).toBe(fresh._cycleId);
    expect(await db.taskCycles.count()).toBe(2);
});
it("تحديد اليوم المحلي يحذف إنجاز أمس حتى لو كان الموعد المجدول يوافق اليوم", async () => {
    const id = await scheduled("مبكرًا", { date: "2026-10-18" });
    await changeStatus("task", id, "done");
    vi.setSystemTime(new Date("2026-10-17T21:00:00Z"));
    expect(ordered(await views())).toEqual([]);
});

it.each([
    ["weekly", "2026-10-18"],
    ["monthly", "2026-11-17"],
] as const)(
    "%s: دورة جديدة بساعة محددة في اليوم نفسه تستبدل العرض القديم دون تكرار",
    async (repeat, boundaryDay) => {
        await scheduled("حد بساعة", {
            repeat,
            time: "20:00",
            weekdays: repeat === "weekly" ? [6, 0] : undefined,
            monthDay: repeat === "monthly" ? 17 : undefined,
        });
        vi.setSystemTime(new Date(boundaryDay + "T09:00:00Z"));
        await reconcileTaskCycles(at());
        const previousId = (await views())[0]._cycleId!;
        await setCycleStatus(previousId, "done");
        const previous = await views();
        expect(ordered(previous)[0].status).toBe("done");
        vi.setSystemTime(new Date(boundaryDay + "T17:00:00Z"));
        const next = ordered(previous);
        expect(next).toHaveLength(1);
        expect(next[0].status).toBe("todo");
        expect(next[0]._cycleId).not.toBe(previousId);
        // Rendering is read-only: reconciliation remains the sole owner of cycle creation.
        expect(await db.taskCycles.count()).toBe(1);
        await reconcileTaskCycles(at());
        expect(await db.taskCycles.count()).toBe(2);
        expect((await db.taskCycles.get(previousId))!.status).toBe("completed");
        expect((await db.tasks.toArray())[0].status).toBe("todo");
    },
);
