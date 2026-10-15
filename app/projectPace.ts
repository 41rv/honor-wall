import { Temporal } from "@js-temporal/polyfill";
import type { Project, Step, Task } from "./model";
import type { Hierarchy } from "./hierarchy";
import type {
    ProjectGoal,
    ProjectPlan,
    StepWork,
    PaceRecommendation,
    PaceSettings,
} from "./paceTypes";
import {
    availableProjectDays,
    isProjectRest,
    remainingWorkDays,
    finishOnWorkDay,
    projectRestSettings,
    restScheduleAt,
} from "./projectRest";
import { dateKey } from "./dateKey";
import { localZone } from "./taskSchedule";
import { orderedToday } from "./dailyPlanning";

export const paused = (plan?: ProjectPlan) =>
    !!plan?.pauses.at(-1) && !plan.pauses.at(-1)!.end;
export const activeProject = (p: Project, plan?: ProjectPlan) =>
    p.status === "active" && !p.archived && !paused(plan);
export const addDays = (day: string, n: number) =>
    Temporal.PlainDate.from(day).add({ days: n }).toString();
export const betweenDays = (a: string, b: string) =>
    Temporal.PlainDate.from(a).until(Temporal.PlainDate.from(b)).days;
const startOf = (day: string, zone: string) =>
    Temporal.PlainDate.from(day).toZonedDateTime({
        timeZone: zone,
        plainTime: "00:00",
    }).epochMilliseconds;
