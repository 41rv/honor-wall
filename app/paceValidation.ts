import { Temporal } from "@js-temporal/polyfill";
import type { Snapshot } from "./model";
export function validatePaceData(d: Snapshot, fail: () => never) {
    const names = [
        "projectPlans",
        "stepWork",
        "recommendations",
        "paceSettings",
    ] as const;
    if (
        names.some((n) => d[n] !== undefined && !Array.isArray(d[n])) ||
        (d.version >= 4 && names.some((n) => !Array.isArray(d[n]))) ||
        (d.version < 4 && names.some((n) => !!d[n]?.length))
    )
        return fail();
    const iso = (s: unknown): s is string =>
        typeof s === "string" &&
        Number.isFinite(Date.parse(s)) &&
        new Date(s).toISOString() === s;
    const date = (s: unknown): s is string => {
        try {
            return (
                typeof s === "string" &&
                /^\d{4}-\d\d-\d\d$/.test(s) &&
                Temporal.PlainDate.from(s).toString() === s
            );
        } catch {
            return false;
        }
    };
    const ids = new Set(d.projects.map((p) => p.id)),
        plans = new Map();
    for (const p of d.projectPlans ?? []) {
        if (
            !p ||
            !ids.has(p.projectId) ||
            plans.has(p.projectId) ||
            !iso(p.since) ||
            !Number.isInteger(p.revision) ||
            p.revision < 0 ||
            !Number.isInteger(p.workOrder) ||
            p.workOrder < 0 ||
            !Array.isArray(p.pauses) ||
            (p.approvedPace !== undefined &&
                (!Number.isInteger(p.approvedPace) || p.approvedPace < 1)) ||
            (p.approvedAt !== undefined && !iso(p.approvedAt)) ||
            !!p.approvedPace !== !!p.approvedAt
        )
            return fail();
        let last = p.since;
        for (const pause of p.pauses) {
            if (
                !pause ||
                !iso(pause.start) ||
                pause.start < last ||
                (pause.end !== undefined &&
                    (!iso(pause.end) || pause.end < pause.start))
            )
                return fail();
            last = pause.end ?? "\uffff";
        }
        const g = p.goal;
        if (g !== undefined) {
            if (
                !g ||
                !["duration", "date"].includes(g.kind) ||
                !["flexible", "fixed"].includes(g.deadline) ||
                !date(g.anchor) ||
                !date(g.targetDate) ||
                g.targetDate < g.anchor ||
                typeof g.timeZone !== "string"
            )
                return fail();
            try {
                Temporal.Now.zonedDateTimeISO(g.timeZone);
            } catch {
                return fail();
            }
            if (
                g.kind === "duration" &&
                (!Number.isInteger(g.days) ||
                    g.days! < 1 ||
                    g.days! > 36500 ||
                    Temporal.PlainDate.from(g.anchor)
                        .add({ days: g.days! - 1 })
                        .toString() !== g.targetDate)
            )
                return fail();
        } else if (p.approvedPace) return fail();
        plans.set(p.projectId, p);
    }
    if (d.version >= 4 && plans.size !== ids.size) return fail();
    const workIds = new Set<string>();
    const stepsById = new Map(d.steps.map((s) => [s.id, s]));
    const entityIds = new Set(
        [...d.projects, ...d.steps, ...d.tasks, ...d.ideas].map((e) => e.id),
    );
    const workProjects = new Map<string, string>();
    for (const w of d.stepWork ?? []) {
        if (
            !w ||
            typeof w.id !== "string" ||
            !w.id ||
            workIds.has(w.id) ||
            !plans.has(w.projectId) ||
            typeof w.stepId !== "string" ||
            !w.stepId ||
            !iso(w.at) ||
            w.at < plans.get(w.projectId).since ||
            typeof w.complete !== "boolean" ||
            !Number.isInteger(w.order) ||
            w.order < 1 ||
            w.order > plans.get(w.projectId).workOrder ||
            w.id !== JSON.stringify([w.projectId, w.order])
        )
            return fail();
        const step = stepsById.get(w.stepId);
        if (
            (step &&
                (step.projectId !== w.projectId || step.kind !== "step")) ||
            (!step && entityIds.has(w.stepId)) ||
            (workProjects.has(w.stepId) &&
                workProjects.get(w.stepId) !== w.projectId)
        )
            return fail();
        workProjects.set(w.stepId, w.projectId);
        workIds.add(w.id);
    }
    for (const p of d.projectPlans ?? [])
        if (
            (d.stepWork ?? []).filter((w) => w.projectId === p.projectId)
                .length !== p.workOrder
        )
            return fail();
    const recIds = new Set<string>();
    for (const r of d.recommendations ?? []) {
        if (
            !r ||
            typeof r.id !== "string" ||
            !r.id ||
            recIds.has(r.id) ||
            typeof r.key !== "string" ||
            typeof r.basis !== "string" ||
            !["accelerate", "ease", "focus"].includes(r.type) ||
            !Array.isArray(r.projectIds) ||
            !r.projectIds.length ||
            new Set(r.projectIds).size !== r.projectIds.length ||
            r.projectIds.some((id) => !ids.has(id)) ||
            !iso(r.createdAt) ||
            !["new", "accepted", "rejected", "invalid"].includes(r.status) ||
            typeof r.reason !== "string" ||
            typeof r.effect !== "string" ||
            !Array.isArray(r.changes) ||
            !r.changes.length ||
            (r.status !== "new" &&
                (!iso(r.decidedAt) || r.decidedAt < r.createdAt)) ||
            (r.status === "accepted" &&
                JSON.stringify(r.approvedChanges) !==
                    JSON.stringify(r.changes)) ||
            (r.status !== "accepted" && r.approvedChanges !== undefined)
        )
            return fail();
        for (const c of r.changes)
            if (
                !c ||
                !r.projectIds.includes(c.projectId) ||
                !["target", "pace", "pause"].includes(c.type) ||
                ((c.type === "target" || c.type === "pace") &&
                    (!date(c.targetDate) ||
                        !Number.isInteger(c.daily) ||
                        c.daily < 1))
            )
                return fail();
        recIds.add(r.id);
    }
    if (
        (d.paceSettings?.length ?? 0) > 1 ||
        d.paceSettings?.some(
            (s) =>
                !s ||
                s.id !== "pace" ||
                !Number.isInteger(s.activeLimit) ||
                s.activeLimit < 1 ||
                s.activeLimit > 1000,
        )
    )
        return fail();
}
