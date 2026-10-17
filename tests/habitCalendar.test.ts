import { describe, it, expect } from "vitest";
import {
    addHabitDays,
    habitDate,
    habitDayBounds,
    effectiveHabitPlan,
    habitDay,
    habitCommitment,
    habitToday,
} from "../app/habitCalendar";
import type {
    Habit,
    HabitPlan,
    HabitPath,
    HabitEntry,
} from "../app/habitTypes";
const stamp = "2026-10-01T00:00:00.000Z";
const habit: Habit = {
    id: "h",
    title: "عادة",
    kind: "simple",
    pathId: null,
    timeZone: "Asia/Riyadh",
    createdAt: stamp,
    updatedAt: stamp,
    archived: false,
    pauses: [],
};
const plan: HabitPlan = {
    id: "p",
    habitId: "h",
    revision: 1,
    createdAt: stamp,
    effectiveDate: "2026-10-01",
    timeZone: habit.timeZone,
    pathId: null,
    schedule: { repeat: "daily" },
    phases: [],
};
const path: HabitPath = {
    id: "path",
    title: "مسار",
    order: 0,
    createdAt: stamp,
    updatedAt: stamp,
    pauses: [],
};
function entry(date: string, done = true): HabitEntry {
    const d = habitDayBounds(date, habit.timeZone);
    return {
        id: date,
        habitId: habit.id,
        planId: plan.id,
        localDate: date,
        dayStart: new Date(d.start).toISOString(),
        dayEnd: new Date(d.end).toISOString(),
        timeZone: habit.timeZone,
        recordedAt: new Date(d.start + 3600000).toISOString(),
        updatedAt: new Date(d.start + 3600000).toISOString(),
        result: { kind: "simple", done },
    };
}
const at = new Date("2026-10-04T12:00:00Z");
describe("التقويم والالتزام: أيام مغلقة مؤهلة فقط", () => {
    it.each([
        ["2026-10-03T20:59:59Z", "2026-10-03"],
        ["2026-10-03T21:00:00Z", "2026-10-04"],
        ["2026-12-31T21:00:00Z", "2027-01-01"],
    ])("التوقيت المحلي %s", (instant, date) =>
        expect(habitDate(new Date(instant), habit.timeZone)).toBe(date),
    );
    it.each([
        ["2026-03-08", 23],
        ["2026-11-01", 25],
    ])("طول اليوم فيDST %s", (date, hours) => {
        const b = habitDayBounds(date, "America/New_York");
        expect((b.end - b.start) / 3600000).toBe(hours);
    });
    it("يعبر السنة والكبيسة دون24ساعة ثابتة", () => {
        expect(addHabitDays("2026-12-31", 1)).toBe("2027-01-01");
        expect(addHabitDays("2028-02-28", 1)).toBe("2028-02-29");
    });
    it.each(["2026-02-31", "2026-13-01", "bad", "2026-1-01"])(
        "يرفض تاريخًا غير قانوني %s",
        (d) => expect(() => habitDayBounds(d, habit.timeZone)).toThrow(),
    );
    it("آخر مراجعة لليوم نفسه هي الفعالة دون تعديل السابقة", () => {
        const later = { ...plan, id: "p2", revision: 2 };
        expect(effectiveHabitPlan([later, plan], "2026-10-04")?.id).toBe("p2");
        expect(effectiveHabitPlan([plan], "2026-09-30")).toBeUndefined();
    });
    it("اليوم الجاري مفتوح حتى مع وجودإنجاز، والمستقبل ليس إخفاقًا", () => {
        expect(habitDay(habit, [plan], [], [], "2026-10-04", at).state).toBe(
            "open",
        );
        expect(habitDay(habit, [plan], [], [], "2026-10-05", at).state).toBe(
            "future",
        );
        expect(
            habitCommitment(
                habit,
                [plan],
                [],
                [entry("2026-10-01"), entry("2026-10-04")],
                "2026-10-01",
                "2026-10-31",
                at,
            ),
        ).toEqual({ eligible: 3, done: 1, percent: 33 });
    });
    it("لا100% وهمية عند غيابالأيام", () =>
        expect(
            habitCommitment(
                habit,
                [plan],
                [],
                [],
                "2026-10-04",
                "2026-10-31",
                at,
            ),
        ).toEqual({ eligible: 0, done: 0, percent: null }));
    it("الأيام المحددة فقط تدخل المقام", () => {
        const weekly = {
            ...plan,
            schedule: { repeat: "weekly" as const, weekdays: [4, 6] },
        };
        expect(
            habitCommitment(
                habit,
                [weekly],
                [],
                [entry("2026-10-02")],
                "2026-10-01",
                "2026-10-04",
                at,
            ),
        ).toEqual({ eligible: 2, done: 0, percent: 0 });
    });
    it("الإنجاز الاختياري لا يضخم الالتزام", () => {
        const weekly = {
            ...plan,
            schedule: { repeat: "weekly" as const, weekdays: [4] },
        };
        expect(
            habitDay(
                habit,
                [weekly],
                [],
                [entry("2026-10-02")],
                "2026-10-02",
                at,
            ).state,
        ).toBe("unscheduled");
        expect(
            habitCommitment(
                habit,
                [weekly],
                [],
                [entry("2026-10-02")],
                "2026-10-01",
                "2026-10-03",
                at,
            ).done,
        ).toBe(0);
    });
    it("يوم الإيقاف والاستئناف الجزئي محايدان حتى لوأُنجزا", () => {
        const paused = {
            ...habit,
            pauses: [
                {
                    start: "2026-10-01T10:00:00.000Z",
                    end: "2026-10-02T10:00:00.000Z",
                },
            ],
        };
        expect(
            habitCommitment(
                paused,
                [plan],
                [],
                [entry("2026-10-01"), entry("2026-10-02")],
                "2026-10-01",
                "2026-10-03",
                at,
            ),
        ).toEqual({ eligible: 1, done: 0, percent: 0 });
    });
    it("استئناف عند منتصفالليل يسمح باليوم الكامل التالي", () => {
        const paused = {
            ...habit,
            pauses: [{ start: stamp, end: "2026-10-02T21:00:00.000Z" }],
        };
        expect(habitDay(paused, [plan], [], [], "2026-10-03", at).neutral).toBe(
            false,
        );
    });
    it("اتحاد إيقافالمسار والعادة لا يخصم اليوممرتين", () => {
        const h = {
                ...habit,
                pathId: path.id,
                pauses: [{ start: stamp, end: "2026-10-02T21:00:00.000Z" }],
            },
            p = { ...plan, pathId: path.id },
            pa = {
                ...path,
                pauses: [
                    {
                        start: "2026-10-02T09:00:00.000Z",
                        end: "2026-10-03T09:00:00.000Z",
                    },
                ],
            };
        expect(
            habitCommitment(h, [p], [pa], [], "2026-10-01", "2026-10-03", at)
                .eligible,
        ).toBe(0);
    });
    it("النقل يحفظ نسبة المسارالسابق ولاينقلها للجديد", () => {
        const a = { ...plan, pathId: path.id },
            b = {
                ...plan,
                id: "next",
                revision: 2,
                pathId: null,
                effectiveDate: "2026-10-03",
            };
        expect(
            habitCommitment(
                habit,
                [a, b],
                [path],
                [entry("2026-10-01")],
                "2026-10-01",
                "2026-10-03",
                at,
                path.id,
            ),
        ).toEqual({ eligible: 2, done: 1, percent: 50 });
    });
    it("لا تُنقل سجلات الأيام عند تغيير توقيتالجهاز", () => {
        const u = new Date("2026-10-03T22:00:00Z");
        expect(habitDate(u, "Asia/Riyadh")).toBe("2026-10-04");
        expect(habitDate(u, "America/Los_Angeles")).toBe("2026-10-03");
    });
    it("مهاماليوم تبدأغيرالمنجز وتحفظ المكتمل مرةواحدة", () => {
        const h2 = { ...habit, id: "b", title: "الثانية" },
            p2 = { ...plan, id: "bplan", habitId: "b" };
        const e = entry("2026-10-04");
        expect(
            habitToday([habit, h2], [plan, p2], [], [e], at).map(
                (r) => r.habit.id,
            ),
        ).toEqual(["b", "h"]);
    });
    it("الإيقافيخفي المطالبة فورًا ولايمنعاليومالمحايد بعداستئناف", () => {
        const h = { ...habit, pauses: [{ start: "2026-10-04T10:00:00.000Z" }] };
        expect(habitToday([h], [plan], [], [], at)).toHaveLength(0);
        const resumed = {
            ...h,
            pauses: [
                {
                    start: "2026-10-04T10:00:00.000Z",
                    end: "2026-10-04T11:00:00.000Z",
                },
            ],
        };
        const rows = habitToday([resumed], [plan], [], [], at);
        expect(rows).toHaveLength(1);
        expect(rows[0].neutral).toBe(true);
    });
    it("استئناف المسار لايلغي الإيقافالمستقل", () => {
        const h = { ...habit, pathId: path.id, pauses: [{ start: stamp }] },
            p = { ...plan, pathId: path.id };
        expect(habitToday([h], [p], [path], [], at)).toHaveLength(0);
    });
    it("الأرشيف والمستقبل والمتدرج لا يدخلون بطاقةاليوم", () => {
        expect(
            habitToday(
                [
                    { ...habit, archived: true },
                    { ...habit, id: "g", kind: "graded" },
                ],
                [plan],
                [],
                [],
                at,
            ),
        ).toHaveLength(0);
        expect(
            habitToday(
                [habit],
                [{ ...plan, effectiveDate: "2026-11-01" }],
                [],
                [],
                at,
            ),
        ).toHaveLength(0);
    });
});
it("العضويةالجديدةفيالمسارالموقوفتسريغدًابلا تغييرمطالبةاليوم", () => {
    const h = { ...habit, pathId: path.id },
        future = {
            ...plan,
            id: "future",
            revision: 2,
            pathId: path.id,
            effectiveDate: "2026-10-05",
        };
    const pausedPath = { ...path, pauses: [{ start: stamp }] };
    expect(habitToday([h], [plan, future], [pausedPath], [], at)).toHaveLength(
        1,
    );
    expect(
        habitToday(
            [h],
            [plan, future],
            [pausedPath],
            [],
            new Date("2026-10-05T12:00:00Z"),
        ),
    ).toHaveLength(0);
});
