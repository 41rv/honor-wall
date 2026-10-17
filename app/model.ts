import type { HabitData } from "./habitTypes";
import { validateHabitData } from "./habitValidation";
import {
    validateTaskOptions,
    currentCycle,
    firstCycleStart,
    recurring,
} from "./taskSchedule";
import type { TaskOptions, TaskCycle } from "./taskTypes";
import type { ProjectProgress, ProjectTracking } from "./projectProgressTypes";
export type Status = "todo" | "doing" | "done";
export interface Base {
    id: string;
    title: string;
    notes: string;
    createdAt: string;
    updatedAt: string;
    startedAt?: string;
    completedAt?: string;
}
export interface Project extends Base {
    status: "active" | "closed";
    archived: boolean;
}
export interface Step extends Base {
    projectId: string;
    parentId: string | null;
    kind: "stage" | "step";
    order: number;
    status: Status;
}
export interface Task extends Base, TaskOptions {
    status: Status;
    today?: { date: string; timeZone: string };
    scheduleRevision?: number;
    scheduleSince?: string;
    scheduleCursor?: string;
}
export interface Idea extends Base {
    archived: boolean;
}
export type EntityKind = "project" | "step" | "task" | "idea";
export type Action =
    | "created"
    | "started"
    | "completed"
    | "reopened"
    | "closed"
    | "archived"
    | "converted"
    | "deleted";
