import Dexie, { type Table } from "dexie";
import {
    currentCycle,
    cycleBatch,
    recurring,
    validateTaskOptions,
    localDay,
    localZone,
} from "./taskSchedule";
import type { TaskCycle, TaskOptions } from "./taskTypes";
import type {
    ProjectProgress,
    ProjectTracking,
    ProgressReason,
} from "./projectProgressTypes";
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
import type {
    ProjectPlan,
    StepWork,
    PaceRecommendation,
    PaceSettings,
} from "./paceTypes";
import { activeProject } from "./projectPace";
export class Database extends Dexie {
    projectPlans!: Table<ProjectPlan, string>;
    stepWork!: Table<StepWork, string>;
    recommendations!: Table<PaceRecommendation, string>;
    paceSettings!: Table<PaceSettings, string>;
    projects!: Table<Project, string>;
    steps!: Table<Step, string>;
    tasks!: Table<Task, string>;
    ideas!: Table<Idea, string>;
    events!: Table<Event, string>;
    taskCycles!: Table<TaskCycle, string>;
    projectProgress!: Table<ProjectProgress, string>;
    projectTracking!: Table<ProjectTracking, string>;
    constructor(name = "masar-v1") {
        super(name);
        this.version(1).stores({
            projects: "id,updatedAt,status,archived",
            steps: "id,projectId,parentId,order,status",
            tasks: "id,status,completedAt",
            ideas: "id,archived,updatedAt",
            events: "id,entityId,at,action",
        });
        // Add one store and an optional index; existing rows and IDs stay intact.
        this.version(2).stores({
            tasks: "id,status,completedAt,schedule.repeat",
            taskCycles:
                "id,taskId,[taskId+revision+start],[status+end],end,status,completedAt",
        });
        this.version(3).stores({
            taskCycles:
                "id,taskId,[taskId+revision+start],[status+end],end,status,completedAt,scheduledAt",
        });
        this.version(4)
            .stores({
                projectProgress: "id,projectId,[projectId+order],at,reason",
                projectTracking: "projectId,since",
            })
            .upgrade(async (tx) => {
                const projects = (await tx
                    .table("projects")
                    .toArray()) as Project[];
                const index = buildHierarchy(
                    (await tx.table("steps").toArray()) as Step[],
                );
                const since = now();
                await tx.table("projectTracking").bulkAdd(
                    projects.map((p) => ({
                        projectId: p.id,
                        since,
                        initialPercent: index.metric(p.id).percent,
                        origin: "existing",
                        lastOrder: 0,
                    })),
                );
            });
        this.version(5)
            .stores({
                projectPlans: "projectId,since",
                stepWork: "id,projectId,[projectId+at],at,stepId",
                recommendations: "id,key,status,createdAt,*projectIds",
                paceSettings: "id",
            })
            .upgrade(async (tx) => {
                const projects = (await tx
                    .table("projects")
                    .toArray()) as Project[];
                const since = now();
                await tx.table("projectPlans").bulkAdd(
                    projects.map((p) => ({
                        projectId: p.id,
                        since,
                        revision: 0,
                        workOrder: 0,
                        pauses: [],
                    })),
                );
                await tx
                    .table("paceSettings")
                    .put({ id: "pace", activeLimit: 3 });
            });
    }
}
export const db = new Database();
async function captureProjectProgress(projectId: string) {
    const project = await db.projects.get(projectId);
    if (!project) throw new Error("المشروع غير موجود.");
    const percent = buildHierarchy(
        await db.steps.where("projectId").equals(projectId).toArray(),
    ).metric(projectId).percent;
    if (!(await db.projectTracking.get(projectId)))
        await db.projectTracking.add({
            projectId,
            since: now(),
            initialPercent: percent,
            origin: "existing",
            lastOrder: 0,
        });
    return percent;
}
async function recordProjectProgress(
    projectId: string,
    before: number | null,
    reason: ProgressReason,
    intendedAt?: string,
) {
    const after = buildHierarchy(
        await db.steps.where("projectId").equals(projectId).toArray(),
    ).metric(projectId).percent;
    if (before === after) return;
    const tracking = (await db.projectTracking.get(projectId))!;
    const order = tracking.lastOrder + 1;
    const at = intendedAt ?? now();
    await db.projectProgress.add({
        id: JSON.stringify([projectId, order]),
        projectId,
        order,
        at,
        before,
        after,
        reason,
    });
    await db.projectTracking.update(projectId, {
        lastOrder: order,
        ...(reason === "completion" && (after ?? 0) > (before ?? 0)
            ? { lastProgressAt: at }
            : {}),
    });
}
export async function ensureProjectTracking() {
    await db.transaction(
        "rw",
        [db.projects, db.steps, db.projectTracking],
        async () => {
            const projects = await db.projects.toArray(),
                tracking = new Set(
                    (await db.projectTracking.toArray()).map(
                        (t) => t.projectId,
                    ),
                );
            const missing = projects.filter((p) => !tracking.has(p.id));
            if (!missing.length) return;
            const index = buildHierarchy(await db.steps.toArray()),
                since = now();
            await db.projectTracking.bulkAdd(
                missing.map((p) => ({
                    projectId: p.id,
                    since,
                    initialPercent: index.metric(p.id).percent,
                    origin: "existing" as const,
                    lastOrder: 0,
                })),
            );
        },
    );
}
const todayPrefix = "masar-pending-today/";
export async function selectTaskToday(
    id: string,
    selected: boolean,
    at = new Date(),
    timeZone = localZone(),
) {
    const today = selected
        ? { date: localDay(at, timeZone).toString(), timeZone }
        : undefined;
    const key = todayPrefix + encodeURIComponent(id);
    const intent = JSON.stringify({ id, today: today ?? null });
    try {
        localStorage.setItem(key, intent);
    } catch {
        /* IndexedDB remains primary. */
    }
    try {
        await db.transaction("rw", db.tasks, async () => {
            const task = await db.tasks.get(id);
            if (!task) throw new Error("المهمة غير موجودة.");
            if (task.schedule)
                throw new Error("الاختيار اليدوي للمهام العامة بدون موعد فقط.");
            await db.tasks.update(id, {
                today,
            });
        });
    } finally {
        try {
            if (localStorage.getItem(key) === intent)
                localStorage.removeItem(key);
        } catch {
            /* Primary write is unaffected. */
        }
    }
}
export async function restoreTodaySelections() {
    let keys: string[];
    try {
        keys = Object.keys(localStorage).filter((k) =>
            k.startsWith(todayPrefix),
        );
    } catch {
        return;
    }
    for (const key of keys) {
        const raw = localStorage.getItem(key);
        let record: { id: string; today: Task["today"] | null };
        try {
            record = JSON.parse(raw ?? "null");
            if (
                !record ||
                typeof record.id !== "string" ||
                key !== todayPrefix + encodeURIComponent(record.id)
            )
                throw new Error();
            if (record.today !== null) {
                if (!record.today) throw new Error();
                validateTaskOptions({
                    schedule: { ...record.today, repeat: "none", leadDays: 0 },
                });
            }
        } catch {
            localStorage.removeItem(key);
            continue;
        }
        await db.transaction("rw", db.tasks, async () => {
            const task = await db.tasks.get(record.id);
            if (task && !task.schedule)
                await db.tasks.update(task.id, {
                    today: record.today ?? undefined,
                });
        });
        if (localStorage.getItem(key) === raw) localStorage.removeItem(key);
    }
}
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
    await db.transaction(
        "rw",
        [
            db.projects,
            db.steps,
            db.events,
            db.projectTracking,
            db.projectPlans,
            db.paceSettings,
        ],
        async () => {
            await assertProjectCapacity();
            await db.projects.add(project);
            await db.projectPlans.add({
                projectId: project.id,
                since: now(),
                revision: 0,
                workOrder: 0,
                pauses: [],
            });
            await db.steps.bulkAdd(steps);
            await db.events.bulkAdd(events);
            await db.projectTracking.add({
                projectId: project.id,
                since: project.createdAt,
                initialPercent: buildHierarchy(steps).metric(project.id)
                    .percent,
                origin: "new",
                lastOrder: 0,
            });
        },
    );
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
    await reconcileTaskCycles();
    await ensureProjectTracking();
    await ensurePacePlans();
    return db.transaction("r", db.tables, async () => {
        const [
            projects,
            steps,
            tasks,
            ideas,
            events,
            taskCycles,
            projectProgress,
            projectTracking,
            projectPlans,
            stepWork,
            recommendations,
            paceSettings,
        ] = await Promise.all([
            db.projects.toArray(),
            db.steps.toArray(),
            db.tasks.toArray(),
            db.ideas.toArray(),
            db.events.toArray(),
            db.taskCycles.toArray(),
            db.projectProgress.toArray(),
            db.projectTracking.toArray(),
            db.projectPlans.toArray(),
            db.stepWork.toArray(),
            db.recommendations.toArray(),
            db.paceSettings.toArray(),
        ]);
        return {
            version: 4,
            exportedAt: now(),
            projects,
            steps,
            tasks,
            ideas,
            events,
            taskCycles,
            projectProgress,
            projectTracking,
            projectPlans,
            stepWork,
            recommendations,
            paceSettings,
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
    taskOptions: TaskOptions = {},
) {
    if (!title.trim()) throw new Error("أدخل اسمًا أولًا.");
    return db.transaction(
        "rw",
        kind === "step"
            ? [
                  db.steps,
                  db.projects,
                  db.events,
                  db.projectTracking,
                  db.projectProgress,
                  db.projectPlans,
                  db.stepWork,
                  db.recommendations,
                  db.paceSettings,
              ]
            : kind === "task"
              ? [db.tasks, db.events, db.taskCycles]
              : kind === "project"
                ? [
                      db.projects,
                      db.events,
                      db.projectTracking,
                      db.projectPlans,
                      db.paceSettings,
                  ]
                : [table(kind), db.events],
        async () => {
            const b = base(title, notes);
            const previous =
                kind === "step" && projectId
                    ? await captureProjectProgress(projectId)
                    : null;
            let item: Project | Step | Task | Idea;
            if (kind === "project") {
                await assertProjectCapacity();
                item = { ...b, status: "active", archived: false };
                await db.projectPlans.add({
                    projectId: b.id,
                    since: b.createdAt,
                    revision: 0,
                    workOrder: 0,
                    pauses: [],
                });
            } else if (kind === "task") {
                const options = validateTaskOptions(taskOptions);
                item = {
                    ...b,
                    ...options,
                    status: "todo",
                    ...(options.schedule
                        ? { scheduleRevision: 1, scheduleSince: b.createdAt }
                        : {}),
                };
            } else if (kind === "idea") item = { ...b, archived: false };
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
            if (kind === "project")
                await db.projectTracking.add({
                    projectId: item.id,
                    since: item.createdAt,
                    initialPercent: null,
                    origin: "new",
                    lastOrder: 0,
                });
            if (kind === "task") {
                const cycle = currentCycle(
                    item as Task,
                    new Date(item.createdAt),
                );
                if (cycle) {
                    await db.taskCycles.add(cycle);
                    await db.tasks.update(item.id, {
                        scheduleCursor: cycle.end,
                    });
                }
            }
            if (kind === "step") {
                await refresh(projectId!, parentId);
                await recordProjectProgress(projectId!, previous, "step_added");
            }
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
    await ensureProjectTracking();
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
            ? [
                  db.steps,
                  db.projects,
                  db.events,
                  db.projectTracking,
                  db.projectProgress,
                  db.projectPlans,
                  db.stepWork,
                  db.recommendations,
                  db.paceSettings,
              ]
            : [db.tasks, db.events],
        async () => {
            const t = table(kind) as Table<Task | Step, string>;
            const item = await t.get(id);
            if (!item || item.status === status) return;
            if (kind === "task" && recurring(item as Task))
                throw new Error(
                    "أنجز الدورة الحالية بدل إغلاق المهمة المتكررة.",
                );
            if (
                kind === "step" &&
                (await db.steps.where("parentId").equals(id).count())
            )
                throw new Error("حالة هذا الفرع تُحسب من خطواته النهائية.");
            const at = now();
            const previous =
                kind === "step"
                    ? await captureProjectProgress((item as Step).projectId)
                    : null;
            if (
                kind === "step" &&
                (item as Step).kind === "step" &&
                (status === "done" || item.status === "done")
            )
                await recordStepWork(item as Step, status === "done", at);
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
                await recordProjectProgress(
                    s.projectId,
                    previous,
                    status === "done" ? "completion" : "reopen",
                    at,
                );
            }
        },
    );
}
export async function projectState(id: string, action: "archive" | "close") {
    await db.transaction(
        "rw",
        [db.projects, db.events, db.projectPlans, db.paceSettings],
        async () => {
            const p = await db.projects.get(id);
            if (!p) return;
            const at = now();
            if (
                (action === "archive" && p.archived && p.status === "active") ||
                (action === "close" && p.status === "closed" && !p.archived)
            )
                await assertProjectCapacity(id);
            if (action === "archive") {
                await db.projects.update(id, {
                    archived: !p.archived,
                    updatedAt: at,
                });
                await event(
                    "project",
                    p,
                    p.archived ? "reopened" : "archived",
                    at,
                );
            } else {
                const closed = p.status === "active";
                await db.projects.update(id, {
                    status: closed ? "closed" : "active",
                    completedAt: closed ? at : undefined,
                    updatedAt: at,
                });
                await event("project", p, closed ? "closed" : "reopened", at);
            }
        },
    );
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
            ? [
                  db.projects,
                  db.steps,
                  db.events,
                  db.projectTracking,
                  db.projectProgress,
                  db.projectPlans,
                  db.stepWork,
                  db.recommendations,
                  db.paceSettings,
              ]
            : kind === "task"
              ? [db.tasks, db.taskCycles, db.events]
              : [table(kind), db.events],
        async () => {
            const item = await (table(kind) as Table).get(id);
            if (!item) return null;
            const previous =
                kind === "step"
                    ? await captureProjectProgress(item.projectId)
                    : null;
            const tracking =
                kind === "project"
                    ? await db.projectTracking.get(id)
                    : undefined;
            const projectProgress =
                kind === "project"
                    ? await db.projectProgress
                          .where("projectId")
                          .equals(id)
                          .toArray()
                    : [];
            const paceData =
                kind === "project"
                    ? {
                          plan: await db.projectPlans.get(id),
                          work: await db.stepWork
                              .where("projectId")
                              .equals(id)
                              .toArray(),
                          recommendations: await db.recommendations
                              .where("projectIds")
                              .equals(id)
                              .toArray(),
                      }
                    : undefined;
            const steps =
                kind === "project"
                    ? await db.steps.where("projectId").equals(id).toArray()
                    : kind === "step"
                      ? descendants(await db.steps.toArray(), id)
                      : [];
            const taskCycles =
                kind === "task"
                    ? await db.taskCycles.where("taskId").equals(id).toArray()
                    : [];
            await (table(kind) as Table).delete(id);
            if (steps.length) await db.steps.bulkDelete(steps.map((s) => s.id));
            if (taskCycles.length)
                await db.taskCycles.bulkDelete(taskCycles.map((c) => c.id));
            await event(kind, item, "deleted");
            if (kind === "step") {
                await refresh(item.projectId, item.parentId);
                await recordProjectProgress(
                    item.projectId,
                    previous,
                    "step_deleted",
                );
            }
            if (kind === "project") {
                await db.projectPlans.delete(id);
                await db.stepWork.where("projectId").equals(id).delete();
                if (paceData?.recommendations.length)
                    await db.recommendations.bulkDelete(
                        paceData.recommendations.map((r) => r.id),
                    );
                await db.projectTracking.delete(id);
                await db.projectProgress.where("projectId").equals(id).delete();
            }
            return {
                kind,
                item,
                steps,
                taskCycles,
                tracking,
                projectProgress,
                paceData,
            } as Deleted;
        },
    );
}
export interface Deleted {
    paceData?: {
        plan?: ProjectPlan;
        work: StepWork[];
        recommendations: PaceRecommendation[];
    };
    kind: EntityKind;
    item: Project | Step | Task | Idea;
    steps: Step[];
    taskCycles?: TaskCycle[];
    tracking?: ProjectTracking;
    projectProgress?: ProjectProgress[];
}
export async function undo(data: Deleted) {
    await db.transaction(
        "rw",
        data.kind === "project" || data.kind === "step"
            ? [
                  db.projects,
                  db.steps,
                  db.events,
                  db.projectTracking,
                  db.projectProgress,
                  db.projectPlans,
                  db.stepWork,
                  db.recommendations,
                  db.paceSettings,
              ]
            : data.kind === "task"
              ? [db.tasks, db.taskCycles, db.events]
              : [table(data.kind), db.events],
        async () => {
            // Retrying a successful undo must not overwrite later edits or
            // append another restoration event.
            if (await (table(data.kind) as Table).get(data.item.id)) return;
            const previous =
                data.kind === "step"
                    ? await captureProjectProgress(
                          (data.item as Step).projectId,
                      )
                    : null;
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
            if (data.kind === "project") {
                if (activeProject(data.item as Project, data.paceData?.plan))
                    await assertProjectCapacity();
                if (data.paceData?.plan)
                    await db.projectPlans.put(data.paceData.plan);
                if (data.paceData?.work.length)
                    await db.stepWork.bulkPut(data.paceData.work);
                if (data.paceData?.recommendations.length) {
                    const projects = new Set(
                        (await db.projects.toArray())
                            .map((p) => p.id)
                            .concat(data.item.id),
                    );
                    await db.recommendations.bulkPut(
                        data.paceData.recommendations.filter((r) =>
                            r.projectIds.every((id) => projects.has(id)),
                        ),
                    );
                }
            }
            await (table(data.kind) as Table).put(data.item);
            if (data.steps.length) await db.steps.bulkPut(data.steps);
            if (data.taskCycles?.length)
                await db.taskCycles.bulkPut(data.taskCycles);
            if (data.tracking) await db.projectTracking.put(data.tracking);
            if (data.projectProgress?.length)
                await db.projectProgress.bulkPut(data.projectProgress);
            await event(data.kind, data.item, "reopened");
            if (data.kind === "step") {
                await refresh(
                    (data.item as Step).projectId,
                    (data.item as Step).parentId,
                );
                await recordProjectProgress(
                    (data.item as Step).projectId,
                    previous,
                    "restore",
                );
            }
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
        await db.taskCycles.bulkAdd(data.taskCycles ?? []);
        await db.projectTracking.bulkAdd(data.projectTracking ?? []);
        await db.projectProgress.bulkAdd(data.projectProgress ?? []);
        await db.projectPlans.bulkAdd(data.projectPlans ?? []);
        await db.stepWork.bulkAdd(data.stepWork ?? []);
        await db.recommendations.bulkAdd(data.recommendations ?? []);
        await db.paceSettings.bulkAdd(data.paceSettings ?? []);
        await ensurePacePlans();
        await completeFinishedProjects();
    });
}
// Complete or reopen an entire branch in one atomic operation. Only terminal
// executable steps count toward progress; empty stages can still have a state.
export async function setBranchCompletion(id: string, complete: boolean) {
    await db.transaction(
        "rw",
        [
            db.steps,
            db.projects,
            db.events,
            db.projectTracking,
            db.projectProgress,
            db.projectPlans,
            db.stepWork,
            db.recommendations,
            db.paceSettings,
        ],
        async () => {
            const root = await db.steps.get(id);
            if (!root) throw new Error("الخطوة أو المرحلة غير موجودة.");
            const previous = await captureProjectProgress(root.projectId);
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
                for (const changed of updates.values()) {
                    const before = index.byId.get(changed.id)!;
                    if (
                        before.kind === "step" &&
                        !index.children(before.projectId, before.id).length &&
                        (before.status === "done" || changed.status === "done")
                    )
                        await recordStepWork(
                            before,
                            changed.status === "done",
                            at,
                        );
                }
                await db.steps.bulkPut([...updates.values()]);
                await db.events.bulkAdd(logs);
                await db.projects.update(root.projectId, { updatedAt: at });
                await closeIfFinished(root.projectId, after, at);
                await recordProjectProgress(
                    root.projectId,
                    previous,
                    complete ? "completion" : "reopen",
                    at,
                );
            }
        },
    );
}
export async function setProjectCompletion(id: string, complete: boolean) {
    await db.transaction(
        "rw",
        [db.projects, db.events, db.projectPlans, db.paceSettings],
        async () => {
            const p = await db.projects.get(id);
            if (!p) throw new Error("المشروع غير موجود.");
            const status = complete ? "closed" : "active";
            if (p.status === status) return;
            if (!complete && !p.archived) await assertProjectCapacity(id);
            const at = now();
            await db.projects.update(id, {
                status,
                updatedAt: at,
                completedAt: complete ? at : undefined,
            });
            await event("project", p, complete ? "closed" : "reopened", at);
        },
    );
}

