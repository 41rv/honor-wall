import { currentCycle, projectTask } from "./taskSchedule";
import { db, ensurePacePlans, ActiveProjectLimitError } from "./db";
import type { ProjectGoal, PaceRecommendation, PlanChange } from "./paceTypes";
import {
    makeGoal,
    activeProject,
    paused,
    recommendationCandidates,
    projectPace,
    accelerationOptions,
    type RecommendationContext,
} from "./projectPace";
import { buildHierarchy } from "./hierarchy";

export async function setActiveLimit(limit: number) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
        throw new Error("اختر حدًا من مشروع واحد إلى 1000 مشروع.");
    await db.transaction("rw", db.paceSettings, async () => {
        const old = await db.paceSettings.get("pace");
        await db.paceSettings.put({ ...old, id: "pace", activeLimit: limit });
    });
}
export async function saveProjectGoal(
    id: string,
    input?: {
        kind: ProjectGoal["kind"];
        value: string | number;
        deadline: ProjectGoal["deadline"];
    },
    at = new Date(),
) {
    await ensurePacePlans();
    const goal = input
        ? makeGoal(input.kind, input.value, input.deadline, at)
        : undefined;
    await db.transaction("rw", db.projects, db.projectPlans, async () => {
        if (!(await db.projects.get(id))) throw new Error("المشروع غير موجود.");
        const plan = (await db.projectPlans.get(id))!;
        await db.projectPlans.put({
            ...plan,
            goal,
            approvedPace: undefined,
            approvedAt: undefined,
            revision: plan.revision + 1,
        });
    });
}
async function pauseInTransaction(id: string, value: boolean, at: string) {
    const p = await db.projects.get(id),
        plan = await db.projectPlans.get(id);
    if (!p || !plan) throw new Error("المشروع غير موجود.");
    if (paused(plan) === value) return;
    if (p.status !== "active" || p.archived)
        throw new Error(
            "الإيقاف والاستئناف للمشاريع المفتوحة غير المؤرشفة فقط.",
        );
    if (!value) {
        const projects = await db.projects.toArray(),
            plans = await db.projectPlans.toArray(),
            limit = (await db.paceSettings.get("pace"))?.activeLimit ?? 3;
        if (
            projects.filter(
                (p) =>
                    p.id !== id &&
                    activeProject(
                        p,
                        plans.find((r) => r.projectId === p.id),
                    ),
            ).length >= limit
        )
            throw new ActiveProjectLimitError(limit, id);
    }
    const pauses = value
        ? [...plan.pauses, { start: at }]
        : plan.pauses.map((p, i) =>
              i === plan.pauses.length - 1 ? { ...p, end: at } : p,
          );
    await db.projectPlans.put({ ...plan, pauses, revision: plan.revision + 1 });
    await db.projects.update(id, { updatedAt: at });
}
export async function setProjectPaused(
    id: string,
    value: boolean,
    at = new Date(),
) {
    await ensurePacePlans();
    await db.transaction(
        "rw",
        db.projects,
        db.projectPlans,
        db.paceSettings,
        () => pauseInTransaction(id, value, at.toISOString()),
    );
}
async function context(at = new Date()): Promise<RecommendationContext> {
    const [projects, plans, work, steps, tasks] = await Promise.all([
        db.projects.toArray(),
        db.projectPlans.toArray(),
        db.stepWork
            .where("at")
            .above(new Date(at.getTime() - 29 * 86400000).toISOString())
            .toArray(),
        db.steps.toArray(),
        db.tasks.toArray(),
    ]);
    const cycles = (
        await db.taskCycles.bulkGet(
            tasks.flatMap((t) => currentCycle(t, at)?.id ?? []),
        )
    ).filter((c) => !!c);
    const byId = new Map(cycles.map((c) => [c.id, c]));
    return {
        projects,
        plans,
        work,
        hierarchy: buildHierarchy(steps),
        tasks: tasks.map((t) => projectTask(t, byId, at)),
    };
}
const recommendationTables = () => [
    db.projects,
    db.projectPlans,
    db.stepWork,
    db.steps,
    db.tasks,
    db.recommendations,
    db.paceSettings,
    db.taskCycles,
];
export async function refreshRecommendations(at = new Date()) {
    await ensurePacePlans();
    await db.transaction("rw", recommendationTables(), async () => {
        const candidates = recommendationCandidates(await context(at), at),
            current = await db.recommendations.toArray(),
            byKey = new Map(current.map((r) => [r.key, r]));
        for (const r of current)
            if (r.status === "new" && !candidates.some((c) => c.key === r.key))
                await db.recommendations.update(r.id, {
                    status: "invalid",
                    decidedAt: at.toISOString(),
                });
        for (const candidate of candidates) {
            if (
                current.some(
                    (r) =>
                        r.status === "rejected" &&
                        r.type === candidate.type &&
                        JSON.stringify(r.projectIds) ===
                            JSON.stringify(candidate.projectIds) &&
                        !meaningfulChange(candidate, r, at),
                )
            )
                continue;
            const old = byKey.get(candidate.key);
            if (!old) await db.recommendations.add(candidate);
            else if (
                old.status === "new" &&
                (candidate.basis !== old.basis ||
                    JSON.stringify(candidate.changes) !==
                        JSON.stringify(old.changes))
            )
                await db.recommendations.put({
                    ...candidate,
                    id: old.id,
                    createdAt: old.createdAt,
                });
        }
    });
}
export async function rejectRecommendation(id: string, at = new Date()) {
    await db.transaction("rw", db.recommendations, async () => {
        const r = await db.recommendations.get(id);
        if (!r || r.status !== "new") return;
        await db.recommendations.update(id, {
            status: "rejected",
            decidedAt: at.toISOString(),
        });
    });
}
async function applyChanges(changes: PlanChange[], at: string) {
    for (const c of changes) {
        const p = await db.projects.get(c.projectId),
            plan = await db.projectPlans.get(c.projectId);
        if (!p || !plan || !activeProject(p, plan))
            throw new Error("تغيرت حالة المشروع. أعد فتح المعاينة.");
        if (c.type === "pause") await pauseInTransaction(c.projectId, true, at);
        else {
            if (
                !plan.goal ||
                (c.type === "target" && plan.goal.deadline === "fixed") ||
                (c.type === "pace" && plan.goal.deadline !== "fixed")
            )
                throw new Error(
                    "الموعد الإلزامي لا يتغير بالتوصيات. عدّله صراحة من إعداد الهدف.",
                );
            const goal =
                c.type === "pace"
                    ? plan.goal
                    : makeGoal(
                          "date",
                          c.targetDate,
                          "flexible",
                          new Date(at),
                          plan.goal.timeZone,
                      );
            await db.projectPlans.put({
                ...plan,
                goal,
                approvedPace: c.daily,
                approvedAt: at,
                revision: plan.revision + 1,
            });
        }
    }
}
// The caller must pass the exact previewed record. Confirmation is never inferred
// from viewing a suggestion, and stale previews cannot silently change a plan.
export async function acceptRecommendation(
    preview: PaceRecommendation,
    confirmed: boolean,
    at = new Date(),
) {
    if (!confirmed) throw new Error("يلزم التأكيد النهائي قبل تعديل الخطة.");
    const valid = await db.transaction(
        "rw",
        recommendationTables(),
        async () => {
            const row = await db.recommendations.get(preview.id);
            if (row?.status === "accepted") return true; // repeated confirmation
            if (!row || row.status !== "new")
                throw new Error("التوصية لم تعد متاحة.");
            const current = recommendationCandidates(
                await context(at),
                at,
            ).find((c) => c.key === row.key);
            if (
                !current ||
                row.basis !== preview.basis ||
                current.basis !== preview.basis ||
                JSON.stringify(current.changes) !==
                    JSON.stringify(preview.changes)
            ) {
                await db.recommendations.update(row.id, {
                    status: "invalid",
                    decidedAt: at.toISOString(),
                });
                return false;
            }
            await applyChanges(row.changes, at.toISOString());
            await db.recommendations.update(row.id, {
                status: "accepted",
                decidedAt: at.toISOString(),
                approvedChanges: row.changes,
            });
            return true;
        },
    );
    if (!valid)
        throw new Error(
            "تغيرت البيانات منذ المعاينة؛ التوصية لم تعد صالحة. افتح التوصيات مجددًا.",
        );
}
export async function adoptAcceleration(
    id: string,
    daily: number,
    finish: string,
    revision: number,
    remaining: number,
    confirmed: boolean,
    at = new Date(),
) {
    if (!confirmed) throw new Error("يلزم تأكيد الخطة قبل اعتمادها.");
    await db.transaction("rw", recommendationTables(), async () => {
        const plan = await db.projectPlans.get(id),
            project = await db.projects.get(id),
            ctx = await context(at);
        if (
            !plan ||
            !project ||
            plan.revision !== revision ||
            ctx.hierarchy.metric(id).remaining !== remaining
        )
            throw new Error("تغير المشروع؛ أعد فتح المعاينة.");
        if (!Number.isInteger(daily) || daily < 1)
            throw new Error("الوتيرة غير صالحة.");
        const pace = projectPace(project, plan, ctx.hierarchy, ctx.work, at);
        if (
            !accelerationOptions(pace, at, plan.goal?.timeZone).some(
                (o) => o.daily === daily && o.finish === finish,
            )
        )
            throw new Error(
                "تغيرت المعاينة أو التاريخ؛ افتح مستويات التسريع مجددًا.",
            );
        const change: PlanChange = {
            type: plan.goal?.deadline === "fixed" ? "pace" : "target",
            projectId: id,
            targetDate: finish,
            daily,
        };
        const stamp = at.toISOString();
        const rec: PaceRecommendation = {
            id: crypto.randomUUID(),
            key: crypto.randomUUID(),
            type: "accelerate",
            projectIds: [id],
            reason: "اختيار صريح من معاينة مستويات التسريع.",
            effect:
                plan.goal?.deadline === "fixed"
                    ? `${daily} خطوة يوميًا؛ انتهاء حسابي ${finish} مع بقاء الموعد الإلزامي ${plan.goal.targetDate}.`
                    : `${daily} خطوة يوميًا؛ هدف مرن ${finish}.`,
            createdAt: stamp,
            status: "accepted",
            decidedAt: stamp,
            changes: [change],
            approvedChanges: [change],
            basis: JSON.stringify([revision, remaining]),
        };
        await applyChanges([change], stamp);
        await db.recommendations.add(rec);
    });
}

