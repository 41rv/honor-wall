import Dexie, { type Table } from "dexie";
import { validateProjectImport, importNodes } from "./projectImport";
import { buildHierarchy, type Hierarchy } from "./hierarchy";
import {
    base,
    now,
    uid,
    children,
    descendants,
    validateBackup,
    type Project,
    type Step,
    type Task,
    type Idea,
    type Event,
    type Snapshot,
    type EntityKind,
    type Status,
    type Action,
} from "./model";
export class Database extends Dexie {
    projects!: Table<Project, string>;
    steps!: Table<Step, string>;
    tasks!: Table<Task, string>;
    ideas!: Table<Idea, string>;
    events!: Table<Event, string>;
    constructor(name = "masar-v1") {
        super(name);
        this.version(1).stores({
            projects: "id,updatedAt,status,archived",
            steps: "id,projectId,parentId,order,status",
            tasks: "id,status,completedAt",
            ideas: "id,archived,updatedAt",
            events: "id,entityId,at,action",
        });
    }
}
export const db = new Database();
// Additive import: one transaction, fresh IDs, no changes to existing rows.
export async function importProject(input: unknown): Promise<string> {
    const file = validateProjectImport(input);
    const project: Project = {
        ...base(file.project.title, file.project.description),
        status: "active",
        archived: false,
    };
    const nodes = importNodes(file);
    const ids = nodes.map(() => uid());
    const steps: Step[] = nodes.map((node, i) => ({
        ...base(node.title, node.notes),
        id: ids[i],
        projectId: project.id,
        parentId: node.parent === null ? null : ids[node.parent],
        kind: node.kind,
        order: node.order,
        status: "todo",
    }));
    const events: Event[] = [project, ...steps].map((item) => ({
        id: uid(),
        entityId: item.id,
        entityKind: item === project ? "project" : "step",
        title: item.title,
        action: "created",
        at: item.createdAt,
    }));
    await db.transaction("rw", [db.projects, db.steps, db.events], async () => {
        await db.projects.add(project);
        await db.steps.bulkAdd(steps);
        await db.events.bulkAdd(events);
    });
    return project.id;
}
const table = (kind: EntityKind) =>
    kind === "project"
        ? db.projects
        : kind === "step"
          ? db.steps
          : kind === "task"
            ? db.tasks
            : db.ideas;
