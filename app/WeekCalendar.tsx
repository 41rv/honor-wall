import { useState, useMemo } from "react";
import { Temporal } from "@js-temporal/polyfill";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import {
    weekStart,
    weekBounds,
    dayInstant,
    calendarEntries,
    calendarForecasts,
} from "./weekCalendar";
import { localDay, localZone, type TaskView } from "./taskSchedule";
import { priorities } from "./taskTypes";
import { CompletionButton } from "./CompletionButton";
import { PlanningLinks } from "./TodayTasks";
import { useWallClock } from "./useWallClock";
import type { Task, Status } from "./model";
export function WeekCalendar({
    tasks,
    onComplete,
}: {
    tasks: Task[];
    onComplete: (task: TaskView, status: Status, at?: string) => Promise<void>;
}) {
    const clock = useWallClock(),
        zone = localZone(),
        now = new Date(clock),
        today = localDay(now, zone).toString();
    const [offset, setOffset] = useState(0);
    const start = Temporal.PlainDate.from(weekStart(now, zone))
        .add({ weeks: offset })
        .toString();
    const bounds = weekBounds(start, zone);
    const stored = useLiveQuery(
        async () => ({
            start: bounds.start,
            end: bounds.end,
            rows: await db.taskCycles
                .where("scheduledAt")
                .between(
                    new Date(bounds.start).toISOString(),
                    new Date(bounds.end).toISOString(),
                    true,
                    false,
                )
                .toArray(),
        }),
        [bounds.start, bounds.end],
    );
    const history =
        stored?.start === bounds.start && stored.end === bounds.end
            ? stored.rows
            : undefined;
    const shape = JSON.stringify([
        tasks.map((t) => [
            t.id,
            t.createdAt,
            t.scheduleSince,
            t.scheduleRevision,
            t.schedule,
        ]),
        history?.map((c) => [
            c.id,
            c.end,
            c.scheduledAt,
            c.closedReason,
            c.source,
        ]),
    ]);
    const forecasts = useMemo(
        () =>
            history
                ? calendarForecasts(tasks, history, start, zone)
                : new Map(),
        [shape, start, zone],
    );
    const entries = useMemo(
        () =>
            history
                ? calendarEntries(
                      tasks,
                      history,
                      start,
                      new Date(clock),
                      zone,
                      forecasts,
                  )
                : [],
        [tasks, history, start, clock, zone, forecasts],
    );
    const format = new Intl.DateTimeFormat("ar", {
        timeZone: zone,
        weekday: "long",
        day: "numeric",
        month: "short",
        year: "numeric",
    });
    const timeFormat = useMemo(
        () =>
            new Intl.DateTimeFormat("ar", {
                timeZone: zone,
                hour: "numeric",
                minute: "2-digit",
            }),
        [zone],
    );
    return (
        <section className="week-calendar" aria-label="تقويم المهام الأسبوعي">
            <PlanningLinks />
            <div className="calendar-toolbar">
                <button
                    className="btn secondary"
                    onClick={() => setOffset((n) => n - 1)}
                >
                    الأسبوع السابق
                </button>
                <button className="btn secondary" onClick={() => setOffset(0)}>
                    الأسبوع الحالي
                </button>
                <button
                    className="btn secondary"
                    onClick={() => setOffset((n) => n + 1)}
                >
                    الأسبوع القادم
                </button>
            </div>
            <p className="muted small">
                السبت إلى الجمعة · التوقيت المحلي: {zone}. المواعيد القادمة
                للعرض فقط؛ إنجاز الدورة والتراجع متاحان خلال فترة تنفيذها.
            </p>
            <div className="calendar-week">
                {Array.from({ length: 7 }, (_, i) =>
                    Temporal.PlainDate.from(start).add({ days: i }).toString(),
                ).map((day) => (
                    <section
                        key={day}
                        className="calendar-day surface"
                        aria-label={day}
                        data-today={day === today}
                    >
                        <h2>
                            {format.format(new Date(dayInstant(day, zone)))}
                            {day === today && (
                                <span className="badge doing">اليوم</span>
                            )}
                        </h2>
                        {entries
                            .filter((entry) => entry.day === day)
                            .map((entry) => (
                                <article
                                    key={entry.key}
                                    className="calendar-entry"
                                    data-calendar-key={entry.key}
                                >
                                    {entry.task.priority && (
                                        <span
                                            className="priority-strip"
                                            role="img"
                                            aria-label={
                                                priorities[entry.task.priority]
                                                    .name
                                            }
                                            style={{
                                                backgroundColor:
                                                    priorities[
                                                        entry.task.priority
                                                    ].color,
                                            }}
                                        />
                                    )}
                                    <div className="calendar-entry-head">
                                        <CompletionButton
                                            checked={
                                                entry.task.status === "done"
                                            }
                                            disabled={
                                                entry.task._available ===
                                                    false ||
                                                (!!entry.task._cycleId &&
                                                    history === undefined)
                                            }
                                            entityKey={
                                                entry.task._cycleId
                                                    ? `taskCycle/${entry.task._cycleId}`
                                                    : `task/${entry.task.id}`
                                            }
                                            label={`المهمة «${entry.task.title}»`}
                                            onToggle={(complete, at) =>
                                                onComplete(
                                                    entry.task,
                                                    complete ? "done" : "todo",
                                                    at,
                                                )
                                            }
                                        />
                                        <a
                                            href={`#task/${encodeURIComponent(entry.task.id)}`}
                                        >
                                            {entry.task.title}
                                        </a>
                                    </div>
                                    <p>
                                        {entry.task.schedule?.time
                                            ? timeFormat.format(
                                                  new Date(entry.scheduledAt),
                                              )
                                            : "بدون وقت محدد"}
                                    </p>
                                    {entry.task._cycleId && (
                                        <p className="muted small">
                                            {entry.task._dueLabel}
                                        </p>
                                    )}
                                </article>
                            ))}
                        {!entries.some((entry) => entry.day === day) && (
                            <p className="muted small">
                                {history === undefined
                                    ? "قراءة المواعيد…"
                                    : "لا توجد مواعيد."}
                            </p>
                        )}
                    </section>
                ))}
            </div>
        </section>
    );
}