export function makeGoal(
    kind: ProjectGoal["kind"],
    value: string | number,
    deadline: ProjectGoal["deadline"],
    at = new Date(),
    zone = localZone(),
): ProjectGoal {
    const anchor = dateKey(at, zone);
    if (kind === "duration") {
        const days = Number(value);
        if (!Number.isInteger(days) || days < 1 || days > 36500)
            throw new Error("اختر مدة من يوم إلى 36500 يوم.");
        return {
            kind,
            days,
            anchor,
            targetDate: addDays(anchor, days - 1),
            deadline,
            timeZone: zone,
        };
    }
    const targetDate = String(value);
    if (
        !/^\d{4}-\d\d-\d\d$/.test(targetDate) ||
        Temporal.PlainDate.from(targetDate).toString() !== targetDate ||
        targetDate < anchor
    )
        throw new Error("اختر تاريخًا صحيحًا لا يسبق اليوم.");
    return { kind, anchor, targetDate, deadline, timeZone: zone };
}
// Flexible goals pause by local calendar duration. A pause predating a newly
// edited goal contributes only its overlap with that goal. Fixed dates never move.
export function effectiveTarget(plan: ProjectPlan, at: Date) {
    const g = plan.goal;
    if (!g) return undefined;
    let shift = 0;
    if (g.deadline === "flexible")
        for (const pause of plan.pauses) {
            const a = [dateKey(pause.start, g.timeZone), g.anchor]
                .sort()
                .at(-1)!;
            const b = dateKey(
                Math.min(
                    Date.parse(pause.end ?? at.toISOString()),
                    at.getTime(),
                ),
                g.timeZone,
            );
            shift += Math.max(0, betweenDays(a, b));
        }
    return addDays(g.targetDate, shift);
}
export interface PaceResult {
    total: number;
    done: number;
    remaining: number;
    percent: number | null;
    target?: string;
    days?: number;
    workingDays?: number;
    restDay: boolean;
    restCompleted: number;
    restSettings?: PaceSettings;
    required?: number;
    today: number;
    allocation?: {
        low: number;
        high: number;
        highDays: number;
        lowDays: number;
    };
    actual?: number;
    forecastRate?: number;
    robustOlder?: number;
    recentWorkDays: number;
    recent?: number;
    older?: number;
    forecast?: string;
    observationDays: number;
    workDays: number;
    dailyCounts: number[];
    completedToday: number;
    recentBelowApproved: number;
    paused: boolean;
    sufficient: boolean;
}
export function projectPace(
    project: Project,
    plan: ProjectPlan | undefined,
    hierarchy: Hierarchy,
    work: StepWork[],
    at = new Date(),
    settings?: PaceSettings,
): PaceResult {
    settings = projectRestSettings(settings, plan);
    const metric = hierarchy.metric(project.id);
    const result: PaceResult = {
        ...metric,
        today: 0,
        observationDays: 0,
        recentWorkDays: 0,
        workDays: 0,
        dailyCounts: [],
        completedToday: 0,
        recentBelowApproved: 0,
        paused: paused(plan),
        sufficient: false,
        restDay: isProjectRest(at, settings),
        restCompleted: 0,
        restSettings: settings,
    };
    if (!plan) return result;
    const goalZone = plan.goal?.timeZone ?? localZone(),
        goalToday = dateKey(at, goalZone);
    result.target = effectiveTarget(plan, at);
    if (result.target) {
        result.days = Math.max(0, betweenDays(goalToday, result.target) + 1);
        result.workingDays = remainingWorkDays(
            [goalToday, plan.goal!.anchor].sort().at(-1)!,
            result.target,
            settings,
            at,
            goalZone,
        );
        result.required = metric.remaining
            ? result.workingDays
                ? metric.remaining / result.workingDays
                : undefined
            : 0;
        if (result.workingDays) {
            const low = Math.floor(metric.remaining / result.workingDays),
                highDays = metric.remaining % result.workingDays;
            result.allocation = {
                low,
                high: low + (highDays ? 1 : 0),
                highDays,
                lowDays: result.workingDays - highDays,
            };
        }
    }
    const zone = restScheduleAt(settings, at)?.timeZone ?? goalZone;
    const today = dateKey(at, zone);
    // Net work: only the latest state of each step contributes, even if it was
    // rapidly completed, undone and completed again. Deleted steps keep history.
    const latest = new Map<string, StepWork>();
    for (const row of [...work].sort((a, b) => a.order - b.order))
        if (
            row.projectId === project.id &&
            row.at >= plan.since &&
            Date.parse(row.at) <= at.getTime()
        )
            latest.set(row.stepId, row);
    const byDay = new Map<string, number>(),
        workingByDay = new Map<string, number>();
    for (const row of latest.values())
        if (
            row.complete &&
            !plan.pauses.some(
                (p) =>
                    row.at >= p.start &&
                    row.at < (p.end ?? "9999-12-31T23:59:59.999Z"),
            )
        ) {
            const day = dateKey(row.at, zone);
            byDay.set(day, (byDay.get(day) ?? 0) + 1);
            if (isProjectRest(new Date(row.at), settings)) {
                if (day >= addDays(today, -28)) result.restCompleted++;
            } else workingByDay.set(day, (workingByDay.get(day) ?? 0) + 1);
        }
    result.completedToday = byDay.get(today) ?? 0;
    const sinceDay = dateKey(plan.since, zone),
        first = [sinceDay, addDays(today, -28)].sort().at(-1)!;
    const recentCounts: number[] = [],
        olderCounts: number[] = [];
    let recentCount = 0,
        recentDays = 0,
        olderCount = 0,
        olderDays = 0;
    for (let day = first; day < today; day = addDays(day, 1)) {
        const start = Math.max(startOf(day, zone), Date.parse(plan.since)),
            end = startOf(addDays(day, 1), zone);
        const weight = availableProjectDays(
            start,
            end,
            settings,
            plan.pauses,
            zone,
        );
        if (!weight) continue;
        const count = workingByDay.get(day) ?? 0;
        result.observationDays += weight;
        result.dailyCounts.push(count);
        if (count) result.workDays++;
        if (day >= addDays(today, -7)) {
            if (
                plan.approvedPace &&
                plan.approvedAt &&
                day >= dateKey(plan.approvedAt, zone) &&
                weight >= 0.99 &&
                count < plan.approvedPace
            )
                result.recentBelowApproved++;
            recentCounts.push(count);
            if (count) result.recentWorkDays++;
            recentCount += count;
            recentDays += weight;
        } else {
            olderCounts.push(count);
            olderCount += count;
            olderDays += weight;
        }
    }
    const count = recentCount + olderCount;
    if (result.observationDays) result.actual = count / result.observationDays;
    if (recentDays >= 3) result.recent = recentCount / recentDays;
    if (olderDays >= 3) result.older = olderCount / olderDays;
    result.sufficient =
        result.observationDays >= 7 && result.workDays >= 3 && !!result.actual;
    // Use the observed recent rate if available; inactivity is part of the rate.
    const robust = (counts: number[], days: number, reference = counts) => {
        const positive = reference.filter((c) => c > 0).sort((a, b) => a - b);
        const median = positive[Math.floor((positive.length - 1) / 2)] ?? 0;
        return days
            ? counts.reduce((sum, c) => sum + Math.min(c, median), 0) / days
            : 0;
    };
    const rate =
        recentDays >= 3
            ? robust(
                  recentCounts,
                  recentDays,
                  result.recentWorkDays >= 3
                      ? recentCounts
                      : [...olderCounts, ...recentCounts],
              )
            : robust([...olderCounts, ...recentCounts], result.observationDays);
    result.forecastRate = rate;
    if (olderDays >= 3) result.robustOlder = robust(olderCounts, olderDays);
    if (result.sufficient && rate > 0 && activeProject(project, plan))
        result.forecast = finishOnWorkDay(
            at,
            Math.ceil(metric.remaining / rate),
            settings,
            goalZone,
        );
    const daily =
        result.workingDays === 0
            ? undefined
            : (plan.approvedPace ??
              (result.required === undefined
                  ? undefined
                  : Math.ceil(result.required)));
    result.today =
        result.paused ||
        result.restDay ||
        result.workingDays === 0 ||
        !activeProject(project, plan)
            ? 0
            : Math.min(
                  metric.remaining,
                  Math.max(0, (daily ?? 1) - result.completedToday),
              );
    return result;
}
export interface Acceleration {
    level: number;
    name: string;
    daily: number;
    finish: string;
    saved: number;
    hypothetical: boolean;
    reason: string;
}
export function accelerationOptions(
    pace: PaceResult,
    at = new Date(),
    zone = localZone(),
    commitments = 0,
): Acceleration[] {
    if (
        !pace.target ||
        !pace.remaining ||
        pace.paused ||
        pace.workingDays === 0
    )
        return [];
    const positive = pace.dailyCounts
        .filter((n) => n > 0)
        .sort((a, b) => a - b);
    const quantile = (q: number) =>
        positive[Math.floor((positive.length - 1) * q)] ?? 0;
    const baseline = Math.max(1, Math.ceil(pace.required ?? 0));
    const observed = pace.sufficient
        ? [
              Math.ceil(pace.forecastRate ?? pace.actual ?? 0),
              quantile(0.5),
              quantile(0.75),
          ]
        : [baseline + 1, baseline + 2, baseline + 3];
    const names = ["تسريع مريح", "ضغط خفيف", "ضغط قوي"];
    let previous = baseline - 1;
    return observed
        .map((n, i) => {
            const daily = pace.sufficient ? Math.max(1, n) : n;
            const finish = finishOnWorkDay(
                at,
                Math.ceil(pace.remaining / daily),
                pace.restSettings,
                zone,
            );
            if (!finish) return [];
            const saved = betweenDays(finish, pace.target!);
            const valid = daily > previous && daily >= baseline && saved > 0;
            previous = Math.max(previous, daily);
            return valid
                ? [
                      {
                          level: i + 1,
                          name: names[i],
                          daily,
                          finish,
                          saved,
                          hypothetical: !pace.sufficient,
                          reason: !pace.sufficient
                              ? "خيار حسابي افتراضي؛ لا يوجد سجل كافٍ لتوصية شخصية."
                              : `${["معدل حديث محافظ لكل يوم عمل، يستبعد الراحة والإيقاف ويحدّ من أثر الدفعات", "وسيط إنجاز أيام العمل النشطة", "الربيع الأعلى لأيام العمل النشطة؛ ضغط أكبر وقد لا يستمر"][i]}. الثقة أولية من ${positive.length} أيام إنجاز. لديك ${commitments} التزامات ظاهرة اليوم؛ عدد الخطوات لا يقيس الجهد.`,
                      },
                  ]
                : [];
        })
        .flat();
}
export function dailySteps(
    projectId: string,
    hierarchy: Hierarchy,
    count: number,
): Step[] {
    const out: Step[] = [],
        stack = [...hierarchy.children(projectId, null)].reverse();
    while (stack.length && out.length < count) {
        const s = stack.pop()!,
            children = hierarchy.children(projectId, s.id);
        if (children.length) stack.push(...[...children].reverse());
        else if (s.kind === "step" && s.status !== "done") out.push(s);
    }
    return out;
}
export interface RecommendationContext {
    projects: Project[];
    plans: ProjectPlan[];
    work: StepWork[];
    hierarchy: Hierarchy;
    tasks: Task[];
    settings?: PaceSettings;
}
export function recommendationCandidates(
    ctx: RecommendationContext,
    at = new Date(),
): PaceRecommendation[] {
    const { projects, plans, work, hierarchy, tasks, settings } = ctx;
    if (isProjectRest(at, settings)) return [];
    const open = projects.filter((p) =>
        activeProject(
            p,
            plans.find((x) => x.projectId === p.id),
        ),
    );
    const load = orderedToday(tasks, at).filter(
        ({ task }) => task.status !== "done",
    ).length;
    const urgent = orderedToday(tasks, at).some(
        ({ task }) =>
            task.status !== "done" &&
            ["important-urgent", "urgent"].includes(task.priority ?? ""),
    );
    const groupedWork = new Map<string, StepWork[]>();
    for (const row of work) {
        const group = groupedWork.get(row.projectId) ?? [];
        group.push(row);
        groupedWork.set(row.projectId, group);
    }
    const rows = open.map((p) => {
        const plan = plans.find((x) => x.projectId === p.id);
        return {
            p,
            plan,
            pace: projectPace(
                p,
                plan,
                hierarchy,
                groupedWork.get(p.id) ?? [],
                at,
                settings,
            ),
        };
    });
    const candidates: PaceRecommendation[] = [];
    const build = (
        type: PaceRecommendation["type"],
        ids: string[],
        reason: string,
        effect: string,
        changes: PaceRecommendation["changes"],
        evidence: unknown,
    ) => {
        const basis = JSON.stringify([
            ids.map((id) => {
                const p = projects.find((p) => p.id === id)!,
                    plan = plans.find((x) => x.projectId === id);
                return [
                    id,
                    p.status,
                    p.archived,
                    plan?.revision,
                    hierarchy.metric(id).remaining,
                ];
            }),
            evidence,
            load,
            open.map((p) => p.id).sort(),
            settings?.restHistory?.at(-1),
        ]);
        // Same situation remains dismissed across days; no date in identity.
        const key = JSON.stringify([
            type,
            ids,
            ids.map((id) => {
                const plan = plans.find((p) => p.projectId === id);
                const m = hierarchy.metric(id);
                return [
                    plan?.revision,
                    Math.floor((m.done / Math.max(1, m.total)) * 5),
                ];
            }),
            evidence,
            Math.floor(load / 3),
            open.map((p) => p.id).sort(),
            settings?.restHistory?.at(-1),
        ]);
        candidates.push({
            id: key,
            key,
            type,
            projectIds: ids,
            reason,
            effect,
            createdAt: at.toISOString(),
            status: "new",
            changes,
            basis,
        });
    };
    for (const { p, plan, pace } of rows) {
        if (!plan || !pace.remaining || pace.days === undefined) continue;
        const options = accelerationOptions(
            pace,
            at,
            plan.goal?.timeZone,
            load,
        );
        // Urgent current commitments suppress personal acceleration advice.
        // We do not claim to know how much effort any task requires.
        if (
            options[0] &&
            options[0].daily > (plan.approvedPace ?? 0) &&
            pace.sufficient &&
            (pace.forecastRate ?? 0) >= (pace.required ?? Infinity) &&
            !urgent &&
            !!plan.goal
        ) {
            const o = options[0];
            build(
                "accelerate",
                [p.id],
                `لديك إنجاز في ${pace.workDays} أيام فعلية، ومتوسط ${pace.actual!.toFixed(1)} خطوة لكل يوم عمل متاح للرصد.`,
                plan.goal?.deadline === "fixed"
                    ? `${o.daily} خطوة لكل يوم عمل؛ انتهاء حسابي ${o.finish} مع بقاء الموعد الإلزامي ${pace.target}.`
                    : `${o.daily} خطوة لكل يوم عمل؛ هدف مرن جديد ${o.finish} بدل ${pace.target}.`,
                [
                    {
                        type:
                            plan.goal?.deadline === "fixed" ? "pace" : "target",
                        projectId: p.id,
                        targetDate: o.finish,
                        daily: o.daily,
                    },
                ],
                [
                    "capacity",
                    Math.floor(pace.actual!),
                    Math.floor(pace.recent ?? 0),
                    Math.floor(pace.older ?? 0),
                ],
            );
        }
        const approvedDays = plan.approvedAt
            ? betweenDays(
                  dateKey(plan.approvedAt, plan.goal?.timeZone ?? localZone()),
                  dateKey(at, plan.goal?.timeZone ?? localZone()),
              )
            : 0;
        if (
            plan.approvedPace &&
            pace.observationDays >= 7 &&
            approvedDays >= 7 &&
            pace.recentBelowApproved >= 5 &&
            (pace.recent ?? 0) < plan.approvedPace &&
            plan.goal?.deadline === "flexible"
        ) {
            const daily = Math.max(
                    1,
                    Math.ceil(pace.recent ?? pace.actual ?? 1),
                ),
                finish = finishOnWorkDay(
                    at,
                    Math.ceil(pace.remaining / daily),
                    pace.restSettings,
                    plan.goal.timeZone,
                );
            if (finish && finish > pace.target!)
                build(
                    "ease",
                    [p.id],
                    `لم تبلغ الوتيرة المعتمدة في خمسة أيام متاحة على الأقل من آخر أسبوع مرصود بعد اعتمادها.${pace.workDays < 3 ? " هذه خطة تجريبية لتخفيف الضغط، وليست قدرة شخصية مثبتة." : ""}`,
                    `تخفيف إلى ${daily} خطوة لكل يوم عمل وتمديد الهدف المرن إلى ${finish}.`,
                    [
                        {
                            type: "target",
                            projectId: p.id,
                            targetDate: finish,
                            daily,
                        },
                    ],
                    ["below", daily, plan.approvedPace],
                );
        }
    }
    const fast = rows.find(
        (r) =>
            r.pace.sufficient &&
            (r.pace.forecastRate ?? 0) > (r.pace.robustOlder ?? Infinity) &&
            r.pace.recentWorkDays >= 3 &&
            r.pace.workDays >= 5,
    );
    const slow = rows.find(
        (r) =>
            r !== fast &&
            r.pace.sufficient &&
            r.plan?.goal?.deadline !== "fixed" &&
            r.pace.recent === 0 &&
            (r.pace.older ?? 0) > 0,
    );
    if (fast && slow)
        build(
            "focus",
            [fast.p.id, slow.p.id],
            `إنجاز «${fast.p.title}» أعلى من الفترة الأقدم، و«${slow.p.title}» لم يسجل إنجازًا خلال الأسبوع الأخير مع استبعاد الراحة والإيقاف. هذه مقارنة أعداد، لا قياس جهد.`,
            `إتاحة التركيز على «${fast.p.title}» عبر إيقاف «${slow.p.title}» مؤقتًا. هدفه المرن يتجمد ويمكن استئنافه في أي وقت.`,
            [{ type: "pause", projectId: slow.p.id }],
            [
                "focus",
                Math.floor(fast.pace.recent!),
                Math.floor(fast.pace.older!),
                slow.pace.recent,
            ],
        );
    return candidates;
}

export function pausedCalendarDays(
    plan: ProjectPlan | undefined,
    start: Date,
    end: Date,
    zone = localZone(),
) {
    if (!plan) return 0;
    return plan.pauses.reduce((sum, p) => {
        const a = Math.max(start.getTime(), Date.parse(p.start)),
            b = Math.min(end.getTime(), Date.parse(p.end ?? end.toISOString()));
        return (
            sum +
            (b > a
                ? Math.max(0, betweenDays(dateKey(a, zone), dateKey(b, zone)))
                : 0)
        );
    }, 0);
}
