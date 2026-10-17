import { GlassChoices } from "./GlassChoices";
import { useState, useMemo, useEffect, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { useWallClock } from "./useWallClock";
import {
    periodWindows,
    taskMetrics,
    projectMetrics,
    inRange,
    type Period,
} from "./analytics";
import { localZone } from "./taskSchedule";
import { dateKey } from "./dateKey";
import type { Snapshot } from "./model";
import { MasarInsights } from "./MasarInsights";
import { AchievementLog } from "./AchievementLog";
import type { AchievementRecord } from "./achievementRecords";
export type ProgressTab = "overview" | "insights" | "history";
const progressTabs = [
    ["overview", "نظرة عامة"],
    ["insights", "رؤى مسار"],
    ["history", "سجل الإنجاز"],
] as const;
import { projectPeriodSummary } from "./projectInsights";
export function PeriodDashboard({
    data,
    tab,
    onTabChange,
    legacy,
    renderRecord,
}: {
    data: Snapshot;
    tab: ProgressTab;
    onTabChange: (tab: ProgressTab) => void;
    legacy: ReactNode;
    renderRecord: (r: AchievementRecord) => ReactNode;
}) {
    const [visited, setVisited] = useState<Set<ProgressTab>>(
        () => new Set([tab]),
    );
    const stableData = useMemo(
        () => data,
        [
            data.tasks,
            data.steps,
            data.projects,
            data.ideas,
            data.events,
            data.taskCycles,
            data.projectPlans,
        ],
    );
    function chooseTab(next: ProgressTab) {
        setVisited((previous) =>
            previous.has(next) ? previous : new Set([...previous, next]),
        );
        onTabChange(next);
    }
    const wallClock = useWallClock(),
        zone = localZone();
    const [observedAt, setObservedAt] = useState(wallClock);
    const clock = Math.max(wallClock, observedAt);
    useEffect(() => {
        setObservedAt(Date.now());
    }, [wallClock, data.tasks, data.projects, data.steps]);
    const [period, setPeriod] = useState<Period>("week");
    const windows = useMemo(
        () => periodWindows(period, new Date(clock), zone),
        [period, clock, zone],
    );
    const history = useLiveQuery(async () => {
        const lower = new Date(windows.previous.start).toISOString(),
            upper = new Date(clock).toISOString();
        const [due, completed] = await Promise.all([
            db.taskCycles
                .where("scheduledAt")
                .between(lower, upper, true, true)
                .toArray(),
            db.taskCycles
                .where("completedAt")
                .between(lower, upper, true, true)
                .toArray(),
        ]);
        return [
            ...new Map([...due, ...completed].map((c) => [c.id, c])).values(),
        ];
    }, [windows.previous.start, clock]);
    const current = useMemo(
        () => taskMetrics(data.tasks, history ?? [], windows.current, zone),
        [data.tasks, history, windows, zone],
    );
    const previous = useMemo(
        () => taskMetrics(data.tasks, history ?? [], windows.previous, zone),
        [data.tasks, history, windows, zone],
    );
    const knownStart = Math.min(
        Infinity,
        ...data.tasks.map((t) => Date.parse(t.createdAt)),
    );
    const canCompare = knownStart <= windows.previous.start;
    const tracking = useLiveQuery(() => db.projectTracking.toArray(), [], []);
    const projectRows = useLiveQuery(
        () =>
            db.projectProgress
                .where("at")
                .between(
                    new Date(windows.previous.start).toISOString(),
                    new Date(clock).toISOString(),
                    true,
                    true,
                )
                .toArray(),
        [windows.previous.start, clock],
        [],
    );
    const projectSummary = useMemo(
        () =>
            projectPeriodSummary(
                data,
                projectRows,
                tracking,
                windows.current,
                new Date(clock),
                zone,
            ),
        [
            data.projects,
            data.steps,
            data.projectPlans,
            projectRows,
            tracking,
            windows,
            clock,
            zone,
        ],
    );
    const stepParents = useMemo(
        () => new Set(data.steps.map((step) => step.parentId)),
        [data.steps],
    );
    const activeDays = useMemo(
        () =>
            new Set(
                [
                    ...current.completions,
                    ...data.projects
                        .filter(
                            (p) =>
                                p.status === "closed" &&
                                inRange(p.completedAt, windows.current),
                        )
                        .map((p) => p.completedAt!),
                    ...data.steps
                        .filter(
                            (step) =>
                                step.kind === "step" &&
                                !stepParents.has(step.id) &&
                                step.status === "done" &&
                                inRange(step.completedAt, windows.current),
                        )
                        .map((step) => step.completedAt!),
                ].map((at) => dateKey(at, zone)),
            ).size,
        [current, data.projects, data.steps, stepParents, windows, zone],
    );
    const projects = useMemo(
        () => projectMetrics(data, windows.current),
        [data.projects, data.steps, data.projectPlans, windows],
    );
    const format = new Intl.DateTimeFormat("ar", {
        timeZone: zone,
        dateStyle: "medium",
    });
    return (
        <section className="period-dashboard" aria-label="إحصائيات الفترة">
            <GlassChoices
                className="progress-tabs tabs"
                role="tablist"
                aria-label="أقسام التقدم"
            >
                {progressTabs.map(([key, label], i) => (
                    <button
                        key={key}
                        id={`progress-tab-${key}`}
                        role="tab"
                        aria-selected={tab === key}
                        aria-controls={`progress-panel-${key}`}
                        tabIndex={tab === key ? 0 : -1}
                        className={tab === key ? "selected" : ""}
                        onClick={() => chooseTab(key)}
                        onKeyDown={(e) => {
                            if (
                                ![
                                    "ArrowLeft",
                                    "ArrowRight",
                                    "Home",
                                    "End",
                                ].includes(e.key)
                            )
                                return;
                            e.preventDefault();
                            const next =
                                e.key === "Home"
                                    ? 0
                                    : e.key === "End"
                                      ? 2
                                      : (i + (e.key === "ArrowLeft" ? 1 : 2)) %
                                        3;
                            chooseTab(progressTabs[next][0]);
                            document
                                .getElementById(
                                    `progress-tab-${progressTabs[next][0]}`,
                                )
                                ?.focus();
                        }}
                    >
                        {label}
                    </button>
                ))}
            </GlassChoices>
            <div className="section-heading">
                <h2 className="small muted">الفترة</h2>
                <GlassChoices
                    className="tabs"
                    role="group"
                    aria-label="نطاق الإحصائيات"
                >
                    {(
                        [
                            ["week", "أسبوعي"],
                            ["month", "شهري"],
                            ["year", "سنوي"],
                        ] as const
                    ).map(([key, label]) => (
                        <button
                            key={key}
                            aria-pressed={period === key}
                            className={period === key ? "selected" : ""}
                            onClick={() => setPeriod(key)}
                        >
                            {label}
                        </button>
                    ))}
                </GlassChoices>
            </div>
            <p className="muted small">
                {format.format(new Date(windows.current.start))} —{" "}
                {format.format(new Date(clock))} · الفترة الحالية جزئية.
            </p>
            <div
                id="progress-panel-overview"
                role="tabpanel"
                aria-labelledby="progress-tab-overview"
                hidden={tab !== "overview"}
            >
                {(visited.has("overview") || tab === "overview") && (
                    <>
                        {history === undefined && (
                            <p role="status">قراءة سجل الإنجاز…</p>
                        )}
                        {data.tasks.some(
                            (t) =>
                                t.schedule &&
                                t.schedule.repeat !== "none" &&
                                (!t.scheduleCursor ||
                                    Date.parse(t.scheduleCursor) <= clock),
                        ) && (
                            <p className="muted small">
                                يُستكمل سجل الدورات؛ تتحدث الأرقام عند انتهاء
                                الحفظ.
                            </p>
                        )}
                        <div className="period-metrics">
                            {[
                                ["المهام المنجزة", current.completed],
                                ["المهام المستحقة", current.due],
                                [
                                    "إنجاز المهام المستحقة",
                                    current.rate === null
                                        ? "—"
                                        : `${current.rate}٪`,
                                ],
                                ["أيام شهدت إنجازًا", activeDays],
                                [
                                    "مشاريع حققت تقدمًا",
                                    projectSummary.progressed,
                                ],
                                ["مشاريع اكتملت في الفترة", projects.completed],
                            ].map(([label, value]) => (
                                <div className="period-metric" key={label}>
                                    <strong>{value}</strong>
                                    <span>{label}</span>
                                </div>
                            ))}
                        </div>
                        <p className="muted small">
                            العامة تدخل في الإنجازات فقط. نسبة الإنجاز تخص
                            المواعيد التي حلت خلال الفترة؛ المواعيد المستقبلية
                            مستبعدة، والفترات المفتوحة متاحة وليست إخفاقات.
                        </p>
                        {!current.due && (
                            <p>
                                لا توجد مواعيد مستحقة لحساب النسبة في هذه
                                الفترة.
                            </p>
                        )}
                        {canCompare ? (
                            <div className="surface period-comparison">
                                <p>
                                    أنجزت {current.completed} مهمة في الفترة
                                    الحالية، مقابل {previous.completed} في الجزء
                                    المقابل من الفترة السابقة.
                                </p>
                                <p>
                                    أيام إنجاز المهام: {current.activeDays}{" "}
                                    حاليًا، مقابل {previous.activeDays} سابقًا.
                                </p>
                                {previous.completed > 0 && (
                                    <p>
                                        تغير عدد الإنجازات:{" "}
                                        {Math.round(
                                            ((current.completed -
                                                previous.completed) /
                                                previous.completed) *
                                                100,
                                        )}
                                        ٪.
                                    </p>
                                )}
                            </div>
                        ) : (
                            <p className="muted">
                                لا تتوفر بيانات كافية لتغطية الفترة السابقة؛ لا
                                يمكن حساب معدل تحسن موثوق.
                            </p>
                        )}
                        <details className="surface period-details">
                            <summary>تفاصيل المواعيد والمشاريع</summary>
                            <div className="period-metrics">
                                {[
                                    [
                                        "دورات ومواعيد ما زالت متاحة",
                                        current.pending,
                                    ],
                                    ["مواعيد انتهت دون إنجاز", current.missed],
                                    ["مشاريع نشطة الآن", projects.active],
                                    [
                                        "مشاريع بلا تقدم منذ ١٤ يومًا",
                                        projectSummary.stalled.length,
                                    ],
                                ].map(([label, value]) => (
                                    <div className="period-metric" key={label}>
                                        <strong>{value}</strong>
                                        <span>{label}</span>
                                    </div>
                                ))}
                            </div>
                            <p className="muted small">
                                المقارنة حتى الوقت نفسه بعد عدد الأيام نفسه من
                                بداية الفترة السابقة، مع مراعاة طول الشهر.
                                الأسبوع يبدأ السبت. التوقف منذ آخر تقدم عمل مسجل
                                أو بداية التتبع، بحد ١٤ يومًا؛ لا يُستنتج تاريخ
                                قبل بدء السجل. تُستبعد أيام الإيقاف المؤقت من
                                عدّاد التوقف.
                            </p>
                        </details>
                        <details className="progress-legacy">
                            <summary>تفاصيل المشاريع وآخر ٧ أيام</summary>
                            {legacy}
                        </details>
                    </>
                )}
            </div>
            <div
                id="progress-panel-insights"
                role="tabpanel"
                aria-labelledby="progress-tab-insights"
                hidden={tab !== "insights"}
            >
                {(visited.has("insights") || tab === "insights") && (
                    <MasarInsights
                        data={stableData}
                        rows={projectRows}
                        tracking={tracking}
                        current={windows.current}
                        previous={windows.previous}
                        clock={clock}
                    />
                )}
            </div>
            <div
                id="progress-panel-history"
                role="tabpanel"
                aria-labelledby="progress-tab-history"
                hidden={tab !== "history"}
            >
                {(visited.has("history") || tab === "history") && (
                    <AchievementLog
                        data={stableData}
                        range={windows.current}
                        clock={clock}
                        renderRecord={renderRecord}
                    />
                )}
            </div>
        </section>
    );
}
