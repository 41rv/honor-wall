import { useState, useMemo, useEffect, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import {
    achievementRecords,
    type AchievementKind,
    type AchievementRecord,
} from "./achievementRecords";
import type { Snapshot } from "./model";
import { date } from "./model";
import type { TimeRange } from "./analytics";
export function AchievementLog({
    data,
    range,
    clock,
    renderRecord,
}: {
    data: Snapshot;
    range: TimeRange;
    clock: number;
    renderRecord: (r: AchievementRecord) => ReactNode;
}) {
    const [all, setAll] = useState(false),
        [kind, setKind] = useState<AchievementKind | "all">("all"),
        [limit, setLimit] = useState(40);
    const history = useLiveQuery(
        async () =>
            all
                ? await db.taskCycles
                      .where("status")
                      .equals("completed")
                      .toArray()
                : await db.taskCycles
                      .where("completedAt")
                      .between(
                          new Date(range.start).toISOString(),
                          new Date(range.end).toISOString(),
                          true,
                          false,
                      )
                      .toArray(),
        [all, range.start, range.end],
    );
    const records = useMemo(
        () =>
            achievementRecords(
                data,
                history ?? [],
                all ? undefined : range,
                new Date(clock),
            ),
        [data.tasks, data.steps, data.projects, history, all, range, clock],
    );
    const filtered = useMemo(
        () => records.filter((r) => kind === "all" || r.kind === kind),
        [records, kind],
    );
    useEffect(() => setLimit(40), [kind, all, range.start]);
    return (
        <section aria-label="سجل الإنجاز" className="achievement-log">
            <div className="history-filters">
                <label>
                    عرض السجل{" "}
                    <select
                        value={all ? "all" : "period"}
                        onChange={(e) => setAll(e.target.value === "all")}
                    >
                        <option value="period">الفترة المختارة</option>
                        <option value="all">كل السجل</option>
                    </select>
                </label>
                <label>
                    تصفية سجل الإنجاز{" "}
                    <select
                        value={kind}
                        onChange={(e) =>
                            setKind(e.target.value as AchievementKind | "all")
                        }
                    >
                        <option value="all">كل الإنجازات</option>
                        <option value="task">المهام</option>
                        <option value="cycle">دورات التكرار</option>
                        <option value="step">خطوات المشاريع</option>
                        <option value="project">المشاريع المكتملة</option>
                    </select>
                </label>
            </div>
            {history === undefined && (
                <p className="muted" role="status">
                    قراءة سجل الإنجاز…
                </p>
            )}
            <p className="muted small">
                {filtered.length} إنجاز · تُعرض الحالات المكتملة المحفوظة فقط،
                دون إنشاء أحداث قديمة.
            </p>
            <div className="surface achievement-records">
                {filtered.slice(0, limit).map((r) => (
                    <article
                        key={r.recordId}
                        data-record-id={r.recordId}
                        className="achievement-record"
                    >
                        <p className="small muted">
                            {
                                {
                                    task: "مهمة",
                                    cycle: "دورة مهمة متكررة",
                                    step: "خطوة مشروع",
                                    project: "مشروع مكتمل",
                                }[r.kind]
                            }{" "}
                            · {date(r.completedAt)}
                            {r.scheduledAt &&
                                ` · موعد الدورة ${date(r.scheduledAt)}`}
                        </p>
                        {renderRecord(r)}
                    </article>
                ))}
            </div>
            {!filtered.length && history !== undefined && (
                <p className="compact-empty muted">
                    لا توجد إنجازات محفوظة ضمن هذا العرض.
                </p>
            )}
            {filtered.length > limit && (
                <button
                    className="text-btn load-more"
                    onClick={() => setLimit((n) => n + 40)}
                >
                    عرض المزيد من الإنجازات ({filtered.length - limit})
                </button>
            )}
        </section>
    );
}
