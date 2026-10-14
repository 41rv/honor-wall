import { it, expect } from "vitest";
import {
    calendarEntries,
    calendarForecasts,
    weekStart,
    weekBounds,
} from "../app/weekCalendar";
import { currentCycle } from "../app/taskSchedule";
import type { Task } from "../app/model";
import type { TaskSchedule, TaskCycle } from "../app/taskTypes";
const zone = "Asia/Riyadh";
function task(
    repeat: TaskSchedule["repeat"],
    extra: Partial<TaskSchedule> = {},
): Task {
    return {
        id: repeat,
        title: repeat,
        notes: "",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        status: "todo",
        scheduleSince: "2026-01-01T00:00:00.000Z",
        scheduleRevision: 1,
        schedule: {
            date: "2026-01-01",
            repeat,
            timeZone: zone,
            leadDays: 1,
            ...extra,
        },
    };
}
it("الأسبوع يبدأ السبت ويعبر السنة ويحتوي سبعة أيام محلية", () => {
    expect(weekStart(new Date("2027-01-01T12:00:00Z"), zone)).toBe(
        "2026-12-26",
    );
    expect(weekBounds("2026-12-26", zone)).toEqual({
        start: Date.parse("2026-12-25T21:00:00Z"),
        end: Date.parse("2027-01-01T21:00:00Z"),
    });
});
it("تكرار متعدد الأيام والمستقبل للعرض فقط بلا تغيير الأصل أو السجل", () => {
    const t = task("weekly", { weekdays: [2, 6], time: "20:00" }),
        history: TaskCycle[] = [];
    const original = structuredClone(t);
    const rows = calendarEntries(
        [t],
        history,
        "2026-10-17",
        new Date("2026-10-18T09:00:00Z"),
        zone,
    );
    expect(rows.map((r) => r.day)).toEqual(["2026-10-17", "2026-10-20"]);
    expect(rows[0].task._available).toBe(true);
    expect(rows[1].future).toBe(true);
    expect(rows[1].task._available).toBe(false);
    expect(t).toEqual(original);
    expect(history).toEqual([]);
});
it("المنجزة الحالية تتطابق مع سجلها ولا تُكرر، والعامة لا تدخل التقويم", () => {
    const t = task("daily"),
        now = new Date("2026-10-18T09:00:00Z"),
        c = currentCycle(t, now)!;
    c.status = "completed";
    c.completedAt = now.toISOString();
    const general: Task = { ...t, id: "general", schedule: undefined };
    const rows = calendarEntries([t, general], [c], "2026-10-17", now, zone);
    expect(rows).toHaveLength(7);
    expect(rows.filter((r) => r.key === c.id)).toHaveLength(1);
    expect(rows.find((r) => r.key === c.id)!.task.status).toBe("done");
    expect(rows.some((r) => r.task.id === "general")).toBe(false);
});
it("الشهرية نهاية فبراير والانتقال إلى مارس لا يُسقطان الموعد", () => {
    const t = task("monthly", { monthDay: 31 });
    const rows = calendarEntries(
        [t],
        [],
        "2027-02-27",
        new Date("2027-02-27T09:00:00Z"),
        zone,
    );
    expect(rows.map((r) => r.day)).toEqual(["2027-02-28"]);
});
it("حدود الأسبوع عبر التوقيت الصيفي وتحويل الموعد إلى اليوم المحلي", () => {
    const b = weekBounds("2026-10-31", "America/New_York");
    expect((b.end - b.start) / 3600000).toBe(169);
    const t = task("none", {
        date: "2026-11-01",
        time: "01:30",
        timeZone: "America/New_York",
    });
    expect(
        calendarEntries(
            [t],
            [],
            "2026-10-31",
            new Date("2026-10-31T12:00:00Z"),
            "America/New_York",
        )[0].day,
    ).toBe("2026-11-01");
});

it("إعادة استعمال مواعيد التقويم لا تحتفظ بحالة إنجاز قديمة ولا تتيح فترة مستقبلية", () => {
    const t = task("daily"),
        now = new Date("2026-10-18T09:00:00Z"),
        c = currentCycle(t, now)!;
    const forecast = calendarForecasts([t], [c], "2026-10-17", zone);
    const completed = {
        ...c,
        status: "completed" as const,
        completedAt: now.toISOString(),
    };
    const rows = calendarEntries(
        [t],
        [completed],
        "2026-10-17",
        now,
        zone,
        forecast,
    );
    expect(rows.find((r) => r.key === c.id)!.task.status).toBe("done");
    const next = calendarEntries(
        [t],
        [completed],
        "2026-10-17",
        new Date(c.end),
        zone,
        forecast,
    );
    expect(next.find((r) => r.key === c.id)!.task._available).toBe(false);
    expect(next.find((r) => r.day === "2026-10-19")!.task._available).toBe(
        true,
    );
});
