import { beforeEach, afterEach, it, expect, vi } from "vitest";
import "fake-indexeddb/auto";
import {
    db,
    create,
    selectTaskToday,
    changeStatus,
    snapshot,
    importBackup,
    restoreTodaySelections,
} from "../app/db";
import { todayGroups } from "../app/dailyPlanning";
import { calendarEntries } from "../app/weekCalendar";
import { periodWindows, taskMetrics } from "../app/analytics";
import { projectTask } from "../app/taskSchedule";
const zone = "Asia/Riyadh";
beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-18T09:00:00Z"));
    await db.transaction("rw", db.tables, async () => {
        for (const t of db.tables) await t.clear();
    });
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});
async function views() {
    return (await db.tasks.toArray()).map((t) =>
        projectTask(t, new Map(), new Date()),
    );
}
it("اختيار العامة وإزالتها لا يضع موعدًا أو يمس المعرف والملاحظات", async () => {
    const id = await create("task", "عامة", "أصلية");
    await Promise.all([
        selectTaskToday(id, true, new Date(), zone),
        selectTaskToday(id, true, new Date(), zone),
    ]);
    expect(
        todayGroups(await views(), new Date(), zone).selected.map((t) => t.id),
    ).toEqual([id]);
    expect((await db.tasks.get(id))!.schedule).toBeUndefined();
    await selectTaskToday(id, false);
    expect(todayGroups(await views(), new Date(), zone).selected).toHaveLength(
        0,
    );
    expect((await db.tasks.get(id))!.notes).toBe("أصلية");
});
it("عند منتصف الليل تختفي العامة المختارة دون تأخر أو دورة غير مكتملة", async () => {
    const id = await create("task", "يوم واحد");
    await selectTaskToday(id, true, new Date(), zone);
    vi.setSystemTime(new Date("2026-10-18T21:00:00Z"));
    const tasks = await views();
    expect(todayGroups(tasks, new Date(), zone).selected).toHaveLength(0);
    expect(tasks[0]._dueState).toBe("general");
    expect(await db.taskCycles.count()).toBe(0);
    expect(tasks[0].status).toBe("todo");
});
it("تفصل موعد اليوم والمتأخرة ودورة السبت المفتوحة وتمنع تكرار الاختيار", async () => {
    vi.setSystemTime(new Date("2026-10-16T09:00:00Z"));
    for (const [title, date, repeat] of [
        ["اليوم", "2026-10-18", "none"],
        ["قديم", "2026-10-17", "none"],
        ["السبت", "2026-10-17", "weekly"],
    ] as const) {
        const id = await create("task", title, "", undefined, null, false, {
            schedule: {
                date,
                repeat,
                leadDays: 1,
                timeZone: zone,
                ...(repeat === "weekly" ? { weekdays: [6] } : {}),
            },
        });
        await expect(selectTaskToday(id, true)).rejects.toThrow("العامة");
    }
    vi.setSystemTime(new Date("2026-10-18T09:00:00Z"));
    const groups = todayGroups(await views(), new Date(), zone);
    expect(groups.due.map((t) => t.title)).toEqual(["اليوم"]);
    expect(groups.overdue.map((t) => t.title)).toEqual(["قديم"]);
    expect(groups.available.map((t) => t.title)).toEqual(["السبت"]);
});
it("الإنجاز والتراجع والنسخة الاحتياطية يحفظان اختيار اليوم دون إنجاز زائف", async () => {
    const id = await create("task", "حفظ اليوم");
    await selectTaskToday(id, true, new Date(), zone);
    await changeStatus("task", id, "done");
    expect(
        todayGroups(await views(), new Date(), zone).selected[0].status,
    ).toBe("done");
    const backup = await snapshot();
    await importBackup(JSON.parse(JSON.stringify(backup)));
    await changeStatus("task", id, "todo");
    expect(
        todayGroups(await views(), new Date(), zone).selected[0].status,
    ).toBe("todo");
    const invalid = structuredClone(backup);
    invalid.tasks[0].today!.date = "2026-02-30";
    await expect(importBackup(invalid)).rejects.toThrow("غير صالحة");
    expect((await db.tasks.get(id))!.status).toBe("todo");
});

