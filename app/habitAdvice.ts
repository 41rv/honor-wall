import Dexie from "dexie";
import { db } from "./db";
import { trackBackupWrite } from "./backupWrites";
import { uid } from "./model";
import {
    addHabitDays,
    effectiveHabitPlan,
    habitDate,
    habitDay,
    habitDates,
    habitPaused,
} from "./habitCalendar";
import { calibration } from "./habitProgression";
import { scaledQuantity } from "./habitValidation";
import { hardEffort } from "./habitFeedback";
import { assessedHabitEntries } from "./habitAssessments";
import type {
    Habit,
    HabitEntry,
    HabitLevel,
    HabitPath,
    HabitPlan,
    HabitSuggestion,
} from "./habitTypes";
export interface HabitAdvice {
    type: HabitSuggestion["type"];
    plan: HabitPlan;
    reason: string;
    effect: string;
    change?: HabitLevel;
    basis: string;
    days: ReturnType<typeof habitDay>[];
}
export function habitAdvice(
    habit: Habit,
    plans: HabitPlan[],
    paths: HabitPath[],
    entries: HabitEntry[],
    at: Date,
    required = 6,
): HabitAdvice | null {
    if (!Number.isInteger(required) || required < 3 || required > 7)
        throw new Error("عتبة المعاينة من3 إلى7 أيام من آخر7 أيام مؤهلة.");
    const today = habitDate(at, habit.timeZone),
        plan = effectiveHabitPlan(plans, today),
        latest = [...plans].sort((a, b) => b.revision - a.revision)[0];
    if (
        habit.kind !== "graded" ||
        habit.archived ||
        !plan?.current ||
        plan.id !== latest?.id ||
        habitPaused(habit.pauses, at) ||
        habitPaused(paths.find((p) => p.id === plan.pathId)?.pauses ?? [], at)
    )
        return null;
    const eligible = habitDates(
        addHabitDays(today, -28),
        addHabitDays(today, -1),
    )
        .map((date) => habitDay(habit, plans, paths, entries, date, at))
        .filter((d) => d.eligible);
    // Use only the latest uninterrupted run on this scale/level. Missing
    // recordings remain eligible days for promotion; they are not hard reports.
    const compatible: typeof eligible = [];
    for (const d of [...eligible].reverse()) {
        if (
            !d.plan ||
            calibration(d.plan) !== calibration(plan) ||
            JSON.stringify(d.plan.current) !== JSON.stringify(plan.current)
        )
            break;
        compatible.unshift(d);
    }
    const days = compatible.slice(-7);
    const recorded = compatible.filter((d) => d.entry).slice(-5);
    const hard = recorded.filter((d) => d.entry && hardEffort(d.entry));
    const hardBelow = hard.filter(
        (d) =>
            d.entry &&
            d.entry.result.kind === "graded" &&
            d.entry.result.amount < d.entry.result.threshold,
    );
    const canEase =
        recorded.length === 5 &&
        hardBelow.length >= 3 &&
        plan.current.target >
            plan.phases.find((p) => p.key === plan.current!.phaseKey)!.start;
    if (days.length < 7 && !canEase) return null;
    const completed = days.filter((d) => d.done),
        phase = plan.phases.find((p) => p.key === plan.current!.phaseKey)!,
        index = plan.phases.indexOf(phase);
    const actualDays = new Set(
        completed
            .filter(
                (d) =>
                    d.entry &&
                    habitDate(new Date(d.entry.recordedAt), habit.timeZone) ===
                        d.date,
            )
            .map((d) => d.date),
    );
    // Optional duration is a supporting signal, on six separate closed days
    // at the same scale/level. Compare time per actual unit, not raw duration
    // when the user performed different quantities. Missing data is neutral.
    const timed = compatible
        .filter(
            (d) =>
                d.entry?.durationMinutes !== undefined &&
                d.entry.result.kind === "graded" &&
                d.entry.result.amount > 0 &&
                habitDate(new Date(d.entry.recordedAt), habit.timeZone) ===
                    d.date,
        )
        .slice(-6);
    const median = (values: number[]) =>
        [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    let durationStrain = false,
        durationNote = "";
    if (timed.length === 6) {
        const values = timed.map(
            (d) =>
                d.entry!.durationMinutes! /
                (d.entry!.result.kind === "graded"
                    ? d.entry!.result.amount
                    : 1),
        );
        const older = values.slice(0, 3),
            recent = values.slice(3),
            a = median(older),
            b = median(recent);
        const scatter = Math.max(
            median(older.map((v) => Math.abs(v - a))),
            median(recent.map((v) => Math.abs(v - b))),
        );
        durationStrain = b > a + scatter && hard.length >= 2;
        durationNote = durationStrain
            ? " زاد وسيط الدقائق الفعلية لكل وحدة في آخر3 جلسات مقارنة بالثلاث السابقة، مع تقييمَي صعوبة مرتفعين على الأقل؛ هذا عامل مساعد للاستمرار، وليس قياسًا لجهدك أو سببًا لخفض تلقائي."
            : " تتوفر مدد فعلية لست جلسات مؤهلة؛ تبقى عاملًا مساعدًا ولا تثبت وحدها جاهزية التطوير.";
    }
    let type: HabitSuggestion["type"] = "maintain",
        change: HabitLevel | undefined,
        reason: string,
        effect: string;
    const value = scaledQuantity(plan.current.target)!,
        start = scaledQuantity(phase.start)!,
        step = scaledQuantity(phase.step)!,
        goal = scaledQuantity(phase.target)!;
    if (canEase && value > start) {
        type = "ease";
        change = {
            phaseKey: phase.key,
            target: Math.max(start, value - step) / 1000,
        };
        reason =
            "سجلت أن المستوى مرهق مع كمية أقل من الحد في3 من آخر5 تسجيلات مؤهلة. الانقطاع وحده لا يؤدي للتخفيف.";
    } else if (
        days.length === 7 &&
        completed.length >= required &&
        actualDays.size >= 3 &&
        hard.length < 3 &&
        !durationStrain
    ) {
        if (value < goal) {
            type = "increase";
            change = {
                phaseKey: phase.key,
                target: Math.min(goal, value + step) / 1000,
            };
        } else if (index < plan.phases.length - 1) {
            const next = plan.phases[index + 1];
            type = "advance";
            change = { phaseKey: next.key, target: next.start };
        }
        reason = `حققت حدك في${completed.length} من آخر7 أيام مؤهلة مغلقة، ومنها3 أيام أداء منفصلة على الأقل. عتبة هذه المعاينة ${required}/7.`;
    } else
        reason =
            hard.length >= 3
                ? "الاستمرار مناسب: تكررت تقييمات الصعوبة المرتفعة في3 من آخر5 جلسات مؤهلة، حتى لو تحقق الهدف. لا نقترح زيادة الآن ولا نخفض المستوى تلقائيًا."
                : `الاستمرار مناسب حاليًا: ${completed.length}/7 أيام تحقيق. يلزم الأداء المسجل في يومه على3 أيام منفصلة، ولا تكفي تعبئة أيام قديمة دفعة واحدة لاقتراح تطوير.`;
    reason += durationNote;
    if (change) {
        const targetPhase = plan.phases.find(
            (p) => p.key === change!.phaseKey,
        )!;
        effect = `من الغد: ${targetPhase.label}، ${change.target} ${targetPhase.unit}. ${type === "advance" ? "يتغير نوع الصعوبة؛ الكميات بين المراحل ليست متساوية في الجهد." : "زيادة أو تخفيف خطوة واحدة فقط."} السجل السابق محفوظ، ولا يطبق شيء دون تأكيدك.`;
    } else
        effect = "يبقى المستوى والجدول كما هما. لا خفض أو تصفير بسبب الانقطاع.";
    return {
        type,
        plan,
        reason,
        effect,
        change,
        days,
        basis: JSON.stringify([
            required,
            plan,
            habit.pauses,
            paths.find((p) => p.id === plan.pathId)?.pauses ?? [],
            days.map((d) => [d.date, d.entry ?? null]),
            recorded.map((d) => d.entry),
        ]),
    };
}
async function hash(value: string) {
    return [
        ...new Uint8Array(
            await crypto.subtle.digest(
                "SHA-256",
                new TextEncoder().encode(value),
            ),
        ),
    ]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}
const stores = [
    db.habits,
    db.habitPlans,
    db.habitPaths,
    db.habitEntries,
    db.habitSuggestions,
    db.habitAssessments,
];
async function evidence(id: string, at: Date, required: number) {
    const habit = await db.habits.get(id);
    if (!habit) throw new Error("العادة غير موجودة.");
    const today = habitDate(at, habit.timeZone);
    const [plans, paths, entries] = await Promise.all([
        db.habitPlans.where("habitId").equals(id).toArray(),
        db.habitPaths.toArray(),
        db.habitEntries
            .where("[habitId+localDate]")
            .between([id, addHabitDays(today, -28)], [id, today], true, true)
            .toArray(),
    ]);
    const assessed = await assessedHabitEntries(db, entries);
    return {
        habit,
        plans,
        paths,
        entries: assessed,
        advice: habitAdvice(habit, plans, paths, assessed, at, required),
    };
}
function materiallyChanged(
    rejected: HabitSuggestion,
    e: Awaited<ReturnType<typeof evidence>>,
    at: Date,
) {
    if (e.advice?.plan.id !== rejected.planId) return true;
    const after = e.advice.days.filter(
        (d) =>
            d.entry &&
            d.entry.recordedAt > (rejected.decidedAt ?? rejected.createdAt) &&
            habitDate(new Date(d.entry.recordedAt), e.habit.timeZone) ===
                d.date,
    );
    if (after.length < 3) return false;
    // A higher sustained actual amount or a demonstrable relief from reported
    // effort is meaningful; the calendar advancing alone is never sufficient.
    const prior = e.entries.filter(
        (r) =>
            r.recordedAt <= rejected.createdAt &&
            r.updatedAt <= (rejected.decidedAt ?? rejected.createdAt) &&
            r.result.kind === "graded",
    );
    if (prior.length < 3) return false;
    const median = (values: number[]) =>
        [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    const oldMedian = median(
        prior.map((r) => (r.result.kind === "graded" ? r.result.amount : 0)),
    );
    const newMedian = median(
        after.map((d) =>
            d.entry?.result.kind === "graded" ? d.entry.result.amount : 0,
        ),
    );
    return (
        newMedian > oldMedian ||
        (prior.filter(hardEffort).length >= 3 &&
            after.every(
                (d) =>
                    d.done &&
                    d.entry &&
                    (d.entry.effortRating !== undefined ||
                        d.entry.difficulty !== undefined) &&
                    !hardEffort(d.entry),
            ) &&
            at.toISOString() > (rejected.decidedAt ?? rejected.createdAt))
    );
}
export function refreshHabitAdvice(id: string, required = 6, at = new Date()) {
    return trackBackupWrite(() =>
        db.transaction("rw", stores, async () => {
            const e = await evidence(id, at, required),
                advice = e.advice,
                rows = await db.habitSuggestions
                    .where("habitId")
                    .equals(id)
                    .toArray();
            if (
                at.toISOString() < e.habit.updatedAt ||
                rows.some(
                    (s) =>
                        s.createdAt > at.toISOString() ||
                        (s.decidedAt ?? s.createdAt) > at.toISOString(),
                )
            )
                throw new Error("وقت الجهاز يسبق آخر قرار محفوظ.");
            const basisHash = advice
                ? await Dexie.waitFor(hash(advice.basis))
                : null;
            for (const row of rows.filter(
                (s) => s.status === "new" && s.basisHash !== basisHash,
            ))
                await db.habitSuggestions.put({
                    ...row,
                    status: "invalid",
                    decidedAt: at.toISOString(),
                });
            if (!advice || !basisHash) return null;
            const matching = rows.filter((s) => s.basisHash === basisHash);
            const fresh = matching.find((s) => s.status === "new");
            if (fresh) return fresh;
            if (
                matching.some(
                    (s) => s.status === "accepted" || s.status === "rejected",
                )
            )
                return null;
            const rejected = rows
                .filter(
                    (s) =>
                        s.status === "rejected" &&
                        s.type === advice.type &&
                        JSON.stringify(s.change) ===
                            JSON.stringify(advice.change),
                )
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
            if (rejected && !materiallyChanged(rejected, e, at)) return null;
            const row: HabitSuggestion = {
                id: uid(),
                habitId: id,
                planId: advice.plan.id,
                type: advice.type,
                reason: advice.reason,
                effect: advice.effect,
                basisHash,
                createdAt: at.toISOString(),
                status: "new",
                ...(advice.change ? { change: advice.change } : {}),
            };
            await db.habitSuggestions.add(row);
            return row;
        }),
    );
}
export function decideHabitAdvice(
    id: string,
    accept: boolean,
    required = 6,
    at = new Date(),
) {
    return trackBackupWrite(() =>
        db.transaction("rw", stores, async () => {
            const row = await db.habitSuggestions.get(id);
            if (!row) throw new Error("التوصية غير موجودة.");
            if (row.status !== "new")
                return { applied: false, stale: row.status === "invalid" };
            const stamp = at.toISOString();
            if (stamp < row.createdAt) throw new Error("تحقق من ساعة الجهاز.");
            if (!accept) {
                await db.habitSuggestions.put({
                    ...row,
                    status: "rejected",
                    decidedAt: stamp,
                });
                return { applied: false, stale: false };
            }
            const e = await evidence(row.habitId, at, required),
                candidate = e.advice;
            if (
                !candidate ||
                candidate.type !== row.type ||
                candidate.plan.id !== row.planId ||
                JSON.stringify(candidate.change) !==
                    JSON.stringify(row.change) ||
                row.basisHash !== (await Dexie.waitFor(hash(candidate.basis)))
            ) {
                await db.habitSuggestions.put({
                    ...row,
                    status: "invalid",
                    decidedAt: stamp,
                });
                return { applied: false, stale: true };
            }
            if (stamp < e.habit.updatedAt)
                throw new Error("تحقق من ساعة الجهاز.");
            let appliedPlanId: string | undefined;
            if (row.change) {
                const p = candidate.plan;
                appliedPlanId = uid();
                await db.habitPlans.add({
                    ...p,
                    id: appliedPlanId,
                    revision: p.revision + 1,
                    createdAt: stamp,
                    effectiveDate: addHabitDays(
                        habitDate(at, e.habit.timeZone),
                        1,
                    ),
                    current: { ...row.change },
                });
                await db.habits.put({ ...e.habit, updatedAt: stamp });
            }
            await db.habitSuggestions.put({
                ...row,
                status: "accepted",
                decidedAt: stamp,
                ...(appliedPlanId ? { appliedPlanId } : {}),
            });
            return { applied: true, stale: false };
        }),
    );
}
