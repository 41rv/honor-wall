import { Temporal } from "@js-temporal/polyfill";
import { habitStores, schema7HabitStores, receiptStores } from "./backupTables";
import { validFeedback } from "./habitFeedback";
import type { Snapshot } from "./model";
import type {
    HabitLevel,
    HabitPhase,
    HabitPause,
    HabitPlan,
} from "./habitTypes";

export function scaledQuantity(value: unknown): number | null {
    if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < 0 ||
        value > 1e9
    )
        return null;
    const scaled = Math.round(value * 1000);
    return Math.abs(value * 1000 - scaled) <= 1e-7 ? scaled : null;
}
const object = (x: unknown): x is Record<string, unknown> =>
    !!x && typeof x === "object" && !Array.isArray(x);
const text = (x: unknown, max = 300): x is string =>
    typeof x === "string" && !!x.trim() && x.length <= max;
const iso = (x: unknown): x is string =>
    typeof x === "string" &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x) &&
    Number.isFinite(Date.parse(x)) &&
    new Date(x).toISOString() === x;
const date = (x: unknown): x is string => {
    try {
        return (
            typeof x === "string" &&
            /^\d{4}-\d\d-\d\d$/.test(x) &&
            Temporal.PlainDate.from(x).toString() === x
        );
    } catch {
        return false;
    }
};
const zone = (x: unknown): x is string => {
    if (!text(x, 100)) return false;
    try {
        new Intl.DateTimeFormat("ar", { timeZone: x }).format();
        return true;
    } catch {
        return false;
    }
};
const keys = (row: unknown, allowed: string[]) =>
    object(row) && Object.keys(row).every((k) => allowed.includes(k));
const integer = (n: unknown, min = 0) =>
    Number.isSafeInteger(n) && Number(n) >= min;
const digest = (x: unknown) =>
    typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
const pauses = (rows: HabitPause[], since: string) => {
    if (!Array.isArray(rows)) return false;
    let previous = since;
    for (const row of rows) {
        if (
            !keys(row, ["start", "end"]) ||
            !iso(row.start) ||
            row.start < previous ||
            (row.end !== undefined && (!iso(row.end) || row.end < row.start))
        )
            return false;
        previous = row.end ?? "\uffff";
    }
    return true;
};
const level = (row: HabitLevel | undefined, phases: HabitPhase[]) => {
    if (!keys(row, ["phaseKey", "target"])) return false;
    const phase = phases.find((p) => p.key === row!.phaseKey),
        value = scaledQuantity(row!.target);
    if (!phase || value === null) return false;
    const start = scaledQuantity(phase.start)!,
        target = scaledQuantity(phase.target)!,
        step = scaledQuantity(phase.step)!;
    return (
        value >= start &&
        value <= target &&
        (value === target || (value - start) % step === 0)
    );
};
/** Fail closed before any write. No historical records, defaults or schedules
 * are synthesized here. The original validator continues to own legacy data. */
