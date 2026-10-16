import { useState, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, updateTaskOptions } from "./db";
import { Dialog } from "./Dialog";
import { TaskFields } from "./TaskFields";
import { priorities, type TaskOptions } from "./taskTypes";
import type { TaskView } from "./taskSchedule";
import { userError } from "./userError";
import { flushCompletions } from "./useCompletion";
import { flushAllSaves } from "./saveQueue";
export function TaskDue({ task }: { task: TaskView }) {
    return (
        <span className={`task-due due-${task._dueState ?? "general"}`}>
            {task._dueLabel ?? "بدون موعد"}
            {task._next && (
                <span>
                    {" "}
                    · التالية:{" "}
                    {new Intl.DateTimeFormat("ar", {
                        timeZone: task.schedule?.timeZone,
                        dateStyle: "medium",
                        timeStyle: task.schedule?.time ? "short" : undefined,
                    }).format(new Date(task._next))}
                </span>
            )}
        </span>
    );
}
export function TaskDetails({ task }: { task: TaskView }) {
    const [editing, setEditing] = useState(false);
    const [options, setOptions] = useState<TaskOptions>({});
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const lock = useRef(false);
    const history = useLiveQuery(
        () => db.taskCycles.where("taskId").equals(task.id).toArray(),
        [task.id],
        [],
    );
    const [limit, setLimit] = useState(20);
    const format = (at: string) =>
        new Intl.DateTimeFormat("ar", {
            dateStyle: "medium",
            timeStyle: "short",
        }).format(new Date(at));
    return (
        <section className="task-details">
            <TaskDue task={task} />
            <p>
                الأولوية:{" "}
                {task.priority ? priorities[task.priority].name : "بدون تصنيف"}
            </p>
            <button
                className="btn secondary"
                onClick={() => {
                    setOptions({
                        priority: task.priority,
                        schedule: task.schedule,
                    });
                    setError("");
                    setEditing(true);
                }}
            >
                تعديل الموعد والأولوية
            </button>
            {!!history.length && (
                <details className="cycle-history">
                    <summary>سجل الدورات ({history.length})</summary>
                    <p className="muted small">
                        تعديل التكرار ينهي الدورة الحالية عند الحفظ ويحفظ
                        نتيجتها وسجلها، ثم يطبق الجدول الجديد. الإنجاز يعود إلى
                        الدورة التي ضغطت عليها.
                    </p>
                    {[...history]
                        .sort((a, b) => b.start.localeCompare(a.start))
                        .slice(0, limit)
                        .map((c) => (
                            <article key={c.id} data-cycle-id={c.id}>
                                <strong>
                                    {c.status === "completed"
                                        ? "مكتملة"
                                        : c.status === "incomplete"
                                          ? "غير مكتملة"
                                          : "جارية"}
                                </strong>
                                <p>
                                    من {format(c.start)} إلى {format(c.end)}
                                </p>
                                <p>الموعد المجدول: {format(c.scheduledAt)}</p>
                                {c.completedAt && (
                                    <p>
                                        الإنجاز الفعلي: {format(c.completedAt)}
                                    </p>
                                )}
                                {c.closedReason && (
                                    <p>أُغلقت عند تغيير الجدول.</p>
                                )}
                                {c.source && (
                                    <p>إنجاز محفوظ قبل تغيير نوع المهمة.</p>
                                )}
                            </article>
                        ))}
                    {history.length > limit && (
                        <button
                            className="text-btn"
                            onClick={() => setLimit((n) => n + 20)}
                        >
                            عرض المزيد من الدورات
                        </button>
                    )}
                </details>
            )}
            {editing && (
                <Dialog
                    title="موعد المهمة وأولويتها"
                    canClose={() => !lock.current}
                    onClose={() => {
                        if (!lock.current) setEditing(false);
                    }}
                >
                    <form
                        onSubmit={async (e) => {
                            e.preventDefault();
                            if (lock.current) return;
                            lock.current = true;
                            setBusy(true);
                            setError("");
                            try {
                                await flushAllSaves();
                                await flushCompletions();
                                await updateTaskOptions(task.id, options);
                                setEditing(false);
                            } catch (err) {
                                setError(userError(err));
                            } finally {
                                lock.current = false;
                                setBusy(false);
                            }
                        }}
                    >
                        <TaskFields
                            value={options}
                            onChange={setOptions}
                            disabled={busy}
                        />
                        {error && (
                            <p role="alert" className="warning">
                                {error}
                            </p>
                        )}
                        <div className="dialog-buttons">
                            <button
                                type="button"
                                className="btn secondary"
                                disabled={busy}
                                onClick={() => setEditing(false)}
                            >
                                إلغاء
                            </button>
                            <button className="btn primary" disabled={busy}>
                                حفظ الإعدادات
                            </button>
                        </div>
                    </form>
                </Dialog>
            )}
        </section>
    );
}