// Idempotent batches backfill every elapsed period without creating task copies.
export async function reconcileTaskCycles(at = new Date(), taskId?: string) {
    const selected = taskId ? await db.tasks.get(taskId) : undefined;
    const tasks = taskId
        ? selected && recurring(selected)
            ? [selected]
            : []
        : await db.tasks
              .where("schedule.repeat")
              .anyOf("daily", "weekly", "monthly")
              .toArray();
    await db.transaction("rw", db.taskCycles, async () => {
        await db.taskCycles
            .where("[status+end]")
            .between(
                ["current", Dexie.minKey],
                ["current", at.toISOString()],
                true,
                true,
            )
            .and((c) => !taskId || c.taskId === taskId)
            .modify({ status: "incomplete" });
    });
    const due = tasks.filter(
        (task) =>
            !task.scheduleCursor ||
            Date.parse(task.scheduleCursor) <= at.getTime(),
    );
    // Commit at most 256 new periods at once, across up to 32 tasks. This avoids
    // one full live-query render for every task at midnight or after a long absence.
    for (let offset = 0; offset < due.length; offset += 32) {
        const group = due.slice(offset, offset + 32);
        let more = true;
        while (more) {
            more = await db.transaction(
                "rw",
                [db.tasks, db.taskCycles],
                async () => {
                    let count = 0,
                        pending = false;
                    for (const original of group) {
                        const actual = await db.tasks.get(original.id);
                        if (
                            !actual ||
                            !recurring(actual) ||
                            actual.scheduleRevision !==
                                original.scheduleRevision ||
                            (actual.scheduleCursor &&
                                Date.parse(actual.scheduleCursor) >
                                    at.getTime())
                        )
                            continue;
                        if (count >= 256) {
                            pending = true;
                            continue;
                        }
                        const batch = cycleBatch(
                            actual,
                            at,
                            actual.scheduleCursor
                                ? { end: actual.scheduleCursor }
                                : undefined,
                            256 - count,
                        );
                        if (batch.length) {
                            const existing = await db.taskCycles.bulkGet(
                                batch.map((c) => c.id),
                            );
                            await db.taskCycles.bulkAdd(
                                batch.filter((_, i) => !existing[i]),
                            );
                            await db.tasks.update(actual.id, {
                                scheduleCursor: batch.at(-1)!.end,
                            });
                            count += batch.length;
                            if (Date.parse(batch.at(-1)!.end) <= at.getTime())
                                pending = true;
                        }
                    }
                    return pending;
                },
            );
        }
    }
}
export async function setCycleStatus(
    id: string,
    status: Status,
    intentAt = now(),
) {
    const at = new Date(intentAt);
    if (!Number.isFinite(at.getTime()) || at.getTime() > Date.now() + 1000)
        throw new Error("وقت الإنجاز غير صالح.");
    await db.transaction(
        "rw",
        [db.tasks, db.taskCycles, db.events],
        async () => {
            let cycle = await db.taskCycles.get(id);
            if (!cycle) {
                let identity: [string, number, string];
                try {
                    identity = JSON.parse(id);
                } catch {
                    throw new Error("الدورة غير موجودة.");
                }
                if (
                    !Array.isArray(identity) ||
                    identity.length !== 3 ||
                    typeof identity[0] !== "string" ||
                    !Number.isInteger(identity[1]) ||
                    typeof identity[2] !== "string" ||
                    JSON.stringify(identity) !== id
                )
                    throw new Error("الدورة غير موجودة.");
                const task = await db.tasks.get(identity[0]);
                const expected = task && currentCycle(task, at);
                if (!expected || expected.id !== id)
                    throw new Error("الدورة غير موجودة أو تغير جدولها.");
                await db.taskCycles.add(expected);
                cycle = expected;
            }
            const task = await db.tasks.get(cycle.taskId);
            if (
                !task ||
                at.getTime() < Date.parse(cycle.start) ||
                at.getTime() >= Date.parse(cycle.end)
            )
                throw new Error(
                    "انتهت هذه الدورة أو لم تبدأ؛ لا يُنسب الإنجاز إلى دورة أخرى. حدّث العرض.",
                );
            const completed = status === "done";
            const desired = completed
                ? "completed"
                : Date.now() >= Date.parse(cycle.end)
                  ? "incomplete"
                  : "current";
            if (
                cycle.status === desired &&
                (completed || (cycle.workStatus ?? "todo") === status)
            )
                return;
            await db.taskCycles.update(id, {
                status: desired,
                completedAt: completed ? intentAt : undefined,
                workStatus: status === "doing" ? "doing" : "todo",
                startedAt:
                    status === "doing"
                        ? (cycle.startedAt ?? intentAt)
                        : cycle.startedAt,
            });
            await event(
                "task",
                task,
                completed
                    ? "completed"
                    : status === "doing"
                      ? "started"
                      : "reopened",
                intentAt,
            );
        },
    );
}
export async function updateTaskOptions(
    id: string,
    input: TaskOptions,
    at = new Date(),
) {
    const options = validateTaskOptions(input);
    await reconcileTaskCycles(at, id);
    await db.transaction(
        "rw",
        [db.tasks, db.taskCycles, db.events],
        async () => {
            const task = await db.tasks.get(id);
            if (!task) throw new Error("المهمة غير موجودة.");
            const boundary = (s: TaskOptions["schedule"]) =>
                s
                    ? JSON.stringify([
                          s.date,
                          s.time ?? null,
                          s.repeat,
                          s.timeZone,
                          s.repeat === "weekly"
                              ? [...s.weekdays!].sort()
                              : null,
                          s.repeat === "monthly" ? s.monthDay : null,
                      ])
                    : "";
            const changed =
                boundary(task.schedule) !== boundary(options.schedule);
            if (!changed) {
                await db.tasks.update(id, {
                    ...options,
                    updatedAt: at.toISOString(),
                });
                return;
            }
            const current = currentCycle(task, at);
            if (current) {
                const row = (await db.taskCycles.get(current.id)) ?? current;
                await db.taskCycles.put({
                    ...row,
                    end: at.toISOString(),
                    plannedEnd: row.end,
                    closedReason: "schedule_changed",
                    status:
                        row.status === "completed" ? "completed" : "incomplete",
                });
            }
            // A completed legacy task may have no events (old imported backups).
            const recurrenceChanged =
                recurring(task) ||
                (options.schedule && options.schedule.repeat !== "none");
            if (
                !recurring(task) &&
                task.status === "done" &&
                recurrenceChanged
            ) {
                const start = task.createdAt;
                await db.taskCycles.put({
                    id: JSON.stringify([id, task.scheduleRevision ?? 0, start]),
                    taskId: id,
                    revision: task.scheduleRevision ?? 0,
                    start,
                    end: at.toISOString(),
                    scheduledAt: task.completedAt!,
                    completedAt: task.completedAt,
                    status: "completed",
                    source: "legacy",
                    timeZone:
                        options.schedule?.timeZone ??
                        Intl.DateTimeFormat().resolvedOptions().timeZone,
                });
            }
            const next: Task = {
                ...task,
                ...options,
                schedule: options.schedule,
                status: recurrenceChanged ? "todo" : task.status,
                completedAt: recurrenceChanged ? undefined : task.completedAt,
                updatedAt: at.toISOString(),
                scheduleRevision: (task.scheduleRevision ?? 0) + 1,
                scheduleSince: at.toISOString(),
                scheduleCursor: undefined,
            };
            await db.tasks.put(next);
            const cycle = currentCycle(next, at);
            if (cycle) {
                await db.taskCycles.add(cycle);
                await db.tasks.update(id, { scheduleCursor: cycle.end });
            }
        },
    );
}

