import { useState, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import type { Snapshot } from "./model";
import type { ProjectProgress, ProjectTracking } from "./projectProgressTypes";
import { progressReasons } from "./projectProgressTypes";
import { periodWindows, type TimeRange } from "./analytics";
import {
    progressPace,
    projectComparison,
    projectMilestones,
    inactivityDays,
    durationLabel,
    activityPeriods,
    periodDays,
} from "./projectInsights";
import { localZone } from "./taskSchedule";
import { dayInstant } from "./weekCalendar";

export function MasarInsights({
    data,
    rows,
    tracking,
    current,
    previous,
    clock,
}: {
    data: Snapshot;
    rows: ProjectProgress[];
    tracking: ProjectTracking[];
    current: TimeRange;
    previous: TimeRange;
    clock: number;
}) {
    const [chosen, setChosen] = useState(""),
        [limit, setLimit] = useState(20);
    const project =
            data.projects.find((p) => p.id === chosen) ?? data.projects[0],
        zone = localZone();
    const storedHistory = useLiveQuery(
        async () => ({
            projectId: project?.id,
            rows: project
                ? await db.projectProgress
                      .where("projectId")
                      .equals(project.id)
                      .sortBy("order")
                : ([] as ProjectProgress[]),
        }),
        [project?.id],
    );
    const history =
        storedHistory?.projectId === project?.id
            ? storedHistory?.rows
            : undefined;
    const byId = useMemo(
        () => new Map(tracking.map((t) => [t.projectId, t])),
        [tracking],
    );
    const baseline = project ? byId.get(project.id) : undefined;
    const milestones = project
        ? projectMilestones(project, baseline, history ?? [])
        : [];
    const byProject = useMemo(() => {
        const groups = new Map<string, ProjectProgress[]>();
        for (const row of rows) {
            const group = groups.get(row.projectId) ?? [];
            group.push(row);
            groups.set(row.projectId, group);
        }
        return groups;
    }, [rows]);
    const durations = useMemo(
        () => ({
            current: periodDays(current, zone),
            previous: periodDays(previous, zone),
        }),
        [current, previous, zone],
    );
    const projects = useMemo(
        () =>
            data.projects
                .map((p) => ({
                    project: p,
                    ...projectComparison(
                        byProject.get(p.id) ?? [],
                        byId.get(p.id),
                        current,
                        previous,
                        zone,
                        durations,
                    ),
                    idle: inactivityDays(byId.get(p.id), new Date(clock), zone),
                }))
                .sort((a, b) => b.currentGain - a.currentGain),
        [
            data.projects,
            byProject,
            byId,
            current,
            previous,
            zone,
            clock,
            durations,
        ],
    );
    const format = new Intl.DateTimeFormat("ar", {
        timeZone: zone,
        dateStyle: "medium",
        timeStyle: "short",
    });
    const plot = useMemo(() => {
        if (!baseline) return [];
        const full = [
            {
                at: baseline.since,
                after: baseline.initialPercent,
                reason: "baseline",
                order: 0,
            },
            ...(history ?? []),
        ];
        if (full.length <= 202) return full;
        const kept = new Set([0, full.length - 1]);
        const bucket = Math.ceil(full.length / 100);
        for (let i = 0; i < full.length; i += bucket) {
            let min = i,
                max = i;
            for (let j = i; j < Math.min(full.length, i + bucket); j++) {
                if ((full[j].after ?? 0) < (full[min].after ?? 0)) min = j;
                if ((full[j].after ?? 0) > (full[max].after ?? 0)) max = j;
            }
            kept.add(min);
            kept.add(max);
        }
        return [...kept].sort((a, b) => a - b).map((i) => full[i]);
    }, [baseline, history]);
    const first = baseline ? Date.parse(baseline.since) : clock,
        span = Math.max(1, clock - first);
    let continuous = false;
    const path = plot
        .map((point) => {
            if (point.after === null) {
                continuous = false;
                return "";
            }
            const command = continuous ? "L" : "M";
            continuous = true;
            return `${command}${380 - ((Date.parse(point.at) - first) / span) * 360},${140 - point.after * 1.2}`;
        })
        .join(" ");
    const weekly = periodWindows("week", new Date(clock), zone),
        monthly = periodWindows("month", new Date(clock), zone);
    const last = baseline
        ? inactivityDays(baseline, new Date(clock), zone)
        : null;
    const lastWork = (history ?? []).filter(
        (r) => r.reason === "completion" && (r.after ?? 0) > (r.before ?? 0),
    );
    const periods = useMemo(
        () => activityPeriods(history ?? [], baseline, new Date(clock), zone),
        [history, baseline, clock, zone],
    );
    return (
        <section className="surface masar-insights" aria-label="رؤى مسار">
            <h2>رؤى مسار</h2>
            <p className="muted">
                نقيس وتيرة التقدم عبر الزمن التقويمي، لا ساعات العمل أو مقدار
                الجهد. تغييرات البنية تظهر في الرسم والسجل، ولا تُحسب كإنجاز
                عمل.
            </p>
            {projects.some((p) => p.currentGain > 0) && (
                <p>
                    أكبر تقدم عمل في الفترة: «{projects[0].project.title}» —{" "}
                    {projects[0].currentGain} نقطة مئوية.
                </p>
            )}
            {projects
                .filter((p) => p.trend === "faster" || p.trend === "slower")
                .slice(0, 3)
                .map((p) => (
                    <p key={p.project.id}>
                        وتيرة «{p.project.title}»{" "}
                        {p.trend === "faster" ? "أعلى" : "أقل"} من الجزء المقابل
                        في الفترة السابقة: {p.currentGain} مقابل{" "}
                        {p.previousGain} نقطة مئوية.
                    </p>
                ))}
            {!projects.some((p) => p.covered) && (
                <p className="muted small">
                    سجل التقدم لا يغطي الفترة السابقة بعد؛ لن نستنتج تسارعًا أو
                    تباطؤًا دون بيانات كافية.
                </p>
            )}
            {projects
                .filter(
                    (p) =>
                        p.project.status === "active" &&
                        !p.project.archived &&
                        (p.idle ?? 0) >= 14,
                )
                .slice(0, 3)
                .map((p) => (
                    <p key={`idle-${p.project.id}`}>
                        لم يسجل «{p.project.title}» تقدم عمل إيجابيًا منذ{" "}
                        {p.idle} يومًا ضمن مدة التتبع المتاحة.
                    </p>
                ))}
            {project ? (
                <>
                    <label className="field">
                        تحليل المشروع
                        <select
                            aria-label="المشروع للتحليل"
                            value={project.id}
                            onChange={(e) => {
                                setChosen(e.target.value);
                                setLimit(20);
                            }}
                        >
                            {data.projects.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.title}
                                </option>
                            ))}
                        </select>
                    </label>
                    <a
                        className="text-btn"
                        href={`#project/${encodeURIComponent(project.id)}`}
                    >
                        فتح المشروع
                    </a>
                    <p className="muted small">
                        {project.startedAt
                            ? "البداية: تاريخ بدء العمل المسجل"
                            : "البداية: تاريخ إنشاء المشروع لعدم وجود تاريخ بدء صريح"}{" "}
                        —{" "}
                        {format.format(
                            new Date(project.startedAt ?? project.createdAt),
                        )}
                        .
                    </p>
                    {baseline?.origin === "existing" && (
                        <p className="muted small">
                            بدأ التتبع في{" "}
                            {format.format(new Date(baseline.since))}. نسبة
                            البداية المرصودة:{" "}
                            {baseline.initialPercent === null
                                ? "لا توجد خطوات"
                                : `${baseline.initialPercent}٪`}
                            . لا نعرف مسار النسبة أو مدة بلوغها قبل هذا التاريخ.
                        </p>
                    )}
                    <div className="project-chart">
                        <svg
                            viewBox="0 0 400 170"
                            role="img"
                            aria-label={`تغير نسبة إنجاز ${project.title} عبر الزمن`}
                        >
                            <line
                                x1="20"
                                y1="140"
                                x2="380"
                                y2="140"
                                stroke="var(--line)"
                            />
                            <line
                                x1="20"
                                y1="20"
                                x2="380"
                                y2="20"
                                stroke="var(--line)"
                            />
                            <text
                                x="2"
                                y="24"
                                fill="var(--muted)"
                                fontSize="10"
                            >
                                100%
                            </text>
                            <text
                                x="2"
                                y="140"
                                fill="var(--muted)"
                                fontSize="10"
                            >
                                0%
                            </text>
                            <path
                                d={path}
                                fill="none"
                                stroke="var(--primary)"
                                strokeWidth="2"
                            />
                            {plot
                                .filter((p) => p.after !== null)
                                .map((p) => (
                                    <circle
                                        key={p.order}
                                        cx={
                                            380 -
                                            ((Date.parse(p.at) - first) /
                                                span) *
                                                360
                                        }
                                        cy={140 - p.after! * 1.2}
                                        r="3"
                                        fill={
                                            p.reason === "completion"
                                                ? "var(--primary)"
                                                : "var(--surface)"
                                        }
                                        stroke="var(--text)"
                                    >
                                        <title>
                                            {format.format(new Date(p.at))}:{" "}
                                            {p.after}٪{" "}
                                            {p.reason === "baseline"
                                                ? "بداية التتبع"
                                                : progressReasons[
                                                      p.reason as keyof typeof progressReasons
                                                  ]}
                                        </title>
                                    </circle>
                                ))}
                        </svg>
                    </div>
                    <p className="muted small">
                        من{" "}
                        {baseline
                            ? format.format(new Date(baseline.since))
                            : "—"}{" "}
                        إلى الآن. النقاط المجوفة تغيّر بنية أو تراجع؛ الممتلئة
                        إنجاز عمل. التفاصيل محفوظة في السجل أدناه.
                    </p>
                    {history === undefined && (
                        <p role="status" className="muted">
                            قراءة سجل المشروع…
                        </p>
                    )}
                    {history !== undefined && !history.length && (
                        <p>لم تُسجل تغيرات في النسبة بعد.</p>
                    )}
                    <div className="insight-milestones">
                        {milestones.map((m) => (
                            <div key={m.percent}>
                                <strong>{m.percent}٪</strong>
                                <span>
                                    {m.durationMs !== undefined
                                        ? durationLabel(m.durationMs)
                                        : "مدة الوصول غير معروفة"}
                                </span>
                                {m.row && (
                                    <span>
                                        {format.format(new Date(m.row.at))}
                                        {m.structural ? " · تغيّر بنية" : ""}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                    <p>
                        تقدم العمل هذا الأسبوع:{" "}
                        {progressPace(history ?? [], weekly.current)} نقطة
                        مئوية؛ هذا الشهر:{" "}
                        {progressPace(history ?? [], monthly.current)} نقطة
                        مئوية.
                    </p>
                    <p className="muted small">
                        أيام تغير النسبة بسبب إنجاز العمل:{" "}
                        {
                            new Set(
                                lastWork.map((r) =>
                                    new Intl.DateTimeFormat("en-CA", {
                                        timeZone: zone,
                                    }).format(new Date(r.at)),
                                ),
                            ).size
                        }
                        .{" "}
                        {last !== null
                            ? `منذ آخر تقدم إيجابي مرصود: ${last} يومًا.`
                            : "لا توجد بيانات كافية لتحديد آخر تقدم."}
                    </p>
                    {!!(periods.active.length + periods.idle.length) && (
                        <details className="progress-history">
                            <summary>
                                فترات النشاط والتوقف في سجل النسبة
                            </summary>
                            <p className="muted small">
                                ضمن مدة التتبع فقط. اليوم الجاري لا يُحسب فترة
                                توقف مكتملة؛ غياب تغير النسبة لا يعني قياس الجهد
                                أو ساعات العمل.
                            </p>
                            {[...periods.active, ...periods.idle]
                                .sort((a, b) => b.start.localeCompare(a.start))
                                .slice(0, 6)
                                .map((period) => (
                                    <p key={period.kind + period.start}>
                                        {period.kind === "active"
                                            ? "تقدم عمل مسجل"
                                            : "دون تقدم عمل مسجل"}
                                        : من{" "}
                                        {new Intl.DateTimeFormat("ar", {
                                            timeZone: zone,
                                            dateStyle: "medium",
                                        }).format(
                                            new Date(
                                                dayInstant(period.start, zone),
                                            ),
                                        )}{" "}
                                        إلى{" "}
                                        {new Intl.DateTimeFormat("ar", {
                                            timeZone: zone,
                                            dateStyle: "medium",
                                        }).format(
                                            new Date(
                                                dayInstant(period.end, zone),
                                            ),
                                        )}
                                        .
                                    </p>
                                ))}
                        </details>
                    )}
                    <details className="progress-history">
                        <summary>
                            سجل تغير نسب المشروع ({history?.length ?? 0})
                        </summary>
                        <div className="table-scroll">
                            <table>
                                <thead>
                                    <tr>
                                        <th>التوقيت</th>
                                        <th>قبل</th>
                                        <th>بعد</th>
                                        <th>السبب</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...(history ?? [])]
                                        .reverse()
                                        .slice(0, limit)
                                        .map((row) => (
                                            <tr key={row.id}>
                                                <td>
                                                    {format.format(
                                                        new Date(row.at),
                                                    )}
                                                </td>
                                                <td>
                                                    {row.before === null
                                                        ? "—"
                                                        : `${row.before}٪`}
                                                </td>
                                                <td>
                                                    {row.after === null
                                                        ? "—"
                                                        : `${row.after}٪`}
                                                </td>
                                                <td>
                                                    {
                                                        progressReasons[
                                                            row.reason
                                                        ]
                                                    }
                                                </td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        </div>
                        {(history?.length ?? 0) > limit && (
                            <button
                                className="text-btn"
                                onClick={() => setLimit((n) => n + 20)}
                            >
                                عرض المزيد من التغيرات
                            </button>
                        )}
                    </details>
                </>
            ) : (
                <p className="muted">
                    أضف مشروعًا لترى تطوره. لا تتوفر بيانات مشاريع للتحليل بعد.
                </p>
            )}
        </section>
    );
}
