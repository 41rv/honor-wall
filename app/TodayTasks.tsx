import type { ReactNode } from "react";
import type { TaskView } from "./taskSchedule";
import { orderedToday } from "./dailyPlanning";
import { useWallClock } from "./useWallClock";

export function PlanningLinks({ all = true }: { all?: boolean }) {
    return (
        <nav className="planning-links" aria-label="تنظيم يومك">
            <a className="btn secondary" href="#home">
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
    return (
        <section className="daily-planning" aria-label="قائمة مهامي اليوم">
            <PlanningLinks />
            <p className="muted">
                اختياراتك العامة تخص هذا اليوم فقط؛ تبقى المهمة الأصلية بدون
                موعد. أضفها أو أزلها من قائمة ⋮ للمهمة. الدورات المفتوحة تظل
                متاحة حتى الموعد التالي، وتبقى إنجازات اليوم أسفل القائمة.
            </p>
            <div className="surface task-list today-ordered sky-glass">
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
                        </section>
                    );
                })}
                {!ordered.length && (
                    <p className="compact-empty muted">
                        لا توجد مهام لليوم. من «كل المهام» افتح قائمة ⋮ للمهمة
                        العامة واختر «إضافة إلى مهامي اليوم».
                    </p>
                )}
            </div>
        </section>
    );
}
