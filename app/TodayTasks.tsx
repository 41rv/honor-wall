import { useState, type ReactNode } from "react";
import type { TaskView } from "./taskSchedule";
import { chosenToday, orderedToday } from "./dailyPlanning";
import { selectTaskToday } from "./db";
import { userError } from "./userError";
import { useWallClock } from "./useWallClock";

export function PlanningLinks({ all = true }: { all?: boolean }) {
    return (
        <nav className="planning-links" aria-label="تنظيم يومك">
            <a className="btn secondary" href="#today">
                مهامي اليوم
            </a>
            <a className="btn secondary" href="#calendar">
                التقويم الأسبوعي
            </a>
            {all && (
                <a className="text-btn" href="#tasks">
                    كل المهام
                </a>
            )}
        </nav>
    );
}
export function TodayTasks({
    tasks,
    renderTask,
}: {
    tasks: TaskView[];
    renderTask: (task: TaskView) => ReactNode;
}) {
    const clock = useWallClock();
    const at = new Date(Math.max(clock, Date.now()));
    const ordered = orderedToday(tasks, at);
    const [busy, setBusy] = useState("");
    const [error, setError] = useState("");
    async function select(task: TaskView, selected: boolean) {
        if (busy) return;
        setBusy(task.id);
        setError("");
        try {
            await selectTaskToday(task.id, selected);
        } catch (err) {
            setError(userError(err));
        } finally {
            setBusy("");
        }
    }
    return (
        <section className="daily-planning" aria-label="قائمة مهامي اليوم">
            <PlanningLinks />
            <p className="muted">
                اختياراتك العامة تخص هذا اليوم فقط؛ تبقى المهمة الأصلية بدون
                موعد. الدورات المفتوحة تظل متاحة حتى الموعد التالي.
            </p>
            {error && (
                <p role="alert" className="warning">
                    {error}
                </p>
            )}
            <div className="surface task-list today-ordered">
                {ordered.map(({ task, category: key }) => {
                    const title = {
                        due: "مستحقة اليوم",
                        selected: "اخترتها لليوم",
                        available: "دورات سابقة ما زالت متاحة",
                        overdue: "مهام تجاوزت موعدها",
                    }[key];
                    return (
                        <section
                            key={task.id}
                            aria-label={title}
                            className={`planning-section planning-${key}`}
                        >
                            <span className="planning-context small muted">
                                {title}
                            </span>
                            {renderTask(task)}
                            {key === "selected" && (
                                <button
                                    className="text-btn daily-remove"
                                    disabled={!!busy}
                                    onClick={() => void select(task, false)}
                                >
                                    إزالة «{task.title}» من اليوم
                                </button>
                            )}
                        </section>
                    );
                })}
                {!ordered.length && (
                    <p className="compact-empty muted">
                        لا توجد مهام لليوم. اختر مهمة عامة أدناه أو أضف مهمة من
                        زر الإضافة.
                    </p>
                )}
            </div>
            <details className="surface daily-picker">
                <summary>اختيار مهام عامة لليوم</summary>
                {tasks
                    .filter(
                        (t) =>
                            !t.schedule &&
                            t.status !== "done" &&
                            !chosenToday(t, at),
                    )
                    .map((task) => (
                        <div key={task.id} className="daily-choice">
                            <span>{task.title}</span>
                            <button
                                className="btn secondary"
                                disabled={!!busy}
                                onClick={() => void select(task, true)}
                            >
                                إضافة «{task.title}» إلى اليوم
                            </button>
                        </div>
                    ))}
                {!tasks.some(
                    (t) =>
                        !t.schedule &&
                        t.status !== "done" &&
                        !chosenToday(t, at),
                ) && (
                    <p className="muted">
                        لا توجد مهام عامة أخرى. يمكنك إنشاء مهمة من قائمة
                        المهام.
                    </p>
                )}
            </details>
        </section>
    );
}