export class ActiveProjectLimitError extends Error {
    constructor(
        public limit: number,
        public excludeId?: string,
    ) {
        super(
            `وصلت إلى حد المشاريع النشطة (${limit}). اختر مشروعًا لإيقافه، أو عدّل الحد، أو ألغِ العملية.`,
        );
    }
}
export async function assertProjectCapacity(excludeId?: string) {
    const projects = await db.projects.toArray(),
        plans = await db.projectPlans.toArray();
    const selected = excludeId
        ? plans.find((p) => p.projectId === excludeId)
        : undefined;
    if (selected?.pauses.at(-1) && !selected.pauses.at(-1)!.end) return;
    const limit = (await db.paceSettings.get("pace"))?.activeLimit ?? 3;
    if (
        projects.filter(
            (p) =>
                p.id !== excludeId &&
                activeProject(
                    p,
                    plans.find((r) => r.projectId === p.id),
                ),
        ).length >= limit
    )
        throw new ActiveProjectLimitError(limit, excludeId);
}
export async function ensurePacePlans() {
    await db.transaction(
        "rw",
        db.projects,
        db.projectPlans,
        db.paceSettings,
        async () => {
            const existing = new Set(
                await db.projectPlans.toCollection().primaryKeys(),
            );
            const since = now();
            const missing = (await db.projects.toArray()).filter(
                (p) => !existing.has(p.id),
            );
            if (missing.length)
                await db.projectPlans.bulkAdd(
                    missing.map((p) => ({
                        projectId: p.id,
                        since,
                        revision: 0,
                        workOrder: 0,
                        pauses: [],
                    })),
                );
            if (!(await db.paceSettings.get("pace")))
                await db.paceSettings.add({ id: "pace", activeLimit: 3 });
        },
    );
}
async function recordStepWork(step: Step, complete: boolean, at: string) {
    if (!(await db.projectPlans.get(step.projectId)))
        await db.projectPlans.put({
            projectId: step.projectId,
            since: at,
            revision: 0,
            workOrder: 0,
            pauses: [],
        });
    const plan = (await db.projectPlans.get(step.projectId))!;
    const order = plan.workOrder + 1;
    await db.stepWork.add({
        id: JSON.stringify([step.projectId, order]),
        projectId: step.projectId,
        stepId: step.id,
        order,
        at,
        complete,
    });
    await db.projectPlans.update(step.projectId, { workOrder: order });
}
// Additive restore remaps the whole imported graph. No incoming ID can overwrite
// local data; a SHA-256 receipt makes repeated merging of the same file harmless.
export async function mergeBackup(input: unknown) {
    const data = validateBackup(input);
    const bytes = new TextEncoder().encode(
        JSON.stringify({ ...data, exportedAt: "" }),
    );
    const digest = [
        ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    ]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    return db.transaction("rw", db.tables, async () => {
        const settings = await db.paceSettings.get("pace");
        if (settings?.importDigests?.includes(digest)) return false;
        const mapping = new Map<string, string>();
        for (const x of [
            ...data.projects,
            ...data.steps,
            ...data.tasks,
            ...data.ideas,
        ])
            mapping.set(x.id, uid());
        const map = (id: string) => {
            if (!mapping.has(id)) mapping.set(id, uid());
            return mapping.get(id)!;
        };
        await db.projects.bulkAdd(
            data.projects.map((p) => ({ ...p, id: map(p.id) })),
        );
        await db.steps.bulkAdd(
            data.steps.map((s) => ({
                ...s,
                id: map(s.id),
                projectId: map(s.projectId),
                parentId: s.parentId ? map(s.parentId) : null,
            })),
        );
        await db.tasks.bulkAdd(
            data.tasks.map((t) => ({ ...t, id: map(t.id) })),
        );
        await db.ideas.bulkAdd(
            data.ideas.map((i) => ({ ...i, id: map(i.id) })),
        );
        await db.events.bulkAdd(
            data.events.map((e) => ({
                ...e,
                id: uid(),
                entityId: map(e.entityId),
            })),
        );
        await db.taskCycles.bulkAdd(
            (data.taskCycles ?? []).map((c) => ({
                ...c,
                taskId: map(c.taskId),
                id: cycleIdForMerge(map(c.taskId), c.revision, c.start),
            })),
        );
        await db.projectTracking.bulkAdd(
            (data.projectTracking ?? []).map((p) => ({
                ...p,
                projectId: map(p.projectId),
            })),
        );
        await db.projectProgress.bulkAdd(
            (data.projectProgress ?? []).map((p) => ({
                ...p,
                projectId: map(p.projectId),
                id: JSON.stringify([map(p.projectId), p.order]),
            })),
        );
        await db.projectPlans.bulkAdd(
            (data.projectPlans ?? []).map((p) => ({
                ...p,
                projectId: map(p.projectId),
            })),
        );
        await db.stepWork.bulkAdd(
            (data.stepWork ?? []).map((w) => ({
                ...w,
                projectId: map(w.projectId),
                stepId: map(w.stepId),
                id: JSON.stringify([map(w.projectId), w.order]),
            })),
        );
        await db.recommendations.bulkAdd(
            (data.recommendations ?? []).map((r) => {
                const changes = r.changes.map((c) => ({
                    ...c,
                    projectId: map(c.projectId),
                }));
                const mergedId = uid();
                // Historical decisions remain history. Pending advice is invalidated
                // because merging changes the workload and project identities.
                return {
                    ...r,
                    id: mergedId,
                    key: mergedId,
                    projectIds: r.projectIds.map(map),
                    changes,
                    approvedChanges: r.approvedChanges ? changes : undefined,
                    status:
                        r.status === "new" ? ("invalid" as const) : r.status,
                    decidedAt: r.status === "new" ? now() : r.decidedAt,
                };
            }),
        );
        await db.paceSettings.put({
            ...settings,
            id: "pace",
            activeLimit: settings?.activeLimit ?? 3,
            importDigests: [
                ...new Set([...(settings?.importDigests ?? []), digest]),
            ],
        });
        await ensurePacePlans();
        await completeFinishedProjects();
        return true;
    });
}
function cycleIdForMerge(taskId: string, revision: number, start: string) {
    return JSON.stringify([taskId, revision, start]);
}
