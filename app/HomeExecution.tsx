import { useEffect, useState, type ReactNode } from "react";
import { ArrowUpLeft, ChevronLeft } from "lucide-react";
import { CompletionButton } from "./CompletionButton";
import { stageFor } from "./execution";
import type { Hierarchy } from "./hierarchy";
import type { Snapshot, Project, Step } from "./model";
import type { TaskView } from "./taskSchedule";
import { orderedToday } from "./dailyPlanning";
import { useWallClock } from "./useWallClock";
import { TodayTasks } from "./TodayTasks";
export function HomeExecution({
    data,
    active,
    resume,
    hierarchy,
    renderProject,
    renderTask,
    open,
    complete,
    openHistory,
    expanded = false,
    recommendation,
    projectRest = false,
}: {
    expanded?: boolean;
    recommendation?: ReactNode;
    projectRest?: boolean;
    data: Snapshot;
    active: Project[];
    resume?: Step;
    hierarchy: Hierarchy;
    renderProject: (
        project: Project,
        index: number,
        omitCurrentId?: string,
    ) => ReactNode;
    renderTask: (task: TaskView) => ReactNode;
    open: (route: string) => void;
    complete: (id: string, value: boolean) => Promise<void>;
    openHistory: () => void;
}) {
    const clock = useWallClock();
    const today = orderedToday(
        data.tasks,
        new Date(Math.max(clock, Date.now())),
    );
    const [limit, setLimit] = useState(4);
    const [all, setAll] = useState(expanded);
    useEffect(() => {
        setAll(expanded);
    }, [expanded]);
    const project = data.projects.find((p) => p.id === resume?.projectId);
    const stage = resume ? stageFor(resume, hierarchy) : undefined;
    return (
        <>
            <section className="home-today" aria-label="مهامي اليوم">
                <div className="section-heading">
                    <h2>
                        مهامي اليوم{" "}
                        <span className="count">{today.length}</span>
                    </h2>
                    <a
                        className="text-btn"
                        href="#today"
                        aria-expanded={all}
                        onClick={(e) => {
                            if (all) {
                                e.preventDefault();
                                setAll(false);
                            } else setAll(true);
                        }}
                    >
                        {all ? "عرض مختصر" : "عرض الكل"}{" "}
                        <ChevronLeft size={16} />
                    </a>
                </div>
                {all ? (
                    <TodayTasks tasks={data.tasks} renderTask={renderTask} />
                ) : today.length ? (
                    <div className="surface task-list sky-glass">
                        {today.slice(0, 3).map(({ task }) => renderTask(task))}
                    </div>
                ) : (
                    <p className="compact-empty muted sky-glass">
                        قائمة اليوم خفيفة.{" "}
                        <a
                            className="text-btn"
                            href="#today"
                            onClick={() => setAll(true)}
                        >
                            اختر مهامك لليوم
                        </a>
                    </p>
                )}
            </section>
            <section
                className="home-execution"
                aria-label="خطوات مشاريعك القادمة"
            >
                <div className="section-heading">
                    <h2>
                        خطوات مشاريعك القادمة{" "}
                        <span className="count">{active.length}</span>
                    </h2>
                    <button
                        className="text-btn"
                        onClick={() => open("projects")}
                    >
                        كل المشاريع <ChevronLeft size={16} />
                    </button>
                </div>
                {projectRest && (
                    <p className="project-rest-notice surface" role="status">
                        اليوم راحة من المشاريع. تبقى متاحة للإنجاز الاختياري؛ لا
                        خطوات مطلوبة اليوم.
                    </p>
                )}
                <section
                    className="surface resume-shortcut sky-glass"
                    aria-label="اختصار الاستكمال"
                >
                    <div>
                        <span className="small muted">
                            {projectRest
                                ? "خطوة متاحة اختياريًا"
                                : "أكمل من حيث توقفت"}
                        </span>
                        <h2 title={resume?.title}>
                            {resume?.title ?? "خطوتك التالية تبدأ هنا"}
                        </h2>
                        <p className="muted small" title={project?.title}>
                            {resume
                                ? `${project?.title} / ${stage ? `المرحلة ${hierarchy.numbers.get(stage.id)}` : "خطوات المشروع"}`
                                : "افتح مشروعًا واختر خطوة لتعود إليها هنا."}
                        </p>
                    </div>
                    {resume && (
                        <>
                            <CompletionButton
                                entityKey={`step/${resume.id}`}
                                checked={false}
                                label={`الخطوة «${resume.title}»`}
                                onToggle={(value) => complete(resume.id, value)}
                            />
                            <button
                                className="icon-btn"
                                aria-label="أكمل من حيث توقفت"
                                onClick={() => open(`step/${resume.id}`)}
                            >
                                <ArrowUpLeft size={20} />
                            </button>
                        </>
                    )}
                </section>
                <div className="project-grid">
                    {active
                        .slice(0, limit)
                        .map((p, i) => renderProject(p, i, resume?.id))}
                </div>
                {!active.length && (
                    <p className="compact-empty muted sky-glass">
                        لا توجد مشاريع نشطة. يمكنك إضافة مشروع من زر الإضافة.
                    </p>
                )}
                {active.length > limit && (
                    <button
                        className="text-btn load-more"
                        onClick={() => setLimit((v) => v + 4)}
                    >
                        عرض المزيد من المشاريع ({active.length - limit})
                    </button>
                )}
            </section>
            {recommendation}
            <button
                className="text-btn home-progress-link"
                onClick={openHistory}
            >
                سجل الإنجاز <ChevronLeft size={16} />
            </button>
        </>
    );
}
