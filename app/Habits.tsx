import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
    Check,
    ChevronLeft,
    ChevronRight,
    MoreVertical,
    Pause,
    Play,
    Plus,
    Sprout,
} from "lucide-react";
import { Temporal } from "@js-temporal/polyfill";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { Dialog } from "./Dialog";
import { GlassChoices } from "./GlassChoices";
import { useWallClock } from "./useWallClock";
import { useHabitData } from "./useHabitData";
import {
    habitCommitment,
    habitDate,
    habitDates,
    habitDay,
    habitDayNames,
    habitPaused,
    habitToday,
    habitWeek,
} from "./habitCalendar";
import {
    archiveHabitPath,
    recordSimpleHabit,
    restoreHabitPath,
    saveHabitPath,
    saveSimpleHabit,
    saveGradedHabit,
    setHabitArchived,
    setHabitPaused,
} from "./habitStore";
import type {
    Habit,
    HabitEntry,
    HabitPath,
    HabitPlan,
    HabitSchedule,
    HabitPhase,
    HabitLevel,
} from "./habitTypes";
import {
    GradedFields,
    GradedRecord,
    HabitEvolutionPanel,
} from "./GradedHabits";
import { habitLevelText } from "./habitProgression";
import { uid } from "./model";
import { HabitSuggestionPanel } from "./HabitSuggestions";
import { HabitImportDialog } from "./HabitImportDialog";
import { userError } from "./userError";
import { HabitFeedback } from "./HabitFeedback";
import { feedbackText } from "./habitFeedback";
import { assessedHabitEntries } from "./habitAssessments";
import { HabitDeletionDialog } from "./HabitDeletionDialog";
import "./habits.css";

type HabitData = NonNullable<ReturnType<typeof useHabitData>>;
// Transient presentation state only. No persisted fields, no user records,
// and a bounded cache; data is always read again from IndexedDB on return.
const habitScreens = new Map<
    string,
    { limit: number; month: string | null; y: number }
>();
const localZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const scheduleText = (s?: HabitSchedule) =>
    !s
        ? "لم تبدأ بعد"
        : s.repeat === "daily"
          ? "كل يوم"
          : s.weekdays.map((d) => habitDayNames[d]).join("، ");
const dayText = (date: string) =>
    new Intl.DateTimeFormat("ar", {
        day: "numeric",
        month: "long",
        timeZone: "UTC",
    }).format(new Date(date + "T12:00:00Z"));

