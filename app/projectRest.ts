import { Temporal } from "@js-temporal/polyfill";
import type { PaceSettings, ProjectPause, ProjectPlan } from "./paceTypes";
import { localZone } from "./taskSchedule";

export const defaultProjectRestDays = [5, 6];
export const projectWeekDays = [
    [6, "السبت"],
    [0, "الأحد"],
    [1, "الاثنين"],
    [2, "الثلاثاء"],
    [3, "الأربعاء"],
    [4, "الخميس"],
    [5, "الجمعة"],
] as const;
export function withProjectRestDefaults(
    old?: PaceSettings,
    at = new Date(),
): PaceSettings {
    return {
        ...old,
        id: "pace",
        activeLimit: old?.activeLimit ?? 3,
        restHistory: old?.restHistory?.length
            ? old.restHistory
            : [
                  {
                      since: at.toISOString(),
                      days: [...defaultProjectRestDays],
                      timeZone: localZone(),
                  },
              ],
    };
}
export function restScheduleAt(
    settings: PaceSettings | undefined,
    at: Date | number,
) {
    const stamp = Number(at);
    const history = settings?.restHistory ?? [];
    for (let i = history.length - 1; i >= 0; i--)
        if (Date.parse(history[i].since) <= stamp) return history[i];
}
export function isProjectRest(at: Date | number, settings?: PaceSettings) {
    const schedule = restScheduleAt(settings, at);
    if (!schedule) return false; // No invented schedule before activation.
    const day =
        Temporal.Instant.fromEpochMilliseconds(Number(at)).toZonedDateTimeISO(
            schedule.timeZone,
        ).dayOfWeek % 7;
    return schedule.days.includes(day);
}
export function projectRestSettings(
    settings?: PaceSettings,
    plan?: ProjectPlan,
): PaceSettings | undefined {
    if (!plan?.restBefore) return settings;
    const { until, history } = plan.restBefore;
    const boundary = restScheduleAt(settings, Date.parse(until));
    return {
        id: "pace",
        activeLimit: settings?.activeLimit ?? 3,
        restHistory: [
            ...history.filter((s) => s.since < until),
            {
                since: until,
                days: boundary?.days ?? [],
                timeZone: boundary?.timeZone ?? localZone(),
            },
            ...(settings?.restHistory ?? []).filter((s) => s.since > until),
        ],
    };
}
function dayBounds(stamp: number, zone: string) {
    const day = Temporal.Instant.fromEpochMilliseconds(stamp)
        .toZonedDateTimeISO(zone)
        .startOfDay();
    return [day.epochMilliseconds, day.add({ days: 1 }).epochMilliseconds];
}
// Split at policy changes, local midnights and pause boundaries. Exclusions are
// a union, so a paused rest day is never subtracted twice; DST days weigh one.
export function availableProjectDays(
    start: number,
    end: number,
    settings?: PaceSettings,
    pauses: ProjectPause[] = [],
    zone = localZone(),
) {
    if (end <= start) return 0;
    const boundaries = new Set([start, end]);
    for (const row of settings?.restHistory ?? []) {
        const stamp = Date.parse(row.since);
        if (stamp > start && stamp < end) boundaries.add(stamp);
    }
    for (const pause of pauses)
        for (const stamp of [
            Date.parse(pause.start),
            Date.parse(pause.end ?? ""),
        ])
            if (stamp > start && stamp < end) boundaries.add(stamp);
    const cuts = [...boundaries].sort((a, b) => a - b);
    let total = 0;
    for (let i = 0; i < cuts.length - 1; i++) {
        let cursor = cuts[i];
        const stop = cuts[i + 1];
        if (
            pauses.some(
                (p) =>
                    cursor >= Date.parse(p.start) &&
                    cursor < Date.parse(p.end ?? "9999-12-31"),
            )
        )
            continue;
        const schedule = restScheduleAt(settings, cursor);
        if (!schedule || schedule.timeZone === zone) {
            const [firstStart, firstEnd] = dayBounds(cursor, zone);
            if (stop <= firstEnd) {
                if (!isProjectRest(cursor, settings))
                    total += (stop - cursor) / (firstEnd - firstStart);
                continue;
            }
            if (!isProjectRest(cursor, settings))
                total += (firstEnd - cursor) / (firstEnd - firstStart);
            const [lastStart, lastEnd] = dayBounds(stop - 1, zone);
            if (!isProjectRest(lastStart, settings))
                total += (stop - lastStart) / (lastEnd - lastStart);
            const from = Temporal.Instant.fromEpochMilliseconds(firstEnd)
                .toZonedDateTimeISO(zone)
                .toPlainDate();
            const last = Temporal.Instant.fromEpochMilliseconds(lastStart)
                .toZonedDateTimeISO(zone)
                .toPlainDate()
                .subtract({ days: 1 });
            total += countWeeklyDates(from, last, schedule?.days ?? []);
            continue;
        }
        // Rare cross-zone intervals are split at both calendars' midnights.
        while (cursor < stop) {
            const [a, b] = dayBounds(cursor, zone);
            const next = Math.min(
                stop,
                b,
                dayBounds(cursor, schedule.timeZone)[1],
            );
            if (!isProjectRest(cursor, settings))
                total += (next - cursor) / (b - a);
            cursor = next;
        }
    }
    return total;
}
const dayStart = (day: string, zone: string) =>
    Temporal.PlainDate.from(day).toZonedDateTime({
        timeZone: zone,
        plainTime: "00:00",
    }).epochMilliseconds;

