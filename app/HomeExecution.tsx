import { useState, type ReactNode } from "react";
import {
    ArrowUpLeft,
    ChevronLeft,
    NotebookPen,
    ChartNoAxesCombined,
} from "lucide-react";
import { stageFor, type Execution } from "./execution";
import type { Hierarchy } from "./hierarchy";
import type { Snapshot, Project, Task, Step } from "./model";
import { ExecutionSummary } from "./ExecutionSummary";
export function HomeExecution({
    data,
    active,
    remaining,
    latestProject,
    resume,
    hierarchy,
    executions,
    renderProject,
    renderTask,
    open,
    complete,
    onCreateProject,
    lastVisited,
}: {
    data: Snapshot;
    active: Project[];
    remaining: Task[];
    latestProject?: Project;
    resume?: Step;
    hierarchy: Hierarchy;
    executions: Map<string, Execution>;
    renderProject: (project: Project, index: number) => ReactNode;
    renderTask: (task: Task) => ReactNode;
    open: (route: string) => void;
    complete: (id: string, value: boolean) => Promise<void>;
    onCreateProject: () => void;
    lastVisited: string | null;
}) {
    const [limit, setLimit] = useState(4);
    const project = data.projects.find((p) => p.id === resume?.projectId);
    const stage = resume ? stageFor(resume, hierarchy) : undefined;
    const completedTask = data.tasks
        .filter((t) => t.status === "done")
        .sort((a, b) => b.completedAt!.localeCompare(a.completedAt!))[0];
    const remembered = hierarchy.byId.get(lastVisited ?? "");
    const rememberedClosed =
        remembered?.kind === "step" &&
        !hierarchy.children(remembered.projectId, remembered.id).length &&
        data.projects.some(
            (p) =>
                p.id === remembered.projectId &&
                p.status === "closed" &&
                !p.archived,
        )
            ? remembered
            : undefined;
    const closedStep =
        rememberedClosed ??
        data.projects
            .filter((p) => p.status === "closed" && !p.archived)
            .flatMap((p) => executions.get(p.id)?.lastCompleted ?? [])
            .sort((a, b) => b.completedAt!.localeCompare(a.completedAt!))[0];
    return (
        <>
            <section
                className="surface resume-shortcut"
                aria-label="اختصار الاستكمال"
            >
                <div>
                    <span className="small muted">أكمل من حيث توقفت</span>
                    <h2>{resume?.title ?? "لا توجد خطوة تنتظر التنفيذ"}</h2>
                    <p className="muted small">
                        {resume
                            ? `${project?.title} / ${stage?.title ?? "خطوات المشروع"}`
                            : "أنشئ مشروعًا أو أضف خطوة، وستجد نقطة العودة هنا."}
                    </p>
                </div>
                {resume && (
                    <button
                        className="btn secondary"
                        onClick={() => open(`step/${resume.id}`)}
                    >
                        أكمل من حيث توقفت <ArrowUpLeft size={18} />
                    </button>
                )}
            </section>
            <section className="home-execution" aria-label="خطوات مشاريعك الآن">
                <div className="section-heading">
                    <h2>
                        خطوات مشاريعك الآن{" "}
                        <span className="count">{active.length}</span>
                    </h2>
                    <button
                        className="text-btn"
                        onClick={() => open("projects")}
                    >
                        كل المشاريع <ChevronLeft size={16} />
                    </button>
                </div>
                <div className="project-grid">
                    {active.slice(0, limit).map(renderProject)}
                </div>
                {!active.length && (
                    <div className="surface empty-execution">
                        <p className="muted">
                            لا توجد مشاريع نشطة. أضف مشروعك التالي عندما تكون
                            مستعدًا.
                        </p>
                        <button
                            className="btn secondary"
                            onClick={onCreateProject}
                        >
                            {data.projects.length
                                ? "مشروع جديد"
                                : "ابدأ مشروعك الأول"}
                        </button>
                    </div>
                )}
                {active.length > limit && (
                    <button
                        className="btn secondary load-more"
                        onClick={() => setLimit((value) => value + 4)}
                    >
                        عرض المزيد من المشاريع ({active.length - limit})
                    </button>
                )}
            </section>
            <section className="home-execution" aria-label="مهامك الآن">
                <div className="section-heading">
                    <h2>
                        مهامك الآن{" "}
                        <span className="count">{remaining.length}</span>
                    </h2>
                    <button className="text-btn" onClick={() => open("tasks")}>
                        إلى المهام <ChevronLeft size={16} />
                    </button>
                </div>
                {remaining.length ? (
                    <div className="surface task-list">
                        {remaining.slice(0, 5).map(renderTask)}
                    </div>
                ) : (
                    <p className="surface muted">لا توجد مهام مستقلة متبقية.</p>
                )}
                {remaining.length > 5 && (
                    <button className="text-btn" onClick={() => open("tasks")}>
                        عرض كل المهام ({remaining.length})
                    </button>
                )}
                {completedTask && (
                    <details
                        className="surface home-recent"
                        open
                        key={completedTask.id}
                    >
                        <summary>آخر مهمة أُنجزت · إعادة فتحها</summary>
                        {renderTask(completedTask)}
                    </details>
                )}
            </section>
            {closedStep && (
                <details
                    className="surface home-recent"
                    open
                    key={closedStep.id}
                >
                    <summary>
                        {closedStep.status === "done"
                            ? "آخر خطوة أُنجزت في مشروع مكتمل"
                            : "آخر خطوة أُعيد فتحها في مشروع مغلق"}
                    </summary>
                    <ExecutionSummary
                        execution={{ total: 1, lastCompleted: closedStep }}
                        open={(stepId) => open(`step/${stepId}`)}
                        complete={complete}
                    />
                    <button
                        className="text-btn"
                        onClick={() => open(`project/${closedStep.projectId}`)}
                    >
                        عرض المشروع
                    </button>
                </details>
            )}
            {latestProject && (
                <p className="last-edited">
                    <NotebookPen size={16} /> آخر مشروع عُدّل:{" "}
                    <button
                        className="text-btn"
                        onClick={() => open(`project/${latestProject.id}`)}
                    >
                        {latestProject.title}
                    </button>
                </p>
            )}
            <button
                className="text-btn home-progress-link"
                onClick={() => open("progress")}
            >
                كل التقدم <ChartNoAxesCombined size={17} />
            </button>
        </>
    );
}
