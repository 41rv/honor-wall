import { activeProject } from "./projectPace";
import { Temporal } from "@js-temporal/polyfill";
import { localDay, localZone, recurring } from "./taskSchedule";
import { calendarScheduledInstant, taskDeadline } from "./dailyPlanning";
import { weekStart, dayInstant } from "./weekCalendar";
import type { Task, Snapshot } from "./model";
import { dateKey } from "./dateKey";
import type { TaskCycle } from "./taskTypes";
export function projectMetrics(
    data: Pick<Snapshot, "projects" | "steps" | "projectPlans">,
    range: TimeRange,
) {
    return {
        completed: new Set(
            data.projects
                .filter(
                    (p) =>
                        p.status === "closed" && inRange(p.completedAt, range),
                )
                .map((p) => p.id),
        ).size,
        active: data.projects.filter((p) =>
            activeProject(
                p,
                data.projectPlans?.find((plan) => plan.projectId === p.id),
            ),
        ).length,
    };
}
export type Period = "week" | "month" | "year";
export interface TimeRange {
    start: number;
    end: number;
    cutoff: number;
}
export function periodWindows(
    period: Period,
    at = new Date(),
    zone = localZone(),
) {
    const today = localDay(at, zone);
    const start =
        period === "week"
            ? Temporal.PlainDate.from(weekStart(at, zone))
            : period === "month"
              ? today.with({ day: 1 })
              : today.with({ month: 1, day: 1 });
    const span =
        period === "week"
            ? { weeks: 1 }
            : period === "month"
              ? { months: 1 }
              : { years: 1 };
    const previous = start.subtract(span),
        end = start.add(span),
        startMs = dayInstant(start.toString(), zone);
    const elapsedDays = start.until(today).days;
    const localTime = Temporal.Instant.fromEpochMilliseconds(at.getTime())
        .toZonedDateTimeISO(zone)
        .toPlainTime();
    const matched = previous.add({ days: elapsedDays }).toZonedDateTime({
        timeZone: zone,
        plainTime: localTime,
    }).epochMilliseconds;
    return {
        current: {
            start: startMs,
            end: dayInstant(end.toString(), zone),
            cutoff: at.getTime(),
        },
        previous: {
            start: dayInstant(previous.toString(), zone),
            end: startMs,
            cutoff: Math.min(startMs, matched),
        },
        elapsedDays,
        partial: true,
    };
}
export const inRange = (at: string | undefined, range: TimeRange) =>
    !!at &&
    Date.parse(at) >= range.start &&
    Date.parse(at) < range.end &&
    Date.parse(at) <= range.cutoff;
export function taskMetrics(
    tasks: Task[],
    cycles: TaskCycle[],
    range: TimeRange,
    zone = localZone(),
) {
    const completions: string[] = [];
    let due = 0,
        doneDue = 0,
        pending = 0,
        missed = 0;
    const dueResult = (completedAt: string | undefined, deadline: number) => {
        due++;
        if (completedAt && Date.parse(completedAt) <= range.cutoff) doneDue++;
        else if (deadline <= range.cutoff) missed++;
        else pending++;
    };
    for (const task of tasks) {
        if (
            !recurring(task) &&
            task.status === "done" &&
            inRange(task.completedAt, range)
        )
            completions.push(task.completedAt!);
        if (
            task.schedule &&
            !recurring(task) &&
            Date.parse(task.scheduleSince ?? task.createdAt) <= range.cutoff &&
            inRange(
                new Date(calendarScheduledInstant(task, zone)).toISOString(),
                range,
            )
        ) {
            const s = task.schedule;
            const deadline = taskDeadline(task) + (s.time ? 1 : 0);
            dueResult(
                task.status === "done" ? task.completedAt : undefined,
                deadline,
            );
        }
    }
    for (const cycle of new Map(cycles.map((c) => [c.id, c])).values()) {
        if (cycle.status === "completed" && inRange(cycle.completedAt, range))
            completions.push(cycle.completedAt!);
        if (
            !cycle.source &&
            Date.parse(cycle.start) <= range.cutoff &&
            inRange(cycle.scheduledAt, range) &&
            !(
                cycle.closedReason &&
                Date.parse(cycle.scheduledAt) >= Date.parse(cycle.end)
            )
        )
            dueResult(
                cycle.status === "completed" ? cycle.completedAt : undefined,
                Date.parse(cycle.end),
            );
    }
    return {
        completed: completions.length,
        due,
        doneDue,
        pending,
        missed,
        rate: due ? Math.round((doneDue / due) * 100) : null,
        activeDays: new Set(completions.map((at) => dateKey(at, zone))).size,
        completions,
    };
}
