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

export function sortTodayTasks(tasks: TaskView[]) {
    const rank = { "important-urgent": 0, important: 1, urgent: 2, low: 3 };
    const dates = new Map(
        tasks.map((task) => [
            task.id,
            task.schedule
                ? Date.parse(
                      task._cycle?.scheduledAt ??
                          task._next ??
                          new Date(
                              calendarScheduledInstant(task),
                          ).toISOString(),
                  )
                : Infinity,
        ]),
    );
    return [...tasks].sort(
        (a, b) =>
            (a.priority ? rank[a.priority] : 4) -
                (b.priority ? rank[b.priority] : 4) ||
            dates.get(a.id)! - dates.get(b.id)! ||
            a.createdAt.localeCompare(b.createdAt) ||
            a.id.localeCompare(b.id),
    );
}

export function orderedToday(
    tasks: TaskView[],
    at = new Date(),
    zone = localZone(),
) {
    const groups = todayGroups(tasks, at, zone);
    const category = new Map<string, keyof typeof groups>();
    for (const key of Object.keys(groups) as Array<keyof typeof groups>)
        for (const task of groups[key]) category.set(task.id, key);
    const unique = new Map(
        Object.values(groups)
            .flat()
            .map((task) => [task.id, task]),
    );
    return sortTodayTasks([...unique.values()]).map((task) => ({
        task,
        category: category.get(task.id)!,
    }));
}

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