export interface Event {
    id: string;
    entityId: string;
    entityKind: EntityKind;
    title: string;
    action: Action;
    at: string;
}
import type { PaceData } from "./paceTypes";
import { validatePaceData } from "./paceValidation";
export interface Snapshot extends PaceData, HabitData {
    version: 1 | 2 | 3 | 4 | 5;
    exportedAt: string;
    projects: Project[];
    steps: Step[];
    tasks: Task[];
    ideas: Idea[];
    events: Event[];
    taskCycles?: TaskCycle[];
    projectProgress?: ProjectProgress[];
    projectTracking?: ProjectTracking[];
}
export const now = () => new Date().toISOString();
export const uid = () => crypto.randomUUID();
export function base(title: string, notes = ""): Base {
    const at = now();
    return {
        id: uid(),
        title: title.trim(),
        notes,
        createdAt: at,
        updatedAt: at,
    };
}
export const children = (
    steps: Step[],
    parentId: string | null,
    projectId: string,
) =>
    steps
        .filter((s) => s.projectId === projectId && s.parentId === parentId)
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
export function descendants(steps: Step[], id: string): Step[] {
    const byParent = new Map<string, Step[]>();
    for (const step of steps)
        if (step.parentId) {
            const group = byParent.get(step.parentId) ?? [];
            group.push(step);
            byParent.set(step.parentId, group);
        }
    const result: Step[] = [];
    const pending = [id];
    while (pending.length) {
        for (const step of byParent.get(pending.pop()!) ?? []) {
            result.push(step);
            pending.push(step.id);
        }
    }
    return result;
}
export function leaves(
    steps: Step[],
    projectId: string,
    root?: string,
): Step[] {
    const scope = root
        ? descendants(steps, root).concat(steps.filter((s) => s.id === root))
        : steps.filter((s) => s.projectId === projectId);
    const parents = new Set(steps.map((s) => s.parentId));
    return scope.filter((s) => s.kind === "step" && !parents.has(s.id));
}
export function progress(steps: Step[], projectId: string, root?: string) {
    const all = leaves(steps, projectId, root);
    const done = all.filter((s) => s.status === "done").length;
    return {
        total: all.length,
        done,
        remaining: all.length - done,
        percent: all.length
            ? done === all.length
                ? 100
                : Math.min(99, Math.round((done / all.length) * 100))
            : null,
    };
}
export function derivedStatus(step: Step, steps: Step[]): Status {
    if (!steps.some((c) => c.parentId === step.id)) return step.status;
    const p = progress(steps, step.projectId, step.id);
    if (!p.total) {
        const parents = new Set(steps.map((s) => s.parentId));
        const terminal = descendants(steps, step.id).filter(
            (s) => !parents.has(s.id),
        );
        return terminal.length && terminal.every((s) => s.status === "done")
            ? "done"
            : terminal.some((s) => s.status !== "todo")
              ? "doing"
              : "todo";
    }
    return p.total && p.done === p.total
        ? "done"
        : leaves(steps, step.projectId, step.id).some(
                (s) => s.status !== "todo",
            )
          ? "doing"
          : "todo";
}
export function numbered(
    steps: Step[],
    projectId: string,
): Map<string, string> {
    const out = new Map<string, string>();
    const walk = (parent: string | null, prefix = "") =>
        children(steps, parent, projectId).forEach((s, i) => {
            const n = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
            out.set(s.id, n);
            walk(s.id, n);
        });
    walk(null);
    return out;
}
export function pathFor(step: Step, steps: Step[], projects: Project[]) {
    const chain = [step.title];
    let parent = step.parentId;
    while (parent) {
        const p = steps.find((s) => s.id === parent);
        if (!p) break;
        chain.unshift(p.title);
        parent = p.parentId;
    }
    chain.unshift(projects.find((p) => p.id === step.projectId)?.title ?? "");
    return chain.join(" / ");
}
export const statusNames: Record<Status, string> = {
    todo: "لم تبدأ",
    doing: "جارٍ العمل",
    done: "مكتملة",
};
const dateFormatter = new Intl.DateTimeFormat("ar", {
    dateStyle: "medium",
    timeStyle: "short",
});
export function date(value?: string) {
    return value ? dateFormatter.format(new Date(value)) : "—";
}
export function elapsed(created: string, completed: string) {
    const days = Math.floor(
        Math.max(
            0,
            new Date(completed).getTime() - new Date(created).getTime(),
        ) / 86400000,
    );
    return days === 0
        ? "أقل من يوم منقضٍ"
        : days === 1
          ? "يوم منقضٍ"
          : days === 2
            ? "يومان منقضيان"
            : days <= 10
              ? `${days} أيام منقضية`
              : `${days} يومًا منقضيًا`;
}
export function achievements(
    data: Pick<Snapshot, "tasks" | "steps"> &
        Pick<Partial<Snapshot>, "taskCycles">,
    at = new Date(),
) {
    const cutoff = at.getTime() - 7 * 86400000;
    const parents = new Set(data.steps.map((s) => s.parentId));
    return [
        ...data.tasks
            .filter((t) => !t.schedule || t.schedule.repeat === "none")
            .map((t) => ({
                ...t,
                recordId: t.id,
                entityKind: "task" as const,
            })),
        ...(data.taskCycles ?? [])
            .filter((c) => c.status === "completed")
            .flatMap((c) => {
                const task = data.tasks.find((t) => t.id === c.taskId);
                return task
                    ? [
                          {
                              ...task,
                              status: "done" as const,
                              completedAt: c.completedAt,
                              recordId: c.id,
                              entityKind: "task" as const,
                          },
                      ]
                    : [];
            }),
        ...data.steps
            .filter((s) => s.kind === "step" && !parents.has(s.id))
            .map((s) => ({
                ...s,
                recordId: s.id,
                entityKind: "step" as const,
            })),
    ]
        .filter(
            (t) =>
                t.status === "done" &&
                t.completedAt &&
                Date.parse(t.completedAt) >= cutoff &&
                Date.parse(t.completedAt) <= at.getTime(),
        )
        .sort((a, b) => b.completedAt!.localeCompare(a.completedAt!));
}
export function search(data: Snapshot, query: string) {
    const q = query.trim().toLocaleLowerCase("ar");
    if (!q) return [];
    return (
        [
            ["project", data.projects],
            ["step", data.steps],
            ["task", data.tasks],
            ["idea", data.ideas],
        ] as const
    ).flatMap(([kind, items]) =>
        items
            .filter((x) =>
                `${x.title} ${x.notes}`.toLocaleLowerCase("ar").includes(q),
            )
            .map((x) => ({
                kind,
                id: x.id,
                title: x.title,
                notes: x.notes,
                projectId: kind === "step" ? (x as Step).projectId : undefined,
            })),
    );
}
export function validateBackup(input: unknown): Snapshot {
    const fail = () => {
        throw new Error(
            "النسخة غير صالحة: تحقق من الإصدار والحقول والعلاقات والتواريخ.",
        );
    };
    if (!input || typeof input !== "object") return fail();
    const d = input as Snapshot;
    const iso = (x: unknown) => {
        if (
            typeof x !== "string" ||
            !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(x)
        )
            return false;
        const timestamp = Date.parse(x);
        // Date.parse normalizes impossible dates such as February 30 and 24:00.
        return (
            Number.isFinite(timestamp) &&
            new Date(timestamp).toISOString().slice(0, 19) === x.slice(0, 19)
        );
    };
    if (
        ![1, 2, 3, 4, 5].includes(d.version) ||
        (d.version >= 2 && !Array.isArray(d.taskCycles)) ||
        (d.version >= 3 &&
            (!Array.isArray(d.projectProgress) ||
                !Array.isArray(d.projectTracking))) ||
        [d.projectProgress, d.projectTracking].some(
            (rows) => rows !== undefined && !Array.isArray(rows),
        ) ||
        (d.version < 3 &&
            (!!d.projectProgress?.length || !!d.projectTracking?.length)) ||
        (d.taskCycles !== undefined && !Array.isArray(d.taskCycles)) ||
        (d.version === 1 && !!d.taskCycles?.length) ||
        !iso(d.exportedAt) ||
        !["projects", "steps", "tasks", "ideas", "events"].every((k) =>
            Array.isArray(d[k as keyof Snapshot]),
        )
    )
        return fail();
    const ids = new Set<string>();
    for (const [kind, items] of [
        ["projects", d.projects],
        ["steps", d.steps],
        ["tasks", d.tasks],
        ["ideas", d.ideas],
    ] as const)
        for (const x of items) {
            if (
                !x ||
                typeof x.id !== "string" ||
                !x.id ||
                ids.has(x.id) ||
                typeof x.title !== "string" ||
                !x.title.trim() ||
                typeof x.notes !== "string" ||
                !iso(x.createdAt) ||
                !iso(x.updatedAt) ||
                Date.parse(x.updatedAt) < Date.parse(x.createdAt) ||
                [x.startedAt, x.completedAt].some(
                    (v) =>
                        v !== undefined &&
                        (!iso(v) || Date.parse(v) < Date.parse(x.createdAt)),
                )
            )
                return fail();
            ids.add(x.id);
            if (kind === "tasks") {
                const task = x as Task;
                try {
                    validateTaskOptions(task);
                    if (task.today !== undefined) {
                        if (!task.today || typeof task.today !== "object")
                            return fail();
                        validateTaskOptions({
                            schedule: {
                                ...task.today,
                                repeat: "none",
                                leadDays: 0,
                            },
                        });
                    }
                } catch {
                    return fail();
                }
                if (
                    task.scheduleRevision !== undefined &&
                    (!Number.isInteger(task.scheduleRevision) ||
                        task.scheduleRevision < 0)
                )
                    return fail();
                if (
                    task.scheduleCursor !== undefined &&
                    !iso(task.scheduleCursor)
                )
                    return fail();
                if (
                    task.schedule &&
                    (!Number.isInteger(task.scheduleRevision) ||
                        task.scheduleRevision! < 1 ||
                        !iso(task.scheduleSince))
                )
                    return fail();
                if (
                    task.schedule?.repeat !== undefined &&
                    task.schedule.repeat !== "none" &&
                    task.status === "done"
                )
                    return fail();
                if (d.version === 1 && (task.schedule || task.priority))
                    return fail();
            }
            if (
                kind === "projects" &&
                (!["active", "closed"].includes((x as Project).status) ||
                    typeof (x as Project).archived !== "boolean" ||
                    ((x as Project).status === "closed") !== !!x.completedAt)
            )
                return fail();
            if (kind === "ideas" && typeof (x as Idea).archived !== "boolean")
                return fail();
            if (
                (kind === "tasks" || kind === "steps") &&
                (!["todo", "doing", "done"].includes((x as Task).status) ||
                    ((x as Task).status === "done") !== !!x.completedAt ||
                    ((x as Task).status === "doing" && !x.startedAt))
            )
                return fail();
        }
    const projectIds = new Set(d.projects.map((p) => p.id));
    const byId = new Map(d.steps.map((s) => [s.id, s]));
    for (const s of d.steps) {
        if (
            !["stage", "step"].includes(s.kind) ||
            !Number.isInteger(s.order) ||
            s.order < 0 ||
            !projectIds.has(s.projectId) ||
            (s.parentId !== null &&
                (typeof s.parentId !== "string" ||
                    !s.parentId ||
                    byId.get(s.parentId)?.projectId !== s.projectId))
        )
            return fail();
    }
    // Each parent chain is resolved once, including deep imported hierarchies.
    const resolved = new Set<string>();
    for (const step of d.steps) {
        const chain = new Set<string>();
        let current: Step | undefined = step;
        while (current && !resolved.has(current.id)) {
            if (chain.has(current.id)) return fail();
            chain.add(current.id);
            current =
                current.parentId === null
                    ? undefined
                    : byId.get(current.parentId);
        }
        for (const id of chain) resolved.add(id);
    }
    const orders = new Set<string>();
    for (const s of d.steps) {
        const k = JSON.stringify([s.projectId, s.parentId, s.order]);
        if (orders.has(k)) return fail();
        orders.add(k);
    }
    const eventIds = new Set<string>();
    for (const e of d.events) {
        if (
            !e ||
            typeof e.id !== "string" ||
            !e.id ||
            eventIds.has(e.id) ||
            typeof e.entityId !== "string" ||
            !e.entityId ||
            typeof e.title !== "string" ||
            !["project", "step", "task", "idea"].includes(e.entityKind) ||
            ![
                "created",
                "started",
                "completed",
                "reopened",
                "closed",
                "archived",
                "converted",
                "deleted",
            ].includes(e.action) ||
            !iso(e.at)
        )
            return fail();
        eventIds.add(e.id);
    }
    const cycleIds = new Set<string>();
    const taskIds = new Map(d.tasks.map((task) => [task.id, task]));
    for (const c of d.taskCycles ?? []) {
        const task = taskIds.get(c?.taskId);
        // Scheduled periods are [start, end). A schedule edit can close a
        // period at the exact instant of a valid action; legacy rows also
        // include that closing instant to preserve old completion records.
        const withinCycle = (at: string) =>
            iso(at) &&
            Date.parse(at) >= Date.parse(c.start) &&
            (Date.parse(at) < Date.parse(c.end) ||
                (Date.parse(at) === Date.parse(c.end) &&
                    (!!c.closedReason || c.source === "legacy")));
        if (
            !c ||
            !task ||
            cycleIds.has(c.id) ||
            c.id !== JSON.stringify([c.taskId, c.revision, c.start]) ||
            !Number.isInteger(c.revision) ||
            c.revision < 0 ||
            c.revision > (task.scheduleRevision ?? 0) ||
            !iso(c.start) ||
            !iso(c.end) ||
            Date.parse(c.end) < Date.parse(c.start) ||
            !iso(c.scheduledAt) ||
            !["current", "completed", "incomplete"].includes(c.status) ||
            (c.status === "completed") !== !!c.completedAt ||
            (c.completedAt !== undefined && !withinCycle(c.completedAt)) ||
            (c.startedAt !== undefined && !withinCycle(c.startedAt)) ||
            (c.workStatus !== undefined &&
                !["todo", "doing"].includes(c.workStatus)) ||
            (c.closedReason !== undefined &&
                c.closedReason !== "schedule_changed") ||
            (c.plannedEnd !== undefined && !iso(c.plannedEnd)) ||
            (c.source !== undefined && c.source !== "legacy")
        )
            return fail();
        if (typeof c.timeZone !== "string" || !c.timeZone) return fail();
        if (
            c.status === "current" &&
            (!recurring(task) ||
                c.revision !== task.scheduleRevision ||
                c.closedReason)
        )
            return fail();
        if (
            recurring(task) &&
            c.revision === task.scheduleRevision &&
            !c.source &&
            !c.closedReason
        ) {
            const expected = currentCycle(task, new Date(c.start));
            if (
                !expected ||
                expected.id !== c.id ||
                expected.end !== c.end ||
                expected.scheduledAt !== c.scheduledAt ||
                c.timeZone !== task.schedule!.timeZone
            )
                return fail();
        }
        try {
            new Intl.DateTimeFormat("ar", { timeZone: c.timeZone }).format();
        } catch {
            return fail();
        }
        cycleIds.add(c.id);
    }
    const cycleGroups = new Map<string, TaskCycle[]>();
    for (const c of d.taskCycles ?? []) {
        const group = cycleGroups.get(c.taskId) ?? [];
        group.push(c);
        cycleGroups.set(c.taskId, group);
    }
    for (const task of d.tasks)
        if (recurring(task) && task.scheduleCursor) {
            const rows = (cycleGroups.get(task.id) ?? [])
                .filter(
                    (c) =>
                        c.revision === task.scheduleRevision &&
                        !c.source &&
                        !c.closedReason,
                )
                .sort((a, b) => a.start.localeCompare(b.start));
            let cursor = new Date(firstCycleStart(task)).toISOString();
            for (const c of rows) {
                if (c.start !== cursor) return fail();
                cursor = c.end;
            }
            if (cursor !== task.scheduleCursor) return fail();
        }
    const tracked = new Map<string, ProjectTracking>();
    const projectById = new Map(d.projects.map((p) => [p.id, p]));
    const percent = (n: unknown) =>
        n === null ||
        (Number.isInteger(n) && Number(n) >= 0 && Number(n) <= 100);
    for (const tracking of d.projectTracking ?? []) {
        const project = projectById.get(tracking?.projectId);
        if (
            !tracking ||
            !project ||
            tracked.has(tracking.projectId) ||
            !iso(tracking.since) ||
            (tracking.origin === "new" &&
                Date.parse(tracking.since) < Date.parse(project.createdAt)) ||
            !percent(tracking.initialPercent) ||
            !["new", "existing"].includes(tracking.origin) ||
            !Number.isInteger(tracking.lastOrder) ||
            tracking.lastOrder < 0 ||
            (tracking.lastProgressAt !== undefined &&
                (!iso(tracking.lastProgressAt) ||
                    Date.parse(tracking.lastProgressAt) <
                        Date.parse(tracking.since)))
        )
            return fail();
        tracked.set(tracking.projectId, tracking);
    }
    if (d.version >= 3 && tracked.size !== d.projects.length) return fail();
    const records = new Map<string, ProjectProgress[]>(),
        recordIds = new Set<string>();
    for (const row of d.projectProgress ?? []) {
        const tracking = tracked.get(row?.projectId);
        if (
            !row ||
            !tracking ||
            recordIds.has(row.id) ||
            row.id !== JSON.stringify([row.projectId, row.order]) ||
            !Number.isInteger(row.order) ||
            row.order < 1 ||
            !iso(row.at) ||
            Date.parse(row.at) < Date.parse(tracking.since) ||
            !percent(row.before) ||
            !percent(row.after) ||
            row.before === row.after ||
            ![
                "completion",
                "reopen",
                "step_added",
                "step_deleted",
                "structure_changed",
                "restore",
            ].includes(row.reason)
        )
            return fail();
        recordIds.add(row.id);
        const rows = records.get(row.projectId) ?? [];
        rows.push(row);
        records.set(row.projectId, rows);
    }
    for (const tracking of tracked.values()) {
        const rows = (records.get(tracking.projectId) ?? []).sort(
            (a, b) => a.order - b.order,
        );
        let previous = tracking.initialPercent,
            stamp = Date.parse(tracking.since),
            order = 0;
        for (const row of rows) {
            if (
                row.order !== ++order ||
                row.before !== previous ||
                Date.parse(row.at) < stamp
            )
                return fail();
            previous = row.after;
            stamp = Date.parse(row.at);
        }
        const lastWork = rows
            .filter(
                (row) =>
                    row.reason === "completion" &&
                    (row.after ?? 0) > (row.before ?? 0),
            )
            .at(-1)?.at;
        if (
            order !== tracking.lastOrder ||
            tracking.lastProgressAt !== lastWork
        )
            return fail();
    }
    validatePaceData(d, fail);
    validateHabitData(d, fail);
    return structuredClone(d);
}

export function parseBackup(text: string): Snapshot {
    let input: unknown;
    try {
        input = JSON.parse(text);
    } catch {
        throw new Error("تعذر قراءة النسخة: الملف ليس ملف JSON صالحًا.");
    }
    return validateBackup(input);
}