function HabitCheck({
    habit,
    date,
    entry,
    onRecorded,
}: {
    habit: Habit;
    date: string;
    entry?: HabitEntry;
    onRecorded?: (id: string) => void;
}) {
    const saved = entry?.result.kind === "simple" && entry.result.done;
    const [pending, setPending] = useState<boolean | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const lock = useRef(false);
    const value = pending ?? saved;

    return (
        <div className="habit-check-wrap">
            <button
                type="button"
                className={`task-check ${value ? "checked" : ""}`}
                aria-label={`${value ? "التراجع عن" : "تسجيل"} عادة «${habit.title}»`}
                aria-pressed={value}
                aria-busy={saving}
                disabled={saving}
                onClick={async () => {
                    if (lock.current) return;
                    lock.current = true;
                    setSaving(true);
                    setPending(!value);
                    setError("");
                    try {
                        const entryId = await recordSimpleHabit(
                            habit.id,
                            date,
                            !value,
                        );
                        if (!value) onRecorded?.(entryId);
                    } catch (e) {
                        setPending(null);
                        setError(userError(e));
                    } finally {
                        lock.current = false;
                        setPending(null);
                        setSaving(false);
                    }
                }}
            >
                {value && <Check size={18} />}
            </button>
            {error && (
                <p className="warning small" role="alert">
                    {error}
                </p>
            )}
        </div>
    );
}
function HabitRow({
    habit,
    data,
    at,
    compact = false,
    onRecorded,
}: {
    habit: Habit;
    data: HabitData;
    at: Date;
    compact?: boolean;
    onRecorded?: (id: string) => void;
}) {
    const date = habitDate(at, habit.timeZone);
    const plans = data.plans.filter((p) => p.habitId === habit.id);
    const day = habitDay(habit, plans, data.paths, data.entries, date, at);
    const stopped =
        habitPaused(habit.pauses, at) ||
        habitPaused(
            data.paths.find((p) => p.id === day.plan?.pathId)?.pauses ?? [],
            at,
        );
    return (
        <div
            className={`habit-row ${day.done ? "is-done" : ""}`}
            data-habit-id={habit.id}
        >
            <div className="habit-row-copy">
                <a href={`#habit/${encodeURIComponent(habit.id)}`}>
                    <strong>{habit.title}</strong>
                </a>
                {!compact && (
                    <small className="muted">
                        {stopped
                            ? "موقوفة مؤقتًا"
                            : day.neutral
                              ? "يوم محايد · التسجيل اختياري"
                              : !day.scheduled
                                ? "غير مستهدفة اليوم"
                                : scheduleText(day.plan?.schedule)}
                    </small>
                )}
                {!compact && habit.kind === "graded" && (
                    <small>{habitLevelText(day.plan)}</small>
                )}
            </div>
            {habit.kind === "simple" &&
                day.plan &&
                !habit.archived &&
                day.start <= at.getTime() && (
                    <HabitCheck
                        habit={habit}
                        date={date}
                        entry={day.entry}
                        onRecorded={onRecorded}
                    />
                )}
            {habit.kind === "graded" &&
                day.plan &&
                !habit.archived &&
                day.start <= at.getTime() && (
                    <GradedRecord
                        key={`${date}/${day.plan.id}/${JSON.stringify(day.entry ?? null)}`}
                        habit={habit}
                        plan={day.plan}
                        date={date}
                        entry={day.entry}
                        onRecorded={onRecorded}
                    />
                )}
            <a
                className="icon-btn"
                aria-label={`تفاصيل عادة «${habit.title}»`}
                href={`#habit/${encodeURIComponent(habit.id)}`}
            >
                <ChevronLeft size={18} />
            </a>
            {habit.kind === "simple" && (
                <HabitFeedback
                    key={JSON.stringify(day.entry ?? null)}
                    entry={day.entry}
                />
            )}
        </div>
    );
}
export function TodayHabitsCard({
    data,
    rows,
    at,
}: {
    data?: HabitData;
    rows: ReturnType<typeof habitToday>;
    at: Date;
}) {
    const [lastRecordedId, setLastRecordedId] = useState<string | null>(null);
    if (!data)
        return (
            <section className="home-habits" aria-label="عاداتي اليوم">
                <p className="muted" role="status">
                    جارٍ قراءة عادات اليوم…
                </p>
            </section>
        );

    const hiddenRecord = rows.find(
        (r) =>
            r.entry?.id === lastRecordedId &&
            !rows.slice(0, 3).some((v) => v.habit.id === r.habit.id),
    );
    return (
        <section className="home-habits" aria-label="عاداتي اليوم">
            <div className="section-heading">
                <h2>
                    عاداتي اليوم{" "}
                    <span className="count">
                        {rows.filter((r) => r.done).length}/{rows.length}
                    </span>
                </h2>
                <a className="text-btn" href="#habits/today">
                    كل العادات <ChevronLeft size={16} />
                </a>
            </div>
            {data.error ? (
                <p role="alert" className="warning">
                    {data.error}
                </p>
            ) : rows.length ? (
                <div className="surface sky-glass habit-list">
                    {rows.slice(0, 3).map((row) => (
                        <HabitRow
                            key={row.habit.id}
                            compact
                            habit={row.habit}
                            data={data}
                            at={at}
                            onRecorded={setLastRecordedId}
                        />
                    ))}
                </div>
            ) : (
                <p className="compact-empty muted sky-glass">
                    لا عادات مطلوبة اليوم.{" "}
                    <a className="text-btn" href="#habits">
                        مساراتي وعاداتي
                    </a>
                </p>
            )}
            {hiddenRecord && (
                <div
                    className="home-record-feedback"
                    role="region"
                    aria-label="تقييم آخر تسجيل"
                >
                    <HabitFeedback
                        key={JSON.stringify(hiddenRecord.entry ?? null)}
                        entry={hiddenRecord.entry}
                        title={`تم تسجيل «${hiddenRecord.habit.title}» · التقييم والمدة`}
                    />
                </div>
            )}
        </section>
    );
}
export function HabitEditor({
    kind,
    habit,
    path,
    defaultPath,
    onClose,
    onSaved,
}: {
    kind: "habit" | "path";
    habit?: Habit;
    path?: HabitPath;
    defaultPath?: string;
    onClose: () => void;
    onSaved?: (id: string) => void;
}) {
    const date = habitDate(new Date(), localZone());
    const data = useHabitData(date, date);
    const lock = useRef(false);
    const editing = !!habit || !!path;
    const title =
        kind === "path"
            ? editing
                ? "تعديل المسار"
                : "مسار جديد"
            : editing
              ? "تعديل العادة"
              : "عادة جديدة";
    // Keep a single Dialog mounted while indexed reads resolve, so Escape,
    // close animation and focus restoration cannot be lost during loading.
    return (
        <Dialog
            title={title}
            onClose={onClose}
            canClose={() => !lock.current}
            className="habit-dialog"
        >
            {!data ? (
                <p role="status">جارٍ القراءة…</p>
            ) : data.error ? (
                <p role="alert">{data.error}</p>
            ) : (
                <HabitForm
                    key={habit?.id ?? path?.id ?? kind}
                    kind={kind}
                    habit={habit}
                    path={path}
                    defaultPath={defaultPath}
                    data={data}
                    onClose={onClose}
                    onSaved={onSaved}
                    lock={lock}
                />
            )}
        </Dialog>
    );
}

