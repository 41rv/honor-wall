import { Temporal } from "@js-temporal/polyfill";
import type {
    Habit,
    HabitEntry,
    HabitPath,
    HabitPause,
    HabitPlan,
} from "./habitTypes";

export const habitWeek = [6, 0, 1, 2, 3, 4, 5];
export const habitDayNames = [
    "الأحد",
    "الاثنين",
    "الثلاثاء",
    "الأربعاء",
    "الخميس",
    "الجمعة",
    "السبت",
];
export function habitDate(at: Date, zone: string) {
    return Temporal.Instant.fromEpochMilliseconds(at.getTime())
        .toZonedDateTimeISO(zone)
        .toPlainDate()
        .toString();
}
export function addHabitDays(date: string, days: number) {
    return Temporal.PlainDate.from(date).add({ days }).toString();
}
export function habitDayBounds(date: string, zone: string) {
    const plain = Temporal.PlainDate.from(date);
    if (!/^\d{4}-\d\d-\d\d$/.test(date) || plain.toString() !== date)
        throw new Error("تاريخ العادة غير صالح.");
    const start = plain.toZonedDateTime(zone);
    return {
        start: start.epochMilliseconds,
        end: start.add({ days: 1 }).epochMilliseconds,
    };
}
export function effectiveHabitPlan(plans: HabitPlan[], date: string) {
    return plans
        .filter((p) => p.effectiveDate <= date)
        .reduce<HabitPlan | undefined>(
            (best, p) => (!best || p.revision > best.revision ? p : best),
            undefined,
        );
}
export function habitPaused(pauses: HabitPause[], at: Date) {
    const stamp = at.getTime();
    return pauses.some(
        (p) =>
            Date.parse(p.start) <= stamp &&
            (p.end === undefined || Date.parse(p.end) > stamp),
    );
}
function intersects(pauses: HabitPause[], start: number, end: number) {
    return pauses.some(
        (p) =>
            Date.parse(p.start) < end &&
            (p.end === undefined || Date.parse(p.end) > start),
    );
}
export type HabitDayState =
    | "before"
    | "future"
    | "neutral"
    | "unscheduled"
    | "open"
    | "done"
    | "missed";
export function habitDay(
    habit: Habit,
    plans: HabitPlan[],
    paths: HabitPath[],
    entries: HabitEntry[],
    date: string,
    at: Date,
) {
    const plan = effectiveHabitPlan(plans, date);
    const { start, end } = habitDayBounds(date, habit.timeZone);
    const entry = entries.find(
        (e) => e.habitId === habit.id && e.localDate === date,
    );
    const done =
        entry?.result.kind === "simple"
            ? entry.result.done
            : entry?.result.kind === "graded"
              ? entry.result.amount >= entry.result.threshold
              : false;
    const path = paths.find((p) => p.id === plan?.pathId);
    const scheduled =
        plan !== undefined &&
        (plan.schedule.repeat === "daily" ||
            plan.schedule.weekdays.includes(
                Temporal.PlainDate.from(date).dayOfWeek % 7,
            ));
    const neutral =
        intersects(habit.pauses, start, end) ||
        intersects(path?.pauses ?? [], start, end) ||
        intersects(plan?.detachedPath?.pauses ?? [], start, end);
    let state: HabitDayState;
    if (!plan || end <= Date.parse(habit.createdAt)) state = "before";
    else if (start > at.getTime()) state = "future";
    else if (neutral) state = "neutral";
    else if (!scheduled) state = "unscheduled";
    else if (end > at.getTime()) state = "open";
    else state = done ? "done" : "missed";
    return {
        date,
        plan,
        entry,
        done,
        state,
        scheduled,
        neutral,
        closed: end <= at.getTime(),
        eligible:
            scheduled &&
            !neutral &&
            end <= at.getTime() &&
            end > Date.parse(habit.createdAt),
        start,
        end,
    };
}
/** Dates are local calendar dates, never elapsed multiples of 24h. */
export function habitDates(from: string, to: string) {
    const dates: string[] = [];
    for (let d = from; d <= to; d = addHabitDays(d, 1)) dates.push(d);
    return dates;
}
export function habitCommitment(
    habit: Habit,
    plans: HabitPlan[],
    paths: HabitPath[],
    entries: HabitEntry[],
    from: string,
    to: string,
    at: Date,
    pathId?: string,
) {
    let eligible = 0,
        done = 0;
    for (const date of habitDates(from, to)) {
        const day = habitDay(habit, plans, paths, entries, date, at);
        if (
            day.eligible &&
            (pathId === undefined || day.plan?.pathId === pathId)
        ) {
            eligible++;
            if (day.done) done++;
        }
    }
    return {
        eligible,
        done,
        percent: eligible ? Math.round((done / eligible) * 100) : null,
    };
}
export function habitToday(
    habits: Habit[],
    plans: HabitPlan[],
    paths: HabitPath[],
    entries: HabitEntry[],
    at: Date,
) {
    return habits
        .filter((h) => !h.archived)
        .flatMap((habit) => {
            const date = habitDate(at, habit.timeZone);
            const day = habitDay(
                habit,
                plans.filter((p) => p.habitId === habit.id),
                paths,
                entries,
                date,
                at,
            );
            const historicPath = paths.find((p) => p.id === day.plan?.pathId);
            if (
                !day.plan ||
                day.start > at.getTime() ||
                !day.scheduled ||
                habitPaused(habit.pauses, at) ||
                habitPaused(historicPath?.pauses ?? [], at)
            )
                return [];
            return [{ habit, ...day }];
        })
        .sort(
            (a, b) =>
                Number(a.done) - Number(b.done) ||
                a.habit.createdAt.localeCompare(b.habit.createdAt) ||
                a.habit.id.localeCompare(b.habit.id),
        );
}
