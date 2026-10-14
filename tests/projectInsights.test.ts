import { it, expect } from "vitest";
import {
    projectMilestones,
    progressPace,
    projectComparison,
    inactivityDays,
    projectPeriodSummary,
    activityPeriods,
} from "../app/projectInsights";
import { periodWindows } from "../app/analytics";
import type { Project } from "../app/model";
import type {
    ProjectProgress,
    ProjectTracking,
} from "../app/projectProgressTypes";
const zone = "Asia/Riyadh",
    now = new Date("2026-10-18T09:00:00Z");
const project: Project = {
    id: "p",
    title: "مشروع",
    notes: "",
    status: "active",
    archived: false,
    createdAt: "2026-10-01T09:00:00.000Z",
    updatedAt: now.toISOString(),
};
const tracking: ProjectTracking = {
    projectId: "p",
    since: project.createdAt,
    origin: "new",
    initialPercent: 0,
    lastOrder: 0,
};
function row(
    order: number,
    before: number,
    after: number,
    at: string,
    reason: ProjectProgress["reason"] = "completion",
): ProjectProgress {
    return {
        id: JSON.stringify(["p", order]),
        projectId: "p",
        order,
        before,
        after,
        at,
        reason,
    };
}
it("مدد ٢٥ و٥٠ و٧٥ و١٠٠ محسوبة من البداية المعروفة، لا من مؤقت جهد", () => {
    const p = { ...project, createdAt: "2026-10-17T09:00:00.000Z" };
    const rows = [
        row(1, 0, 25, "2026-10-17T10:00:00.000Z"),
        row(2, 25, 50, "2026-10-17T21:00:00.000Z"),
        row(3, 50, 75, "2026-10-18T09:00:00.000Z"),
        row(4, 75, 100, "2026-10-19T09:00:00.000Z"),
    ];
    expect(
        projectMilestones(p, { ...tracking, since: p.createdAt }, rows).map(
            (m) => m.durationMs,
        ),
    ).toEqual([3600000, 43200000, 86400000, 172800000]);
    const started = { ...p, startedAt: "2026-10-17T09:30:00.000Z" };
    expect(
        projectMilestones(started, { ...tracking, since: p.createdAt }, rows)[0]
            .durationMs,
    ).toBe(1800000);
});
it("المشروع القديم لا يختلق مدد وصول قبل التتبع ولا يعد بلوغًا متكررًا أول وصول", () => {
    const old = {
        ...tracking,
        origin: "existing" as const,
        since: "2026-10-18T09:00:00.000Z",
        initialPercent: 50,
    };
    const milestones = projectMilestones(project, old, [
        row(1, 50, 75, "2026-10-19T09:00:00.000Z"),
    ]);
    expect(milestones.every((m) => m.durationMs === undefined)).toBe(true);
    expect(milestones[1].row).toBeUndefined();
    expect(milestones[2].row?.after).toBe(75);
    expect(
        projectMilestones({ ...project, startedAt: old.since }, old, [
            row(1, 50, 75, "2026-10-19T09:00:00.000Z"),
        ])[2].durationMs,
    ).toBeUndefined();
});
it("تغيّر الهيكل لا يرفع وتيرة العمل، والتراجع يخفضها والمراحل الهيكلية مميزة", () => {
    const range = periodWindows("week", now, zone).current;
    const rows = [
        row(1, 0, 25, "2026-10-17T09:00:00.000Z"),
        row(2, 25, 50, "2026-10-17T10:00:00.000Z", "step_deleted"),
        row(3, 50, 25, "2026-10-18T08:00:00.000Z", "reopen"),
    ];
    expect(progressPace(rows, range)).toBe(0);
    expect(projectMilestones(project, tracking, rows)[1].structural).toBe(true);
});
it("مقارنة فترتين ومشروعين تستخدم جزءًا مماثلًا وتكشف التسارع والتباطؤ فقط مع تغطية", () => {
    const w = periodWindows("week", now, zone);
    const rows = [
        row(1, 0, 10, "2026-10-11T08:00:00.000Z"),
        row(2, 10, 35, "2026-10-18T08:00:00.000Z"),
    ];
    expect(
        projectComparison(rows, tracking, w.current, w.previous, zone).trend,
    ).toBe("faster");
    expect(
        projectComparison(
            [rows[1], { ...rows[0], after: 50 }],
            tracking,
            w.current,
            w.previous,
            zone,
        ).trend,
    ).toBe("slower");
    expect(
        projectComparison(
            rows,
            { ...tracking, since: now.toISOString() },
            w.current,
            w.previous,
            zone,
        ).trend,
    ).toBe("unknown");
});
it("التوقف يبدأ من التتبع أو آخر تقدم مرصود لا من إنشاء قديم غير مرصود", () => {
    expect(
        inactivityDays(
            { ...tracking, origin: "existing", since: now.toISOString() },
            now,
            zone,
        ),
    ).toBe(0);
    expect(
        inactivityDays(
            { ...tracking, lastProgressAt: "2026-10-06T09:00:00.000Z" },
            now,
            zone,
        ),
    ).toBe(12);
    expect(inactivityDays(undefined, now, zone)).toBeNull();
    const w = periodWindows("week", now, zone),
        p2 = { ...project, id: "other" };
    const stats = projectPeriodSummary(
        { projects: [project, p2], steps: [] },
        [row(1, 0, 25, "2026-10-18T08:00:00.000Z")],
        [
            { ...tracking, lastProgressAt: "2026-10-18T08:00:00.000Z" },
            { ...tracking, projectId: "other" },
        ],
        w.current,
        now,
        zone,
    );
    expect(stats.progressed).toBe(1);
    expect(stats.stalled.map((p) => p.id)).toEqual(["other"]);
});

it("تجمع أيام النشاط وتحدد فجوات التوقف بعد التتبع دون الحكم على اليوم الجاري", () => {
    const rows = [
        row(1, 0, 25, "2026-10-02T09:00:00.000Z"),
        row(2, 25, 50, "2026-10-03T09:00:00.000Z"),
        row(3, 50, 75, "2026-10-06T09:00:00.000Z"),
    ];
    const periods = activityPeriods(
        rows,
        tracking,
        new Date("2026-10-08T09:00:00Z"),
        zone,
    );
    expect(periods.active.map((p) => [p.start, p.end])).toEqual([
        ["2026-10-02", "2026-10-03"],
        ["2026-10-06", "2026-10-06"],
    ]);
    expect(periods.idle.map((p) => [p.start, p.end])).toEqual([
        ["2026-10-01", "2026-10-01"],
        ["2026-10-04", "2026-10-05"],
        ["2026-10-07", "2026-10-07"],
    ]);
    expect(activityPeriods([], undefined, now, zone).idle).toEqual([]);
});
