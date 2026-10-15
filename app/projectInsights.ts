import { activeProject, pausedCalendarDays } from "./projectPace";
import type { ProjectPlan } from "./paceTypes";
import { dateKey } from "./dateKey";
import type { Project, Snapshot } from "./model";
import { Temporal } from "@js-temporal/polyfill";
import { localDay, localZone } from "./taskSchedule";
import { inRange, type TimeRange } from "./analytics";
import type { ProjectProgress, ProjectTracking } from "./projectProgressTypes";
export const workDelta = (row: ProjectProgress) =>
    ["completion", "reopen"].includes(row.reason)
        ? (row.after ?? 0) - (row.before ?? 0)
        : 0;
export function activityPeriods(
    rows: ProjectProgress[],
    tracking: ProjectTracking | undefined,
    at = new Date(),
    zone = localZone(),
    plan?: ProjectPlan,
) {
    const active: { start: string; end: string; kind: "active" }[] = [],
        idle: { start: string; end: string; kind: "idle" }[] = [];
    if (!tracking) return { active, idle };
    const start = localDay(new Date(tracking.since), zone),
        today = localDay(at, zone);
    const days = [
        ...new Set(
            rows
                .filter(
                    (r) =>
                        r.reason === "completion" &&
                        workDelta(r) > 0 &&
                        Date.parse(r.at) >= Date.parse(tracking.since) &&
                        Date.parse(r.at) <= at.getTime(),
                )
                .map((r) => localDay(new Date(r.at), zone).toString()),
        ),
    ].sort();
    for (const day of days) {
        const last = active.at(-1);
        if (
            last &&
            Temporal.PlainDate.from(last.end).add({ days: 1 }).toString() ===
                day
        )
            last.end = day;
        else active.push({ start: day, end: day, kind: "active" });
    }
    let cursor = start;
    const lastComplete = today.subtract({ days: 1 });
    for (const period of active) {
        const before = Temporal.PlainDate.from(period.start).subtract({
            days: 1,
        });
        if (Temporal.PlainDate.compare(cursor, before) <= 0)
            idle.push({
                start: cursor.toString(),
                end: before.toString(),
                kind: "idle",
            });
        cursor = Temporal.PlainDate.from(period.end).add({ days: 1 });
    }
    if (Temporal.PlainDate.compare(cursor, lastComplete) <= 0)
        idle.push({
            start: cursor.toString(),
            end: lastComplete.toString(),
            kind: "idle",
        });
    let available = idle;
    for (const pause of plan?.pauses ?? []) {
        const endStamp = Date.parse(pause.end ?? at.toISOString());
        if (endStamp <= Date.parse(pause.start)) continue;
        const begin = dateKey(pause.start, zone),
            finish = dateKey(endStamp - 1, zone);
        available = available.flatMap((row) => {
            if (row.end < begin || row.start > finish) return [row];
            return [
                ...(row.start < begin
                    ? [
                          {
                              ...row,
                              end: Temporal.PlainDate.from(begin)
                                  .subtract({ days: 1 })
                                  .toString(),
                          },
                      ]
                    : []),
                ...(row.end > finish
                    ? [
                          {
                              ...row,
                              start: Temporal.PlainDate.from(finish)
                                  .add({ days: 1 })
                                  .toString(),
                          },
                      ]
                    : []),
            ];
        });
    }
    return { active, idle: available };
}
export function progressPace(rows: ProjectProgress[], range: TimeRange) {
    return rows
        .filter((row) => inRange(row.at, range))
        .reduce((total, row) => total + workDelta(row), 0);
}
export function periodDays(range: TimeRange, zone = localZone()) {
    const days = localDay(new Date(range.start), zone).until(
        localDay(new Date(range.cutoff), zone),
    ).days;
    const at = new Intl.DateTimeFormat("en-GB", {
        timeZone: zone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).format(new Date(range.cutoff));
    const [hours, minutes] = at.split(":").map(Number);
    return Math.max(0, days + (hours * 60 + minutes) / 1440);
}
export function projectComparison(
    rows: ProjectProgress[],
    tracking: ProjectTracking | undefined,
    current: TimeRange,
    previous: TimeRange,
    zone = localZone(),
    durations?: { current: number; previous: number },
) {
    const currentGain = progressPace(rows, current),
        previousGain = progressPace(rows, previous),
        currentDays = durations?.current ?? periodDays(current, zone),
        previousDays = durations?.previous ?? periodDays(previous, zone);
    const covered =
        !!tracking &&
        Date.parse(tracking.since) <= previous.start &&
        currentDays > 0 &&
        previousDays > 0;
    const speed = covered ? currentGain / currentDays : null,
        oldSpeed = covered ? previousGain / previousDays : null;
    return {
        currentGain,
        previousGain,
        covered,
        speed,
        oldSpeed,
        trend: covered
            ? speed! > oldSpeed! + 0.01
                ? "faster"
                : speed! < oldSpeed! - 0.01
                  ? "slower"
                  : "steady"
            : "unknown",
    };
}
export function projectMilestones(
    project: Project,
    tracking: ProjectTracking | undefined,
    rows: ProjectProgress[],
) {
    const start = Date.parse(project.startedAt ?? project.createdAt);
    return [25, 50, 75, 100].map((percent) => {
        const row = [...rows]
            .sort((a, b) => a.order - b.order)
            .find(
                (r) => (r.before ?? 0) < percent && (r.after ?? 0) >= percent,
            );
        const alreadyKnown =
            tracking?.initialPercent !== null &&
            tracking?.initialPercent !== undefined &&
            tracking.initialPercent >= percent;
        // A later "doing" action on an old project does not prove that it
        // never crossed this milestone before tracking began.
        const known = !!tracking && !alreadyKnown && tracking.origin === "new";
        return {
            percent,
            row: alreadyKnown ? undefined : row,
            durationMs:
                known && row && Date.parse(row.at) >= start
                    ? Date.parse(row.at) - start
                    : undefined,
            structural: !!row && !["completion", "reopen"].includes(row.reason),
        };
    });
}
export function inactivityDays(
    tracking: ProjectTracking | undefined,
    at = new Date(),
    zone = localZone(),
    plan?: ProjectPlan,
) {
    if (!tracking) return null;
    return Math.max(
        0,
        localDay(
            new Date(tracking.lastProgressAt ?? tracking.since),
            zone,
        ).until(localDay(at, zone)).days -
            pausedCalendarDays(
                plan,
                new Date(tracking.lastProgressAt ?? tracking.since),
                at,
                zone,
            ),
    );
}
export function projectPeriodSummary(
    data: Pick<Snapshot, "projects" | "steps" | "projectPlans">,
    rows: ProjectProgress[],
    tracking: ProjectTracking[],
    range: TimeRange,
    at: Date,
    zone = localZone(),
) {
    const tracked = new Map(tracking.map((t) => [t.projectId, t]));
    const grouped = new Map<string, ProjectProgress[]>();
    for (const row of rows) {
        const list = grouped.get(row.projectId) ?? [];
        list.push(row);
        grouped.set(row.projectId, list);
    }
    const active = data.projects.filter((p) =>
        activeProject(
            p,
            data.projectPlans?.find((plan) => plan.projectId === p.id),
        ),
    );
    const legacy = new Set<string>(),
        parents = new Set(data.steps.map((s) => s.parentId));
    for (const step of data.steps)
        if (
            step.kind === "step" &&
            !parents.has(step.id) &&
            step.status === "done" &&
            inRange(step.completedAt, range) &&
            !!tracked.get(step.projectId) &&
            Date.parse(step.completedAt!) <
                Date.parse(tracked.get(step.projectId)!.since)
        )
            legacy.add(step.projectId);
    return {
        progressed: data.projects.filter(
            (p) =>
                progressPace(grouped.get(p.id) ?? [], range) > 0 ||
                legacy.has(p.id),
        ).length,
        stalled: active.filter(
            (p) =>
                (inactivityDays(
                    tracked.get(p.id),
                    at,
                    zone,
                    data.projectPlans?.find((plan) => plan.projectId === p.id),
                ) ?? 0) >= 14,
        ),
        active: active.length,
    };
}
export function durationLabel(ms: number) {
    if (ms < 3600000)
        return ms < 60000 ? "أقل من دقيقة" : `${Math.floor(ms / 60000)} دقيقة`;
    if (ms < 48 * 3600000) return `${Math.floor(ms / 3600000)} ساعة`;
    return `${Math.floor(ms / 86400000)} يومًا`;
}