function countWeeklyDates(
    first: Temporal.PlainDate,
    last: Temporal.PlainDate,
    rest: number[],
) {
    const length = Math.max(0, first.until(last).days + 1);
    let count = Math.floor(length / 7) * (7 - rest.length);
    for (let n = 0; n < length % 7; n++)
        if (!rest.includes((first.dayOfWeek + n) % 7)) count++;
    return count;
}
export function remainingWorkDays(
    today: string,
    target: string,
    settings: PaceSettings | undefined,
    at: Date,
    zone: string,
) {
    if (target < today) return 0;
    const schedule = restScheduleAt(settings, at);
    // Common case: a stable weekly calendar in the goal's time zone. Count
    // complete weeks arithmetically rather than walking a 100-year goal.
    if (
        (!schedule || schedule.timeZone === zone) &&
        !(settings?.restHistory ?? []).some((s) => Date.parse(s.since) > +at)
    ) {
        return countWeeklyDates(
            Temporal.PlainDate.from(today),
            Temporal.PlainDate.from(target),
            schedule?.days ?? [],
        );
    }
    // Count dates in the saved work calendar, not fragments of that same
    // date split across the goal's calendar. A partial first/last date is usable.
    const workZone = schedule?.timeZone ?? zone;
    const start = Math.max(+at, dayStart(today, zone));
    const end = dayStart(
        Temporal.PlainDate.from(target).add({ days: 1 }).toString(),
        zone,
    );
    if (end <= start) return 0;
    const first = Temporal.Instant.fromEpochMilliseconds(start)
        .toZonedDateTimeISO(workZone)
        .toPlainDate();
    const last = Temporal.Instant.fromEpochMilliseconds(end - 1)
        .toZonedDateTimeISO(workZone)
        .toPlainDate();
    return countWeeklyDates(first, last, schedule?.days ?? []);
}

export function finishOnWorkDay(
    at: Date,
    count: number,
    settings?: PaceSettings,
    zone = localZone(),
) {
    const schedule = restScheduleAt(settings, at);
    if (schedule?.days.length === 7) return undefined;
    const workZone = schedule?.timeZone ?? zone;
    let day = Temporal.Instant.fromEpochMilliseconds(+at)
        .toZonedDateTimeISO(workZone)
        .toPlainDate();
    let remaining = Math.max(1, Math.ceil(count));
    const rest = schedule?.days ?? [];
    const weeks = Math.max(0, Math.floor((remaining - 1) / (7 - rest.length)));
    day = day.add({ days: weeks * 7 });
    remaining -= weeks * (7 - rest.length);
    while (true) {
        if (!rest.includes(day.dayOfWeek % 7) && --remaining === 0) {
            if (workZone === zone) return day.toString();
            // Report the end of the estimated work date in the goal's zone.
            // Its beginning may fall on the previous goal date (e.g. Riyadh/UTC).
            return Temporal.Instant.fromEpochMilliseconds(
                dayStart(day.add({ days: 1 }).toString(), workZone) - 1,
            )
                .toZonedDateTimeISO(zone)
                .toPlainDate()
                .toString();
        }
        day = day.add({ days: 1 });
    }
}
