import { orderedToday } from "./dailyPlanning";
import { usePaceData } from "./usePaceData";
import { ProjectPacePanel, PaceSummary } from "./ProjectPacePanel";
import { ProjectCapacitySettings, CapacityOptions } from "./ProjectCapacity";
import { ProjectRestSettings } from "./ProjectRestSettings";
import { isProjectRest } from "./projectRest";
import { PaceRecommendations } from "./PaceRecommendations";
import { ActiveProjectLimitError } from "./db";
import { activeProject, dailySteps, paused, projectPace } from "./projectPace";
import type { ProjectPlan, StepWork, PaceSettings } from "./paceTypes";
import { TaskStatusControls } from "./TaskStatusControls";
import { PlanningLinks } from "./TodayTasks";
import { WeekCalendar } from "./WeekCalendar";
import { PeriodDashboard } from "./PeriodDashboard";
import { TaskFields } from "./TaskFields";
import { TaskDetails, TaskDue } from "./TaskDetails";
import { priorities, type TaskOptions } from "./taskTypes";
import { taskRank, type TaskView } from "./taskSchedule";
import { Dialog } from "./Dialog";
import { ProjectImport } from "./ProjectImport";
import {
    useEffect,
    useCallback,
    useMemo,
    memo,
    type Dispatch,
    type SetStateAction,
    useLayoutEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { useAppData } from "./useAppData";
import { userError } from "./userError";
import {
    createSaveQueue,
    flushAllSaves,
    type EditPatch,
    type SaveQueue,
} from "./saveQueue";
import { buildHierarchy, type Hierarchy } from "./hierarchy";
import { CompletionButton } from "./CompletionButton";
import {
    useCompletion,
    flushCompletions,
    trackCompletionFocus,
} from "./useCompletion";
import { QuickIdeaCapture } from "./QuickIdeaCapture";
import { buildExecution, resumeStep, type Execution } from "./execution";
import { ExecutionSummary } from "./ExecutionSummary";
import { ActionButton, type OpenActions } from "./ActionButton";
import { useLongPress } from "./useLongPress";
import { useTheme, type ThemeMode, type Identity } from "./useTheme";
import { HomeExecution } from "./HomeExecution";
import { startCompletionRecovery } from "./completionRecovery";
import { registerSW } from "virtual:pwa-register";
import {
    Home,
    FolderKanban,
    CheckCheck,
    Lightbulb,
    ChartNoAxesCombined,
    Plus,
    Search,
    ArrowUpLeft,
    ChevronDown,
    ChevronLeft,
    ArrowUp,
    ArrowDown,
    X,
    Moon,
    Sun,
    Download,
    Upload,
    Archive,
    Trash2,
    Check,
    Play,
    ArrowRight,
    FileText,
    Leaf,
    ShieldCheck,
    RotateCcw,
    WifiOff,
    PanelTop,
    NotebookPen,
    Palette,
} from "lucide-react";
import {
    setCycleStatus,
    snapshot,
    create,
    update,
    changeStatus,
    setBranchCompletion,
    setProjectCompletion,
    completeFinishedProjects,
    projectState,
    reorder,
    remove,
    undo,
    convertIdea,
    archiveIdea,
    db,
    importBackup,
    mergeBackup,
    type Deleted,
} from "./db";
import {
    children,
    pathFor,
    achievements,
    search,
    date,
    elapsed,
    parseBackup,
    statusNames,
    type Snapshot,
    type Project,
    type Step,
    type Task,
    type Idea,
    type EntityKind,
    type Status,
    type Base,
} from "./model";
const nav = [
    { id: "home", label: "الرئيسية", icon: Home },
    { id: "projects", label: "المشاريع", icon: FolderKanban },
    { id: "tasks", label: "المهام", icon: CheckCheck },
    { id: "ideas", label: "الأفكار", icon: Lightbulb },
    { id: "progress", label: "التقدم", icon: ChartNoAxesCombined },
];
const kindNames = {
    project: "مشروع",
    step: "خطوة",
    task: "مهمة",
    idea: "فكرة",
};
const actions = {
    created: "إنشاء",
    started: "بدء العمل",
    completed: "إنجاز",
    reopened: "إعادة فتح",
    closed: "إغلاق المشروع",
    archived: "أرشفة",
    converted: "تحويل الفكرة",
    deleted: "حذف",
};
function useRoute() {
    const [route, setRoute] = useState(() => location.hash.slice(1) || "home");
    const positions = useRef<
        Record<string, { y: number; anchor?: { id: string; top: number } }>
    >({});
    const previous = useRef(route);
    useEffect(() => {
        const restoration = history.scrollRestoration;
        history.scrollRestoration = "manual";
        const change = () => {
            const main = document
                .querySelector("main")!
                .getBoundingClientRect();
            const x = (main.left + main.right) / 2;
            let anchor: { id: string; top: number } | undefined;
            for (const y of [innerHeight / 2, 100, innerHeight - 120]) {
                const row = document
                    .elementsFromPoint(x, y)
                    .map((element) =>
                        element.closest<HTMLElement>("[data-step-id]"),
                    )
                    .find(Boolean);
                if (row?.dataset.stepId) {
                    anchor = {
                        id: row.dataset.stepId,
                        top: row.getBoundingClientRect().top,
                    };
                    break;
                }
            }
            positions.current[previous.current] = { y: window.scrollY, anchor };
            const next = location.hash.slice(1) || "home";
            previous.current = next;
            setRoute(next);
        };
        window.addEventListener("hashchange", change);
        return () => {
            window.removeEventListener("hashchange", change);
            history.scrollRestoration = restoration;
        };
    }, []);
    useLayoutEffect(() => {
        const frame = requestAnimationFrame(() => {
            const position = positions.current[route];
            if (position && position.y > 0) {
                // Returning to a scrolled hierarchy needs its real height.
                document
                    .querySelector(".hierarchy")
                    ?.classList.add("restored-hierarchy");
            }
            const row =
                position?.anchor &&
                document.querySelector<HTMLElement>(
                    `[data-step-id="${CSS.escape(position.anchor.id)}"]`,
                );
            if (row && position?.anchor) {
                // Restore the same visible row even if offscreen leaf heights
                // are estimated, text wraps differently, or data has changed.
                row.scrollIntoView({ block: "start", behavior: "instant" });
                window.scrollBy(0, -position.anchor.top);
            } else window.scrollTo(0, position?.y ?? 0);
        });
        return () => cancelAnimationFrame(frame);
    }, [route]);
    return route;
}
const go = (route: string) => {
    const separator = route.indexOf("/");
    location.hash =
        separator < 0
            ? route
            : `${route.slice(0, separator)}/${encodeURIComponent(route.slice(separator + 1))}`;
};
function routeId(value: string | undefined) {
    if (value === undefined) return "";
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}
function Empty({
    icon: Icon = FolderKanban,
    title,
    body,
    action,
}: {
    icon?: typeof FolderKanban;
    title: string;
    body: string;
    action?: ReactNode;
}) {
    return (
        <div className="empty">
            <span className="empty-icon">
                <Icon size={30} />
            </span>
            <h3>{title}</h3>
            <p>{body}</p>
            {action}
        </div>
    );
}
function Progress({
    hierarchy,
    projectId,
    root,
    compact = false,
}: {
    hierarchy: Hierarchy;
    projectId: string;
    root?: string;
    compact?: boolean;
}) {
    const p = hierarchy.metric(projectId, root);
    if (!p.total) return <p className="muted small">لم تُضف خطوات بعد</p>;
    const color =
        p.percent === 100
            ? "green"
            : p.percent! >= 75
              ? "teal"
              : p.percent! >= 50
                ? "blue"
                : p.percent! >= 25
                  ? "orange"
                  : "gray";
    return (
        <div className={"progress " + (compact ? "compact" : "")}>
            <div className="progress-label">
                <span>
                    {p.done} من {p.total} خطوات مكتملة
                </span>
                <strong>{p.percent}%</strong>
            </div>
            <div
                className="track"
                role="progressbar"
                aria-label="تقدم المشروع"
                aria-valuenow={p.percent!}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuetext={`${p.done} من ${p.total} خطوات مكتملة؛ ${p.percent}٪`}
            >
                <span className={color} style={{ width: p.percent + "%" }} />
            </div>
            {!compact && (
                <p className="muted small">{p.remaining} خطوات متبقية</p>
            )}
        </div>
    );
}
function Badge({ status }: { status: Status }) {
    return (
        <span className={"badge " + status}>
            {status === "done" ? (
                <Check size={12} />
            ) : status === "doing" ? (
                <Play size={11} />
            ) : (
                <span className="dot" />
            )}
            {statusNames[status]}
        </span>
    );
}
const ProjectCard = memo(function ProjectCard({
    project,
    hierarchy,
    onComplete,
    index = 0,
    execution,
    onStepComplete,
    onActions,
    home = false,
    omitCurrentId,
    plan,
    paceWork,
    paceClock,
    paceSettings,
}: {
    plan?: ProjectPlan;
    paceWork?: StepWork[];
    paceClock?: number;
    paceSettings?: PaceSettings;
    project: Project;
    onComplete: (id: string, complete: boolean) => Promise<void>;
    hierarchy: Hierarchy;
    index?: number;
    execution: Execution;
    onStepComplete: (id: string, complete: boolean) => Promise<void>;
    onActions: OpenActions;
    home?: boolean;
    omitCurrentId?: string;
}) {
    const gestures = useLongPress((rect) =>
        onActions("project", project, rect, true),
    );
    return (
        <article
            className={`project-card${home ? " home-project" : ""}`}
            data-project-id={project.id}
            {...gestures}
        >
            <div className="project-card-top">
                <ActionButton kind="project" item={project} open={onActions} />
                <CompletionButton
                    entityKey={`project/${project.id}`}
                    checked={project.status === "closed"}
                    label={`المشروع «${project.title}»`}
                    onToggle={(complete) => onComplete(project.id, complete)}
                />
                <span className="project-icon">
                    <FolderKanban size={22} />
                </span>
                <span className="muted small">
                    {project.archived
                        ? "مؤرشف"
                        : project.status === "closed"
                          ? "مغلق"
                          : paused(plan)
                            ? "موقوف مؤقتًا"
                            : "نشط"}{" "}
                    <span className="project-index">
                        {" "}
                        / {String(index + 1).padStart(2, "0")}
                    </span>
                </span>
            </div>
            <button
                className="title-link"
                onClick={() => go(`project/${project.id}`)}
            >
                <span className="project-name">{project.title}</span>
                <ArrowUpLeft size={19} />
            </button>
            {!home && (
                <p className="project-note" title={project.notes}>
                    {project.notes || "مساحة لخطوتك التالية."}
                </p>
            )}
            <Progress hierarchy={hierarchy} projectId={project.id} compact />
            {home && paceWork && paceClock !== undefined ? (
                <>
                    <PaceSummary
                        project={project}
                        plan={plan}
                        hierarchy={hierarchy}
                        work={paceWork}
                        clock={paceClock}
                        settings={paceSettings}
                    />
                    {(() => {
                        const pace = projectPace(
                            project,
                            plan,
                            hierarchy,
                            paceWork,
                            new Date(Math.max(paceClock, Date.now())),
                            paceSettings,
                        );
                        const steps = dailySteps(
                            project.id,
                            hierarchy,
                            Math.min(3, pace.today),
                        ).filter((s) => s.id !== omitCurrentId);
                        return (
                            <div
                                className="daily-project-steps"
                                aria-label="اقتراح خطوات اليوم"
                            >
                                <p className="small muted">
                                    {pace.restDay
                                        ? "الإنجاز اختياري اليوم؛ افتح المشروع للوصول إلى خطواته."
                                        : pace.today
                                          ? `اقتراح مرن لليوم: ${pace.today} خطوة؛ دون تراكم أو تأخير.`
                                          : pace.remaining
                                            ? "لا توجد خطوات إضافية مقترحة اليوم. تبقى خطوات المشروع متاحة."
                                            : pace.total
                                              ? "اكتملت خطوات المشروع."
                                              : "أضف خطوات للمشروع لتحديد وتيرته."}
                                </p>
                                {steps.map((step) => (
                                    <div
                                        className="daily-project-step"
                                        key={step.id}
                                    >
                                        <CompletionButton
                                            entityKey={`step/${step.id}`}
                                            checked={false}
                                            label={`الخطوة «${step.title}»`}
                                            onToggle={(value) =>
                                                onStepComplete(step.id, value)
                                            }
                                        />
                                        <button
                                            className="text-btn"
                                            onClick={() =>
                                                go(`step/${step.id}`)
                                            }
                                        >
                                            {step.title}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        );
                    })()}
                </>
            ) : (
                <>
                    <ExecutionSummary
                        execution={
                            home
                                ? { ...execution, lastCompleted: undefined }
                                : execution
                        }
                        stageLabel={
                            execution.stage
                                ? `المرحلة ${hierarchy.numbers.get(execution.stage.id)}`
                                : undefined
                        }
                        omitCurrentId={omitCurrentId}
                        open={(stepId) => go(`step/${stepId}`)}
                        complete={onStepComplete}
                    />
                </>
            )}
            <div className="card-foot">
                <span>آخر تعديل {date(project.updatedAt)}</span>
                <button
                    className="text-btn"
                    onClick={() => go(`project/${project.id}`)}
                >
                    افتح المشروع <ChevronLeft size={16} />
                </button>
            </div>
        </article>
    );
});
const Tree = memo(function Tree({
    projectId,
    parentId = null,
    depth = 0,
    hierarchy,
    folded,
    setFolded,
    setForm,
    onComplete,
    run,
    onActions,
}: {
    projectId: string;
    onComplete: (id: string, complete: boolean) => Promise<void>;
    parentId?: string | null;
    depth?: number;
    hierarchy: Hierarchy;
    folded: Set<string>;
    setFolded: Dispatch<SetStateAction<Set<string>>>;
    setForm: Dispatch<SetStateAction<CreateOptions | null>>;
    run: Run;
    onActions: OpenActions;
}) {
    const nums = hierarchy.numbers;
    return (
        <div className={depth ? "tree-children" : "tree"}>
            {hierarchy.children(projectId, parentId).map((s, i, arr) => {
                const has = hierarchy.children(projectId, s.id).length > 0;
                return (
                    <div
                        className={
                            "tree-item " + (has ? "tree-branch" : "tree-leaf")
                        }
                        key={s.id}
                    >
                        <TreeRow step={s} onActions={onActions}>
                            <CompletionButton
                                entityKey={`step/${s.id}`}
                                checked={
                                    hierarchy.nodes.get(s.id)!.status === "done"
                                }
                                label={`${s.kind === "stage" ? "المرحلة" : "الخطوة"} «${s.title}»`}
                                onToggle={(complete) =>
                                    onComplete(s.id, complete)
                                }
                            />
                            <button
                                className="icon-btn fold"
                                aria-label={
                                    folded.has(s.id)
                                        ? `توسيع ${s.title}`
                                        : `طي ${s.title}`
                                }
                                disabled={!has}
                                onClick={() =>
                                    setFolded((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(s.id)) next.delete(s.id);
                                        else next.add(s.id);
                                        return next;
                                    })
                                }
                            >
                                {has ? (
                                    folded.has(s.id) ? (
                                        <ChevronLeft size={16} />
                                    ) : (
                                        <ChevronDown size={16} />
                                    )
                                ) : (
                                    <span className="leaf-dot" />
                                )}
                            </button>
                            <bdi className="tree-number" dir="ltr">
                                {nums.get(s.id)}
                            </bdi>
                            <button
                                className="tree-title"
                                onClick={() => go(`step/${s.id}`)}
                            >
                                <span className="tree-name">{s.title}</span>
                                <span className="small muted">
                                    {s.kind === "stage"
                                        ? "مرحلة"
                                        : has
                                          ? "خطوة متفرعة"
                                          : "خطوة"}
                                </span>
                            </button>
                            <Badge status={hierarchy.nodes.get(s.id)!.status} />
                            {s.kind === "stage" &&
                                hierarchy.metric(projectId, s.id).total > 0 && (
                                    <span
                                        className="stage-progress"
                                        aria-label={`تقدم المرحلة ${s.title}`}
                                    >
                                        {
                                            hierarchy.metric(projectId, s.id)
                                                .percent
                                        }
                                        %
                                    </span>
                                )}
                            <div className="tree-actions">
                                <ActionButton
                                    kind="step"
                                    item={s}
                                    open={onActions}
                                />
                                <button
                                    className="icon-btn"
                                    aria-label={`رفع ${s.title}`}
                                    disabled={i === 0}
                                    onClick={() => run(() => reorder(s.id, -1))}
                                >
                                    <ArrowUp size={15} />
                                </button>
                                <button
                                    className="icon-btn"
                                    aria-label={`خفض ${s.title}`}
                                    disabled={i === arr.length - 1}
                                    onClick={() => run(() => reorder(s.id, 1))}
                                >
                                    <ArrowDown size={15} />
                                </button>
                                <button
                                    className="icon-btn"
                                    aria-label={`إضافة داخل ${s.title}`}
                                    onClick={() =>
                                        setForm({
                                            kind: "step",
                                            projectId,
                                            parentId: s.id,
                                        })
                                    }
                                >
                                    <Plus size={17} />
                                </button>
                            </div>
                        </TreeRow>
                        {has && !folded.has(s.id) && (
                            <Tree
                                onComplete={onComplete}
                                hierarchy={hierarchy}
                                folded={folded}
                                setFolded={setFolded}
                                setForm={setForm}
                                run={run}
                                projectId={projectId}
                                parentId={s.id}
                                depth={depth + 1}
                                onActions={onActions}
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
});
function TreeRow({
    step,
    onActions,
    children,
}: {
    step: Step;
    onActions: OpenActions;
    children: ReactNode;
}) {
    const gestures = useLongPress((rect) =>
        onActions("step", step, rect, true),
    );
    return (
        <div
            className={`tree-row ${step.kind === "stage" ? "stage-row" : ""}`}
            data-step-id={step.id}
            {...gestures}
        >
            {children}
        </div>
    );
}
const TaskRow = memo(function TaskRow({
    task,
    onComplete,
    onActions,
    defaultPriority = false,
    compact = false,
}: {
    task: TaskView;
    onComplete: (task: TaskView, status: Status, at?: string) => Promise<void>;
    onActions: OpenActions;
    defaultPriority?: boolean;
    compact?: boolean;
}) {
    const completion = useCompletion(
        task._cycleId ? `taskCycle/${task._cycleId}` : `task/${task.id}`,
        task.status === "done",
        (complete, at) => onComplete(task, complete ? "done" : "todo", at),
    );
    const checked = completion.checked;
    const gestures = useLongPress((rect) =>
        onActions("task", task, rect, true),
    );
    return (
        <article
            className={`task-row${compact ? " compact-task" : ""}`}
            data-task-id={task.id}
            {...gestures}
        >
            {(task.priority || defaultPriority) && (
                <span
                    className="priority-strip"
                    role="img"
                    aria-label={
                        task.priority
                            ? priorities[task.priority].name
                            : "بدون أولوية"
                    }
                    style={{
                        backgroundColor: task.priority
                            ? priorities[task.priority].color
                            : "#8B929D",
                    }}
                />
            )}
            <button
                className={"task-check " + (checked ? "checked" : "")}
                data-completion-key={
                    task._cycleId
                        ? `taskCycle/${task._cycleId}`
                        : `task/${task.id}`
                }
                aria-label={
                    checked ? `إعادة فتح ${task.title}` : `إكمال ${task.title}`
                }
                aria-pressed={checked}
                aria-busy={completion.saving}
                disabled={task._available === false}
                onClick={completion.toggle}
            >
                {checked && <Check size={18} />}
            </button>
            <button className="task-main" onClick={() => go(`task/${task.id}`)}>
                <strong>{task.title}</strong>
                {!compact && (
                    <span className="muted small">
                        {task.status === "done"
                            ? `أُنشئت ${date(task.createdAt)} · أُنجزت ${date(task.completedAt)} · ${elapsed(task.createdAt, task.completedAt!)}`
                            : task.notes || `أُنشئت ${date(task.createdAt)}`}
                    </span>
                )}
                <TaskDue task={task} />
                {compact && task.status === "doing" && (
                    <span className="small muted">جارٍ العمل</span>
                )}
            </button>
            {!compact && <Badge status={task.status} />}
            <ActionButton kind="task" item={task} open={onActions} />
            {!compact && (
                <button
                    className="icon-btn"
                    aria-label={`تفاصيل ${task.title}`}
                    onClick={() => go(`task/${task.id}`)}
                >
                    <FileText size={20} />
                </button>
            )}
        </article>
    );
});
const IdeaCard = memo(function IdeaCard({
    idea,
    onActions,
}: {
    idea: Idea;
    onActions: OpenActions;
}) {
    const gestures = useLongPress((rect) =>
        onActions("idea", idea, rect, true),
    );
    return (
        <article className="idea-card" data-idea-id={idea.id} {...gestures}>
            <ActionButton kind="idea" item={idea} open={onActions} />
            <Lightbulb size={23} />
            <button
                className="title-link"
                onClick={() => go(`idea/${idea.id}`)}
            >
                {idea.title}
                <ArrowUpLeft size={17} />
            </button>
            <p>{idea.notes || "فكرة صغيرة، قد تصبح شيئًا كبيرًا."}</p>
            <span className="muted small">{date(idea.createdAt)}</span>
        </article>
    );
});
type Run = (fn: () => Promise<unknown>, message?: string) => Promise<void>;
interface CreateOptions {
    kind: EntityKind;
    projectId?: string;
    parentId?: string;
    stage?: boolean;
}
function App() {
    const [route] = [useRoute()];
    const [routePage, ...parts] = route.split("/");
    const page = routePage === "today" ? "home" : routePage;
    const id = routeId(parts.length ? parts.join("/") : undefined);
    const data = useAppData(page, id);
    const hierarchy = useMemo(() => buildHierarchy(data.steps), [data.steps]);
    const pace = usePaceData(page, id, data.projects, data.steps, data.tasks);
    const plansById = useMemo(
        () => new Map(pace.plans.map((p) => [p.projectId, p])),
        [pace.plans],
    );
    const [capacityError, setCapacityError] =
        useState<ActiveProjectLimitError | null>(null);
    const [taskFilter, setTaskFilter] = useState("all");
    const [completedOpen, setCompletedOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [searchOpen, setSearchOpen] = useState(false);
    const [progressTab, setProgressTab] = useState<
        "overview" | "insights" | "history"
    >("overview");
    const [filter, setFilter] = useState("active");
    const [ideaArchive, setIdeaArchive] = useState(false);
    const [ideaLimit, setIdeaLimit] = useState(30);
    useEffect(() => setIdeaLimit(30), [ideaArchive]);
    const [folded, setFolded] = useState<Set<string>>(new Set());
    const [form, setForm] = useState<CreateOptions | null>(null);
    const [quick, setQuick] = useState(false);
    const [confirm, setConfirm] = useState<{
        text: string;
        run: () => Promise<unknown>;
    } | null>(null);
    const [toast, setToast] = useState("");
    const [stepUndo, setStepUndo] = useState<{
        id: string;
        projectId: string;
        reopen: boolean;
        value: boolean;
    } | null>(null);
    const projectsRef = useRef(data.projects);
    projectsRef.current = data.projects;
    const confirmLock = useRef(false);
    const importLock = useRef(false);
    useEffect(() => {
        void startCompletionRecovery()
            .then(completeFinishedProjects)
            .catch(() =>
                setToast(
                    "تعذر استعادة حالة قيد الحفظ أو حفظ الإتمام التلقائي. أعد فتح التطبيق للمحاولة مجددًا.",
                ),
            );
    }, []);
    const [deleted, setDeleted] = useState<Deleted | null>(null);
    const { theme, mode, identity, setMode, setIdentity } = useTheme();
    const [appearanceOpen, setAppearanceOpen] = useState(false);
    const [context, setContext] = useState<{
        kind: EntityKind;
        item: Base;
        position?: { top: number; left: number };
        fromHold?: boolean;
    } | null>(null);
    const [editTarget, setEditTarget] = useState<string | null>(null);
    const [lastVisited, setLastVisited] = useState<string | null>(() => {
        try {
            return localStorage.getItem("masar-last-step");
        } catch {
            return null;
        }
    });
    const executions = useMemo(
        () => buildExecution(data.projects, hierarchy),
        [data.projects, hierarchy],
    );
    const resume = resumeStep(
        data.projects.filter((p) => activeProject(p, plansById.get(p.id))),
        hierarchy,
        executions,
        lastVisited,
    );
    const hierarchyRef = useRef(hierarchy);
    hierarchyRef.current = hierarchy;
    const rememberStep = useCallback((stepId: string) => {
        const step = hierarchyRef.current.byId.get(stepId);
        if (step?.kind !== "step") return;
        setLastVisited(stepId);
        try {
            localStorage.setItem("masar-last-step", stepId);
        } catch {
            /* Resume falls back to current work. */
        }
    }, []);
    useEffect(() => {
        if (page === "step") rememberStep(id);
    }, [page, id, hierarchy, rememberStep]);
    useEffect(() => {
        setContext(null);
        setAppearanceOpen(false);
        setQuick(false);
    }, [route]);
    useEffect(() => {
        if (
            !editTarget ||
            id !== editTarget ||
            !["project", "step", "task", "idea"].includes(page)
        )
            return;
        const frame = requestAnimationFrame(() => {
            document
                .querySelector<HTMLInputElement>('[aria-label="تعديل الاسم"]')
                ?.focus();
            setEditTarget(null);
        });
        return () => cancelAnimationFrame(frame);
    }, [page, id, editTarget, data]);
    const openActions = useCallback<OpenActions>(
        (kind, item, rect, fromHold = false) => {
            setContext({
                kind,
                item,
                fromHold,
                position: rect
                    ? {
                          top: Math.max(
                              80,
                              Math.min(rect.bottom + 6, innerHeight - 380),
                          ),
                          left: Math.max(
                              16,
                              Math.min(rect.left, innerWidth - 336),
                          ),
                      }
                    : undefined,
            });
        },
        [],
    );
    const [backup, setBackup] = useState<Snapshot | null>(null);
    const [install, setInstall] = useState<
        (Event & { prompt: () => Promise<unknown> }) | null
    >(null);
    const [offline, setOffline] = useState(!navigator.onLine);
    const [refresh, setRefresh] = useState<(() => Promise<void>) | null>(null);
    useEffect(() => {
        const updateSW = registerSW({
            onNeedRefresh() {
                setRefresh(() => () => updateSW(true));
            },
            onOfflineReady() {
                setToast("التطبيق جاهز للعمل دون إنترنت.");
            },
        });
        const prompt = (e: Event) => {
            e.preventDefault();
            setInstall(e as Event & { prompt: () => Promise<unknown> });
        };
        const online = () => setOffline(!navigator.onLine);
        window.addEventListener("beforeinstallprompt", prompt);
        window.addEventListener("online", online);
        window.addEventListener("offline", online);
        return () => {
            window.removeEventListener("beforeinstallprompt", prompt);
            window.removeEventListener("online", online);
            window.removeEventListener("offline", online);
        };
    }, []);
    useEffect(() => {
        setQuery("");
    }, [route]);
    useEffect(() => {
        if (!toast || deleted) return;
        const timer = setTimeout(() => setToast(""), 5000);
        return () => clearTimeout(timer);
    }, [toast, deleted]);
    const run = useCallback(
        async (fn: () => Promise<unknown>, message?: string) => {
            try {
                await fn();
                if (message) setToast(message);
            } catch (e) {
                if (e instanceof ActiveProjectLimitError) setCapacityError(e);
                setToast(
                    userError(
                        e,
                        "تعذر الحفظ. تحقق من مساحة الجهاز وأعد المحاولة.",
                    ),
                );
            }
        },
        [],
    );
    const completeTask = useCallback(
        async (
            task: TaskView,
            status: Status,
            at?: string,
            autoReveal = true,
        ) => {
            try {
                if (task._cycleId)
                    await setCycleStatus(task._cycleId, status, at);
                else await changeStatus("task", task.id, status);
                if (status === "done") {
                    if (autoReveal) setCompletedOpen(true);
                    setToast(`أُنجزت «${task.title}»`);
                } else
                    setToast(
                        status === "doing"
                            ? `بدأت «${task.title}»`
                            : `أُعيد فتح «${task.title}»`,
                    );
            } catch (e) {
                setToast(userError(e, "تعذر حفظ حالة المهمة. حاول مجددًا."));
                throw e;
            }
        },
        [],
    );
    const completeBranch = useCallback(
        async (id: string, complete: boolean) => {
            try {
                const projectId = hierarchyRef.current.byId.get(id)?.projectId;
                const wasActive =
                    projectsRef.current.find((p) => p.id === projectId)
                        ?.status === "active";
                await setBranchCompletion(id, complete);
                if (projectId && complete) {
                    setDeleted(null);
                }
                if (projectId && complete)
                    setStepUndo({
                        id,
                        projectId,
                        reopen: wasActive,
                        value: false,
                    });
                rememberStep(id);
                setToast(
                    complete
                        ? "تم إتمام الخطوة أو المرحلة."
                        : "أُعيد فتح الخطوة أو المرحلة.",
                );
            } catch (e) {
                setToast(userError(e, "تعذر حفظ الحالة. أعد المحاولة."));
                throw e;
            }
        },
        [rememberStep],
    );
    const completeProject = useCallback(
        async (id: string, complete: boolean) => {
            try {
                await setProjectCompletion(id, complete);
                setToast(
                    complete
                        ? "تم إتمام المشروع وإغلاقه يدويًا."
                        : "أُعيد فتح المشروع.",
                );
            } catch (e) {
                if (e instanceof ActiveProjectLimitError) setCapacityError(e);
                setToast(userError(e, "تعذر حفظ حالة المشروع."));
                throw e;
            }
        },
        [],
    );
    const saveQuickIdea = useCallback(async (title: string, notes: string) => {
        const id = await create("idea", title, notes);
        setIdeaArchive(false);
        setIdeaLimit(30);
        return id;
    }, []);
    const sortedIdeas = useMemo(
        () =>
            data.ideas
                .filter((i) => i.archived === ideaArchive)
                .sort(
                    (a, b) =>
                        b.updatedAt.localeCompare(a.updatedAt) ||
                        b.id.localeCompare(a.id),
                ),
        [data.ideas, ideaArchive],
    );
    const active = data.projects
        .filter((p) => activeProject(p, plansById.get(p.id)))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const remaining = data.tasks
        .filter((t) => t.status !== "done")
        .sort(
            (a, b) =>
                taskRank(a) - taskRank(b) ||
                b.updatedAt.localeCompare(a.updatedAt),
        );
    const recent = useMemo(
        () => achievements(data),
        [data.steps, data.tasks, data.taskCycles],
    );
    const filteredTasks = remaining.filter(
        (t) =>
            taskFilter === "all" ||
            (taskFilter === "cycle"
                ? !!t.schedule && t.schedule.repeat !== "none"
                : (t as TaskView)._dueState === taskFilter),
    );
    function askDelete(kind: EntityKind, item: Base) {
        setConfirm({
            text: `حذف «${item.title}»${kind === "project" ? " وكل مراحله وخطواته" : kind === "step" ? " وكل الخطوات داخله" : ""}؟ يمكنك التراجع بعد الحذف.`,
            run: async () => {
                await flushAllSaves();
                await flushCompletions();
                const d = await remove(kind, item.id);
                setDeleted(d);
                setToast("تم الحذف. يمكنك التراجع.");
                const locationParts = location.hash.slice(1).split("/");
                if (
                    locationParts.shift() === kind &&
                    routeId(locationParts.join("/")) === item.id
                )
                    go(
                        kind === "step"
                            ? `project/${(item as Step).projectId}`
                            : kind === "project"
                              ? "projects"
                              : kind === "task"
                                ? "tasks"
                                : "ideas",
                    );
            },
        });
    }
    const open = (kind: EntityKind, target: string) => go(`${kind}/${target}`);
    const currentProject = data.projects.find((p) => p.id === id);
    const currentStep = data.steps.find((s) => s.id === id);
    const currentTask = data.tasks.find((t) => t.id === id);
    const currentIdea = data.ideas.find((i) => i.id === id);
    const detail =
        page === "project"
            ? currentProject
            : page === "step"
              ? currentStep
              : page === "task"
                ? currentTask
                : currentIdea;
    const section =
        page === "project" || page === "step"
            ? "projects"
            : page === "task"
              ? "tasks"
              : page === "idea"
                ? "ideas"
                : ["today", "calendar"].includes(page)
                  ? "tasks"
                  : page;
    const dashboardProjects = active;
    const latestProject = useMemo(
        () =>
            [...data.projects].sort((a, b) =>
                b.updatedAt.localeCompare(a.updatedAt),
            )[0],
        [data.projects],
    );
    const dashboardRecent = recent.slice(0, 5);
    const legacyDashboard =
        page === "progress" ? (
            <>
                <div className="general-dashboard">
                    {latestProject && (
                        <p className="last-edited">
                            آخر مشروع عُدّل:{" "}
                            <button
                                className="text-btn"
                                onClick={() =>
                                    open("project", latestProject.id)
                                }
                            >
                                {latestProject.title}
                            </button>
                        </p>
                    )}
                    <div className="stats-grid">
                        {[
                            [
                                "إجمالي المشاريع",
                                data.projects.length,
                                FolderKanban,
                            ],
                            ["المشاريع النشطة", active.length, Play],
                            [
                                "المشاريع المغلقة",
                                data.projects.filter(
                                    (p) => p.status === "closed",
                                ).length,
                                CheckCheck,
                            ],
                            [
                                "مهام مستقلة متبقية",
                                remaining.length,
                                NotebookPen,
                            ],
                            ["منجز آخر ٧ أيام", recent.length, Leaf],
                        ].map(([label, value, Icon]) => {
                            const I = Icon as typeof Leaf;
                            return (
                                <div className="stat-card" key={String(label)}>
                                    <I size={21} />
                                    <strong>{String(value)}</strong>
                                    <span>{String(label)}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
                <div className="dashboard-grid">
                    <section className="surface">
                        <div className="section-heading">
                            <h2>مسار مشاريعك</h2>
                            <span className="badge doing">نشطة</span>
                        </div>
                        {active.length ? (
                            dashboardProjects.map((p) => {
                                const pr = hierarchy.metric(p.id);
                                return (
                                    <div
                                        className="dashboard-project"
                                        key={p.id}
                                    >
                                        <CompletionButton
                                            entityKey={`project/${p.id}`}
                                            checked={p.status === "closed"}
                                            label={`المشروع «${p.title}»`}
                                            onToggle={(complete) =>
                                                completeProject(p.id, complete)
                                            }
                                        />
                                        <button
                                            className="title-link"
                                            onClick={() =>
                                                open("project", p.id)
                                            }
                                        >
                                            {p.title}
                                            <ArrowUpLeft size={17} />
                                        </button>
                                        <Progress
                                            hierarchy={hierarchy}
                                            projectId={p.id}
                                            compact
                                        />
                                        {pr.total > 0 && (
                                            <p className="muted small">
                                                {pr.done} مكتملة ·{" "}
                                                {pr.remaining} متبقية
                                            </p>
                                        )}
                                    </div>
                                );
                            })
                        ) : (
                            <Empty
                                title="التقدم يبدأ هنا"
                                body="أضف مشروعًا لترى خطواتك تتحول إلى إنجاز."
                            />
                        )}
                    </section>
                    <section className="surface achievements">
                        <span className="eyebrow">آخر ٧ أيام المتحركة</span>
                        <h2>
                            إنجازات تستحق أن تراها <Leaf size={21} />
                        </h2>
                        <p className="muted small">
                            من الآن إلى ٧ أيام مضت. كل عنصر يُحتسب مرة واحدة
                            بحالته الحالية.
                        </p>
                        <div className="achievement-number">
                            {recent.length}
                            <span>مهام وخطوات مكتملة</span>
                        </div>
                        {dashboardRecent.map((t) => (
                            <button
                                className="achievement-row"
                                key={t.recordId}
                                onClick={() => open(t.entityKind, t.id)}
                            >
                                <span className="achievement-check">
                                    <Check size={16} />
                                </span>
                                <div>
                                    <strong>{t.title}</strong>
                                    <span>
                                        {t.entityKind === "task"
                                            ? "مهمة مستقلة"
                                            : "خطوة مشروع"}{" "}
                                        · {date(t.completedAt)}
                                    </span>
                                </div>
                            </button>
                        ))}
                        {!recent.length && (
                            <p className="muted">
                                ستظهر إنجازاتك هنا مع أول خطوة مكتملة.
                            </p>
                        )}
                    </section>
                </div>
                <div className="surface separate-counts">
                    <span>
                        <strong>{remaining.length}</strong> مهام مستقلة غير
                        مكتملة
                    </span>
                    <span>
                        <strong>
                            {data.projects.reduce(
                                (sum, p) =>
                                    sum + hierarchy.metric(p.id).remaining,
                                0,
                            )}
                        </strong>{" "}
                        خطوات مشاريع غير مكتملة
                    </span>
                    <p>
                        الخطوات النهائية فقط تدخل في الحساب. يُتمّ المشروع
                        تلقائيًا عند ١٠٠٪، ويمكن إتمامه يدويًا قبل ذلك.
                    </p>
                </div>
            </>
        ) : null;
    const dashboard = (
        <PeriodDashboard
            data={{
                ...data,
                projectPlans: pace.plans,
                paceSettings: pace.settings ? [pace.settings] : [],
            }}
            tab={progressTab}
            onTabChange={setProgressTab}
            legacy={legacyDashboard}
            renderRecord={(record) => {
                const target =
                    record.kind === "step"
                        ? "step"
                        : record.kind === "project"
                          ? "project"
                          : "task";
                const task = data.tasks.find((t) => t.id === record.id);
                if (
                    task &&
                    (record.kind === "task" ||
                        (record.kind === "cycle" &&
                            (task as TaskView)._cycleId === record.cycleId))
                )
                    return (
                        <TaskRow
                            task={task}
                            onComplete={completeTask}
                            onActions={openActions}
                        />
                    );
                return (
                    <div className="history-record-body">
                        {(target === "step" || target === "project") && (
                            <CompletionButton
                                entityKey={`${target}/${record.id}`}
                                checked
                                label={`${target === "step" ? "الخطوة" : "المشروع"} «${record.title}»`}
                                onToggle={(value) =>
                                    target === "step"
                                        ? completeBranch(record.id, value)
                                        : completeProject(record.id, value)
                                }
                            />
                        )}
                        <button
                            className="title-link"
                            onClick={() => open(target, record.id)}
                        >
                            {record.title}
                            <ArrowUpLeft size={17} />
                        </button>
                    </div>
                );
            }}
        />
    );
    return (
        <div
            className="app-shell"
            onFocusCapture={(event) => trackCompletionFocus(event.target)}
        >
            <aside className="sidebar">
                <a className="brand" href="#home">
                    <span className="brand-mark">
                        <Leaf size={23} />
                    </span>
                    <strong>
                        مسار<span>مساحة لإنجازك</span>
                    </strong>
                </a>
                <div className="nav-caption">مساحتك الشخصية</div>
                <nav className="navigation" aria-label="التنقل الرئيسي">
                    {nav.map((n) => (
                        <a
                            key={n.id}
                            href={"#" + n.id}
                            className={section === n.id ? "active" : ""}
                            aria-current={section === n.id ? "page" : undefined}
                        >
                            <n.icon size={21} />
                            <span>{n.label}</span>
                            {n.id === "tasks" && remaining.length > 0 && (
                                <b>{remaining.length}</b>
                            )}
                        </a>
                    ))}
                </nav>
                <div className="sidebar-bottom">
                    <div className="local-note">
                        <ShieldCheck size={21} />
                        <div>
                            <strong>لك وحدك. على جهازك.</strong>
                            <p>بلا حسابات، بلا ضجيج.</p>
                        </div>
                    </div>
                    <button
                        className="backup-link"
                        onClick={() => go("backup")}
                    >
                        <Download size={18} /> النسخ الاحتياطي
                    </button>
                </div>
            </aside>
            <div className="workspace">
                <header className="topbar">
                    <div className="topbar-name">
                        <Leaf size={18} />
                        <span>مسار</span>
                        <span className="muted desktop">
                            /{" "}
                            {nav.find((n) => n.id === section)?.label ??
                                "النسخ الاحتياطي"}
                        </span>
                    </div>
                    <div className="topbar-tools">
                        {offline && (
                            <span className="offline-label">
                                <WifiOff size={15} /> دون إنترنت
                            </span>
                        )}
                        <button
                            className="icon-btn"
                            aria-label="النسخ الاحتياطي"
                            onClick={() => go("backup")}
                        >
                            <Download size={19} />
                        </button>
                        <button
                            className="icon-btn"
                            aria-label={
                                theme === "light"
                                    ? "الوضع الداكن"
                                    : "الوضع الفاتح"
                            }
                            onClick={() =>
                                setMode(theme === "light" ? "dark" : "light")
                            }
                        >
                            {theme === "light" ? (
                                <Moon size={19} />
                            ) : (
                                <Sun size={19} />
                            )}
                        </button>
                        <button
                            className="icon-btn"
                            aria-label="المظهر والألوان"
                            aria-haspopup="dialog"
                            onClick={() => setAppearanceOpen(true)}
                        >
                            <Palette size={19} />
                        </button>
                        <span className="avatar" aria-label="مساحتك الشخصية">
                            م
                        </span>
                    </div>
                </header>
                {refresh && (
                    <div className="update-banner" role="status">
                        <span>نسخة أحدث من مسار جاهزة.</span>
                        <button
                            className="btn primary"
                            onClick={() =>
                                void run(async () => {
                                    await flushAllSaves();
                                    await flushCompletions();
                                    await refresh();
                                })
                            }
                        >
                            تحديث الآن
                        </button>
                    </div>
                )}
                <main>
                    {data.taskHistoryError && (
                        <p role="alert" className="warning">
                            {data.taskHistoryError}
                        </p>
                    )}
                    <div className="page-heading">
                        <div>
                            <div className="eyebrow">
                                {page === "home"
                                    ? new Intl.DateTimeFormat("ar", {
                                          weekday: "long",
                                          day: "numeric",
                                          month: "long",
                                      }).format(new Date())
                                    : "خطوة صغيرة، أثر مستمر"}
                            </div>
                            <h1>
                                {page === "today"
                                    ? "مهامي اليوم"
                                    : page === "calendar"
                                      ? "التقويم الأسبوعي"
                                      : page === "home"
                                        ? "مهامي اليوم"
                                        : page === "projects"
                                          ? "مشاريعك"
                                          : page === "tasks"
                                            ? "مهامك"
                                            : page === "ideas"
                                              ? "مساحة الأفكار"
                                              : page === "progress"
                                                ? "كل خطوة تصنع فرقًا"
                                                : page === "backup"
                                                  ? "بياناتك في أمان"
                                                  : (detail?.title ??
                                                    "العنصر غير موجود")}
                            </h1>
                            <p>
                                {page === "home"
                                    ? ""
                                    : page === "projects"
                                      ? "من الفكرة الكبيرة إلى الخطوة التالية."
                                      : page === "tasks"
                                        ? "أشياء صغيرة تستحق أن تُنجز."
                                        : page === "ideas"
                                          ? "التقطها الآن. امنحها مسارًا حين تكون مستعدًا."
                                          : page === "progress"
                                            ? "نظرة واضحة لما أنجزت، وما ينتظر خطوتك التالية."
                                            : page === "backup"
                                              ? "احتفظ بنسخة من مساحتك، وعد إليها متى احتجت."
                                              : ""}
                            </p>
                        </div>
                        {page === "home" && (
                            <button
                                className="icon-btn"
                                aria-label="فتح البحث"
                                aria-expanded={searchOpen}
                                onClick={() => setSearchOpen((v) => !v)}
                            >
                                <Search size={20} />
                            </button>
                        )}
                    </div>
                    {page === "home" && !query && (
                        <>
                            {pace.error && (
                                <p className="warning" role="alert">
                                    {pace.error}
                                </p>
                            )}
                            <HomeExecution
                                expanded={routePage === "today"}
                                projectRest={isProjectRest(
                                    new Date(Math.max(pace.clock, Date.now())),
                                    pace.settings,
                                )}
                                recommendation={
                                    <PaceRecommendations
                                        rows={pace.recommendations}
                                        projects={data.projects}
                                        resting={isProjectRest(
                                            new Date(
                                                Math.max(
                                                    pace.clock,
                                                    Date.now(),
                                                ),
                                            ),
                                            pace.settings,
                                        )}
                                        main
                                    />
                                }
                                data={data}
                                active={active.filter((p) =>
                                    activeProject(p, plansById.get(p.id)),
                                )}
                                resume={
                                    resume &&
                                    activeProject(
                                        data.projects.find(
                                            (p) => p.id === resume.projectId,
                                        )!,
                                        plansById.get(resume.projectId),
                                    )
                                        ? resume
                                        : undefined
                                }
                                hierarchy={hierarchy}
                                open={go}
                                complete={completeBranch}
                                openHistory={() => {
                                    setProgressTab("history");
                                    go("progress");
                                }}
                                renderProject={(p, i, omitCurrentId) => (
                                    <ProjectCard
                                        key={p.id}
                                        home
                                        omitCurrentId={omitCurrentId}
                                        project={p}
                                        plan={plansById.get(p.id)}
                                        paceWork={pace.work}
                                        paceClock={pace.clock}
                                        paceSettings={pace.settings}
                                        hierarchy={hierarchy}
                                        execution={executions.get(p.id)!}
                                        onComplete={completeProject}
                                        onStepComplete={completeBranch}
                                        onActions={openActions}
                                        index={i}
                                    />
                                )}
                                renderTask={(task) => (
                                    <TaskRow
                                        onActions={openActions}
                                        key={task.id}
                                        defaultPriority
                                        compact
                                        task={task}
                                        onComplete={completeTask}
                                    />
                                )}
                            />
                        </>
                    )}
                    {(page !== "home" || searchOpen || query) && (
                        <div className="search-box">
                            <Search size={19} />
                            <input
                                aria-label="بحث شامل"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="ابحث في مشاريعك، مهامك، أفكارك وملاحظاتك…"
                            />
                            {query && (
                                <button
                                    className="icon-btn"
                                    aria-label="مسح البحث"
                                    onClick={() => setQuery("")}
                                >
                                    <X size={16} />
                                </button>
                            )}
                            <span className="search-hint desktop">
                                بحث محلي
                            </span>
                        </div>
                    )}
                    {query ? (
                        <section className="surface search-results">
                            <h2>
                                نتائج البحث{" "}
                                <span className="count">
                                    {search(data, query).length}
                                </span>
                            </h2>
                            {search(data, query).length ? (
                                search(data, query).map((r) => (
                                    <button
                                        className="search-result"
                                        key={r.id}
                                        onClick={() => open(r.kind, r.id)}
                                    >
                                        <span className="small muted">
                                            {kindNames[r.kind]}
                                        </span>
                                        <strong>{r.title}</strong>
                                        <span className="muted small line-clamp">
                                            {r.notes}
                                        </span>
                                        <ArrowUpLeft size={17} />
                                    </button>
                                ))
                            ) : (
                                <Empty
                                    icon={Search}
                                    title="لم نجد نتيجة"
                                    body="جرّب كلمة أخرى من الاسم أو الملاحظات."
                                />
                            )}
                        </section>
                    ) : (
                        <>
                            {page === "calendar" && (
                                <WeekCalendar
                                    tasks={data.tasks}
                                    onComplete={completeTask}
                                />
                            )}
                            {page === "projects" && (
                                <>
                                    <ProjectImport
                                        onImported={(projectId) => {
                                            setToast("تم استيراد مشروع جديد.");
                                            go("project/" + projectId);
                                        }}
                                    />
                                    <div
                                        className="tabs"
                                        role="group"
                                        aria-label="تصفية المشاريع"
                                    >
                                        {[
                                            ["active", "النشطة"],
                                            ["paused", "الموقوفة مؤقتًا"],
                                            ["closed", "المغلقة"],
                                            ["archived", "المؤرشفة"],
                                        ].map(([value, label]) => (
                                            <button
                                                key={value}
                                                aria-pressed={filter === value}
                                                className={
                                                    filter === value
                                                        ? "selected"
                                                        : ""
                                                }
                                                onClick={() => setFilter(value)}
                                            >
                                                {label}
                                                <span>
                                                    {
                                                        data.projects.filter(
                                                            (p) =>
                                                                value ===
                                                                "archived"
                                                                    ? p.archived
                                                                    : !p.archived &&
                                                                      (value ===
                                                                      "paused"
                                                                          ? p.status ===
                                                                                "active" &&
                                                                            paused(
                                                                                plansById.get(
                                                                                    p.id,
                                                                                ),
                                                                            )
                                                                          : p.status ===
                                                                                value &&
                                                                            (value !==
                                                                                "active" ||
                                                                                !paused(
                                                                                    plansById.get(
                                                                                        p.id,
                                                                                    ),
                                                                                ))),
                                                        ).length
                                                    }
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                    <ProjectCapacitySettings />
                                    <div className="project-grid">
                                        {data.projects
                                            .filter((p) =>
                                                filter === "archived"
                                                    ? p.archived
                                                    : !p.archived &&
                                                      (filter === "paused"
                                                          ? p.status ===
                                                                "active" &&
                                                            paused(
                                                                plansById.get(
                                                                    p.id,
                                                                ),
                                                            )
                                                          : p.status ===
                                                                filter &&
                                                            (filter !==
                                                                "active" ||
                                                                !paused(
                                                                    plansById.get(
                                                                        p.id,
                                                                    ),
                                                                ))),
                                            )
                                            .sort((a, b) =>
                                                b.updatedAt.localeCompare(
                                                    a.updatedAt,
                                                ),
                                            )
                                            .map((p, i) => (
                                                <ProjectCard
                                                    key={p.id}
                                                    project={p}
                                                    plan={plansById.get(p.id)}
                                                    paceWork={pace.work}
                                                    paceClock={pace.clock}
                                                    onComplete={completeProject}
                                                    hierarchy={hierarchy}
                                                    execution={executions.get(
                                                        p.id,
                                                    )!}
                                                    onStepComplete={
                                                        completeBranch
                                                    }
                                                    onActions={openActions}
                                                    index={i}
                                                />
                                            ))}
                                    </div>
                                    {!data.projects.some((p) =>
                                        filter === "archived"
                                            ? p.archived
                                            : !p.archived &&
                                              (filter === "paused"
                                                  ? p.status === "active" &&
                                                    paused(plansById.get(p.id))
                                                  : p.status === filter &&
                                                    (filter !== "active" ||
                                                        !paused(
                                                            plansById.get(p.id),
                                                        ))),
                                    ) && (
                                        <div className="surface">
                                            <Empty
                                                title="مساحة لمشروعك القادم"
                                                body={
                                                    filter === "active"
                                                        ? "رتّب أفكارك الكبيرة في خطوات يمكن إنجازها."
                                                        : "ستجد مشاريعك هنا عندما تتغير حالتها."
                                                }
                                            />
                                        </div>
                                    )}
                                </>
                            )}
                            {page === "tasks" && (
                                <>
                                    <div className="task-controls">
                                        <PlanningLinks all={false} />
                                        <div className="section-heading">
                                            <h2>
                                                المهام المستقلة{" "}
                                                <span className="count">
                                                    {remaining.length}
                                                </span>
                                            </h2>
                                            <span className="muted small">
                                                غير المكتملة أولًا
                                            </span>
                                        </div>
                                        <div
                                            className="tabs task-filters"
                                            role="group"
                                            aria-label="عرض المهام بحسب موعدها"
                                        >
                                            {[
                                                ["all", "كل المهام"],
                                                ["general", "بدون موعد"],
                                                ["today", "اليوم"],
                                                ["near", "اقترب الموعد"],
                                                ["overdue", "متأخرة"],
                                                ["cycle", "متكررة"],
                                                ["future", "قادمة"],
                                            ].map(([key, label]) => (
                                                <button
                                                    key={key}
                                                    aria-pressed={
                                                        taskFilter === key
                                                    }
                                                    className={
                                                        taskFilter === key
                                                            ? "selected"
                                                            : ""
                                                    }
                                                    onClick={() =>
                                                        setTaskFilter(key)
                                                    }
                                                >
                                                    {label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="surface task-list">
                                        {filteredTasks.length ? (
                                            filteredTasks
                                                .sort(
                                                    (a, b) =>
                                                        taskRank(a) -
                                                            taskRank(b) ||
                                                        b.updatedAt.localeCompare(
                                                            a.updatedAt,
                                                        ),
                                                )
                                                .map((t) => (
                                                    <TaskRow
                                                        onActions={openActions}
                                                        onComplete={
                                                            completeTask
                                                        }
                                                        task={t}
                                                        key={
                                                            "recordId" in t
                                                                ? String(
                                                                      t.recordId,
                                                                  )
                                                                : t.id
                                                        }
                                                    />
                                                ))
                                        ) : (
                                            <Empty
                                                icon={CheckCheck}
                                                title="قائمة خفيفة، ذهن أصفى"
                                                body="أضف مهمة مستقلة، أو استمتع بخلوّ القائمة."
                                            />
                                        )}
                                    </div>
                                    <details
                                        className="surface completed-list"
                                        open={completedOpen}
                                        onToggle={(e) =>
                                            setCompletedOpen(
                                                e.currentTarget.open,
                                            )
                                        }
                                    >
                                        <summary>
                                            <span>
                                                <CheckCheck size={19} />
                                                المهام المنجزة{" "}
                                                <span className="count">
                                                    {
                                                        data.tasks.filter(
                                                            (t) =>
                                                                t.status ===
                                                                "done",
                                                        ).length
                                                    }
                                                </span>
                                            </span>
                                            <ChevronDown size={18} />
                                        </summary>
                                        <p className="muted small">
                                            المدة المعروضة زمن منقضٍ، وليست
                                            ساعات عمل فعلية.
                                        </p>
                                        {data.tasks
                                            .filter((t) => t.status === "done")
                                            .sort((a, b) =>
                                                b.completedAt!.localeCompare(
                                                    a.completedAt!,
                                                ),
                                            )
                                            .map((t) => (
                                                <TaskRow
                                                    onActions={openActions}
                                                    onComplete={completeTask}
                                                    task={t}
                                                    key={
                                                        "recordId" in t
                                                            ? String(t.recordId)
                                                            : t.id
                                                    }
                                                />
                                            ))}
                                    </details>
                                </>
                            )}
                            {page === "ideas" && (
                                <>
                                    <div className="tabs">
                                        <button
                                            className={
                                                !ideaArchive ? "selected" : ""
                                            }
                                            onClick={() =>
                                                setIdeaArchive(false)
                                            }
                                        >
                                            الأفكار المفتوحة
                                        </button>
                                        <button
                                            className={
                                                ideaArchive ? "selected" : ""
                                            }
                                            onClick={() => setIdeaArchive(true)}
                                        >
                                            الأرشيف
                                        </button>
                                    </div>
                                    <details className="idea-capture-details">
                                        <summary>التقاط فكرة بسرعة</summary>
                                        <QuickIdeaCapture
                                            save={saveQuickIdea}
                                        />
                                    </details>
                                    <div className="idea-grid">
                                        {sortedIdeas
                                            .slice(0, ideaLimit)
                                            .map((idea) => (
                                                <IdeaCard
                                                    key={idea.id}
                                                    idea={idea}
                                                    onActions={openActions}
                                                />
                                            ))}
                                    </div>
                                    {sortedIdeas.length > ideaLimit && (
                                        <button
                                            className="btn secondary load-more"
                                            onClick={() =>
                                                setIdeaLimit((n) => n + 30)
                                            }
                                        >
                                            عرض المزيد من الأفكار (
                                            {sortedIdeas.length - ideaLimit})
                                        </button>
                                    )}
                                    {!data.ideas.some(
                                        (i) => i.archived === ideaArchive,
                                    ) && (
                                        <div className="surface">
                                            <Empty
                                                icon={Lightbulb}
                                                title="امنح أفكارك مكانًا"
                                                body="عنوان واحد يكفي. التفاصيل تأتي لاحقًا، حين ترغب."
                                            />
                                        </div>
                                    )}
                                </>
                            )}
                            {page === "progress" && dashboard}
                            {["project", "step", "task", "idea"].includes(
                                page,
                            ) &&
                                detail && (
                                    <>
                                        <div className="detail-breadcrumb">
                                            <button
                                                className="text-btn"
                                                onClick={() =>
                                                    go(
                                                        page === "step"
                                                            ? `project/${currentStep!.projectId}`
                                                            : page === "project"
                                                              ? "projects"
                                                              : page === "task"
                                                                ? "tasks"
                                                                : "ideas",
                                                    )
                                                }
                                            >
                                                <ArrowRight size={16} />{" "}
                                                {page === "step"
                                                    ? "العودة للمشروع"
                                                    : "العودة للقائمة"}
                                            </button>
                                            <span>
                                                {page === "step"
                                                    ? pathFor(
                                                          currentStep!,
                                                          data.steps,
                                                          data.projects,
                                                      )
                                                    : kindNames[
                                                          page as EntityKind
                                                      ]}
                                            </span>
                                        </div>
                                        <div className="detail-layout">
                                            <section className="surface editor-surface">
                                                <div className="section-heading">
                                                    <h2>
                                                        <FileText size={20} />
                                                        التفاصيل والملاحظات
                                                    </h2>
                                                    {page === "project" ? (
                                                        <span className="badge">
                                                            {currentProject!
                                                                .archived
                                                                ? "مؤرشف"
                                                                : currentProject!
                                                                        .status ===
                                                                    "closed"
                                                                  ? "مغلق"
                                                                  : "نشط"}
                                                        </span>
                                                    ) : (
                                                        page !== "idea" && (
                                                            <Badge
                                                                status={
                                                                    page ===
                                                                    "step"
                                                                        ? hierarchy.nodes.get(
                                                                              currentStep!
                                                                                  .id,
                                                                          )!
                                                                              .status
                                                                        : currentTask!
                                                                              .status
                                                                }
                                                            />
                                                        )
                                                    )}
                                                </div>
                                                {page === "project" && (
                                                    <div className="detail-completion">
                                                        <CompletionButton
                                                            entityKey={`project/${id}`}
                                                            text
                                                            checked={
                                                                currentProject!
                                                                    .status ===
                                                                "closed"
                                                            }
                                                            label="المشروع"
                                                            onToggle={(
                                                                complete,
                                                            ) =>
                                                                completeProject(
                                                                    id,
                                                                    complete,
                                                                )
                                                            }
                                                        />
                                                        <p className="muted small">
                                                            يُتمّ المشروع
                                                            تلقائيًا عند اكتمال
                                                            خطواته بنسبة ١٠٠٪.
                                                            ويمكن إتمامه يدويًا
                                                            قبل ذلك دون تغيير
                                                            حالات الخطوات أو
                                                            نسبة التقدم.
                                                        </p>
                                                    </div>
                                                )}
                                                {page === "task" && (
                                                    <div className="detail-completion">
                                                        <CompletionButton
                                                            text
                                                            label="المهمة"
                                                            entityKey={
                                                                (
                                                                    currentTask as TaskView
                                                                )._cycleId
                                                                    ? `taskCycle/${(currentTask as TaskView)._cycleId}`
                                                                    : `task/${id}`
                                                            }
                                                            disabled={
                                                                (
                                                                    currentTask as TaskView
                                                                )._available ===
                                                                false
                                                            }
                                                            checked={
                                                                currentTask!
                                                                    .status ===
                                                                "done"
                                                            }
                                                            onToggle={(
                                                                value,
                                                                at,
                                                            ) =>
                                                                completeTask(
                                                                    currentTask!,
                                                                    value
                                                                        ? "done"
                                                                        : "todo",
                                                                    at,
                                                                )
                                                            }
                                                        />
                                                    </div>
                                                )}
                                                {page === "step" && (
                                                    <div className="detail-completion">
                                                        <CompletionButton
                                                            entityKey={`step/${id}`}
                                                            text
                                                            checked={
                                                                hierarchy.nodes.get(
                                                                    id,
                                                                )!.status ===
                                                                "done"
                                                            }
                                                            label={
                                                                currentStep!
                                                                    .kind ===
                                                                "stage"
                                                                    ? "المرحلة"
                                                                    : "الخطوة"
                                                            }
                                                            onToggle={(
                                                                complete,
                                                            ) =>
                                                                completeBranch(
                                                                    id,
                                                                    complete,
                                                                )
                                                            }
                                                        />
                                                        {hierarchy.children(
                                                            currentStep!
                                                                .projectId,
                                                            id,
                                                        ).length > 0 && (
                                                            <p className="muted small">
                                                                إتمام هذا الفرع
                                                                يُكمل كل الخطوات
                                                                داخله؛ وإعادة
                                                                فتحه تعيدها إلى
                                                                «لم تبدأ».
                                                            </p>
                                                        )}
                                                    </div>
                                                )}
                                                {page === "project" && (
                                                    <ProjectPacePanel
                                                        project={
                                                            detail as Project
                                                        }
                                                        plan={plansById.get(id)}
                                                        hierarchy={hierarchy}
                                                        work={pace.work}
                                                        clock={pace.clock}
                                                        settings={pace.settings}
                                                        commitments={
                                                            orderedToday(
                                                                data.tasks,
                                                                new Date(
                                                                    Math.max(
                                                                        pace.clock,
                                                                        Date.now(),
                                                                    ),
                                                                ),
                                                            ).filter(
                                                                ({ task }) =>
                                                                    task.status !==
                                                                    "done",
                                                            ).length
                                                        }
                                                    />
                                                )}
                                                <Editor
                                                    key={detail.id}
                                                    item={detail}
                                                    kind={page as EntityKind}
                                                    onError={setToast}
                                                />
                                                {page === "task" && (
                                                    <TaskDetails
                                                        task={
                                                            detail as TaskView
                                                        }
                                                    />
                                                )}
                                                {(page === "task" ||
                                                    page === "step") && (
                                                    <div className="status-controls">
                                                        <label>الحالة</label>
                                                        {page === "task" ? (
                                                            <TaskStatusControls
                                                                task={
                                                                    detail as TaskView
                                                                }
                                                                onComplete={(
                                                                    task,
                                                                    status,
                                                                    at,
                                                                ) =>
                                                                    completeTask(
                                                                        task,
                                                                        status,
                                                                        at,
                                                                        false,
                                                                    )
                                                                }
                                                            />
                                                        ) : data.steps.some(
                                                              (s) =>
                                                                  s.parentId ===
                                                                  id,
                                                          ) ? (
                                                            <p className="muted small">
                                                                حالة هذا الفرع
                                                                تُحسب تلقائيًا
                                                                من خطواته
                                                                النهائية.
                                                            </p>
                                                        ) : (
                                                            <div className="tabs">
                                                                {(
                                                                    [
                                                                        "todo",
                                                                        "doing",
                                                                        "done",
                                                                    ] as Status[]
                                                                ).map(
                                                                    (
                                                                        status,
                                                                    ) => (
                                                                        <button
                                                                            key={
                                                                                status
                                                                            }
                                                                            className={
                                                                                (
                                                                                    detail as Task
                                                                                )
                                                                                    .status ===
                                                                                status
                                                                                    ? "selected"
                                                                                    : ""
                                                                            }
                                                                            onClick={() =>
                                                                                run(
                                                                                    () =>
                                                                                        changeStatus(
                                                                                            "step",
                                                                                            id,
                                                                                            status,
                                                                                        ),
                                                                                )
                                                                            }
                                                                        >
                                                                            {
                                                                                statusNames[
                                                                                    status
                                                                                ]
                                                                            }
                                                                        </button>
                                                                    ),
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                {page === "project" && (
                                                    <Progress
                                                        hierarchy={hierarchy}
                                                        projectId={id}
                                                    />
                                                )}{" "}
                                                {page === "step" &&
                                                    data.steps.some(
                                                        (s) =>
                                                            s.parentId === id,
                                                    ) && (
                                                        <Progress
                                                            hierarchy={
                                                                hierarchy
                                                            }
                                                            projectId={
                                                                currentStep!
                                                                    .projectId
                                                            }
                                                            root={id}
                                                        />
                                                    )}
                                                <div className="detail-actions">
                                                    {page === "project" && (
                                                        <>
                                                            <button
                                                                className="btn secondary"
                                                                onClick={() =>
                                                                    run(() =>
                                                                        projectState(
                                                                            id,
                                                                            "archive",
                                                                        ),
                                                                    )
                                                                }
                                                            >
                                                                <Archive
                                                                    size={16}
                                                                />
                                                                {currentProject!
                                                                    .archived
                                                                    ? "إلغاء الأرشفة"
                                                                    : "أرشفة"}
                                                            </button>
                                                        </>
                                                    )}
                                                    {page === "idea" && (
                                                        <>
                                                            <button
                                                                className="btn secondary"
                                                                onClick={() =>
                                                                    setConfirm({
                                                                        text: "تحويل هذه الفكرة إلى مشروع؟ سيُنسخ العنوان والوصف، وتبقى الفكرة في الأرشيف.",
                                                                        run: async () => {
                                                                            const newId =
                                                                                await convertIdea(
                                                                                    id,
                                                                                    "project",
                                                                                );
                                                                            open(
                                                                                "project",
                                                                                newId,
                                                                            );
                                                                        },
                                                                    })
                                                                }
                                                            >
                                                                <FolderKanban
                                                                    size={16}
                                                                />
                                                                تحويل إلى مشروع
                                                            </button>
                                                            <button
                                                                className="btn secondary"
                                                                onClick={() =>
                                                                    setConfirm({
                                                                        text: "تحويل هذه الفكرة إلى مهمة؟ سيُنسخ العنوان والوصف، وتبقى الفكرة في الأرشيف.",
                                                                        run: async () => {
                                                                            const newId =
                                                                                await convertIdea(
                                                                                    id,
                                                                                    "task",
                                                                                );
                                                                            open(
                                                                                "task",
                                                                                newId,
                                                                            );
                                                                        },
                                                                    })
                                                                }
                                                            >
                                                                <CheckCheck
                                                                    size={16}
                                                                />
                                                                تحويل إلى مهمة
                                                            </button>
                                                            <button
                                                                className="btn secondary"
                                                                onClick={() =>
                                                                    run(() =>
                                                                        archiveIdea(
                                                                            id,
                                                                        ),
                                                                    )
                                                                }
                                                            >
                                                                <Archive
                                                                    size={16}
                                                                />
                                                                {currentIdea!
                                                                    .archived
                                                                    ? "إلغاء الأرشفة"
                                                                    : "أرشفة"}
                                                            </button>
                                                        </>
                                                    )}
                                                    <button
                                                        className="btn danger"
                                                        onClick={() =>
                                                            askDelete(
                                                                page as EntityKind,
                                                                detail,
                                                            )
                                                        }
                                                    >
                                                        <Trash2 size={16} />
                                                        حذف
                                                    </button>
                                                </div>
                                            </section>
                                            <section className="surface timeline">
                                                <h2>
                                                    رحلة{" "}
                                                    {
                                                        kindNames[
                                                            page as EntityKind
                                                        ]
                                                    }
                                                </h2>
                                                <dl>
                                                    {[
                                                        [
                                                            "أُنشئت",
                                                            detail.createdAt,
                                                        ],
                                                        [
                                                            "آخر تعديل",
                                                            detail.updatedAt,
                                                        ],
                                                        [
                                                            "بدء العمل",
                                                            detail.startedAt,
                                                        ],
                                                        [
                                                            "الإنجاز الحالي",
                                                            detail.completedAt,
                                                        ],
                                                    ].map(([label, value]) => (
                                                        <div key={label}>
                                                            <dt>{label}</dt>
                                                            <dd>
                                                                {date(value)}
                                                            </dd>
                                                        </div>
                                                    ))}
                                                </dl>
                                                {detail.completedAt && (
                                                    <p className="elapsed">
                                                        <CheckCheck size={17} />
                                                        {elapsed(
                                                            detail.createdAt,
                                                            detail.completedAt,
                                                        )}
                                                    </p>
                                                )}
                                                <p className="muted small">
                                                    عند إعادة الفتح يُمسح تاريخ
                                                    الإنجاز الحالي، ويبقى
                                                    الإنجاز السابق في السجل.
                                                    المدة زمن منقضٍ وليست ساعات
                                                    عمل.
                                                </p>
                                                <h3>سجل الأحداث</h3>
                                                <ol>
                                                    {data.events
                                                        .filter(
                                                            (e) =>
                                                                e.entityId ===
                                                                id,
                                                        )
                                                        .sort((a, b) =>
                                                            b.at.localeCompare(
                                                                a.at,
                                                            ),
                                                        )
                                                        .map((e) => (
                                                            <li key={e.id}>
                                                                <span className="dot" />
                                                                <div>
                                                                    {
                                                                        actions[
                                                                            e
                                                                                .action
                                                                        ]
                                                                    }
                                                                    <time>
                                                                        {date(
                                                                            e.at,
                                                                        )}
                                                                    </time>
                                                                </div>
                                                            </li>
                                                        ))}
                                                </ol>
                                            </section>
                                        </div>
                                        {(page === "project" ||
                                            page === "step") && (
                                            <section className="surface hierarchy">
                                                <div className="section-heading">
                                                    <h2>
                                                        {page === "project"
                                                            ? "المراحل والخطوات"
                                                            : "الخطوات الفرعية"}{" "}
                                                        <span className="count">
                                                            {page === "project"
                                                                ? hierarchy.metric(
                                                                      id,
                                                                  ).total
                                                                : hierarchy.metric(
                                                                      currentStep!
                                                                          .projectId,
                                                                      id,
                                                                  ).total}
                                                        </span>
                                                    </h2>
                                                    <div className="inline-actions">
                                                        {page === "project" && (
                                                            <button
                                                                className="btn secondary"
                                                                onClick={() =>
                                                                    setForm({
                                                                        kind: "step",
                                                                        projectId:
                                                                            id,
                                                                        stage: true,
                                                                    })
                                                                }
                                                            >
                                                                <Plus
                                                                    size={16}
                                                                />
                                                                مرحلة
                                                            </button>
                                                        )}
                                                        <button
                                                            className="btn secondary"
                                                            onClick={() =>
                                                                setForm({
                                                                    kind: "step",
                                                                    projectId:
                                                                        page ===
                                                                        "project"
                                                                            ? id
                                                                            : currentStep!
                                                                                  .projectId,
                                                                    parentId:
                                                                        page ===
                                                                        "step"
                                                                            ? id
                                                                            : undefined,
                                                                })
                                                            }
                                                        >
                                                            <Plus size={16} />
                                                            خطوة
                                                        </button>
                                                    </div>
                                                </div>
                                                <Tree
                                                    onActions={openActions}
                                                    onComplete={completeBranch}
                                                    hierarchy={hierarchy}
                                                    folded={folded}
                                                    setFolded={setFolded}
                                                    setForm={setForm}
                                                    run={run}
                                                    projectId={
                                                        page === "project"
                                                            ? id
                                                            : currentStep!
                                                                  .projectId
                                                    }
                                                    parentId={
                                                        page === "step"
                                                            ? id
                                                            : null
                                                    }
                                                />
                                                {!children(
                                                    data.steps,
                                                    page === "step" ? id : null,
                                                    page === "project"
                                                        ? id
                                                        : currentStep!
                                                              .projectId,
                                                ).length && (
                                                    <Empty
                                                        title="قسّم المسار إلى خطوات"
                                                        body="أضف مرحلة أو خطوة. الأرقام تتغير تلقائيًا مع الترتيب."
                                                    />
                                                )}
                                            </section>
                                        )}
                                    </>
                                )}
                            {["project", "step", "task", "idea"].includes(
                                page,
                            ) &&
                                !detail && (
                                    <Empty
                                        title="العنصر غير موجود"
                                        body="ربما حُذف هذا العنصر. عد إلى القائمة للمتابعة."
                                        action={
                                            <button
                                                className="btn secondary"
                                                onClick={() => go("home")}
                                            >
                                                الرئيسية
                                            </button>
                                        }
                                    />
                                )}
                            {page === "progress" && (
                                <PaceRecommendations
                                    rows={pace.recommendations}
                                    projects={data.projects}
                                    resting={isProjectRest(
                                        new Date(
                                            Math.max(pace.clock, Date.now()),
                                        ),
                                        pace.settings,
                                    )}
                                />
                            )}
                            {page === "backup" && (
                                <section className="surface backup-page">
                                    <ProjectCapacitySettings />
                                    <ProjectRestSettings />
                                    <ShieldCheck size={35} />
                                    <h2>
                                        بياناتك محلية. نسختك الاحتياطية بيدك.
                                    </h2>
                                    <p>
                                        حذف بيانات الموقع أو التطبيق قد يمحو
                                        قاعدة البيانات، حتى لو كان حذف سجل
                                        التصفح وحده لا يفعل ذلك عادةً. ننصح
                                        بتصدير نسخة احتياطية دورية وحفظها في
                                        مكان آمن.
                                    </p>
                                    <div className="backup-buttons">
                                        <button
                                            className="btn primary"
                                            onClick={() =>
                                                run(async () => {
                                                    await flushAllSaves();
                                                    await flushCompletions();
                                                    const text = JSON.stringify(
                                                        await snapshot(),
                                                        null,
                                                        2,
                                                    );
                                                    const url =
                                                        URL.createObjectURL(
                                                            new Blob([text], {
                                                                type: "application/json",
                                                            }),
                                                        );
                                                    const a =
                                                        document.createElement(
                                                            "a",
                                                        );
                                                    a.href = url;
                                                    a.download = `masar-${new Date().toISOString().slice(0, 10)}.json`;
                                                    a.click();
                                                    setTimeout(
                                                        () =>
                                                            URL.revokeObjectURL(
                                                                url,
                                                            ),
                                                        1000,
                                                    );
                                                }, "تم تصدير النسخة الاحتياطية.")
                                            }
                                        >
                                            <Download size={18} />
                                            تصدير JSON
                                        </button>
                                        <label className="btn secondary file-input">
                                            <Upload size={18} />
                                            استيراد نسخة
                                            <input
                                                aria-label="استيراد نسخة"
                                                type="file"
                                                accept=".json,application/json"
                                                onChange={(e) => {
                                                    const file =
                                                        e.target.files?.[0];
                                                    if (file)
                                                        void run(async () => {
                                                            if (
                                                                file.size >
                                                                20 * 1024 * 1024
                                                            )
                                                                throw new Error(
                                                                    "الملف أكبر من ٢٠ ميجابايت.",
                                                                );
                                                            setBackup(
                                                                parseBackup(
                                                                    await file.text(),
                                                                ),
                                                            );
                                                        });
                                                    e.target.value = "";
                                                }}
                                            />
                                        </label>
                                    </div>
                                    <p className="muted small">
                                        النسخة تشمل جميع المشاريع والعلاقات
                                        والملاحظات والمهام والأفكار وسجل
                                        الأحداث. تعامل مع ملف النسخة كملف شخصي
                                        خاص.
                                    </p>
                                    <hr />
                                    <div className="section-heading">
                                        <h2>
                                            <PanelTop size={20} />
                                            تثبيت مسار
                                        </h2>
                                        {install && (
                                            <button
                                                className="btn primary"
                                                onClick={() =>
                                                    run(async () => {
                                                        await install.prompt();
                                                        setInstall(null);
                                                    })
                                                }
                                            >
                                                تثبيت التطبيق
                                            </button>
                                        )}
                                    </div>
                                    <p>
                                        بعد تحميل التطبيق مرةً عبر HTTPS يمكنك
                                        استخدامه دون إنترنت. على أندرويد، افتحه
                                        في Chrome ثم اختر «تثبيت التطبيق» أو
                                        «إضافة إلى الشاشة الرئيسية». الاتصال
                                        بعنوان جهاز آخر عبر HTTP وحده لا يسمح
                                        بتثبيت PWA.
                                    </p>
                                    {refresh && (
                                        <button
                                            className="btn secondary"
                                            onClick={() =>
                                                run(async () => {
                                                    await flushAllSaves();
                                                    await flushCompletions();
                                                    await refresh();
                                                })
                                            }
                                        >
                                            تطبيق التحديث المتاح
                                        </button>
                                    )}
                                </section>
                            )}
                        </>
                    )}
                    <footer className="page-footer">
                        <Leaf size={14} /> خطوة واضحة، ذهن أهدأ.
                        <span>محفوظ محليًا على جهازك</span>
                    </footer>
                </main>
            </div>
            <button
                className="mobile-fab"
                aria-label="إضافة سريعة"
                aria-haspopup="dialog"
                aria-expanded={quick}
                onClick={() => setQuick(true)}
            >
                <Plus size={24} />
            </button>
            {capacityError && (
                <Dialog
                    title="حد المشاريع النشطة"
                    onClose={() => setCapacityError(null)}
                >
                    <CapacityOptions
                        error={capacityError}
                        onResolved={() => {
                            setCapacityError(null);
                            setToast("تم تحديث الاختيار؛ أعد محاولة التنشيط.");
                        }}
                        onCancel={() => setCapacityError(null)}
                    />
                </Dialog>
            )}
            {quick && (
                <Dialog
                    title="ماذا تريد أن تضيف؟"
                    className="add-menu"
                    onClose={() => setQuick(false)}
                >
                    <div className="quick-options">
                        {(
                            [
                                {
                                    kind: "project",
                                    icon: FolderKanban,
                                    description: "فكرة كبيرة، بخطوات واضحة",
                                },
                                {
                                    kind: "task",
                                    icon: CheckCheck,
                                    description: "شيء واحد تريد إنجازه",
                                },
                                {
                                    kind: "idea",
                                    icon: Lightbulb,
                                    description: "التقطها دون أي التزام",
                                },
                            ] as const
                        ).map((x) => (
                            <button
                                key={x.kind}
                                onClick={() => {
                                    setQuick(false);
                                    setForm({ kind: x.kind });
                                }}
                            >
                                <x.icon size={25} />
                                <div>
                                    <strong>
                                        {kindNames[x.kind]}{" "}
                                        {x.kind === "idea" || x.kind === "task"
                                            ? "جديدة"
                                            : "جديد"}
                                    </strong>
                                </div>
                                <ChevronLeft size={19} />
                            </button>
                        ))}
                    </div>
                </Dialog>
            )}
            {form && (
                <CreateForm
                    kind={form.stage ? "مرحلة" : kindNames[form.kind]}
                    taskForm={form.kind === "task"}
                    onClose={() => setForm(null)}
                    onSubmit={async (title, notes, options) => {
                        await create(
                            form.kind,
                            title,
                            notes,
                            form.projectId,
                            form.parentId ?? null,
                            form.stage,
                            options,
                        );
                        setForm(null);
                        setQuery("");
                        if (form.kind === "idea") {
                            setIdeaArchive(false);
                            setIdeaLimit(30);
                        }
                        setToast("تمت الإضافة.");
                        if (form.kind === "project") go("projects");
                        else if (form.kind === "task") {
                            setTaskFilter("all");
                            go("tasks");
                        } else if (form.kind === "idea") go("ideas");
                    }}
                />
            )}
            {confirm && (
                <Dialog title="تأكيد الإجراء" onClose={() => setConfirm(null)}>
                    <p className="dialog-text">{confirm.text}</p>
                    <div className="dialog-buttons">
                        <button
                            className="btn secondary"
                            onClick={() => setConfirm(null)}
                        >
                            إلغاء
                        </button>
                        <button
                            className="btn primary"
                            onClick={() => {
                                if (confirmLock.current) return;
                                confirmLock.current = true;
                                const action = confirm.run;
                                setConfirm(null);
                                void run(async () => {
                                    try {
                                        await action();
                                    } finally {
                                        confirmLock.current = false;
                                    }
                                });
                            }}
                        >
                            تأكيد
                        </button>
                    </div>
                </Dialog>
            )}
            {backup && (
                <Dialog
                    title="معاينة النسخة الاحتياطية"
                    onClose={() => setBackup(null)}
                >
                    <p className="dialog-text">
                        النسخة بتاريخ {date(backup.exportedAt)}، تحتوي على{" "}
                        {backup.projects.length} مشاريع و{backup.steps.length}{" "}
                        مراحل وخطوات و{backup.tasks.length} مهام و
                        {backup.ideas.length} أفكار و
                        {backup.taskCycles?.length ?? 0} دورات و
                        {backup.events.length} أحداث.
                    </p>
                    <p className="warning">
                        زر الاستبدال يحل النسخة محل جميع البيانات؛ زر الدمج
                        يضيفها بمعرفات مستقلة ويمنع تكرار الملف نفسه. صدّر نسخة
                        من بياناتك أولًا. يُطبّق الاستيراد كاملًا داخل معاملة
                        واحدة أو لا يُطبّق.
                    </p>
                    <p className="muted small">
                        الاستعادة والدمج يحفظان حالات المشاريع من الملف، حتى لو
                        تجاوزت الحد النشط؛ لا يُوقف أي مشروع تلقائيًا. النسخ
                        الجديدة تتضمن الأهداف وفترات الإيقاف وأحداث الخطوات
                        وقرارات التوصيات.
                    </p>
                    <div className="dialog-buttons">
                        <button
                            className="btn secondary"
                            onClick={() => setBackup(null)}
                        >
                            إلغاء
                        </button>
                        <button
                            className="btn primary"
                            onClick={() =>
                                void run(async () => {
                                    if (importLock.current) return;
                                    importLock.current = true;
                                    try {
                                        await flushAllSaves();
                                        await flushCompletions();
                                        await importBackup(backup);
                                        for (const key of Object.keys(
                                            localStorage,
                                        ).filter(
                                            (k) =>
                                                k.startsWith("masar-draft-") ||
                                                k.startsWith(
                                                    "masar-pending-completion/",
                                                ),
                                        ))
                                            localStorage.removeItem(key);
                                        setBackup(null);
                                        setDeleted(null);
                                        setToast("تم استيراد النسخة بالكامل.");
                                    } finally {
                                        importLock.current = false;
                                    }
                                })
                            }
                        >
                            تأكيد استبدال البيانات
                        </button>
                        <button
                            className="btn secondary"
                            onClick={() =>
                                void run(async () => {
                                    if (importLock.current) return;
                                    importLock.current = true;
                                    try {
                                        await flushAllSaves();
                                        await flushCompletions();
                                        const merged =
                                            await mergeBackup(backup);
                                        setBackup(null);
                                        setDeleted(null);
                                        setToast(
                                            merged
                                                ? "دُمجت النسخة بمعرفات مستقلة دون استبدال بياناتك. المشاريع القديمة فوق الحد تبقى كما هي."
                                                : "هذه النسخة دُمجت سابقًا؛ لم تُكرر البيانات.",
                                        );
                                    } finally {
                                        importLock.current = false;
                                    }
                                })
                            }
                        >
                            دمج دون استبدال
                        </button>
                    </div>
                </Dialog>
            )}
            {appearanceOpen && (
                <Dialog
                    title="المظهر والألوان"
                    onClose={() => setAppearanceOpen(false)}
                >
                    <label className="field">
                        الهوية
                        <select
                            data-dialog-autofocus
                            aria-label="الهوية"
                            value={identity}
                            onChange={(event) =>
                                setIdentity(event.target.value as Identity)
                            }
                        >
                            <option value="green">أخضر</option>
                            <option value="mono">أبيض وأسود</option>
                        </select>
                    </label>
                    <label className="field">
                        الوضع
                        <select
                            aria-label="الوضع"
                            value={mode}
                            onChange={(event) =>
                                setMode(event.target.value as ThemeMode)
                            }
                        >
                            <option value="light">فاتح</option>
                            <option value="dark">داكن</option>
                            <option value="system">اتباع النظام</option>
                        </select>
                    </label>
                    <p className="muted small">يُحفظ اختيارك على هذا الجهاز.</p>
                    <button
                        className="btn primary"
                        onClick={() => setAppearanceOpen(false)}
                    >
                        تم
                    </button>
                </Dialog>
            )}
            {context && (
                <Dialog
                    title={`إجراءات ${kindNames[context.kind]} «${context.item.title}»`}
                    className="context-sheet"
                    suppressInitialClick={context.fromHold}
                    position={context.position}
                    onClose={() => setContext(null)}
                >
                    <div className="context-actions">
                        <button
                            className="btn secondary"
                            data-dialog-autofocus
                            onClick={() => {
                                setContext(null);
                                setEditTarget(context.item.id);
                                open(context.kind, context.item.id);
                            }}
                        >
                            <NotebookPen size={17} />
                            تعديل الاسم والملاحظات
                        </button>
                        {context.kind === "step" && (
                            <button
                                className="btn secondary"
                                onClick={() => {
                                    setContext(null);
                                    setForm({
                                        kind: "step",
                                        projectId: (context.item as Step)
                                            .projectId,
                                        parentId: context.item.id,
                                    });
                                }}
                            >
                                <Plus size={17} />
                                إضافة خطوة داخله
                            </button>
                        )}
                        {(context.kind === "project" ||
                            context.kind === "idea") && (
                            <button
                                className="btn secondary"
                                onClick={() => {
                                    setContext(null);
                                    void run(async () => {
                                        await flushAllSaves();
                                        await flushCompletions();
                                        if (context.kind === "project")
                                            await projectState(
                                                context.item.id,
                                                "archive",
                                            );
                                        else await archiveIdea(context.item.id);
                                    });
                                }}
                            >
                                <Archive size={17} />
                                {(context.item as Project | Idea).archived
                                    ? "إلغاء الأرشفة"
                                    : "أرشفة"}
                            </button>
                        )}
                        {context.kind === "idea" &&
                            (["project", "task"] as const).map((kind) => (
                                <button
                                    key={kind}
                                    className="btn secondary"
                                    onClick={() => {
                                        setContext(null);
                                        setConfirm({
                                            text: `تحويل هذه الفكرة إلى ${kindNames[kind]}؟ سيُنسخ العنوان والوصف، وتبقى الفكرة في الأرشيف.`,
                                            run: async () => {
                                                await flushAllSaves();
                                                const newId = await convertIdea(
                                                    context.item.id,
                                                    kind,
                                                );
                                                open(kind, newId);
                                            },
                                        });
                                    }}
                                >
                                    تحويل إلى {kindNames[kind]}
                                </button>
                            ))}
                        <button
                            className="btn danger"
                            onClick={() => {
                                setContext(null);
                                askDelete(context.kind, context.item);
                            }}
                        >
                            <Trash2 size={17} />
                            حذف
                        </button>
                    </div>
                </Dialog>
            )}
            {toast && (
                <div className="toast" role="status">
                    <span>{toast}</span>
                    {stepUndo &&
                        !deleted &&
                        toast === "تم إتمام الخطوة أو المرحلة." && (
                            <button
                                className="text-btn"
                                onClick={() =>
                                    void run(async () => {
                                        const action = stepUndo;
                                        await db.transaction(
                                            "rw",
                                            db.tables,
                                            async () => {
                                                await setBranchCompletion(
                                                    action.id,
                                                    action.value,
                                                );
                                                if (action.reopen) {
                                                    const p =
                                                        await db.projects.get(
                                                            action.projectId,
                                                        );
                                                    if (p?.status === "closed")
                                                        await setProjectCompletion(
                                                            action.projectId,
                                                            false,
                                                        );
                                                }
                                            },
                                        );
                                        setStepUndo(null);
                                        setToast("تم التراجع عن إنجاز الخطوة.");
                                    })
                                }
                            >
                                تراجع عن إنجاز الخطوة
                            </button>
                        )}
                    {deleted && (
                        <button
                            className="text-btn"
                            onClick={() =>
                                void run(async () => {
                                    await undo(deleted);
                                    setDeleted(null);
                                    setToast("تمت الاستعادة.");
                                })
                            }
                        >
                            <RotateCcw size={15} />
                            تراجع
                        </button>
                    )}
                    <button
                        className="icon-btn"
                        aria-label="إخفاء الرسالة"
                        onClick={() => setToast("")}
                    >
                        <X size={17} />
                    </button>
                </div>
            )}
        </div>
    );
}
function CreateForm({
    kind,
    taskForm = false,
    onClose,
    onSubmit,
}: {
    kind: string;
    taskForm?: boolean;
    onClose: () => void;
    onSubmit: (
        title: string,
        notes: string,
        options?: TaskOptions,
    ) => Promise<void>;
}) {
    const [capacity, setCapacity] = useState<ActiveProjectLimitError | null>(
        null,
    );
    const [options, setOptions] = useState<TaskOptions>({});
    const [title, setTitle] = useState("");
    const [notes, setNotes] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const submitting = useRef(false);
    return (
        <Dialog
            title={`إضافة ${kind}`}
            onClose={() => {
                if (!submitting.current) onClose();
            }}
        >
            <form
                onSubmit={async (e) => {
                    e.preventDefault();
                    if (submitting.current) return;
                    if (!title.trim()) {
                        setError("أدخل اسمًا أولًا.");
                        return;
                    }
                    submitting.current = true;
                    setBusy(true);
                    try {
                        await onSubmit(
                            title,
                            notes,
                            taskForm ? options : undefined,
                        );
                    } catch (e) {
                        if (e instanceof ActiveProjectLimitError)
                            setCapacity(e);
                        setError(userError(e));
                        submitting.current = false;
                        setBusy(false);
                    }
                }}
            >
                <label className="field">
                    الاسم
                    <input
                        data-dialog-autofocus
                        disabled={busy}
                        required
                        maxLength={300}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder={`اسم ${kind}`}
                    />
                </label>
                <label className="field">
                    الملاحظات <span className="muted">(اختياري)</span>
                    <textarea
                        disabled={busy}
                        rows={4}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="ما الذي ترغب أن تتذكره؟"
                    />
                </label>
                {capacity && (
                    <CapacityOptions
                        error={capacity}
                        onResolved={() => {
                            setCapacity(null);
                            setError(
                                "تم تحديث الاختيار. اضغط إضافة لإعادة المحاولة.",
                            );
                        }}
                        onCancel={onClose}
                    />
                )}
                {taskForm && (
                    <TaskFields
                        value={options}
                        onChange={setOptions}
                        disabled={busy}
                    />
                )}
                {error && (
                    <p role="alert" className="error">
                        {error}
                    </p>
                )}
                <div className="dialog-buttons">
                    <button
                        type="button"
                        className="btn secondary"
                        disabled={busy}
                        onClick={onClose}
                    >
                        إلغاء
                    </button>
                    <button
                        disabled={busy}
                        className="btn primary"
                        type="submit"
                    >
                        <Plus size={17} />
                        {busy ? "جارٍ الحفظ…" : "إضافة"}
                    </button>
                </div>
            </form>
        </Dialog>
    );
}
function Editor({
    item,
    kind,
    onError,
}: {
    item: Base;
    kind: EntityKind;
    onError: (s: string) => void;
}) {
    const key = `masar-draft-${kind}-${item.id}`;
    function initial() {
        try {
            const draft = JSON.parse(localStorage.getItem(key) ?? "null");
            if (
                draft &&
                typeof draft.title === "string" &&
                typeof draft.notes === "string"
            )
                return draft as { title: string; notes: string };
        } catch {
            /* Ignore invalid local recovery data. */
        }
        return { title: item.title, notes: item.notes };
    }
    const [draft, setDraft] = useState(initial);
    const latest = useRef(draft);
    const saved = useRef({ title: item.title, notes: item.notes });
    const [save, setSave] = useState(
        draft.title !== item.title || draft.notes !== item.notes
            ? "مسودة مستعادة؛ اضغط حفظ لإتمامها"
            : "محفوظ تلقائيًا",
    );
    const [failed, setFailed] = useState(
        draft.title !== item.title || draft.notes !== item.notes,
    );
    const pending = useRef(0);
    const queue = useRef<SaveQueue | null>(null);
    if (!queue.current) queue.current = createSaveQueue(write);
    const dirty = () =>
        latest.current.title.trim() !== saved.current.title ||
        latest.current.notes !== saved.current.notes;
    useEffect(() => {
        const guard = (e: BeforeUnloadEvent) => {
            if (pending.current || dirty()) {
                e.preventDefault();
                e.returnValue = "";
            }
        };
        window.addEventListener("beforeunload", guard);
        const flush = () => {
            void queue.current!.flush().catch(() => {});
        };
        const hidden = () => {
            if (document.visibilityState === "hidden") flush();
        };
        document.addEventListener("visibilitychange", hidden);
        window.addEventListener("pagehide", flush);
        return () => {
            window.removeEventListener("beforeunload", guard);
            document.removeEventListener("visibilitychange", hidden);
            window.removeEventListener("pagehide", flush);
            void queue.current!.dispose().catch(() => {});
        };
    }, []);
    function edit(next: { title: string; notes: string }) {
        latest.current = next;
        setDraft(next);
        try {
            localStorage.setItem(key, JSON.stringify(next));
        } catch {
            onError(
                "تعذر حفظ مسودة الاستعادة. انتظر تأكيد الحفظ قبل إغلاق التطبيق.",
            );
        }
    }
    async function write(patch: EditPatch) {
        pending.current++;
        setSave("جارٍ الحفظ…");
        try {
            await update(kind, item.id, patch);
            saved.current = {
                ...saved.current,
                ...patch,
                title: patch.title?.trim() ?? saved.current.title,
            };
            if (!dirty()) {
                setSave("محفوظ تلقائيًا");
                setFailed(false);
                try {
                    localStorage.removeItem(key);
                } catch {
                    /* The primary database write succeeded. */
                }
            }
        } catch (e) {
            setSave("تعذر الحفظ؛ مسودتك محفوظة للاستعادة");
            setFailed(true);
            onError(userError(e));
            throw e;
        } finally {
            pending.current--;
        }
    }
    function schedule(patch: EditPatch) {
        setSave("جارٍ الحفظ…");
        queue.current!.schedule(patch);
    }
    function flush() {
        void queue.current!.flush().catch(() => {});
    }
    return (
        <>
            <label className="field">
                الاسم
                <input
                    aria-label="تعديل الاسم"
                    value={draft.title}
                    maxLength={300}
                    onChange={(e) => {
                        edit({ ...latest.current, title: e.target.value });
                        if (e.target.value.trim())
                            schedule({ title: e.target.value });
                    }}
                    onBlur={() => {
                        if (
                            latest.current.title.trim() &&
                            latest.current.title.trim() !== saved.current.title
                        )
                            schedule({ title: latest.current.title });
                        else if (!latest.current.title.trim())
                            edit({
                                ...latest.current,
                                title: saved.current.title,
                            });
                        flush();
                    }}
                />
            </label>
            <label className="field">
                الملاحظات
                <textarea
                    aria-label="ملاحظات العنصر"
                    rows={6}
                    value={draft.notes}
                    onChange={(e) => {
                        edit({ ...latest.current, notes: e.target.value });
                        schedule({ notes: e.target.value });
                    }}
                    onBlur={flush}
                    placeholder="سجّل التفاصيل، الروابط، أو أين توقفت…"
                />
            </label>
            <p className="autosave" aria-live="polite">
                <ShieldCheck size={14} />
                {save}
            </p>
            {failed && (
                <button
                    className="btn secondary"
                    onClick={() => {
                        schedule({
                            title: latest.current.title,
                            notes: latest.current.notes,
                        });
                        flush();
                    }}
                >
                    حفظ المسودة مجددًا
                </button>
            )}
        </>
    );
}
export default App;
