import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { habitDate } from "./habitCalendar";
import { uid } from "./model";
import { recordGradedHabit } from "./habitStore";
import { habitEvolution, habitLevelText } from "./habitProgression";
import type {
    Habit,
    HabitEntry,
    HabitLevel,
    HabitPath,
    HabitPhase,
    HabitPlan,
} from "./habitTypes";
import { userError } from "./userError";

export function GradedFields({
    phases,
    setPhases,
    current,
    setCurrent,
    lockedKeys = [],
}: {
    phases: HabitPhase[];
    setPhases: (v: HabitPhase[]) => void;
    current: HabitLevel;
    setCurrent: (v: HabitLevel) => void;
    lockedKeys?: string[];
}) {
    const change = (index: number, patch: Partial<HabitPhase>) =>
        setPhases(phases.map((p, i) => (i === index ? { ...p, ...patch } : p)));
    return (
        <div className="graded-fields">
            <p className="small muted">
                ابدأ بخطوة سهلة، ثم غيّر المستوى بقرارك. لا يرفع مسار المستوى
                تلقائيًا.
            </p>
            <label className="field">
                المرحلة المعتمدة
                <select
                    aria-label="المرحلة المعتمدة"
                    value={current.phaseKey}
                    onChange={(e) =>
                        setCurrent({
                            phaseKey: e.target.value,
                            target: phases.find(
                                (p) => p.key === e.target.value,
                            )!.start,
                        })
                    }
                >
                    {phases.map((p) => (
                        <option key={p.key} value={p.key}>
                            {p.label || "مرحلة جديدة"} · {p.unit}
                        </option>
                    ))}
                </select>
            </label>
            <label className="field">
                المستوى الحالي
                <input
                    type="number"
                    min="0"
                    max="1000000000"
                    step="0.001"
                    required
                    value={current.target}
                    onChange={(e) =>
                        setCurrent({
                            ...current,
                            target: e.target.valueAsNumber,
                        })
                    }
                />
            </label>
            <details>
                <summary>المراحل والوحدات والهدف النهائي</summary>
                {phases.map((p, i) => (
                    <fieldset key={p.key} className="habit-phase">
                        <legend>المرحلة {i + 1}</legend>
                        <label className="field">
                            اسم المرحلة
                            <input
                                required
                                maxLength={300}
                                value={p.label}
                                readOnly={lockedKeys.includes(p.key)}
                                onChange={(e) =>
                                    change(i, { label: e.target.value })
                                }
                            />
                        </label>
                        <label className="field">
                            وحدة القياس
                            <input
                                required
                                maxLength={50}
                                value={p.unit}
                                readOnly={lockedKeys.includes(p.key)}
                                onChange={(e) =>
                                    change(i, { unit: e.target.value })
                                }
                            />
                        </label>
                        <div className="habit-number-grid">
                            {(
                                [
                                    ["start", "بداية سهلة"],
                                    ["target", "الهدف النهائي"],
                                    ["step", "خطوة الزيادة"],
                                ] as const
                            ).map(([key, label]) => (
                                <label key={key} className="field">
                                    {label}
                                    <input
                                        type="number"
                                        required
                                        min={key === "step" ? "0.001" : "0"}
                                        max="1000000000"
                                        step="0.001"
                                        value={p[key]}
                                        onChange={(e) =>
                                            change(i, {
                                                [key]: e.target.valueAsNumber,
                                            })
                                        }
                                    />
                                </label>
                            ))}
                        </div>
                        {lockedKeys.includes(p.key) && (
                            <p className="muted small">
                                الوحدة محفوظة للتاريخ. لتغيير النشاط أو وحدته
                                أضف مرحلة جديدة؛ لا يعاد تفسير السجل.
                            </p>
                        )}
                    </fieldset>
                ))}
                <button
                    type="button"
                    className="btn secondary"
                    disabled={phases.length >= 30}
                    onClick={() =>
                        setPhases([
                            ...phases,
                            {
                                key: uid(),
                                label: `مرحلة ${phases.length + 1}`,
                                unit: "مرة",
                                start: 1,
                                target: 20,
                                step: 1,
                            },
                        ])
                    }
                >
                    إضافة مرحلة صعوبة اختيارية
                </button>
            </details>
        </div>
    );
}
export function GradedRecord({
    habit,
    plan,
    date,
    entry,
}: {
    habit: Habit;
    plan: HabitPlan;
    date: string;
    entry?: HabitEntry;
}) {
    const [amount, setAmount] = useState(
        entry?.result.kind === "graded" ? String(entry.result.amount) : "",
    );
    const [difficulty, setDifficulty] = useState<
        HabitEntry["difficulty"] | null
    >(entry?.difficulty);
    const [busy, setBusy] = useState(false),
        [error, setError] = useState("");
    const lock = useRef(false);
    const phase = plan.phases.find((p) => p.key === plan.current?.phaseKey)!;
    const save = async (undo = false) => {
        if (lock.current) return;
        lock.current = true;
        setBusy(true);
        setError("");
        try {
            if (!undo && !amount.trim())
                throw new Error("أدخل الكمية الفعلية أولًا.");
            await recordGradedHabit(
                habit.id,
                date,
                undo ? null : Number(amount),
                difficulty,
            );
            if (undo) setAmount("");
        } catch (e) {
            setError(userError(e));
        } finally {
            lock.current = false;
            setBusy(false);
        }
    };
    return (
        <div
            className="graded-record"
            aria-label={`تسجيل كمية «${habit.title}»`}
        >
            <label className="field">
                الكمية الفعلية ({phase.unit})
                <input
                    aria-label={`كمية «${habit.title}»`}
                    type="number"
                    min="0"
                    max="1000000000"
                    step="0.001"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            void save();
                        }
                    }}
                />
            </label>
            <button
                className="btn secondary"
                disabled={busy}
                onClick={() => save()}
            >
                {entry ? "تعديل التسجيل" : "سجّل"}
            </button>
            {entry && (
                <button
                    className="text-btn"
                    disabled={busy}
                    onClick={() => save(true)}
                >
                    تراجع
                </button>
            )}
            <details>
                <summary>كيف كان المستوى؟ (اختياري)</summary>
                <label className="field">
                    الصعوبة
                    <select
                        value={difficulty ?? ""}
                        onChange={(e) =>
                            setDifficulty(
                                (e.target.value || null) as
                                    HabitEntry["difficulty"] | null,
                            )
                        }
                    >
                        <option value="">دون تقييم</option>
                        <option value="easy">سهل</option>
                        <option value="okay">مناسب</option>
                        <option value="hard">مرهق</option>
                    </select>
                </label>
            </details>
            {error && (
                <p className="warning" role="alert">
                    {error}
                </p>
            )}
        </div>
    );
}
export function HabitEvolutionPanel({
    habit,
    plans,
    paths,
    at,
}: {
    habit: Habit;
    plans: HabitPlan[];
    paths: HabitPath[];
    at: Date;
}) {
    const entries = useLiveQuery(
        () => db.habitEntries.where("habitId").equals(habit.id).toArray(),
        [habit.id],
    );
    const current = [...plans]
        .filter((p) => p.effectiveDate <= habitDate(at, habit.timeZone))
        .sort((a, b) => a.revision - b.revision)
        .at(-1);
    // The caller's date helper is used below; this panel is an indexed per-habit history, never a home-wide archive read.
    if (!entries || !current) return <p role="status">جارٍ قراءة التطور…</p>;
    const metric = habitEvolution(habit, plans, paths, entries, current, at);
    return (
        <section className="habit-evolution" aria-label="التطور الموثق">
            <h3>التطور الموثق</h3>
            <p>المستوى المعتمد: {habitLevelText(current)}</p>
            <strong>
                {metric.percent === null
                    ? "لا توجد نسبة موثقة بعد"
                    : `${metric.percent}٪ تطور موثق`}
            </strong>
            <p className="small muted">{metric.reason}</p>
            {metric.proven && (
                <p>
                    آخر مستوى موثق: {metric.proven.target}{" "}
                    {
                        current.phases.find(
                            (p) => p.key === metric.proven?.phaseKey,
                        )?.unit
                    }{" "}
                    · آخر تسجيل {metric.date}. البيانات القديمة لا تثبت قدرة
                    حالية.
                </p>
            )}
            <details>
                <summary>تاريخ الخطط والمستويات</summary>
                {[...plans]
                    .sort((a, b) => b.revision - a.revision)
                    .map((p) => (
                        <p key={p.id} className="small">
                            مراجعة {p.revision} · من {p.effectiveDate} ·{" "}
                            {habitLevelText(p)} ·{" "}
                            {p.phases
                                .map(
                                    (x) =>
                                        `${x.label}: ${x.start}–${x.target} ${x.unit}`,
                                )
                                .join(" / ")}
                        </p>
                    ))}
                <p className="small muted">
                    تغيير نطاق المراحل أو الهدف ينشئ سلسلة قياس جديدة؛ لا نحول
                    كميات قديمة إلى مقياس مختلف. سجلاتها وخططها تبقى محفوظة.
                </p>
            </details>
        </section>
    );
}
