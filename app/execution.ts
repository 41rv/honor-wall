import type { Project, Step } from "./model";
import type { Hierarchy } from "./hierarchy";

export interface Execution {
    current?: Step;
    stage?: Step;
    lastCompleted?: Step;
    total: number;
}
export function stageFor(step: Step, hierarchy: Hierarchy) {
    let parent = step.parentId;
    while (parent !== null) {
        const item = hierarchy.byId.get(parent);
        if (!item) break;
        if (item.kind === "stage") return item;
        parent = item.parentId;
    }
    return undefined;
}
export function projectExecution(
    hierarchy: Hierarchy,
    projectId: string,
): Execution {
    const pending = [...hierarchy.children(projectId, null)].reverse();
    const leaves: Step[] = [];
    while (pending.length) {
        const step = pending.pop()!;
        const children = hierarchy.children(projectId, step.id);
        if (children.length) {
            for (let i = children.length - 1; i >= 0; i--)
                pending.push(children[i]);
        } else if (step.kind === "step") leaves.push(step);
    }
    let current: Step | undefined;
    let lastCompleted: Step | undefined;
    for (const step of leaves) {
        if (
            step.status === "doing" &&
            (!current ||
                current.status !== "doing" ||
                step.updatedAt > current.updatedAt)
        )
            current = step;
        else if (!current && step.status !== "done") current = step;
        if (
            step.status === "done" &&
            (!lastCompleted ||
                (step.completedAt ?? step.updatedAt) >
                    (lastCompleted.completedAt ?? lastCompleted.updatedAt))
        )
            lastCompleted = step;
    }
    return {
        current,
        stage: current ? stageFor(current, hierarchy) : undefined,
        lastCompleted,
        total: leaves.length,
    };
}
export function buildExecution(projects: Project[], hierarchy: Hierarchy) {
    return new Map(
        projects.map((project) => [
            project.id,
            projectExecution(hierarchy, project.id),
        ]),
    );
}
export function resumeStep(
    projects: Project[],
    hierarchy: Hierarchy,
    executions: Map<string, Execution>,
    visitedId: string | null,
) {
    const active = projects
        .filter((p) => !p.archived && p.status === "active")
        .sort(
            (a, b) =>
                b.updatedAt.localeCompare(a.updatedAt) ||
                a.id.localeCompare(b.id),
        );
    const eligible = new Set(active.map((p) => p.id));
    const visited = visitedId ? hierarchy.byId.get(visitedId) : undefined;
    if (
        visited &&
        visited.kind === "step" &&
        visited.status !== "done" &&
        eligible.has(visited.projectId)
    )
        return visited;
    const candidates = active.flatMap(
        (p) => executions.get(p.id)?.current ?? [],
    );
    return (
        candidates
            .filter((s) => s.status === "doing")
            .sort(
                (a, b) =>
                    b.updatedAt.localeCompare(a.updatedAt) ||
                    a.id.localeCompare(b.id),
            )[0] ?? candidates[0]
    );
}
