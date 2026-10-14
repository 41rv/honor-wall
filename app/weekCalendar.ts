import { Temporal } from "@js-temporal/polyfill";
import {
    currentCycle,
    firstCycleStart,
    makeCycle,
    cycleId,
    localDay,
    localZone,
    recurring,
    type TaskView,
} from "./taskSchedule";
import { calendarScheduledInstant } from "./dailyPlanning";
import type { Task } from "./model";
import type { TaskCycle } from "./taskTypes";
import { dateKey } from "./dateKey";
export const dayInstant = (date: string, zone = localZone()) =>
    Temporal.PlainDate.from(date).toZonedDateTime({
        timeZone: zone,
        plainTime: "00:00",
    }).epochMilliseconds;
export function weekStart(at = new Date(), zone = localZone()) {
    const day = localDay(at, zone);
    return day.subtract({ days: (day.dayOfWeek + 1) % 7 }).toString();
}
export function weekBounds(start: string, zone = localZone()) {
    return {
        start: dayInstant(start, zone),
        end: dayInstant(
            Temporal.PlainDate.from(start).add({ days: 7 }).toString(),
            zone,
        ),
    };
}
export interface CalendarEntry {
    key: string;
    day: string;
    scheduledAt: string;
    task: TaskView;
    future: boolean;
    historical: boolean;
}
export function calendarForecasts(
    tasks: Task[],
    history: TaskCycle[],
    start: string,
    zone = localZone(),
) {
    const bounds = weekBounds(start, zone),
        known = new Map(history.map((c) => [c.id, c])),
        result = new Map<string, TaskCycle[]>();
    for (const task of tasks)
        if (recurring(task)) {
            const first = currentCycle(task, new Date(bounds.start));
            let cursor = first
                ? Date.parse(first.start)
                : firstCycleStart(task);
            const rows: TaskCycle[] = [];
            while (cursor < bounds.end && rows.length < 32) {
                const id = cycleId(
                    task.id,
                    task.scheduleRevision ?? 1,
                    new Date(cursor).toISOString(),
                );
                const row =
                    known.get(id) ??
                    makeCycle(task, cursor, new Date(bounds.end - 1));
                rows.push(row);
                const next = Date.parse(row.end);
                if (next <= cursor) break;
                cursor = next;
            }
            result.set(task.id, rows);
        }
    return result;
}
export function calendarEntries(
    tasks: Task[],
    history: TaskCycle[],
    start: string,
    at = new Date(),
    zone = localZone(),
    forecasts = calendarForecasts(tasks, history, start, zone),
): CalendarEntry[] {
    const bounds = weekBounds(start, zone);
    const result: CalendarEntry[] = [];
    const add = (task: Task, scheduledAt: string, cycle?: TaskCycle) => {
        const stamp = Date.parse(scheduledAt);
        if (stamp < bounds.start || stamp >= bounds.end) return;
        if (
            cycle?.closedReason &&
            stamp >= Date.parse(cycle.end) &&
            cycle.status !== "completed"
        )
            return;
        const future = !!cycle && Date.parse(cycle.start) > at.getTime();
        const available =
            !cycle ||
            (!future &&
                at.getTime() < Date.parse(cycle.end) &&
                !cycle.closedReason &&
                cycle.revision === task.scheduleRevision);
        const historical = !!cycle && !available && !future;
        result.push({
            key: cycle?.id ?? task.id,
            day: dateKey(stamp, zone),
            scheduledAt,
            future,
            historical,
            task: {
                ...task,
                status: cycle
                    ? cycle.status === "completed"
                        ? "done"
                        : cycle.workStatus === "doing"
                          ? "doing"
                          : "todo"
                    : task.status,
                _cycleId: cycle?.id,
                _cycle: available ? cycle : undefined,
                _available: available,
                _dueState: future ? "future" : cycle ? "cycle" : "today",
                _dueLabel: future
                    ? "موعد قادم — لم تبدأ الدورة"
                    : historical
                      ? cycle?.status === "completed"
                          ? "دورة مكتملة"
                          : "انتهت الدورة"
                      : "الدورة الحالية",
            },
        });
    };
    const byTask = new Map<string, TaskCycle[]>();
    for (const cycle of history) {
        const rows = byTask.get(cycle.taskId) ?? [];
        rows.push(cycle);
        byTask.set(cycle.taskId, rows);
    }
    for (const task of tasks) {
        if (task.schedule && !recurring(task))
            add(
                task,
                new Date(calendarScheduledInstant(task, zone)).toISOString(),
            );
        const saved = new Map(
            (byTask.get(task.id) ?? [])
                .filter((c) => !c.source)
                .map((c) => [c.id, c]),
        );
        if (recurring(task)) {
            for (const c of forecasts.get(task.id) ?? [])
                if (!saved.has(c.id)) saved.set(c.id, c);
        }
        for (const cycle of saved.values()) add(task, cycle.scheduledAt, cycle);
    }
    return result.sort(
        (a, b) =>
            a.scheduledAt.localeCompare(b.scheduledAt) ||
            a.key.localeCompare(b.key),
    );
}