export async function event(
    kind: EntityKind,
    item: { id: string; title: string },
    action: Action,
    at = now(),
) {
    await db.events.add({
        id: uid(),
        entityId: item.id,
        entityKind: kind,
        title: item.title,
        action,
        at,
    });
}
export async function snapshot(): Promise<Snapshot> {
    return db.transaction("r", db.tables, async () => {
        const [projects, steps, tasks, ideas, events] = await Promise.all([
            db.projects.toArray(),
            db.steps.toArray(),
            db.tasks.toArray(),
            db.ideas.toArray(),
            db.events.toArray(),
        ]);
        return {
            version: 1,
            exportedAt: now(),
            projects,
            steps,
            tasks,
            ideas,
            events,
        };
    });
}
export async function create(
    kind: EntityKind,
    title: string,
    notes = "",
    projectId?: string,
    parentId: string | null = null,
    stage = false,
) {
    if (!title.trim()) throw new Error("أدخل اسمًا أولًا.");
    return db.transaction(
        "rw",
        kind === "step"
            ? [db.steps, db.projects, db.events]
            : [table(kind), db.events],
        async () => {
            const b = base(title, notes);
            let item: Project | Step | Task | Idea;
            if (kind === "project")
                item = { ...b, status: "active", archived: false };
            else if (kind === "task") item = { ...b, status: "todo" };
            else if (kind === "idea") item = { ...b, archived: false };
            else {
                if (!projectId || !(await db.projects.get(projectId)))
                    throw new Error("المشروع غير موجود.");
                if (parentId) {
                    const p = await db.steps.get(parentId);
                    if (!p || p.projectId !== projectId)
                        throw new Error("المرحلة غير موجودة.");
                }
                const siblings = await db.steps
                    .where("projectId")
                    .equals(projectId)
                    .toArray();
                item = {
                    ...b,
                    projectId,
                    parentId,
                    kind: stage ? "stage" : "step",
                    order:
                        Math.max(
                            -1,
                            ...siblings
                                .filter((s) => s.parentId === parentId)
                                .map((s) => s.order),
                        ) + 1,
                    status: "todo",
                };
            }
            await (table(kind) as Table).add(item);
            await event(kind, item, "created");
            if (kind === "step") await refresh(projectId!, parentId);
            return item.id;
        },
    );
}
async function refresh(projectId: string, parentId: string | null) {
    const at = now();
    const steps = await db.steps.where("projectId").equals(projectId).toArray();
    const index = buildHierarchy(steps);
    for (let parent = parentId; parent;) {
        const s = index.byId.get(parent);
        if (!s) break;
        const state = index.nodes.get(parent)!.status;
        parent = s.parentId;
        if (state === s.status) continue;
        await db.steps.update(s.id, {
            status: state,
            updatedAt: at,
            completedAt: state === "done" ? at : undefined,
            startedAt: state === "doing" ? (s.startedAt ?? at) : s.startedAt,
        });
        await event(
            "step",
            s,
            state === "done"
                ? "completed"
                : s.status === "done"
                  ? "reopened"
                  : state === "doing"
                    ? "started"
                    : "reopened",
            at,
        );
    }
    await db.projects.update(projectId, { updatedAt: at });
    await closeIfFinished(projectId, index, at);
}
// Compare the actual leaf counts, never a rounded percentage or an empty stage.
// Called inside the same transaction as the step changes and their event log.
async function closeIfFinished(
    projectId: string,
    index: Hierarchy,
    at: string,
) {
    const metric = index.metric(projectId);
    if (!metric.total || metric.done !== metric.total) return;
    const p = await db.projects.get(projectId);
    if (!p || p.status === "closed") return;
    await db.projects.update(projectId, {
        status: "closed",
        completedAt: at,
        updatedAt: at,
    });
    await event("project", p, "closed", at);
}
// Also apply the new rule to existing data when opening the app or a backup.
export async function completeFinishedProjects() {
    await db.transaction("rw", [db.projects, db.steps, db.events], async () => {
        const projects = await db.projects
            .where("status")
            .equals("active")
            .toArray();
        if (!projects.length) return;
        const index = buildHierarchy(await db.steps.toArray());
        const at = now();
        for (const p of projects) await closeIfFinished(p.id, index, at);
    });
}
export async function update(
    kind: EntityKind,
    id: string,
    patch: { title?: string; notes?: string },
) {
    if (patch.title !== undefined && !patch.title.trim())
        throw new Error("الاسم لا يمكن أن يكون فارغًا.");
    await db.transaction(
        "rw",
        kind === "step" ? [db.steps, db.projects] : [table(kind)],
        async () => {
            const t = table(kind) as Table;
            const item = await t.get(id);
            if (!item) throw new Error("العنصر غير موجود.");
            await t.update(id, {
                ...patch,
                title: patch.title?.trim() ?? item.title,
                updatedAt: now(),
            });
            if (kind === "step")
                await db.projects.update(item.projectId, { updatedAt: now() });
        },
    );
}
export async function changeStatus(
    kind: "task" | "step",
    id: string,
    status: Status,
) {
    await db.transaction(
        "rw",
        kind === "step"
            ? [db.steps, db.projects, db.events]
            : [db.tasks, db.events],
        async () => {
            const t = table(kind) as Table<Task | Step, string>;
            const item = await t.get(id);
            if (!item || item.status === status) return;
            if (
                kind === "step" &&
                (await db.steps.where("parentId").equals(id).count())
            )
                throw new Error("حالة هذا الفرع تُحسب من خطواته النهائية.");
            const at = now();
            await t.update(id, {
                status,
                updatedAt: at,
                startedAt:
                    status === "doing"
                        ? (item.startedAt ?? at)
                        : item.startedAt,
                completedAt: status === "done" ? at : undefined,
            });
            await event(
                kind,
                item,
                status === "done"
                    ? "completed"
                    : item.status === "done"
                      ? "reopened"
                      : status === "doing"
                        ? "started"
                        : "reopened",
                at,
            );
            if (kind === "step") {
                const s = item as Step;
                if (status === "doing") {
                    const p = await db.projects.get(s.projectId);
                    if (p && !p.startedAt)
                        await db.projects.update(p.id, { startedAt: at });
                }
                await refresh(s.projectId, s.parentId);
            }
        },
    );
}
export async function projectState(id: string, action: "archive" | "close") {
    await db.transaction("rw", [db.projects, db.events], async () => {
        const p = await db.projects.get(id);
        if (!p) return;
        const at = now();
        if (action === "archive") {
            await db.projects.update(id, {
                archived: !p.archived,
                updatedAt: at,
            });
            await event("project", p, p.archived ? "reopened" : "archived", at);
        } else {
            const closed = p.status === "active";
            await db.projects.update(id, {
                status: closed ? "closed" : "active",
                completedAt: closed ? at : undefined,
                updatedAt: at,
            });
            await event("project", p, closed ? "closed" : "reopened", at);
        }
    });
}
export async function archiveIdea(id: string) {
    await db.transaction("rw", db.ideas, db.events, async () => {
        const x = await db.ideas.get(id);
        if (x) {
            await db.ideas.update(id, {
                archived: !x.archived,
                updatedAt: now(),
            });
            await event("idea", x, x.archived ? "reopened" : "archived");
        }
    });
}
export async function convertIdea(id: string, kind: "task" | "project") {
    return db.transaction("rw", db.tables, async () => {
        const idea = await db.ideas.get(id);
        if (!idea) throw new Error("الفكرة غير موجودة.");
        const newId = await create(kind, idea.title, idea.notes);
        await db.ideas.update(id, { archived: true, updatedAt: now() });
        await event("idea", idea, "converted");
        return newId;
    });
}
export async function reorder(id: string, direction: -1 | 1) {
    await db.transaction("rw", [db.steps, db.projects], async () => {
        const s = await db.steps.get(id);
        if (!s) return;
        const all = await db.steps
            .where("projectId")
            .equals(s.projectId)
            .toArray();
        const siblings = children(all, s.parentId, s.projectId);
        const index = siblings.findIndex((x) => x.id === id);
        const other = siblings[index + direction];
        if (!other) return;
        await db.steps.update(id, { order: other.order, updatedAt: now() });
        await db.steps.update(other.id, { order: s.order, updatedAt: now() });
        await db.projects.update(s.projectId, { updatedAt: now() });
    });
}
export async function remove(kind: EntityKind, id: string) {
    return db.transaction(
        "rw",
        kind === "project" || kind === "step"
            ? [db.projects, db.steps, db.events]
            : [table(kind), db.events],
        async () => {
            const item = await (table(kind) as Table).get(id);
            if (!item) return null;
            const steps =
                kind === "project"
                    ? await db.steps.where("projectId").equals(id).toArray()
                    : kind === "step"
                      ? descendants(await db.steps.toArray(), id)
                      : [];
            await (table(kind) as Table).delete(id);
            if (steps.length) await db.steps.bulkDelete(steps.map((s) => s.id));
            await event(kind, item, "deleted");
            if (kind === "step") await refresh(item.projectId, item.parentId);
            return { kind, item, steps } as Deleted;
        },
    );
}
export interface Deleted {
    kind: EntityKind;
    item: Project | Step | Task | Idea;
    steps: Step[];
}
export async function undo(data: Deleted) {
    await db.transaction(
        "rw",
        data.kind === "project" || data.kind === "step"
            ? [db.projects, db.steps, db.events]
            : [table(data.kind), db.events],
        async () => {
            // Retrying a successful undo must not overwrite later edits or
            // append another restoration event.
            if (await (table(data.kind) as Table).get(data.item.id)) return;
            if (data.kind === "step") {
                const s = data.item as Step;
                if (
                    !(await db.projects.get(s.projectId)) ||
                    (s.parentId && !(await db.steps.get(s.parentId)))
                )
                    throw new Error(
                        "تعذر الاستعادة؛ المشروع أو الفرع الأب غير موجود.",
                    );
                const siblings = await db.steps
                    .where("projectId")
                    .equals(s.projectId)
                    .toArray();
                if (
                    siblings.some(
                        (x) => x.parentId === s.parentId && x.order === s.order,
                    )
                )
                    s.order =
                        Math.max(
                            -1,
                            ...siblings
                                .filter((x) => x.parentId === s.parentId)
                                .map((x) => x.order),
                        ) + 1;
            }
            await (table(data.kind) as Table).put(data.item);
            if (data.steps.length) await db.steps.bulkPut(data.steps);
            await event(data.kind, data.item, "reopened");
            if (data.kind === "step")
                await refresh(
                    (data.item as Step).projectId,
                    (data.item as Step).parentId,
                );
        },
    );
}
export async function importBackup(input: unknown) {
    const data = validateBackup(input);
    await db.transaction("rw", db.tables, async () => {
        for (const t of db.tables) await t.clear();
        await db.projects.bulkAdd(data.projects);
        await db.steps.bulkAdd(data.steps);
        await db.tasks.bulkAdd(data.tasks);
        await db.ideas.bulkAdd(data.ideas);
        await db.events.bulkAdd(data.events);
        await completeFinishedProjects();
    });
}
// Complete or reopen an entire branch in one atomic operation. Only terminal
// executable steps count toward progress; empty stages can still have a state.
export async function setBranchCompletion(id: string, complete: boolean) {
    await db.transaction("rw", [db.steps, db.projects, db.events], async () => {
        const root = await db.steps.get(id);
        if (!root) throw new Error("الخطوة أو المرحلة غير موجودة.");
        const all = await db.steps
            .where("projectId")
            .equals(root.projectId)
            .toArray();
        const index = buildHierarchy(all);
        const subtree = [root, ...descendants(all, id)];
        const at = now();
        const desired: Status = complete ? "done" : "todo";
        const updates = new Map<string, Step>();
        const logs: Event[] = [];
        const set = (s: Step, status: Status) => {
            if (s.status === status) return;
            updates.set(s.id, {
                ...s,
                status,
                updatedAt: at,
                startedAt:
                    status === "doing" ? (s.startedAt ?? at) : s.startedAt,
                completedAt: status === "done" ? at : undefined,
            });
            logs.push({
                id: uid(),
                entityId: s.id,
                entityKind: "step",
                title: s.title,
                action:
                    status === "done"
                        ? "completed"
                        : s.status === "done" || status === "todo"
                          ? "reopened"
                          : "started",
                at,
            });
        };
        for (const s of subtree)
            if (!index.children(s.projectId, s.id).length) set(s, desired);
        const next = all.map((s) => updates.get(s.id) ?? s);
        const after = buildHierarchy(next);
        const parents = new Set(
            subtree
                .filter((s) => index.children(s.projectId, s.id).length)
                .map((s) => s.id),
        );
        let parent = root.parentId;
        while (parent) {
            parents.add(parent);
            parent = index.byId.get(parent)?.parentId ?? null;
        }
        for (const id of parents) {
            const s = index.byId.get(id)!;
            set(s, after.nodes.get(id)!.status);
        }
        if (updates.size) {
            await db.steps.bulkPut([...updates.values()]);
            await db.events.bulkAdd(logs);
            await db.projects.update(root.projectId, { updatedAt: at });
            await closeIfFinished(root.projectId, after, at);
        }
    });
}
export async function setProjectCompletion(id: string, complete: boolean) {
    await db.transaction("rw", [db.projects, db.events], async () => {
        const p = await db.projects.get(id);
        if (!p) throw new Error("المشروع غير موجود.");
        const status = complete ? "closed" : "active";
        if (p.status === status) return;
        const at = now();
        await db.projects.update(id, {
            status,
            updatedAt: at,
            completedAt: complete ? at : undefined,
        });
        await event("project", p, complete ? "closed" : "reopened", at);
    });
}
