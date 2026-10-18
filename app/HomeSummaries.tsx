import { useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { useHabitData } from "./useHabitData";
import {
    addHabitDays,
    habitCommitment,
    habitDate,
    habitPaused,
    habitToday,
} from "./habitCalendar";
import { periodWindows, taskMetrics } from "./analytics";
import { refreshHabitAdvice } from "./habitAdvice";
import type { Snapshot } from "./model";
import { userError } from "./userError";
import { useState } from "react";
export function HomeSummaries({
    data,
    habits,
    at,
    today,
}: {
    data: Snapshot;
    habits?: NonNullable<ReturnType<typeof useHabitData>>;
    at: Date;
    today: ReturnType<typeof habitToday>;
}) {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone,
        date = habitDate(at, zone),
        from = addHabitDays(date, -28);
    const [error, setError] = useState("");
    const windows = periodWindows("week", at, zone),
        lower = new Date(windows.current.start).toISOString(),
        upper = new Date(windows.current.end).toISOString();
    const extra = useLiveQuery(async () => {
        try {
            const [reminders, cycles] = await Promise.all([
                db.reminders.orderBy("createdAt").reverse().limit(4).toArray(),
                db.taskCycles
                    .where("completedAt")
                    .between(lower, upper, true, true)
                    .toArray(),
            ]);
            return { reminders, cycles, error: "" };
        } catch {
            return {
                reminders: [],
                cycles: [],
                error: "تعذر قراءة بعض الملخصات المحلية.",
            };
        }
    }, [lower, upper]);
    const adviceKey = habits
        ? JSON.stringify([
              habits.habits.map((h) => [h.id, h.updatedAt]),
              habits.paths.map((p) => [p.id, p.updatedAt]),
              habits.plans.map((p) => p.id),
              habits.entries.map((e) => [
                  e.id,
                  e.updatedAt,
                  e.result,
                  e.effortRating,
                  e.durationMinutes,
              ]),
              date,
          ])
        : "";
    useEffect(() => {
        if (!adviceKey || !habits) return;
        let disposed = false;
        void (async () => {
            try {
                for (const h of habits.habits.filter(
                    (h) => h.kind === "graded" && !h.archived,
                )) {
                    if (disposed) break;
                    await refreshHabitAdvice(h.id);
                }
            } catch (e) {
                if (!disposed) setError(userError(e));
            }
        })();
        return () => {
            disposed = true;
        };
    }, [adviceKey]);
    const fresh = useLiveQuery(async () => {
        const ids = (habits?.habits ?? [])
            .filter(
                (h) =>
                    h.kind === "graded" &&
                    !h.archived &&
                    !habitPaused(h.pauses, at),
            )
            .map((h) => [h.id, "new"]);
        return ids.length
            ? await db.habitSuggestions
                  .where("[habitId+status]")
                  .anyOf(ids)
                  .limit(1)
                  .first()
            : undefined;
    }, [adviceKey]);
    const paths = (habits?.paths ?? [])
        .filter((p) => !p.deletedAt && !habitPaused(p.pauses, at))
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    const latest = [
        ...data.ideas
            .filter((i) => !i.archived)
            .map((i) => ({
                id: i.id,
                title: i.title,
                at: i.createdAt,
                type: "فكرة",
                href: `#idea/${encodeURIComponent(i.id)}`,
            })),
        ...(extra?.reminders ?? []).map((r) => ({
            id: r.id,
            title: r.title,
            at: r.createdAt,
            type: r.reviewedAt ? "تذكير مراجع" : "تذكير",
            href: "#ideas/reminders",
        })),
    ]
        .sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id))
        .slice(0, 2);
    const completed = extra
        ? taskMetrics(data.tasks, extra.cycles, windows.current, zone)
        : null;
    return (
        <div className="home-summaries">
            <section aria-label="ملخص المسارات النشطة">
                <div className="section-heading">
                    <h2>
                        مساراتي النشطة{" "}
                        <span className="count">{paths.length}</span>
                    </h2>
                    <a className="text-btn" href="#habits">
                        كل المسارات
                    </a>
                </div>
                <div className="surface sky-glass">
                    {!habits ? (
                        <p role="status">جارٍ قراءة المسارات…</p>
                    ) : habits.error ? (
                        <p role="alert">{habits.error}</p>
                    ) : paths.length ? (
                        paths.slice(0, 2).map((path) => {
                            const metrics = habits.habits.map((h) =>
                                    habitCommitment(
                                        h,
                                        habits.plans.filter(
                                            (p) => p.habitId === h.id,
                                        ),
                                        habits.paths,
                                        habits.entries,
                                        from,
                                        date,
                                        at,
                                        path.id,
                                    ),
                                ),
                                eligible = metrics.reduce(
                                    (n, m) => n + m.eligible,
                                    0,
                                ),
                                done = metrics.reduce((n, m) => n + m.done, 0),
                                daily = today.filter(
                                    (r) => r.plan?.pathId === path.id,
                                );
                            return (
                                <div className="habit-row" key={path.id}>
                                    <div className="habit-row-copy">
                                        <a
                                            href={`#habit-path/${encodeURIComponent(path.id)}`}
                                        >
                                            <strong>{path.title}</strong>
                                        </a>
                                        <small className="muted">
                                            اليوم{" "}
                                            {daily.filter((r) => r.done).length}
                                            /{daily.length} ·{" "}
                                            {eligible
                                                ? `${Math.round((done / eligible) * 100)}٪ التزام في آخر28 يومًا`
                                                : "لا أيام مؤهلة مغلقة بعد"}
                                        </small>
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <p className="muted small">
                            لا مسارات نشطة؛ تبقى العادات المستقلة متاحة.
                        </p>
                    )}
                    {fresh && (
                        <a
                            className="text-btn"
                            href={`#habit/${encodeURIComponent(fresh.habitId)}`}
                        >
                            اقتراح اختياري لعادة · راجع السبب والأثر
                        </a>
                    )}
                </div>
            </section>
            <details className="surface sky-glass home-secondary">
                <summary>
                    أفكارك وتذكيراتك{" "}
                    <span className="small muted">آخر العناصر</span>
                </summary>
                <section aria-label="ملخص الأفكار والتذكيرات">
                    <div className="section-heading">
                        <h2>الأفكار والتذكيرات</h2>
                        <div className="habit-actions">
                            <a className="text-btn" href="#ideas">
                                الأفكار
                            </a>
                            <a className="text-btn" href="#ideas/reminders">
                                التذكيرات
                            </a>
                        </div>
                    </div>
                    <div className="home-secondary-body">
                        {latest.length ? (
                            latest.map((r) => (
                                <div key={r.type + r.id} className="habit-row">
                                    <a className="habit-row-copy" href={r.href}>
                                        <strong>{r.title}</strong>
                                        <small className="muted">
                                            {r.type}
                                        </small>
                                    </a>
                                </div>
                            ))
                        ) : (
                            <p className="muted small">
                                مساحة لأفكارك والأشياء التي تود الرجوع إليها.
                            </p>
                        )}
                    </div>
                </section>
            </details>
            <details className="surface sky-glass home-secondary">
                <summary>
                    تقدمك هذا الأسبوع{" "}
                    <span className="small muted">
                        {completed?.completed ?? "…"} مهام منجزة
                    </span>
                </summary>
                <section aria-label="ملخص التقدم العام">
                    <div className="section-heading">
                        <h2>التقدم العام</h2>
                        <a className="text-btn" href="#progress">
                            تفاصيل التقدم
                        </a>
                    </div>
                    <div className="home-secondary-body">
                        <p>
                            {completed
                                ? `${completed.completed} مهام منجزة هذا الأسبوع · ${completed.activeDays} أيام نشاط`
                                : "جارٍ قراءة إنجازات الأسبوع…"}
                        </p>
                        <p className="small muted">
                            {
                                data.projects.filter(
                                    (p) => p.status === "closed" && !p.archived,
                                ).length
                            }{" "}
                            مشاريع مغلقة · مؤشرات العادات وخطوات المشاريع مستقلة
                            عن عدد المهام. الأسبوع الحالي جزئي.
                        </p>
                    </div>
                </section>
            </details>
            {(error || extra?.error) && (
                <p className="warning small" role="alert">
                    {error || extra?.error}
                </p>
            )}
        </div>
    );
}