it("يستعيد اختيارًا انقطع قبل الحفظ ولا يعيد مهمة محذوفة أو ملفًا تالفًا", async () => {
    const memory: Record<string, unknown> = {};
    Object.assign(memory, {
        setItem: (k: string, v: string) => {
            memory[k] = v;
        },
        getItem: (k: string) => memory[k] ?? null,
        removeItem: (k: string) => {
            delete memory[k];
        },
    });
    vi.stubGlobal("localStorage", memory);
    const id = await create("task", "استعادة اليوم");
    for (const [key, payload] of [
        [
            id,
            JSON.stringify({
                id,
                today: { date: "2026-10-18", timeZone: zone },
            }),
        ],
        ["missing", JSON.stringify({ id: "missing", today: null })],
        ["broken", "broken"],
    ])
        localStorage.setItem(
            "masar-pending-today/" + encodeURIComponent(key),
            payload,
        );
    await restoreTodaySelections();
    expect(
        todayGroups(await views(), new Date(), zone).selected.map((t) => t.id),
    ).toEqual([id]);
    expect(await db.tasks.count()).toBe(1);
    const before = await db.tasks.toArray();
    await restoreTodaySelections();
    expect(await db.tasks.toArray()).toEqual(before);
});

it("اختيار العامة يتبع اليوم المحلي المعروض عند استعادة نسخة في منطقة أخرى", async () => {
    const id = await create("task", "يوم محلي");
    await selectTaskToday(id, true, new Date(), zone);
    const at = new Date("2026-10-18T21:00:00Z"),
        tasks = await views();
    expect(todayGroups(tasks, at, zone).selected).toHaveLength(0);
    expect(
        todayGroups(tasks, at, "America/New_York").selected.map((t) => t.id),
    ).toEqual([id]);
});

it("المتأخرة في يوم موعدها تنتقل للقسم المنفصل وتبقى قابلة للتراجع بعد إنجازها", async () => {
    const id = await create(
        "task",
        "متأخرة اليوم",
        "",
        undefined,
        null,
        false,
        {
            schedule: {
                date: "2026-10-18",
                time: "10:00",
                timeZone: zone,
                repeat: "none",
                leadDays: 1,
            },
        },
    );
    let groups = todayGroups(await views(), new Date(), zone);
    expect(groups.due).toHaveLength(0);
    expect(groups.overdue.map((t) => t.id)).toEqual([id]);
    await changeStatus("task", id, "done");
    groups = todayGroups(await views(), new Date(), zone);
    expect(groups.overdue[0].status).toBe("done");
    await changeStatus("task", id, "todo");
    expect(todayGroups(await views(), new Date(), zone).overdue[0].status).toBe(
        "todo",
    );
});

it("التاريخ بلا ساعة يظهر في يوم نهايته المحلي دون تقديمه إلى اليوم السابق عند اختلاف المنطقة", async () => {
    const id = await create("task", "تاريخ محلي", "", undefined, null, false, {
        schedule: {
            date: "2026-10-18",
            timeZone: zone,
            repeat: "none",
            leadDays: 1,
        },
    });
    const at = new Date("2026-10-18T16:00:00Z"),
        ny = "America/New_York",
        tasks = await views();
    expect(todayGroups(tasks, at, ny).due.map((t) => t.id)).toEqual([id]);
    expect(calendarEntries(tasks, [], "2026-10-17", at, ny)[0].day).toBe(
        "2026-10-18",
    );
    expect(
        taskMetrics(tasks, [], periodWindows("week", at, ny).current, ny),
    ).toMatchObject({ due: 1, pending: 1, missed: 0 });
});
