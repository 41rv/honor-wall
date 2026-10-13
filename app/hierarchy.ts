import type { Step, Status } from "./model";
export interface Metric {
    total: number;
    done: number;
    remaining: number;
    percent: number | null;
    status: Status;
    started: number;
}
const empty = (): Metric => ({
    total: 0,
    done: 0,
    remaining: 0,
    percent: null,
    status: "todo",
    started: 0,
});
function finish(m: Metric): Metric {
    return {
        ...m,
        remaining: m.total - m.done,
        percent: m.total
            ? m.done === m.total
                ? 100
                : Math.min(99, Math.round((m.done / m.total) * 100))
            : null,
        status:
            m.total && m.done === m.total
                ? "done"
                : m.started
                  ? "doing"
                  : "todo",
    };
}
const key = (project: string, parent: string | null) =>
    JSON.stringify([project, parent]);
export function buildHierarchy(steps: Step[]) {
    const byId = new Map(steps.map((s) => [s.id, s]));
    const groups = new Map<string, Step[]>();
    for (const s of steps) {
        const k = key(s.projectId, s.parentId);
        const group = groups.get(k) ?? [];
        group.push(s);
        groups.set(k, group);
    }
    for (const group of groups.values())
        group.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    const nodes = new Map<string, Metric>();
    const projects = new Map<string, Metric>();
    const numbers = new Map<string, string>();
    const pending: Array<{ step: Step; number: string; visited: boolean }> = [];
    for (const group of groups.values())
        if (group[0].parentId === null)
            group.forEach((step, i) =>
                pending.push({ step, number: String(i + 1), visited: false }),
            );
    while (pending.length) {
        const { step, number, visited } = pending.pop()!;
        const kids = groups.get(key(step.projectId, step.id)) ?? [];
        if (!visited) {
            numbers.set(step.id, number);
            pending.push({ step, number, visited: true });
            kids.forEach((s, i) =>
                pending.push({
                    step: s,
                    number: `${number}.${i + 1}`,
                    visited: false,
                }),
            );
            continue;
        }
        let m = empty();
        if (kids.length) {
            for (const child of kids) {
                const metric = nodes.get(child.id)!;
                m.total += metric.total;
                m.done += metric.done;
                m.started += metric.started;
            }
            m = finish(m);
            if (!m.total)
                m.status = kids.every((c) => nodes.get(c.id)!.status === "done")
                    ? "done"
                    : kids.some((c) => nodes.get(c.id)!.status !== "todo")
                      ? "doing"
                      : "todo";
        } else if (step.kind === "step") {
            m = finish({
                total: 1,
                done: step.status === "done" ? 1 : 0,
                started: step.status !== "todo" ? 1 : 0,
                remaining: 0,
                percent: 0,
                status: step.status,
            });
        } else m.status = step.status;
        nodes.set(step.id, m);
        if (step.parentId === null) {
            const p = projects.get(step.projectId) ?? empty();
            projects.set(
                step.projectId,
                finish({
                    ...p,
                    total: p.total + m.total,
                    done: p.done + m.done,
                    started: p.started + m.started,
                }),
            );
        }
    }
    return {
        byId,
        nodes,
        projects,
        numbers,
        children: (project: string, parent: string | null) =>
            groups.get(key(project, parent)) ?? [],
        metric: (project: string, root?: string) =>
            root
                ? (nodes.get(root) ?? empty())
                : (projects.get(project) ?? empty()),
    };
}
export type Hierarchy = ReturnType<typeof buildHierarchy>;
