import { it, expect } from "vitest";
import { periodWindows, taskMetrics } from "../app/analytics";
import { currentCycle } from "../app/taskSchedule";
import type { Task } from "../app/model";
import { dateKey } from "../app/dateKey";
const zone = "Asia/Riyadh",
    now = new Date("2026-10-18T09:00:00Z");
it.each([
    ["2026-10-18T20:59:59Z", "Asia/Riyadh", "2026-10-18"],
    ["2026-10-18T21:00:00Z", "Asia/Riyadh", "2026-10-19"],
    ["2026-10-31T23:30:00Z", "America/New_York", "2026-10-31"],
    ["2026-11-01T05:30:00Z", "America/New_York", "2026-11-01"],
    ["2026-11-01T06:30:00Z", "America/New_York", "2026-11-01"],
])(
    "تاريخ العرض %s في %s يطابق حدود اليوم والتوقيت الصيفي",
    (at, tz, expected) => expect(dateKey(at, tz)).toBe(expected),
);
function task(id: string): Task {
    return {
        id,
        title: id,
        notes: "",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-10-18T09:00:00.000Z",
        status: "todo",
    };
}
it.each(["week", "month", "year"] as const)(
    "%s يقارن الأيام المنقضية والوقت المحلي نفسه",
    (period) => {
        const windows = periodWindows(period, now, zone);
        expect(windows.current.cutoff).toBe(now.getTime());
        expect(new Date(windows.previous.cutoff).toISOString()).toBe(
            period === "week"
                ? "2026-10-11T09:00:00.000Z"
                : period === "month"
                  ? "2026-09-18T09:00:00.000Z"
                  : "2025-10-18T09:00:00.000Z",
        );
    },
);
it("الشهر القصير يُحد المقابل بنهايته ولا يدخل بداية الشهر التالي", () => {
    const w = periodWindows("month", new Date("2027-03-31T09:00:00Z"), zone);
    expect(w.previous.cutoff).toBe(w.previous.end);
    const t = {
        ...task("boundary"),
        status: "done" as const,
        completedAt: new Date(w.previous.end).toISOString(),
    };
    expect(taskMetrics([t], [], w.previous, zone).completed).toBe(0);
});
it("فترات محلية عبر تغير التوقيت الصيفي ليست مضاعفات ثابتة من ٢٤ ساعة", () => {
    const w = periodWindows(
        "week",
        new Date("2026-11-02T17:00:00Z"),
        "America/New_York",
    );
    expect((w.current.end - w.current.start) / 3600000).toBe(169);
    expect(new Date(w.previous.cutoff).toISOString()).toBe(
        "2026-10-26T16:00:00.000Z",
    );
});
it("العامة لا تدخل نسبة الموعد، والمفتوحة ليست فائتة، والمستقبل مستبعد", () => {
    const general = {
        ...task("general"),
        status: "done" as const,
        completedAt: "2026-10-17T10:00:00.000Z",
    };
    const once = {
        ...task("once"),
        status: "done" as const,
        completedAt: "2026-10-18T08:00:00.000Z",
        schedule: {
            date: "2026-10-18",
            repeat: "none" as const,
            timeZone: zone,
            leadDays: 1 as const,
        },
    };
    const weekly = {
        ...task("weekly"),
        scheduleSince: "2026-01-01T00:00:00.000Z",
        scheduleRevision: 1,
        schedule: {
            date: "2026-01-01",
            repeat: "weekly" as const,
            weekdays: [6],
            timeZone: zone,
            leadDays: 1 as const,
        },
    };
    const daily = {
        ...weekly,
        id: "daily",
        schedule: { ...weekly.schedule, repeat: "daily" as const },
    };
    const open = currentCycle(weekly, now)!,
        missed = currentCycle(daily, new Date("2026-10-17T09:00:00Z"))!;
    missed.status = "incomplete";
    const future = currentCycle(daily, new Date("2026-10-19T09:00:00Z"))!;
    future.status = "incomplete";
    const stats = taskMetrics(
        [general, once, weekly, daily],
        [open, missed, future, open],
        periodWindows("week", now, zone).current,
        zone,
    );
    expect(stats).toMatchObject({
        completed: 2,
        due: 3,
        doneDue: 1,
        pending: 1,
        missed: 1,
        rate: 33,
        activeDays: 2,
    });
});
it("الإنجاز الفعلي للدورة يُحسب يوم حدوثه والتراجع يزيله دون مضاعفة", () => {
    const t = {
        ...task("repeat"),
        scheduleRevision: 1,
        schedule: {
            date: "2026-01-01",
            repeat: "weekly" as const,
            weekdays: [6],
            timeZone: zone,
            leadDays: 1 as const,
        },
    };
    const c = currentCycle(t, now)!;
    c.status = "completed";
    c.completedAt = now.toISOString();
    const range = periodWindows("week", now, zone).current;
    expect(taskMetrics([t], [c, c], range, zone)).toMatchObject({
        completed: 1,
        doneDue: 1,
        rate: 100,
    });
    c.status = "current";
    c.completedAt = undefined;
    expect(taskMetrics([t], [c], range, zone)).toMatchObject({
        completed: 0,
        doneDue: 0,
        pending: 1,
        missed: 0,
    });
});
it("الفترة السابقة لا تُنسب إليها إنجازات لاحقة لحد المقارنة، والفارغة نسبتها غير متاحة", () => {
    const range = periodWindows("week", now, zone).previous;
    const t = {
        ...task("later"),
        status: "done" as const,
        completedAt: "2026-10-11T10:00:00.000Z",
    };
    expect(taskMetrics([t], [], range, zone)).toMatchObject({
        completed: 0,
        rate: null,
        due: 0,
    });
});

it.each(["week", "month", "year"] as const)(
    "%s بعد منتصف الليل: لا يُحسب إنجاز الساعة القادمة ولو وقع داخل الفترة نفسها",
    (period) => {
        const at = new Date("2026-10-14T21:30:00Z");
        const range = periodWindows(period, at, zone).current;
        const done: Task = {
            ...task("actual"),
            status: "done",
            completedAt: "2026-10-14T21:15:00Z",
        };
        const future: Task = {
            ...task("future"),
            status: "done",
            completedAt: "2026-10-14T22:00:00Z",
        };
        expect(taskMetrics([done, future], [], range, zone)).toMatchObject({
            completed: 1,
            due: 0,
            rate: null,
        });
        expect(taskMetrics([future], [], range, zone).completed).toBe(0);
    },
);
