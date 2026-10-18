import { useRef, useState } from "react";
import type { HabitEntry } from "./habitTypes";
import {
    effortLabels,
    feedbackText,
    recordedPerformance,
    type HabitFeedbackInput,
} from "./habitFeedback";
import { saveHabitFeedback } from "./habitStore";
import { userError } from "./userError";

export function HabitFeedback({
    entry,
    title,
}: {
    entry?: HabitEntry;
    title?: string;
}) {
    const initialRating = String(
        entry?.effortRating ?? (entry?.difficulty ? "legacy" : ""),
    );
    const [rating, setRating] = useState(initialRating);
    const [minutes, setMinutes] = useState(
        String(entry?.durationMinutes ?? ""),
    );
    const baseline = useRef({
        rating: initialRating,
        minutes: String(entry?.durationMinutes ?? ""),
    });
    const [busy, setBusy] = useState(false),
        [error, setError] = useState("");
    const [saved, setSaved] = useState(false);
    const lock = useRef(false);
    if (!entry || !recordedPerformance(entry)) return null;
    return (
        <details className="habit-feedback">
            <summary>
                {title ?? "تقييم التسجيل ومدة التنفيذ"}{" "}
                <span className="muted">
                    {entry.effortRating !== undefined ||
                    entry.durationMinutes !== undefined
                        ? "· محفوظ"
                        : "(اختياري)"}
                </span>
            </summary>
            <p className="small muted">
                لتسجيل {entry.localDate}. الصعوبة تصف شعورك بالأداء، والمدة هي
                الدقائق الفعلية؛ لا نستنتج أحدهما من الآخر.
            </p>
            {feedbackText(entry) && (
                <p className="small">المحفوظ: {feedbackText(entry)}</p>
            )}
            <div className="feedback-fields">
                <label className="field">
                    صعوبة الأداء
                    <select
                        aria-label="صعوبة الأداء"
                        value={rating}
                        onChange={(e) => {
                            setRating(e.target.value);
                            setSaved(false);
                        }}
                        disabled={busy}
                    >
                        <option value="">دون تقييم</option>
                        {entry.difficulty && (
                            <option value="legacy">
                                الإبقاء على التقييم السابق:{" "}
                                {
                                    {
                                        easy: "سهل",
                                        okay: "مناسب",
                                        hard: "مرهق",
                                    }[entry.difficulty]
                                }
                            </option>
                        )}
                        {effortLabels.map((label, i) => (
                            <option key={i} value={i + 1}>
                                {i + 1} — {label}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="field">
                    المدة الفعلية بالدقائق
                    <input
                        type="number"
                        min="0.001"
                        max="1440"
                        step="0.001"
                        inputMode="decimal"
                        placeholder="اختياري"
                        value={minutes}
                        disabled={busy}
                        onChange={(e) => {
                            setMinutes(e.target.value);
                            setSaved(false);
                        }}
                    />
                </label>
            </div>
            <div className="habit-actions">
                <button
                    type="button"
                    className="btn secondary"
                    disabled={busy}
                    onClick={async () => {
                        if (lock.current) return;
                        lock.current = true;
                        setBusy(true);
                        setError("");
                        setSaved(false);
                        try {
                            // Patch only the fields this form changed. A second
                            // tab's duration must survive a rating-only save.
                            const patch: HabitFeedbackInput = {};
                            if (rating !== baseline.current.rating) {
                                patch.effortRating =
                                    rating && rating !== "legacy"
                                        ? (Number(
                                              rating,
                                          ) as HabitEntry["effortRating"])
                                        : null;
                                patch.clearLegacyDifficulty = rating === "";
                            }
                            if (minutes !== baseline.current.minutes)
                                patch.durationMinutes = minutes.trim()
                                    ? Number(minutes)
                                    : null;
                            await saveHabitFeedback(entry.id, patch);
                            setSaved(true);
                        } catch (e) {
                            setError(userError(e));
                        } finally {
                            lock.current = false;
                            setBusy(false);
                        }
                    }}
                >
                    حفظ التقييم والمدة
                </button>
                <button
                    type="button"
                    className="text-btn"
                    disabled={busy}
                    onClick={(e) => {
                        setRating(initialRating);
                        setMinutes(String(entry.durationMinutes ?? ""));
                        setError("");
                        setSaved(false);
                        e.currentTarget
                            .closest("details")
                            ?.removeAttribute("open");
                    }}
                >
                    تخطي / إغلاق
                </button>
            </div>
            {saved && (
                <p role="status" className="small">
                    تم حفظ تفاصيل التسجيل.
                </p>
            )}
            {error && (
                <p role="alert" className="warning small">
                    {error}
                </p>
            )}
        </details>
    );
}
