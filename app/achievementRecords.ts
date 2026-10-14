import type { Snapshot } from "./model";
import type { TaskCycle } from "./taskTypes";
import { inRange, type TimeRange } from "./analytics";
export type AchievementKind = "task" | "cycle" | "step" | "project";
export interface AchievementRecord {
    recordId: string;
    id: string;
    kind: AchievementKind;
    title: string;
    completedAt: string;
    cycleId?: string;
    scheduledAt?: string;
}
export function achievementRecords(
    data: Pick<Snapshot, "tasks" | "steps" | "projects">,
    cycles: TaskCycle[],
    range?: TimeRange,
    at = new Date(),
) {
    const records = new Map<string, AchievementRecord>();
    const tasks = new Map(data.tasks.map((t) => [t.id, t]));
    const parents = new Set(data.steps.map((s) => s.parentId));
    function add(
        kind: AchievementKind,
        id: string,
        title: string,
        completedAt?: string,
        cycle?: TaskCycle,
    ) {
        if (
            !completedAt ||
            Date.parse(completedAt) > at.getTime() ||
            (range && !inRange(completedAt, range))
        )
            return;
        const recordId = JSON.stringify([kind, cycle?.id ?? id]);
        records.set(recordId, {
            recordId,
            id,
            kind,
            title,
            completedAt,
            cycleId: cycle?.id,
            scheduledAt: cycle?.scheduledAt,
        });
    }
    for (const task of data.tasks)
        if (
            task.status === "done" &&
            (!task.schedule || task.schedule.repeat === "none")
        )
            add("task", task.id, task.title, task.completedAt);
    for (const cycle of cycles)
        if (cycle.status === "completed" && tasks.has(cycle.taskId))
            add(
                "cycle",
                cycle.taskId,
                tasks.get(cycle.taskId)!.title,
                cycle.completedAt,
                cycle,
            );
    for (const step of data.steps)
        if (
            step.kind === "step" &&
            step.status === "done" &&
            !parents.has(step.id)
        )
            add("step", step.id, step.title, step.completedAt);
    for (const project of data.projects)
        if (project.status === "closed")
            add("project", project.id, project.title, project.completedAt);
    return [...records.values()].sort(
        (a, b) =>
            b.completedAt.localeCompare(a.completedAt) ||
            a.recordId.localeCompare(b.recordId),
    );
}