// Dismissal survives minor daily fluctuations. A changed explicit plan, a large
// step-count/workload change, or a week of materially different evidence permits
// a fresh suggestion. Merely crossing a rounding boundary never does.
function meaningfulChange(
    next: PaceRecommendation,
    old: PaceRecommendation,
    at: Date,
) {
    try {
        const a = JSON.parse(next.basis),
            b = JSON.parse(old.basis);
        if (!Array.isArray(a[0]) || !Array.isArray(b[0])) return false;
        if (JSON.stringify(a[3]) !== JSON.stringify(b[3])) return true;
        if (a[0].some((row: unknown[], i: number) => row[3] !== b[0][i]?.[3]))
            return true;
        if (
            a[0].some(
                (row: unknown[], i: number) =>
                    Math.abs(Number(row[4]) - Number(b[0][i]?.[4])) >=
                    Math.max(3, Math.ceil(Number(b[0][i]?.[4]) * 0.2)),
            )
        )
            return true;
        if (Math.abs(Number(a[2]) - Number(b[2])) >= 3) return true;
        return (
            at.getTime() - Date.parse(old.decidedAt ?? old.createdAt) >=
                7 * 86400000 && JSON.stringify(a[1]) !== JSON.stringify(b[1])
        );
    } catch {
        return false;
    }
}
