import { Temporal } from "@js-temporal/polyfill";
import {
    currentCycle,
    firstCycleStart,
    makeCycle,
    localZone,
    projectTask,
    recurring,
    type TaskView,
} from "./taskSchedule";
import type { Task } from "./model";
import { dateKey } from "./dateKey";

export function scheduledInstant(task: Task): number {
    const s = task.schedule!;
    return Temporal.PlainDate.from(s.date).toZonedDateTime({
        timeZone: s.timeZone,
        plainTime: s.time ?? "00:00",
    }).epochMilliseconds;
}
export function chosenToday(task: Task, at: Date, zone = localZone()) {
    return (
        !task.schedule && !!task.today && task.today.date === dateKey(at, zone)
    );
}
export function taskDeadline(task: Task) {
    const s = task.schedule!;
    return s.time
        ? scheduledInstant(task)
        : Temporal.PlainDate.from(s.date)
              .add({ days: 1 })
              .toZonedDateTime({ timeZone: s.timeZone, plainTime: "00:00" })
              .epochMilliseconds;
}
export function calendarScheduledInstant(task: Task, zone = localZone()) {
    if (task.schedule?.time) return scheduledInstant(task);
    const date = dateKey(taskDeadline(task) - 1, zone);
    return Temporal.PlainDate.from(date).toZonedDateTime({
        timeZone: zone,
        plainTime: "00:00",
    }).epochMilliseconds;
}
export function todayGroups(
    tasks: TaskView[],
    at = new Date(),
    zone = localZone(),
) {
    const day = dateKey(at, zone);
    const groups: Record<
        "due" | "selected" | "available" | "overdue",
        TaskView[]
    > = { due: [], selected: [], available: [], overdue: [] };
    for (const task of tasks) {
        if (!task.schedule) {
            if (chosenToday(task, at, zone)) groups.selected.push(task);
        } else if (recurring(task)) {
            const stored = task._cycle;
            const cycle =
                stored &&
                stored.revision === task.scheduleRevision &&
                Date.parse(stored.start) <= at.getTime() &&
                Date.parse(stored.end) > at.getTime()
                    ? stored
                    : currentCycle(task, at);
            if (cycle)
                groups[
                    dateKey(cycle.scheduledAt, zone) === day
                        ? "due"
                        : "available"
                ].push(task);
            else if (
                dateKey(
                    new Date(
                        makeCycle(task, firstCycleStart(task), at).scheduledAt,
                    ),
                    zone,
                ) === day
            )
                groups.due.push(task);
        } else {
            const completedLate =
                task.status === "done" &&
                !!task.completedAt &&
                dateKey(task.completedAt, zone) === day &&
                (task.schedule.time
                    ? Date.parse(task.completedAt) > taskDeadline(task)
                    : Date.parse(task.completedAt) >= taskDeadline(task));
            if (
                projectTask(task, new Map(), at)._dueState === "overdue" ||
                completedLate
            )
                groups.overdue.push(task);
            else if (
                dateKey(calendarScheduledInstant(task, zone), zone) === day
            )
                groups.due.push(task);
        }
    }
    return groups;
}