export function validateHabitData(d: Snapshot, fail: () => never) {
    if (
        habitStores.some(
            (name) => d[name] !== undefined && !Array.isArray(d[name]),
        ) ||
        (d.version >= 5 &&
            (d.version >= 6 ? habitStores : schema7HabitStores).some(
                (name) => !Array.isArray(d[name]),
            )) ||
        (d.version === 5 && !!d.habitAssessments?.length) ||
        (d.version < 5 && habitStores.some((name) => !!d[name]?.length))
    )
        return fail();
    if (d.version < 5) return;
    for (const name of habitStores) {
        const ids = new Set<string>();
        for (const row of d[name] ?? []) {
            if (!object(row) || !text(row.id) || ids.has(row.id)) return fail();
            ids.add(row.id);
        }
    }
    const assessmentIndex = new Map(
        (d.habitAssessments ?? []).map((a) => [a.id, a]),
    );
    const paths = new Map((d.habitPaths ?? []).map((p) => [p.id, p]));
    const habits = new Map((d.habits ?? []).map((h) => [h.id, h]));
    const plans = new Map((d.habitPlans ?? []).map((p) => [p.id, p]));
    for (const p of paths.values()) {
        if (
            !keys(p, [
                "id",
                "title",
                "order",
                "createdAt",
                "updatedAt",
                "pauses",
                "deletedAt",
            ]) ||
            !text(p.title) ||
            !integer(p.order) ||
            !iso(p.createdAt) ||
            !iso(p.updatedAt) ||
            p.updatedAt < p.createdAt ||
            !pauses(p.pauses, p.createdAt) ||
            (p.deletedAt !== undefined &&
                (!iso(p.deletedAt) ||
                    p.deletedAt < p.createdAt ||
                    p.deletedAt > p.updatedAt))
        )
            return fail();
    }
    for (const h of habits.values()) {
        if (
            !keys(h, [
                "id",
                "title",
                "kind",
                "pathId",
                "timeZone",
                "createdAt",
                "updatedAt",
                "archived",
                "pauses",
            ]) ||
            !text(h.title) ||
            !["simple", "graded"].includes(h.kind) ||
            !zone(h.timeZone) ||
            (h.pathId !== null &&
                (!paths.has(h.pathId) || paths.get(h.pathId)!.deletedAt)) ||
            typeof h.archived !== "boolean" ||
            !iso(h.createdAt) ||
            !iso(h.updatedAt) ||
            h.updatedAt < h.createdAt ||
            !pauses(h.pauses, h.createdAt)
        )
            return fail();
    }
    const groups = new Map<string, HabitPlan[]>(),
        revisions = new Set<string>();
    for (const p of plans.values()) {
        const habit = habits.get(p.habitId),
            revision = JSON.stringify([p.habitId, p.revision]);
        if (
            !keys(p, [
                "id",
                "habitId",
                "revision",
                "createdAt",
                "effectiveDate",
                "timeZone",
                "pathId",
                "schedule",
                "phases",
                "baseline",
                "current",
                "detachedPath",
            ]) ||
            !habit ||
            !integer(p.revision, 1) ||
            revisions.has(revision) ||
            !iso(p.createdAt) ||
            p.createdAt < habit.createdAt ||
            !date(p.effectiveDate) ||
            !zone(p.timeZone) ||
            p.timeZone !== habit.timeZone ||
            (p.pathId !== null &&
                (!paths.has(p.pathId) ||
                    p.createdAt < paths.get(p.pathId)!.createdAt)) ||
            !keys(p.schedule, ["repeat", "weekdays"]) ||
            !["daily", "weekly"].includes(p.schedule.repeat) ||
            !Array.isArray(p.phases)
        )
            return fail();
        revisions.add(revision);
        if (
            p.detachedPath !== undefined &&
            (!keys(p.detachedPath, ["title", "pauses"]) ||
                !text(p.detachedPath.title) ||
                !pauses(p.detachedPath.pauses, "0000-01-01T00:00:00.000Z") ||
                p.detachedPath.pauses.some((pause) => pause.end === undefined))
        )
            return fail();
        if (p.schedule.repeat === "weekly") {
            const days = p.schedule.weekdays;
            if (
                !Array.isArray(days) ||
                !days.length ||
                days.length > 7 ||
                new Set(days).size !== days.length ||
                days.some((n) => !integer(n) || n > 6)
            )
                return fail();
        } else if ("weekdays" in p.schedule) return fail();
        if (habit.kind === "simple") {
            if (
                p.phases.length ||
                p.baseline !== undefined ||
                p.current !== undefined
            )
                return fail();
        } else {
            if (!p.phases.length || p.phases.length > 30) return fail();
            const phaseKeys = new Set<string>();
            for (const phase of p.phases) {
                if (
                    !keys(phase, [
                        "key",
                        "label",
                        "unit",
                        "start",
                        "target",
                        "step",
                    ]) ||
                    !text(phase.key, 100) ||
                    phaseKeys.has(phase.key) ||
                    !text(phase.label) ||
                    !text(phase.unit, 50)
                )
                    return fail();
                const start = scaledQuantity(phase.start),
                    target = scaledQuantity(phase.target),
                    step = scaledQuantity(phase.step);
                if (
                    start === null ||
                    target === null ||
                    step === null ||
                    step <= 0 ||
                    target < start
                )
                    return fail();
                phaseKeys.add(phase.key);
            }
            if (!level(p.baseline, p.phases) || !level(p.current, p.phases))
                return fail();
        }
        const group = groups.get(p.habitId) ?? [];
        group.push(p);
        groups.set(p.habitId, group);
    }
    for (const h of habits.values()) {
        const group = groups.get(h.id)?.sort((a, b) => a.revision - b.revision);
        if (!group?.length) return fail();
        let previous = "",
            created = h.createdAt;
        const units = new Map<string, string>();
        for (let i = 0; i < group.length; i++) {
            const p = group[i];
            if (
                p.revision !== i + 1 ||
                p.effectiveDate < previous ||
                p.createdAt < created
            )
                return fail();
            previous = p.effectiveDate;
            created = p.createdAt;
            for (const phase of p.phases) {
                if (units.has(phase.key) && units.get(phase.key) !== phase.unit)
                    return fail();
                units.set(phase.key, phase.unit);
            }
        }
    }
    const days = new Set<string>();
    for (const e of d.habitEntries ?? []) {
        const h = habits.get(e.habitId),
            p = plans.get(e.planId),
            key = JSON.stringify([e.habitId, e.localDate]);
        if (
            !keys(e, [
                "id",
                "habitId",
                "planId",
                "localDate",
                "dayStart",
                "dayEnd",
                "timeZone",
                "recordedAt",
                "updatedAt",
                "result",
                "difficulty",
                "effortRating",
                "durationMinutes",
            ]) ||
            !h ||
            !p ||
            p.habitId !== h.id ||
            !date(e.localDate) ||
            days.has(key) ||
            !iso(e.dayStart) ||
            !iso(e.dayEnd) ||
            !zone(e.timeZone) ||
            e.timeZone !== p.timeZone ||
            !iso(e.recordedAt) ||
            !iso(e.updatedAt) ||
            e.updatedAt < e.recordedAt ||
            e.recordedAt < h.createdAt ||
            e.recordedAt < p.createdAt ||
            !validFeedback(e) ||
            (e.effortRating !== undefined && e.effortRating === null) ||
            (e.durationMinutes !== undefined && e.durationMinutes === null) ||
            (e.difficulty !== undefined &&
                !["easy", "okay", "hard"].includes(e.difficulty))
        )
            return fail();
        days.add(key);
        try {
            const start = Temporal.PlainDate.from(e.localDate).toZonedDateTime(
                e.timeZone,
            );
            if (
                Date.parse(e.dayStart) !== start.epochMilliseconds ||
                Date.parse(e.dayEnd) !==
                    start.add({ days: 1 }).epochMilliseconds
            )
                return fail();
        } catch {
            return fail();
        }
        const effective = groups
            .get(h.id)!
            .filter((plan) => plan.effectiveDate <= e.localDate)
            .at(-1);
        if (
            effective?.id !== p.id ||
            !object(e.result) ||
            e.result.kind !== h.kind
        )
            return fail();
        if (e.result.kind === "simple") {
            if (
                !keys(e.result, ["kind", "done"]) ||
                typeof e.result.done !== "boolean"
            )
                return fail();
        } else {
            const r = e.result,
                phase = p.phases.find((x) => x.key === r.phaseKey);
            if (
                !keys(r, ["kind", "phaseKey", "unit", "threshold", "amount"]) ||
                !phase ||
                r.unit !== phase.unit ||
                r.phaseKey !== p.current?.phaseKey ||
                scaledQuantity(r.threshold) === null ||
                r.threshold !== p.current.target ||
                scaledQuantity(r.amount) === null
            )
                return fail();
        }
    }
    const entryIndex = new Map((d.habitEntries ?? []).map((e) => [e.id, e]));
    for (const a of d.habitAssessments ?? []) {
        const e = entryIndex.get(a.id);
        if (
            !keys(a, [
                "id",
                "habitId",
                "planId",
                "localDate",
                "updatedAt",
                "effortRating",
                "durationMinutes",
            ]) ||
            !e ||
            a.habitId !== e.habitId ||
            a.planId !== e.planId ||
            a.localDate !== e.localDate ||
            !iso(a.updatedAt) ||
            a.updatedAt < e.recordedAt ||
            !validFeedback(a) ||
            (a.effortRating === undefined && a.durationMinutes === undefined) ||
            (a.effortRating !== undefined && a.effortRating === null) ||
            (a.durationMinutes !== undefined && a.durationMinutes === null)
        )
            return fail();
    }
    if (d.version >= 6)
        for (const e of d.habitEntries ?? []) {
            const a = assessmentIndex.get(e.id);
            if (
                (e.effortRating !== undefined &&
                    e.effortRating !== a?.effortRating) ||
                (e.durationMinutes !== undefined &&
                    e.durationMinutes !== a?.durationMinutes)
            )
                return fail();
        }
    for (const s of d.habitSuggestions ?? []) {
        const p = plans.get(s.planId),
            applied = s.appliedPlanId ? plans.get(s.appliedPlanId) : undefined;
        if (
            !keys(s, [
                "id",
                "habitId",
                "planId",
                "type",
                "reason",
                "effect",
                "basisHash",
                "createdAt",
                "status",
                "decidedAt",
                "change",
                "appliedPlanId",
            ]) ||
            !habits.has(s.habitId) ||
            p?.habitId !== s.habitId ||
            !["increase", "advance", "maintain", "ease"].includes(s.type) ||
            !text(s.reason, 2000) ||
            !text(s.effect, 2000) ||
            !digest(s.basisHash) ||
            !iso(s.createdAt) ||
            s.createdAt < p.createdAt ||
            !["new", "accepted", "rejected", "invalid"].includes(s.status) ||
            (s.status === "new"
                ? s.decidedAt !== undefined
                : !iso(s.decidedAt) || s.decidedAt < s.createdAt)
        )
            return fail();
        if (s.type === "maintain") {
            if (s.change !== undefined || s.appliedPlanId !== undefined)
                return fail();
        } else if (!level(s.change, p.phases)) return fail();
        if (s.status === "accepted" && s.type !== "maintain") {
            if (
                !applied ||
                applied.habitId !== s.habitId ||
                applied.revision <= p.revision ||
                applied.current?.phaseKey !== s.change?.phaseKey ||
                applied.current?.target !== s.change?.target
            )
                return fail();
        } else if (s.appliedPlanId !== undefined) return fail();
    }
    for (const r of d.reminders ?? []) {
        if (
            !keys(r, [
                "id",
                "title",
                "category",
                "createdAt",
                "updatedAt",
                "reviewedAt",
            ]) ||
            !text(r.title) ||
            (r.category !== undefined && !text(r.category, 64)) ||
            !iso(r.createdAt) ||
            !iso(r.updatedAt) ||
            r.updatedAt < r.createdAt ||
            (r.reviewedAt !== undefined &&
                (!iso(r.reviewedAt) ||
                    r.reviewedAt < r.createdAt ||
                    r.reviewedAt > r.updatedAt))
        )
            return fail();
    }
    for (const r of d.habitImportReceipts ?? []) {
        if (
            !keys(r, [
                "id",
                "digest",
                "kind",
                "createdAt",
                "outputs",
                "partial",
            ]) ||
            (r.partial !== undefined && r.partial !== true) ||
            !digest(r.digest) ||
            !["path", "habit", "backup"].includes(r.kind) ||
            !iso(r.createdAt) ||
            !object(r.outputs) ||
            !Object.keys(r.outputs).length ||
            Object.entries(r.outputs).some(
                ([name, ids]) =>
                    !receiptStores.includes(
                        name as (typeof receiptStores)[number],
                    ) ||
                    !Array.isArray(ids) ||
                    new Set(ids).size !== ids.length ||
                    ids.some((id) => !text(id)),
            )
        )
            return fail();
    }
}