function HabitForm({
    kind,
    habit,
    path,
    defaultPath,
    data,
    onClose,
    onSaved,
    lock,
}: {
    kind: "habit" | "path";
    habit?: Habit;
    path?: HabitPath;
    defaultPath?: string;
    data: HabitData;
    lock: { current: boolean };
    onClose: () => void;
    onSaved?: (id: string) => void;
}) {
    const latest = data.plans
        .filter((p) => p.habitId === habit?.id)
        .sort((a, b) => a.revision - b.revision)
        .at(-1);
    const [habitKind, setHabitKind] = useState<"simple" | "graded">(
        habit?.kind ?? "simple",
    );
    const [phases, setPhases] = useState<HabitPhase[]>(
        latest?.phases.length
            ? structuredClone(latest.phases)
            : [
                  {
                      key: uid(),
                      label: "المستوى الأول",
                      unit: "مرة",
                      start: 1,
                      target: 20,
                      step: 1,
                  },
              ],
    );
    const [current, setCurrent] = useState<HabitLevel>(
        latest?.current ?? { phaseKey: phases[0].key, target: 1 },
    );
    const [name, setName] = useState(habit?.title ?? path?.title ?? "");
    const [pathId, setPathId] = useState(habit?.pathId ?? defaultPath ?? "");
    const [repeat, setRepeat] = useState<"daily" | "weekly">(
        latest?.schedule.repeat ?? "daily",
    );
    const [days, setDays] = useState(
        latest?.schedule.repeat === "weekly"
            ? latest.schedule.weekdays
            : [6, 0, 1, 2, 3, 4, 5],
    );
    const [start, setStart] = useState(habitDate(new Date(), localZone()));
    const [busy, setBusy] = useState(false),
        [error, setError] = useState("");
    return (
        <form
            onSubmit={async (e) => {
                e.preventDefault();
                if (lock.current) return;
                lock.current = true;
                setBusy(true);
                setError("");
                try {
                    const id =
                        kind === "path"
                            ? await saveHabitPath({
                                  id: path?.id,
                                  title: name,
                              })
                            : await (
                                  habitKind === "graded"
                                      ? saveGradedHabit
                                      : saveSimpleHabit
                              )({
                                  id: habit?.id,
                                  title: name,
                                  pathId: pathId || null,
                                  schedule:
                                      repeat === "daily"
                                          ? { repeat: "daily" }
                                          : {
                                                repeat: "weekly",
                                                weekdays: days,
                                            },
                                  startDate: start,
                                  phases,
                                  current,
                              });
                    onSaved?.(id);
                    onClose();
                } catch (e) {
                    setError(userError(e));
                } finally {
                    lock.current = false;
                    setBusy(false);
                }
            }}
        >
            <label className="field">
                {kind === "path" ? "اسم المسار" : "اسم العادة"}
                <input
                    required
                    maxLength={300}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoFocus
                    data-dialog-autofocus
                />
            </label>
            {kind === "habit" && (
                <>
                    {!habit && (
                        <GlassChoices className="tabs" aria-label="نوع العادة">
                            <button
                                type="button"
                                className={
                                    habitKind === "simple" ? "selected" : ""
                                }
                                onClick={() => setHabitKind("simple")}
                            >
                                بسيطة
                            </button>
                            <button
                                type="button"
                                className={
                                    habitKind === "graded" ? "selected" : ""
                                }
                                onClick={() => setHabitKind("graded")}
                            >
                                كمية متدرجة
                            </button>
                        </GlassChoices>
                    )}
                    {habitKind === "graded" && (
                        <GradedFields
                            phases={phases}
                            setPhases={setPhases}
                            current={current}
                            setCurrent={setCurrent}
                            lockedKeys={latest?.phases.map((p) => p.key)}
                        />
                    )}
                    <label className="field">
                        المسار
                        <select
                            value={pathId}
                            onChange={(e) => setPathId(e.target.value)}
                        >
                            <option value="">عادة مستقلة</option>
                            {data.paths
                                .filter((p) => !p.deletedAt)
                                .map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.title}
                                    </option>
                                ))}
                        </select>
                    </label>
                    <GlassChoices className="tabs" aria-label="جدول العادة">
                        <button
                            type="button"
                            className={repeat === "daily" ? "selected" : ""}
                            onClick={() => setRepeat("daily")}
                        >
                            يوميًا
                        </button>
                        <button
                            type="button"
                            className={repeat === "weekly" ? "selected" : ""}
                            onClick={() => setRepeat("weekly")}
                        >
                            أيام محددة
                        </button>
                    </GlassChoices>
                    {repeat === "weekly" && (
                        <div
                            className="habit-weekdays"
                            role="group"
                            aria-label="أيام العادة"
                        >
                            {habitWeek.map((d) => (
                                <button
                                    key={d}
                                    type="button"
                                    aria-pressed={days.includes(d)}
                                    className={`btn secondary ${days.includes(d) ? "selected" : ""}`}
                                    onClick={() =>
                                        setDays((old) =>
                                            old.includes(d)
                                                ? old.filter((n) => n !== d)
                                                : [...old, d],
                                        )
                                    }
                                >
                                    {habitDayNames[d]}
                                </button>
                            ))}
                        </div>
                    )}
                    {!habit && (
                        <label className="field">
                            تاريخ البداية
                            <input
                                type="date"
                                required
                                min={habitDate(new Date(), localZone())}
                                value={start}
                                onChange={(e) => setStart(e.target.value)}
                            />
                        </label>
                    )}
                    <p className="muted small">
                        {habit
                            ? "تغييرات المستوى والهدف والجدول وعضوية المسار تسري من الغد، أو من تاريخ البداية إن كانت لاحقًا. يبقى سجل الأيام السابقة كما هو."
                            : "التسجيل بسيط أو بكمية فعلية وفق نوع العادة. يمكن تسجيل أداء اختياري في يوم غير مستهدف."}
                    </p>
                </>
            )}
            {error && (
                <p className="warning" role="alert">
                    {error}
                </p>
            )}
            <div className="habit-actions">
                <button className="btn primary" type="submit" disabled={busy}>
                    {busy ? "جارٍ الحفظ…" : "حفظ"}
                </button>
                <button
                    className="btn secondary"
                    type="button"
                    disabled={busy}
                    onClick={onClose}
                >
                    إلغاء
                </button>
            </div>
        </form>
    );
}
function Commitment({
    done,
    eligible,
    percent,
}: {
    done: number;
    eligible: number;
    percent: number | null;
}) {
    return (
        <p className="habit-commitment">
            {percent === null ? (
                "لا أيام مستهدفة مؤهلة مغلقة في الفترة"
            ) : (
                <>
                    <strong>{percent}٪ التزام</strong> · {done} من {eligible}{" "}
                    أيام عادات مؤهلة مغلقة
                </>
            )}
        </p>
    );
}
export function HabitsPage({
    page,
    id,
    onBack,
}: {
    page: string;
    id: string;
    onBack: (fallback: string) => void;
}) {
    const clock = useWallClock(),
        at = new Date(Math.max(clock, Date.now()));
    const screenKey = page + "/" + id;
    const [savedScreen] = useState(() => habitScreens.get(screenKey));
    const [month, setMonth] = useState<string | null>(
        savedScreen?.month ?? null,
    );
    const archived = id === "archive";
    const [limit, setLimit] = useState(savedScreen?.limit ?? 30);
    const screenState = useRef({ month, limit });
    screenState.current = { month, limit };
    const scrollPosition = useRef(savedScreen?.y ?? 0);
    const scrollRestored = useRef(!savedScreen);
    useLayoutEffect(() => {
        const capture = () => {
            if (scrollRestored.current) scrollPosition.current = window.scrollY;
        };
        window.addEventListener("scroll", capture, { passive: true });
        window.addEventListener("hashchange", capture);
        return () => {
            window.removeEventListener("scroll", capture);
            window.removeEventListener("hashchange", capture);
            habitScreens.delete(screenKey);
            habitScreens.set(screenKey, {
                ...screenState.current,
                y: scrollPosition.current,
            });
            if (habitScreens.size > 20)
                habitScreens.delete(habitScreens.keys().next().value!);
        };
    }, [screenKey]);
    const [form, setForm] = useState<"habit" | "path" | null>(null);
    const [importing, setImporting] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [menu, setMenu] = useState(false),
        [confirm, setConfirm] = useState(false),
        [busy, setBusy] = useState(false),
        [error, setError] = useState("");
    const actionLock = useRef(false);
    // Month is anchored to the habit's captured timezone as soon as metadata is read.
    const [zone, setZone] = useState(localZone);
    const today = habitDate(at, zone),
        currentMonth = month ?? today.slice(0, 7) + "-01";
    const from = currentMonth,
        to = Temporal.PlainDate.from(from)
            .add({ months: 1 })
            .subtract({ days: 1 })
            .toString();
    const data = useHabitData(from, to);
    const ready = !!data;
    useLayoutEffect(() => {
        if (!ready || !savedScreen) return;
        let second = 0;
        // Restore after indexed data supplies the real list height and after
        // the existing route-level restoration. No navigation or input delay.
        const first = requestAnimationFrame(() => {
            second = requestAnimationFrame(() => {
                window.scrollTo(0, savedScreen.y);
                scrollPosition.current = window.scrollY;
                scrollRestored.current = true;
            });
        });
        return () => {
            cancelAnimationFrame(first);
            cancelAnimationFrame(second);
        };
    }, [ready, savedScreen]);
    const habit = data?.habits.find((h) => h.id === id),
        path = data?.paths.find((p) => p.id === id);
    useEffect(() => {
        if (habit) setZone(habit.timeZone);
    }, [habit?.timeZone]);
    if (!data) return <p role="status">جارٍ قراءة العادات…</p>;
    const run = async (operation: () => Promise<unknown>) => {
        if (actionLock.current) return;
        actionLock.current = true;
        setBusy(true);
        setError("");
        try {
            await operation();
            setMenu(false);
            setConfirm(false);
        } catch (e) {
            setError(userError(e));
        } finally {
            actionLock.current = false;
            setBusy(false);
        }
    };
    const heading = (
        <div className="habit-toolbar">
            <button className="text-btn" onClick={() => onBack("habits")}>
                الرجوع
            </button>
            <a href="#habits" className="text-btn">
                مساراتي
            </a>
            <button
                className="icon-btn"
                aria-label="خيارات العادة أو المسار"
                onClick={() => setMenu(true)}
            >
                <MoreVertical size={20} />
            </button>
        </div>
    );
    const pickMonth = (
        <div className="habit-month-nav">
            <button
                className="icon-btn"
                aria-label="الشهر السابق"
                onClick={() =>
                    setMonth(
                        Temporal.PlainDate.from(from)
                            .subtract({ months: 1 })
                            .toString(),
                    )
                }
            >
                <ChevronRight size={18} />
            </button>
            <strong>
                {new Intl.DateTimeFormat("ar", {
                    month: "long",
                    year: "numeric",
                    timeZone: "UTC",
                }).format(new Date(from + "T12:00:00Z"))}
            </strong>
            <button
                className="icon-btn"
                aria-label="الشهر التالي"
                onClick={() =>
                    setMonth(
                        Temporal.PlainDate.from(from)
                            .add({ months: 1 })
                            .toString(),
                    )
                }
            >
                <ChevronLeft size={18} />
            </button>
            <button className="text-btn" onClick={() => setMonth(null)}>
                هذا الشهر
            </button>
        </div>
    );
    let content;
    if (page === "habit" && habit) {
        const plans = data.plans.filter((p) => p.habitId === habit.id),
            latest = plans.sort((a, b) => a.revision - b.revision).at(-1);
        const date = habitDate(at, habit.timeZone),
            day = habitDay(habit, plans, data.paths, data.entries, date, at);
        const metric = habitCommitment(
            habit,
            plans,
            data.paths,
            data.entries,
            from,
            to,
            at,
        );
        const offset = Temporal.PlainDate.from(from).dayOfWeek % 7;
        const activePath = data.paths.find((p) => p.id === habit.pathId);
        content = (
            <>
                {heading}
                <section
                    className="surface sky-glass habit-detail"
                    aria-label="تفاصيل العادة"
                >
                    <div className="section-heading">
                        <h2>{habit.title}</h2>
                        <span className="muted small">
                            {habit.archived
                                ? "مؤرشفة"
                                : habitPaused(habit.pauses, at)
                                  ? "موقوفة مؤقتًا"
                                  : habit.kind === "graded"
                                    ? "عادة كمية متدرجة"
                                    : "عادة بسيطة"}
                        </span>
                    </div>
                    <>
                        <HabitRow habit={habit} data={data} at={at} />
                        <p className="muted small">
                            {activePath?.title ?? "عادة مستقلة"} ·{" "}
                            {scheduleText(day.plan?.schedule)} ·{" "}
                            {habit.timeZone}
                        </p>
                        {latest && latest.effectiveDate > date && (
                            <p className="habit-notice">
                                تغيير مخطط من {dayText(latest.effectiveDate)}:{" "}
                                {scheduleText(latest.schedule)} ·{" "}
                                {data.paths.find((p) => p.id === latest.pathId)
                                    ?.title ?? "عادة مستقلة"}
                            </p>
                        )}
                        <p className="muted small">
                            اليوم الجاري قيد الإتاحة ولا يُحسب إخفاقًا. الأيام
                            المتقاطعة مع الإيقاف محايدة، والتسجيل فيها اختياري.
                            أيام راحة المشاريع لا تؤثر هنا.
                        </p>
                        {habit.kind === "graded" && (
                            <HabitEvolutionPanel
                                habit={habit}
                                plans={plans}
                                paths={data.paths}
                                at={at}
                            />
                        )}
                        {habit.kind === "graded" && (
                            <HabitSuggestionPanel
                                habit={habit}
                                plans={plans}
                                paths={data.paths}
                                at={at}
                            />
                        )}
                        {pickMonth}
                        <Commitment {...metric} />
                        <div
                            className="habit-calendar"
                            aria-label="تقويم العادة"
                        >
                            {habitWeek.map((d) => (
                                <span key={d} className="habit-calendar-label">
                                    {habitDayNames[d]}
                                </span>
                            ))}
                            {Array.from(
                                { length: (offset + 1) % 7 },
                                (_, i) => (
                                    <span
                                        key={`blank-${i}`}
                                        aria-hidden="true"
                                    />
                                ),
                            )}
                            {habitDates(from, to).map((d) => {
                                const cell = habitDay(
                                    habit,
                                    plans,
                                    data.paths,
                                    data.entries,
                                    d,
                                    at,
                                );
                                return (
                                    <span
                                        key={d}
                                        className={`habit-calendar-day state-${cell.state} ${cell.done ? "has-entry" : ""} ${d === date ? "is-today" : ""}`}
                                        title={`${dayText(d)} · ${cell.state === "neutral" ? "محايد" : cell.state === "unscheduled" ? "غير مستهدف" : cell.state === "before" ? "قبل البداية" : cell.state === "future" ? "مستقبلي" : cell.done ? "تم" : cell.state === "open" ? "جارٍ" : "لم يتم"}`}
                                    >
                                        {Number(d.slice(-2))}
                                        {cell.done && <Check size={11} />}
                                    </span>
                                );
                            })}
                        </div>
                        <p className="muted small">
                            أخضر: تم · خط خفيف: اليوم · رمادي: غير مستهدف أو
                            محايد. لا يُنشأ سجل فشل للأيام الفائتة.
                        </p>
                        <HistoryEditor
                            habit={habit}
                            plans={plans}
                            data={data}
                            from={from}
                            to={to}
                            at={at}
                        />
                    </>
                </section>
            </>
        );
    } else if (page === "habit-path" && path) {
        const current = data.habits.filter(
            (h) => h.pathId === path.id && !h.archived,
        );
        const metrics = data.habits.map((h) =>
            habitCommitment(
                h,
                data.plans.filter((p) => p.habitId === h.id),
                data.paths,
                data.entries,
                from,
                to,
                at,
                path.id,
            ),
        );
        const eligible = metrics.reduce((s, m) => s + m.eligible, 0),
            done = metrics.reduce((s, m) => s + m.done, 0);
        content = (
            <>
                {heading}
                <section
                    className="surface sky-glass habit-detail"
                    aria-label="تفاصيل المسار"
                >
                    <h2>{path.title}</h2>
                    <p className="muted">
                        {path.deletedAt
                            ? "مسار مؤرشف؛ بقيت عاداته مستقلة وسجلاته محفوظة."
                            : habitPaused(path.pauses, at)
                              ? "المسار موقوف مؤقتًا"
                              : "عادات صغيرة، في اتجاه واحد"}
                    </p>
                    {pickMonth}
                    <Commitment
                        eligible={eligible}
                        done={done}
                        percent={
                            eligible
                                ? Math.round((done / eligible) * 100)
                                : null
                        }
                    />
                    <p className="muted small">
                        الحساب وفق عضوية كل عادة التاريخية؛ نقل العادة لا ينقل
                        أيامها القديمة.
                    </p>
                    {!path.deletedAt && (
                        <div className="habit-actions">
                            <button
                                className="btn secondary"
                                onClick={() => setForm("habit")}
                            >
                                <Plus size={17} />
                                عادة جديدة في المسار
                            </button>
                            <a className="text-btn" href="#habits">
                                نقل عادة موجودة من خيارات تعديلها
                            </a>
                        </div>
                    )}
                    <div className="habit-list">
                        {current.slice(0, limit).map((h) => (
                            <HabitRow
                                key={h.id}
                                habit={h}
                                data={data}
                                at={at}
                            />
                        ))}
                        {current.length > limit && (
                            <button
                                className="text-btn habit-load-more"
                                onClick={() => setLimit((v) => v + 30)}
                            >
                                عرض المزيد من العادات ({current.length - limit})
                            </button>
                        )}
                        {!current.length && (
                            <p className="muted">
                                لا عادات حالية في هذا المسار.
                            </p>
                        )}
                    </div>
                </section>
            </>
        );
    } else if (page === "habit" || page === "habit-path")
        content = (
            <section className="surface sky-glass">
                <h2>العنصر غير موجود</h2>
                <a href="#habits">العودة إلى العادات</a>
            </section>
        );
    else {
        const standalone = data.habits
            .filter(
                (h) =>
                    h.archived === archived && (archived || h.pathId === null),
            )
            .sort(
                (a, b) =>
                    a.createdAt.localeCompare(b.createdAt) ||
                    a.id.localeCompare(b.id),
            );
        const todays = habitToday(
            data.habits,
            data.plans,
            data.paths,
            data.entries,
            at,
        );
        content = (
            <>
                <div className="habit-toolbar">
                    <h2>مساراتي</h2>
                    <div className="habit-actions">
                        <button
                            className="btn secondary"
                            onClick={() => setImporting(true)}
                        >
                            استيراد عادات
                        </button>
                        <button
                            className="btn secondary"
                            onClick={() => setForm("habit")}
                        >
                            عادة جديدة
                        </button>
                        <button
                            className="btn secondary"
                            onClick={() => setForm("path")}
                        >
                            مسار جديد
                        </button>
                    </div>
                </div>
                <GlassChoices className="tabs" aria-label="عرض العادات">
                    <button
                        className={
                            id !== "today" && !archived ? "selected" : ""
                        }
                        onClick={() => {
                            location.hash = "habits";
                        }}
                    >
                        الكل
                    </button>
                    <button
                        className={id === "today" ? "selected" : ""}
                        onClick={() => {
                            location.hash = "habits/today";
                        }}
                    >
                        اليوم
                    </button>
                    <button
                        className={archived ? "selected" : ""}
                        onClick={() => {
                            location.hash = "habits/archive";
                        }}
                    >
                        الأرشيف
                    </button>
                </GlassChoices>
                {id === "today" ? (
                    <section
                        className="surface sky-glass habit-list"
                        aria-label="قائمة عادات اليوم"
                    >
                        <h2>
                            عاداتي اليوم · {todays.filter((r) => r.done).length}
                            /{todays.length}
                        </h2>
                        {todays.map((r) => (
                            <HabitRow
                                key={r.habit.id}
                                habit={r.habit}
                                data={data}
                                at={at}
                            />
                        ))}
                        {!todays.length && (
                            <p className="muted">
                                لا عادات مطلوبة اليوم. التسجيل الاختياري متاح من
                                تفاصيل العادة.
                            </p>
                        )}
                    </section>
                ) : (
                    <>
                        <div className="habit-path-grid">
                            {data.paths
                                .filter((p) => !!p.deletedAt === archived)
                                .sort(
                                    (a, b) =>
                                        a.order - b.order ||
                                        a.id.localeCompare(b.id),
                                )
                                .map((p) => (
                                    <a
                                        key={p.id}
                                        className="surface sky-glass habit-path-card"
                                        href={`#habit-path/${encodeURIComponent(p.id)}`}
                                    >
                                        <Sprout size={22} />
                                        <div>
                                            <h3>{p.title}</h3>
                                            <p className="muted small">
                                                {p.deletedAt
                                                    ? "مؤرشف"
                                                    : habitPaused(p.pauses, at)
                                                      ? "موقوف مؤقتًا"
                                                      : `${data.habits.filter((h) => h.pathId === p.id && !h.archived).length} عادات`}
                                            </p>
                                        </div>
                                        <ChevronLeft size={18} />
                                    </a>
                                ))}
                        </div>
                        <section
                            className="surface sky-glass habit-list"
                            aria-label={
                                archived
                                    ? "العادات المؤرشفة"
                                    : "العادات المستقلة"
                            }
                        >
                            <h2>
                                {archived ? "العادات المؤرشفة" : "عادات مستقلة"}
                            </h2>
                            {standalone.slice(0, limit).map((h) => (
                                <HabitRow
                                    key={h.id}
                                    habit={h}
                                    data={data}
                                    at={at}
                                />
                            ))}
                            {standalone.length > limit && (
                                <button
                                    className="text-btn habit-load-more"
                                    onClick={() => setLimit((v) => v + 30)}
                                >
                                    عرض المزيد من العادات (
                                    {standalone.length - limit})
                                </button>
                            )}
                            {!data.habits.some(
                                (h) =>
                                    h.archived === archived &&
                                    (archived || h.pathId === null),
                            ) && (
                                <p className="muted">
                                    {archived
                                        ? "لا عادات مؤرشفة."
                                        : "ابدأ بعادة بسيطة، دون الحاجة إلى مسار."}
                                </p>
                            )}
                        </section>
                    </>
                )}
            </>
        );
    }
    return (
        <div className="habits-area">
            {data.error && (
                <p className="warning" role="alert">
                    {data.error}
                </p>
            )}
            {error && (
                <p className="warning" role="alert">
                    {error}
                </p>
            )}
            {content}
            {form && (
                <HabitEditor
                    kind={form}
                    habit={
                        form === "habit" && page === "habit" ? habit : undefined
                    }
                    path={
                        form === "path" && page === "habit-path"
                            ? path
                            : undefined
                    }
                    defaultPath={page === "habit-path" ? path?.id : undefined}
                    onClose={() => setForm(null)}
                    onSaved={(newId) => {
                        location.hash = `${form === "habit" ? "habit" : "habit-path"}/${encodeURIComponent(newId)}`;
                    }}
                />
            )}
            {importing && (
                <HabitImportDialog onClose={() => setImporting(false)} />
            )}
            {menu && (
                <Dialog
                    title="خيارات العادات"
                    className="context-sheet"
                    onClose={() => setMenu(false)}
                    canClose={() => !actionLock.current}
                >
                    <div className="habit-menu">
                        {(habit || path) && !path?.deletedAt && (
                            <button
                                className="btn secondary"
                                onClick={() => {
                                    setMenu(false);
                                    setForm(habit ? "habit" : "path");
                                }}
                            >
                                تعديل {habit ? "العادة" : "المسار"}
                            </button>
                        )}
                        {(habit || path) &&
                            !path?.deletedAt &&
                            !habit?.archived && (
                                <button
                                    className="btn secondary"
                                    disabled={busy}
                                    onClick={() =>
                                        run(() =>
                                            setHabitPaused(
                                                habit ? "habit" : "path",
                                                id,
                                                !habitPaused(
                                                    (habit ?? path)!.pauses,
                                                    at,
                                                ),
                                            ),
                                        )
                                    }
                                >
                                    {habitPaused(
                                        (habit ?? path)!.pauses,
                                        at,
                                    ) ? (
                                        <Play size={16} />
                                    ) : (
                                        <Pause size={16} />
                                    )}{" "}
                                    {habitPaused((habit ?? path)!.pauses, at)
                                        ? "استئناف"
                                        : "إيقاف مؤقت"}
                                </button>
                            )}
                        {habit && (
                            <button
                                className="btn secondary"
                                disabled={busy}
                                onClick={() =>
                                    habit.archived
                                        ? run(() => setHabitArchived(id, false))
                                        : (setMenu(false), setConfirm(true))
                                }
                            >
                                {habit.archived
                                    ? "استعادة العادة"
                                    : "أرشفة العادة"}
                            </button>
                        )}
                        {path && (
                            <button
                                className="btn secondary"
                                disabled={busy}
                                onClick={() =>
                                    path.deletedAt
                                        ? run(() => restoreHabitPath(id))
                                        : (setMenu(false), setConfirm(true))
                                }
                            >
                                {path.deletedAt
                                    ? "استعادة المسار"
                                    : "أرشفة المسار"}
                            </button>
                        )}
                        {(habit || path) && (
                            <button
                                className="btn danger"
                                disabled={busy}
                                onClick={() => {
                                    setMenu(false);
                                    setDeleting(true);
                                }}
                            >
                                حذف نهائي
                            </button>
                        )}
                        {error && (
                            <p className="warning" role="alert">
                                {error}
                            </p>
                        )}
                    </div>
                </Dialog>
            )}
            {confirm && (
                <Dialog
                    title={habit ? "أرشفة العادة" : "أرشفة المسار"}
                    onClose={() => setConfirm(false)}
                    canClose={() => !actionLock.current}
                >
                    <p>
                        {habit
                            ? "ستُحفظ العادة وسجلاتها، وتتوقف المطالبة اليومية. استعادتها لا تستأنفها تلقائيًا."
                            : "سيُحفظ سجل المسار وتصبح عاداته الحالية مستقلة دون حذفها. تسري العضوية التاريخية الجديدة من الغد. استعادة المسار لا تعيد ربط العادات تلقائيًا."}
                    </p>
                    {error && (
                        <p role="alert" className="warning">
                            {error}
                        </p>
                    )}
                    <div className="habit-actions">
                        <button
                            className="btn primary"
                            disabled={busy}
                            onClick={() =>
                                run(() =>
                                    habit
                                        ? setHabitArchived(id, true)
                                        : archiveHabitPath(id),
                                )
                            }
                        >
                            تأكيد الأرشفة
                        </button>
                        <button
                            className="btn secondary"
                            disabled={busy}
                            onClick={() => setConfirm(false)}
                        >
                            إلغاء
                        </button>
                    </div>
                </Dialog>
            )}
            {deleting && (
                <HabitDeletionDialog
                    id={id}
                    kind={habit ? "habit" : "path"}
                    onClose={() => setDeleting(false)}
                    onDeleted={() => {
                        setDeleting(false);
                        location.hash = "habits";
                    }}
                />
            )}
        </div>
    );
}
function HistoryEditor({
    habit,
    plans,
    data,
    from,
    to,
    at,
}: {
    habit: Habit;
    plans: HabitPlan[];
    data: HabitData;
    from: string;
    to: string;
    at: Date;
}) {
    const today = habitDate(at, habit.timeZone);
    const [selected, setSelected] = useState(today);
    const date = selected > today ? today : selected;
    const selectedEntry = useLiveQuery(
        async () => ({
            date,
            entry: (
                await assessedHabitEntries(
                    db,
                    await db.habitEntries
                        .where("[habitId+localDate]")
                        .equals([habit.id, date])
                        .toArray(),
                )
            )[0],
        }),
        [habit.id, date],
    );
    const day = habitDay(
        habit,
        plans,
        data.paths,
        selectedEntry?.date === date && selectedEntry.entry
            ? [selectedEntry.entry]
            : [],
        date,
        at,
    );
    const entries = data.entries
        .filter(
            (e) =>
                e.habitId === habit.id &&
                e.localDate >= from &&
                e.localDate <= to,
        )
        .sort((a, b) => b.localDate.localeCompare(a.localDate));
    return (
        <section className="habit-history" aria-label="سجل العادة">
            <h3>السجل وتصحيح يوم سابق</h3>
            <label className="field">
                يوم التسجيل
                <input
                    type="date"
                    value={date}
                    max={today}
                    min={plans[0]?.effectiveDate}
                    onChange={(e) => setSelected(e.target.value || today)}
                />
            </label>
            <div className="habit-history-edit">
                <span>
                    {dayText(date)} ·{" "}
                    {day.state === "neutral"
                        ? "محايد"
                        : day.state === "unscheduled"
                          ? "اختياري"
                          : day.state === "open"
                            ? "اليوم قيد الإتاحة"
                            : "سجل سابق"}
                </span>
                {selectedEntry?.date === date &&
                    day.plan &&
                    day.start <= at.getTime() &&
                    (habit.kind === "graded" ? (
                        <GradedRecord
                            key={`${date}/${day.plan.id}/${JSON.stringify(day.entry ?? null)}`}
                            habit={habit}
                            plan={day.plan}
                            date={date}
                            entry={day.entry}
                        />
                    ) : (
                        <>
                            <HabitCheck
                                key={date}
                                habit={habit}
                                date={date}
                                entry={day.entry}
                            />
                            <HabitFeedback
                                key={JSON.stringify(day.entry ?? null)}
                                entry={day.entry}
                            />
                        </>
                    ))}
            </div>
            <p className="muted small">
                تعديل اليوم نفسه يحدّث تسجيله دون نسخة إضافية. وقت الإدخال
                الحقيقي محفوظ، ولا ندّعي معرفة ساعة أداء يوم قديم.
            </p>
            {entries.length ? (
                <ul className="habit-history-list">
                    {entries.map((e) => (
                        <li key={e.id}>
                            <span>{dayText(e.localDate)}</span>
                            <span>
                                {e.result.kind === "graded"
                                    ? `${e.result.amount} ${e.result.unit} · الحد ${e.result.threshold}`
                                    : e.result.done
                                      ? "تم"
                                      : "لم يتم / تراجع"}
                            </span>
                            {feedbackText(e) && (
                                <span className="small muted habit-history-feedback">
                                    {feedbackText(e)}
                                </span>
                            )}
                            <button
                                className="text-btn"
                                onClick={() => setSelected(e.localDate)}
                            >
                                تعديل تسجيل {dayText(e.localDate)}
                            </button>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="muted">لا تسجيلات في هذا الشهر.</p>
            )}
        </section>
    );
}
