import { useMemo, useRef, useState } from "react";
import type { Project } from "./model";
import type { ProjectPlan, StepWork, PaceSettings } from "./paceTypes";
import type { Hierarchy } from "./hierarchy";
import {
    accelerationOptions,
    effectiveTarget,
    paused,
    projectPace,
    type Acceleration,
} from "./projectPace";
import {
    adoptAcceleration,
    saveProjectGoal,
    setProjectPaused,
} from "./projectPaceStore";
import { Dialog } from "./Dialog";
import { userError } from "./userError";
import { CapacityOptions } from "./ProjectCapacity";
import { ActiveProjectLimitError } from "./db";
export function PaceSummary({
    project,
    plan,
    hierarchy,
    work,
    clock,
    settings,
}: {
    project: Project;
    plan?: ProjectPlan;
    hierarchy: Hierarchy;
    work: StepWork[];
    clock: number;
    settings?: PaceSettings;
}) {
    const pace = useMemo(
        () =>
            projectPace(
                project,
                plan,
                hierarchy,
                work,
                new Date(Math.max(clock, Date.now())),
                settings,
            ),
        [project, plan, hierarchy, work, clock, settings],
    );
    return (
        <div className="pace-summary">
            <p>
                <span className="muted">الوتيرة المطلوبة لكل يوم عمل:</span>{" "}
                {pace.paused
                    ? "متوقفة مؤقتًا"
                    : pace.required === undefined
                      ? pace.days === 0
                          ? "انتهى الموعد المستهدف؛ راجع الخطة"
                          : pace.workingDays === 0
                            ? "لا توجد أيام عمل متبقية قبل الهدف؛ راجع الخطة"
                            : "أضف هدفًا زمنيًا"
                      : `${pace.required.toLocaleString("ar", { maximumFractionDigits: 1 })} خطوة / يوم عمل`}
            </p>
            {plan?.goal && (
                <p className="small muted">
                    الموعد المستهدف {pace.target} ·{" "}
                    {plan.goal.deadline === "fixed" ? "إلزامي لا يتأجل" : "مرن"}
                </p>
            )}
            {pace.workingDays !== undefined && (
                <p className="small muted">
                    {pace.workingDays} أيام عمل متبقية ضمن {pace.days} يومًا
                    تقويميًا؛ الراحة لا تؤجل الهدف.
                </p>
            )}
        </div>
    );
}
export function ProjectPacePanel({
    project,
    plan,
    hierarchy,
    work,
    clock,
    commitments = 0,
    settings,
}: {
    project: Project;
    plan?: ProjectPlan;
    hierarchy: Hierarchy;
    work: StepWork[];
    clock: number;
    commitments?: number;
    settings?: PaceSettings;
}) {
    const at = useMemo(
        () => new Date(Math.max(clock, Date.now())),
        [clock, project, plan, hierarchy, work],
    );
    const pace = useMemo(
        () => projectPace(project, plan, hierarchy, work, at, settings),
        [project, plan, hierarchy, work, at, settings],
    );
    const [dialog, setDialog] = useState<"goal" | "levels" | "pause" | null>(
        null,
    );
    const [kind, setKind] = useState<"none" | "duration" | "date">("none"),
        [value, setValue] = useState(""),
        [deadline, setDeadline] = useState<"flexible" | "fixed">("flexible");
    const [choice, setChoice] = useState<Acceleration | null>(null),
        [preview, setPreview] = useState<{
            revision: number;
            remaining: number;
        } | null>(null);
    const [error, setError] = useState(""),
        [capacity, setCapacity] = useState<ActiveProjectLimitError | null>(
            null,
        ),
        [busy, setBusy] = useState(false),
        lock = useRef(false);
    async function perform(fn: () => Promise<unknown>) {
        if (lock.current) return;
        lock.current = true;
        setBusy(true);
        setError("");
        setCapacity(null);
        try {
            await fn();
            setDialog(null);
            setChoice(null);
        } catch (e) {
            setError(userError(e));
            if (e instanceof ActiveProjectLimitError) setCapacity(e);
        } finally {
            lock.current = false;
            setBusy(false);
        }
    }
    function edit() {
        setKind(plan?.goal?.kind ?? "none");
        setValue(
            plan?.goal
                ? plan.goal.kind === "duration"
                    ? String(plan.goal.days)
                    : effectiveTarget(plan, at)!
                : "",
        );
        setDeadline(plan?.goal?.deadline ?? "flexible");
        setError("");
        setDialog("goal");
    }
    const options = useMemo(
        () => accelerationOptions(pace, at, plan?.goal?.timeZone, commitments),
        [pace, at, plan?.goal?.timeZone, commitments],
    );
    return (
        <section className="project-pace surface" aria-label="وتيرة المشروع">
            <div className="section-heading">
                <h2>وتيرة المشروع</h2>
                <button className="btn secondary" onClick={edit}>
                    إعداد الهدف الزمني
                </button>
            </div>
            <PaceSummary
                {...{ project, plan, hierarchy, work, clock, settings }}
            />
            {pace.restDay && (
                <p className="muted small">
                    اليوم راحة من المشاريع؛ الإنجاز اختياري ويُحفظ بصورة طبيعية.
                </p>
            )}
            <div className="pace-metrics">
                <div>
                    <span className="muted small">
                        الوتيرة الفعلية لكل يوم عمل مرصود
                    </span>
                    <strong>
                        {pace.actual === undefined
                            ? "لا يوجد رصد كافٍ"
                            : `${pace.actual.toLocaleString("ar", { maximumFractionDigits: 1 })} خطوة / يوم عمل`}
                    </strong>
                </div>
                <div>
                    <span className="muted small">موعد الانتهاء المتوقع</span>
                    <strong>
                        {!pace.remaining
                            ? "لا توجد خطوات متبقية"
                            : pace.paused
                              ? "معلّق أثناء الإيقاف"
                              : (pace.forecast ??
                                (pace.sufficient
                                    ? "لا يمكن تقدير موعد دون إنجاز حديث"
                                    : "لا توجد بيانات كافية للتوقع"))}
                    </strong>
                </div>
            </div>
            <p className="muted small">
                التوقع تقديري بعد 7 أيام عمل متاحة للرصد وإنجاز في 3 أيام عمل
                مختلفة على الأقل، ويشمل أيام السكون. يحدّ التوقع من أثر دفعات
                الإنجاز الكبيرة باستخدام وسيط أيام النشاط. عدد الخطوات لا يقيس
                جهدها؛ لا تُغيّر الحسابات هدفك تلقائيًا.
            </p>
            <p className="muted small">
                يُستبعد السكون في الراحة من الرصد. إنجاز الراحة الاختياري:{" "}
                {pace.restCompleted} خطوة في نافذة الرصد؛ يحسّن التقدم ويقلّل
                المتبقي، ولا يُفترض وتيرة مستدامة لأيام العمل.
            </p>
            {pace.allocation && pace.remaining > 0 && (
                <p>
                    توزيع عملي للمتبقي:{" "}
                    {pace.allocation.highDays > 0 &&
                        `${pace.allocation.highDays} أيام × ${pace.allocation.high} خطوات؛ `}
                    {pace.allocation.lowDays} أيام × {pace.allocation.low}{" "}
                    خطوات. يُعاد التوزيع حسب المتبقي، دون تجزئة خطوة.
                </p>
            )}
            {plan?.approvedPace && (
                <p className="small">
                    الخطة المعتمدة: {plan.approvedPace} خطوة لكل يوم عمل.
                </p>
            )}
            <div className="pace-actions">
                <button
                    className="btn secondary"
                    disabled={
                        !plan?.goal ||
                        !pace.remaining ||
                        pace.paused ||
                        project.status !== "active" ||
                        project.archived
                    }
                    onClick={() => {
                        setError("");
                        setChoice(null);
                        setPreview({
                            revision: plan!.revision,
                            remaining: pace.remaining,
                        });
                        setDialog("levels");
                    }}
                >
                    معاينة مستويات التسريع
                </button>
                {project.status === "active" && !project.archived && (
                    <button
                        className="btn secondary"
                        onClick={() => {
                            setError("");
                            setCapacity(null);
                            setDialog("pause");
                        }}
                    >
                        {paused(plan) ? "استئناف المشروع" : "إيقاف مؤقت"}
                    </button>
                )}
            </div>
            <details>
                <summary>تفاصيل الرصد والإيقاف</summary>
                <p className="small muted">
                    يبدأ الرصد الفعلي من{" "}
                    {plan
                        ? new Date(plan.since).toLocaleDateString("ar")
                        : "تفعيل الميزة"}
                    ، دون اختلاق إنجازات سابقة. نافذة القياس آخر 28 يومًا،
                    وتُستبعد الراحة والإيقاف معًا دون مضاعفة. أيام العمل
                    المرصودة المتاحة: {pace.observationDays.toFixed(1)}؛ أيام
                    الإنجاز: {pace.workDays}.
                </p>
                {plan?.pauses.map((p) => (
                    <p className="small" key={p.start}>
                        إيقاف {new Date(p.start).toLocaleString("ar")} ←{" "}
                        {p.end ? new Date(p.end).toLocaleString("ar") : "مستمر"}
                    </p>
                ))}
            </details>
            {dialog && (
                <Dialog
                    title={
                        dialog === "goal"
                            ? "هدف المشروع الزمني"
                            : dialog === "levels"
                              ? "مستويات التسريع"
                              : paused(plan)
                                ? "تأكيد استئناف المشروع"
                                : "تأكيد الإيقاف المؤقت"
                    }
                    onClose={() => {
                        if (!lock.current) setDialog(null);
                    }}
                >
                    {dialog === "goal" && (
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                void perform(() =>
                                    saveProjectGoal(
                                        project.id,
                                        kind === "none"
                                            ? undefined
                                            : { kind, value, deadline },
                                    ),
                                );
                            }}
                        >
                            <label className="field">
                                نوع الهدف
                                <select
                                    value={kind}
                                    disabled={busy}
                                    onChange={(e) => {
                                        setKind(e.target.value as typeof kind);
                                        setValue("");
                                    }}
                                >
                                    <option value="none">بدون هدف زمني</option>
                                    <option value="duration">
                                        مدة بالأيام
                                    </option>
                                    <option value="date">تاريخ انتهاء</option>
                                </select>
                            </label>
                            {kind !== "none" && (
                                <>
                                    <label className="field">
                                        {kind === "duration"
                                            ? "المدة بالأيام"
                                            : "التاريخ المستهدف"}
                                        <input
                                            type={
                                                kind === "duration"
                                                    ? "number"
                                                    : "date"
                                            }
                                            min={
                                                kind === "duration"
                                                    ? 1
                                                    : undefined
                                            }
                                            max={
                                                kind === "duration"
                                                    ? 36500
                                                    : undefined
                                            }
                                            required
                                            value={value}
                                            disabled={busy}
                                            onChange={(e) =>
                                                setValue(e.target.value)
                                            }
                                        />
                                    </label>
                                    <label className="field">
                                        طبيعة الموعد
                                        <select
                                            value={deadline}
                                            disabled={busy}
                                            onChange={(e) =>
                                                setDeadline(
                                                    e.target
                                                        .value as typeof deadline,
                                                )
                                            }
                                        >
                                            <option value="flexible">
                                                مرن — يتوقف أثناء الإيقاف
                                            </option>
                                            <option value="fixed">
                                                إلزامي خارجي — لا يتأجل بالإيقاف
                                            </option>
                                        </select>
                                    </label>
                                    <p className="muted small">
                                        تبدأ المدة الجديدة من اليوم وتحتسب اليوم
                                        ضمنها. الحفظ يستبدل الهدف السابق صراحة،
                                        ويحتفظ بسجل الإنجاز والإيقاف.
                                    </p>
                                </>
                            )}
                            <button className="btn primary" disabled={busy}>
                                حفظ الهدف
                            </button>
                        </form>
                    )}
                    {dialog === "levels" && (
                        <>
                            <p className="muted">
                                الهدف الحالي {pace.target}. اختر مستوى لمعاينة
                                أثره قبل التأكيد.
                            </p>
                            {["تسريع مريح", "ضغط خفيف", "ضغط قوي"].map(
                                (name, i) => {
                                    const o = options.find(
                                        (o) => o.level === i + 1,
                                    );
                                    return (
                                        <article
                                            className="pace-option"
                                            key={name}
                                        >
                                            <h3>{name}</h3>
                                            {o ? (
                                                <>
                                                    <p>
                                                        {o.daily} خطوة / يوم عمل
                                                        · انتهاء {o.finish} ·
                                                        تبكير {o.saved} أيام
                                                    </p>
                                                    <p className="muted small">
                                                        {o.reason}
                                                    </p>
                                                    <button
                                                        className="btn secondary"
                                                        disabled={busy}
                                                        onClick={() => {
                                                            setChoice(o);
                                                            setPreview({
                                                                revision:
                                                                    plan!
                                                                        .revision,
                                                                remaining:
                                                                    pace.remaining,
                                                            });
                                                        }}
                                                    >
                                                        معاينة {name}
                                                    </button>
                                                </>
                                            ) : (
                                                <p className="muted small">
                                                    لا تدعم البيانات الحالية
                                                    مستوى مختلفًا يسبق الهدف. لن
                                                    نرفع الوتيرة افتراضيًا
                                                    باعتبارها قدرة مؤكدة.
                                                </p>
                                            )}
                                        </article>
                                    );
                                },
                            )}
                            {plan?.goal?.deadline === "fixed" && (
                                <p className="warning">
                                    موعدك إلزامي؛ لا تغيّره مستويات التسريع.
                                    اعتماد المستوى يغيّر الوتيرة فقط، ويبقى
                                    الموعد الإلزامي ثابتًا.
                                </p>
                            )}
                            {choice && preview && (
                                <div
                                    className="pace-confirm"
                                    aria-label="معاينة الخطة"
                                >
                                    <p>
                                        {plan?.goal?.deadline === "fixed"
                                            ? `يبقى الموعد الإلزامي ${pace.target}، والانتهاء الحسابي بالخطة ${choice.finish}،`
                                            : `سيصبح الهدف المرن ${choice.finish}،`}
                                        والوتيرة المعتمدة {choice.daily} خطوة
                                        لكل يوم عمل.{" "}
                                        {choice.hypothetical
                                            ? "هذه خطة افتراضية وليست توصية شخصية."
                                            : "يمكن تعديلها أو التراجع عنها من إعداد الهدف."}
                                    </p>
                                    <button
                                        className="btn primary"
                                        disabled={busy}
                                        onClick={() =>
                                            void perform(() =>
                                                adoptAcceleration(
                                                    project.id,
                                                    choice.daily,
                                                    choice.finish,
                                                    preview.revision,
                                                    preview.remaining,
                                                    true,
                                                ),
                                            )
                                        }
                                    >
                                        تأكيد اعتماد الخطة
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                    {dialog === "pause" && (
                        <>
                            <p>
                                {paused(plan)
                                    ? "سيُستأنف المشروع بالمدة المرنة المتبقية، مع تطبيق حد المشاريع النشطة."
                                    : "سيُوقف المشروع مؤقتًا وتختفي اقتراحاته اليومية. تُجمّد المدة المرنة فقط؛ الموعد الإلزامي يبقى ثابتًا. يمكنك الاستئناف في أي وقت."}
                            </p>
                            <button
                                className="btn primary"
                                disabled={busy}
                                onClick={() =>
                                    void perform(() =>
                                        setProjectPaused(
                                            project.id,
                                            !paused(plan),
                                        ),
                                    )
                                }
                            >
                                {paused(plan)
                                    ? "تأكيد الاستئناف"
                                    : "تأكيد الإيقاف"}
                            </button>
                        </>
                    )}
                    {error && (
                        <p className="warning" role="alert">
                            {error}
                        </p>
                    )}
                    {capacity && (
                        <CapacityOptions
                            error={capacity}
                            onResolved={() => {
                                setCapacity(null);
                                setError(
                                    "تم تحديث الاختيار. اضغط التأكيد لإعادة المحاولة.",
                                );
                            }}
                        />
                    )}
                </Dialog>
            )}
        </section>
    );
}
