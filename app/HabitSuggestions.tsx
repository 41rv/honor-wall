import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { Dialog } from "./Dialog";
import {
    habitAdvice,
    decideHabitAdvice,
    refreshHabitAdvice,
} from "./habitAdvice";
import type {
    Habit,
    HabitEntry,
    HabitPath,
    HabitPlan,
    HabitSuggestion,
} from "./habitTypes";
import { habitDate } from "./habitCalendar";
import { userError } from "./userError";
import { assessedHabitEntries } from "./habitAssessments";
const adviceLabels = {
    increase: "زيادة بسيطة",
    advance: "مرحلة أصعب",
    maintain: "الاستمرار",
    ease: "تخفيف اختياري",
};
const statusLabels = {
    new: "جديدة",
    accepted: "مقبولة",
    rejected: "مرفوضة",
    invalid: "لم تعد صالحة",
};
export function HabitSuggestionPanel({
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
    const [required, setRequired] = useState(6),
        [error, setError] = useState(""),
        [preview, setPreview] = useState<HabitSuggestion | null>(null),
        [busy, setBusy] = useState(false);
    const lock = useRef(false);
    const date = habitDate(at, habit.timeZone);
    const data = useLiveQuery(
        async () => ({
            entries: await assessedHabitEntries(
                db,
                await db.habitEntries
                    .where("[habitId+localDate]")
                    .between(
                        [habit.id, "0000-01-01"],
                        [habit.id, date],
                        true,
                        true,
                    )
                    .toArray(),
            ),
            suggestions: await db.habitSuggestions
                .where("habitId")
                .equals(habit.id)
                .toArray(),
        }),
        [habit.id, date],
    );
    const entries: HabitEntry[] = data?.entries ?? [];
    const basis = data
        ? JSON.stringify([
              plans,
              paths.map((p) => [p.id, p.pauses]),
              habit,
              entries.map((e) => [
                  e.id,
                  e.updatedAt,
                  e.result,
                  e.difficulty,
                  e.effortRating,
                  e.durationMinutes,
              ]),
              date,
              required,
          ])
        : "";
    useEffect(() => {
        if (!basis) return;
        let active = true;
        refreshHabitAdvice(habit.id, required, new Date()).catch((e) => {
            if (active) setError(userError(e));
        });
        return () => {
            active = false;
        };
    }, [basis, habit.id, required]);
    const candidate = data
        ? habitAdvice(habit, plans, paths, entries, at, required)
        : null;
    const rows = [...(data?.suggestions ?? [])].sort(
        (a, b) =>
            b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
    );
    const fresh = rows.find((s) => s.status === "new");
    const decide = async (s: HabitSuggestion, accept: boolean) => {
        if (lock.current) return;
        lock.current = true;
        setBusy(true);
        setError("");
        try {
            const result = await decideHabitAdvice(s.id, accept, required);
            if (result.stale)
                setError(
                    "تغيرت بيانات الأداء أو الخطة؛ انتهت صلاحية هذه التوصية. راجع التحليل المحدّث.",
                );
            setPreview(null);
        } catch (e) {
            setError(userError(e));
        } finally {
            lock.current = false;
            setBusy(false);
        }
    };
    return (
        <section className="habit-suggestions" aria-label="توصيات العادة">
            <h3>اقتراح اختياري</h3>
            <p className="muted small">
                مسار يقترح، وأنت تقرر. لا تغييرات تلقائية ولا تخفيض بسبب
                الانقطاع.
            </p>
            {!data ? (
                <p role="status">جارٍ قراءة الأداء…</p>
            ) : fresh ? (
                <div className="habit-notice">
                    <strong>{adviceLabels[fresh.type]}</strong>
                    <p>{fresh.reason}</p>
                    <div className="habit-actions">
                        <button
                            className="btn secondary"
                            disabled={busy}
                            onClick={() => setPreview(fresh)}
                        >
                            معاينة الأثر
                        </button>
                        <button
                            className="text-btn"
                            disabled={busy}
                            onClick={() => decide(fresh, false)}
                        >
                            رفض الاقتراح
                        </button>
                    </div>
                </div>
            ) : (
                <p className="small muted">
                    {candidate
                        ? "لا اقتراح جديد؛ القرارات السابقة محفوظة، ولن نكرر الرفض لمجرد مرور يوم."
                        : "لا دليل كافٍ حاليًا، أو توجد خطة للغد أو إيقاف. نحتاج7 أيام مؤهلة مغلقة على المستوى نفسه ضمن28 يومًا."}
                </p>
            )}
            <details>
                <summary>قواعد الاقتراح وسجل القرارات</summary>
                <label className="field">
                    عتبة هذه المعاينة: أيام تحقيق من آخر7
                    <input
                        aria-label="عتبة اقتراح التطور"
                        type="number"
                        min={3}
                        max={7}
                        step={1}
                        value={required}
                        onChange={(e) => {
                            const n = e.target.valueAsNumber;
                            if (Number.isInteger(n) && n >= 3 && n <= 7)
                                setRequired(n);
                        }}
                    />
                </label>
                <p className="small muted">
                    الافتراضي6/7؛ التعديل لهذه المعاينة فقط ولا يغير إعداداتك أو
                    خطتك. يظل إثبات الأداء على3 أيام منفصلة شرطًا. لا تقارن
                    الوحدات المختلفة.
                </p>
                {rows.slice(0, 20).map((s) => (
                    <p key={s.id} className="small">
                        {adviceLabels[s.type]} · {statusLabels[s.status]} ·{" "}
                        {new Date(s.createdAt).toLocaleDateString("ar")}
                        <br />
                        {s.reason}
                        <br />
                        {s.effect}
                    </p>
                ))}
                {rows.length > 20 && (
                    <p className="small muted">
                        يعرض آخر20 قرارًا، والسجل الكامل محفوظ في النسخة
                        الاحتياطية.
                    </p>
                )}
            </details>
            {error && (
                <p className="warning" role="alert">
                    {error}
                </p>
            )}
            {preview && (
                <Dialog
                    title="تأكيد قرار تطوير العادة"
                    onClose={() => setPreview(null)}
                    canClose={() => !lock.current}
                >
                    <p>{preview.reason}</p>
                    <p>{preview.effect}</p>
                    <p className="small muted">
                        يعاد فحص الدليل والخطة الآن. يسري أي تغيير من الغد، ولا
                        تُعاد كتابة الأيام الماضية.
                    </p>
                    <div className="habit-actions">
                        <button
                            className="btn primary"
                            disabled={busy}
                            onClick={() => decide(preview, true)}
                        >
                            أوافق على هذا التغيير
                        </button>
                        <button
                            className="btn secondary"
                            disabled={busy}
                            onClick={() => setPreview(null)}
                        >
                            إلغاء
                        </button>
                    </div>
                </Dialog>
            )}
        </section>
    );
}
