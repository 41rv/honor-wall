import type {
    Habit,
    HabitEntry,
    HabitLevel,
    HabitPath,
    HabitPhase,
    HabitPlan,
} from "./habitTypes";
import { habitDate, habitDay } from "./habitCalendar";
import { scaledQuantity } from "./habitValidation";

export function validateHabitLevels(
    phases: HabitPhase[],
    current: HabitLevel,
    baseline: HabitLevel = current,
) {
    if (!Array.isArray(phases) || !phases.length || phases.length > 30)
        throw new Error("أضف مرحلة إلى30 مرحلة.");
    const keys = new Set<string>();
    for (const p of phases) {
        const start = scaledQuantity(p.start),
            target = scaledQuantity(p.target),
            step = scaledQuantity(p.step);
        if (
            !p.key?.trim() ||
            p.key.length > 100 ||
            keys.has(p.key) ||
            !p.label?.trim() ||
            p.label.length > 300 ||
            !p.unit?.trim() ||
            p.unit.length > 50 ||
            start === null ||
            target === null ||
            step === null ||
            step <= 0 ||
            target < start
        )
            throw new Error(
                "راجع أسماء المراحل والوحدات والأرقام: حتى3 منازل عشرية، والهدف لا يقل عن البداية، والزيادة موجبة.",
            );
        keys.add(p.key);
    }
    for (const level of [current, baseline]) {
        const p = phases.find((p) => p.key === level?.phaseKey),
            n = scaledQuantity(level?.target);
        if (
            !p ||
            n === null ||
            n < scaledQuantity(p.start)! ||
            n > scaledQuantity(p.target)! ||
            (n !== scaledQuantity(p.target)! &&
                (n - scaledQuantity(p.start)!) % scaledQuantity(p.step)! !== 0)
        )
            throw new Error(
                "المستوى يجب أن يقع ضمن المرحلة وعلى خطوات الزيادة المحددة، أو عند هدفها النهائي.",
            );
    }
}
export function habitLevelText(plan?: HabitPlan) {
    const p = plan?.phases.find((p) => p.key === plan.current?.phaseKey);
    return p && plan?.current
        ? `${p.label} · ${plan.current.target} ${p.unit}`
        : "";
}
export function calibration(plan: HabitPlan) {
    // A changed scale is a new series, never a retrospective conversion of units.
    return JSON.stringify([plan.phases, plan.baseline]);
}
function position(plan: HabitPlan, level: HabitLevel) {
    const i = plan.phases.findIndex((p) => p.key === level.phaseKey),
        p = plan.phases[i];
    const fraction =
        p.target === p.start
            ? 1
            : (level.target - p.start) / (p.target - p.start);
    return (i + Math.max(0, Math.min(1, fraction))) / plan.phases.length;
}
export function habitEvolution(
    habit: Habit,
    plans: HabitPlan[],
    paths: HabitPath[],
    entries: HabitEntry[],
    plan: HabitPlan,
    at: Date,
) {
    if (!plan.baseline)
        return {
            percent: null,
            proven: undefined,
            date: undefined,
            reason: "لا ينطبق",
        };
    const comparable = new Map(
        plans
            .filter((p) => calibration(p) === calibration(plan))
            .map((p) => [p.id, p]),
    );
    const groups = new Map<string, { level: HabitLevel; dates: string[] }>();
    for (const e of entries) {
        const p = comparable.get(e.planId);
        if (
            e.habitId !== habit.id ||
            !p?.current ||
            e.result.kind !== "graded" ||
            e.localDate > habitDate(at, habit.timeZone)
        )
            continue;
        const day = habitDay(habit, plans, paths, [e], e.localDate, at);
        // Today is not closed yet: it cannot establish a lasting development.
        if (!day.eligible || !day.done) continue;
        const key = JSON.stringify(p.current),
            group = groups.get(key) ?? { level: p.current, dates: [] };
        if (!group.dates.includes(e.localDate)) group.dates.push(e.localDate);
        groups.set(key, group);
    }
    const proven = [...groups.values()]
        .filter((g) => g.dates.length >= 3)
        .sort((a, b) => position(plan, b.level) - position(plan, a.level))[0];
    const base = position(plan, plan.baseline);
    return {
        percent:
            !proven || base >= 1
                ? null
                : Math.round(
                      100 *
                          Math.max(
                              0,
                              Math.min(
                                  1,
                                  (position(plan, proven.level) - base) /
                                      (1 - base),
                              ),
                          ),
                  ),
        proven: proven?.level,
        date: proven?.dates.sort().at(-1),
        reason:
            base >= 1
                ? "الخطة لا تحتوي نطاق زيادة"
                : !proven
                  ? "يلزم تحقيق المستوى في3 أيام مؤهلة منفصلة؛ تعيين مستوى أعلى وحده لا يثبت التطور"
                  : "تطور موثق بالأداء؛ المراحل أجزاء متساوية من الخطة وليست قياسًا للجهد",
    };
}
