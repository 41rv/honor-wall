import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Dialog } from "./Dialog";
import {
    deleteHabitPermanently,
    previewHabitDeletion,
    type HabitDeletionMode,
} from "./habitDeletion";
import { userError } from "./userError";

export function HabitDeletionDialog({
    id,
    kind,
    onClose,
    onDeleted,
}: {
    id: string;
    kind: "habit" | "path";
    onClose: () => void;
    onDeleted: () => void;
}) {
    const [mode, setMode] = useState<HabitDeletionMode>(
        kind === "habit" ? "habit" : "path-only",
    );
    const [confirmed, setConfirmed] = useState<string | null>(null),
        [busy, setBusy] = useState(false),
        [error, setError] = useState("");
    const lock = useRef(false);
    const result = useLiveQuery(async () => {
        try {
            return { preview: await previewHabitDeletion(id, mode), error: "" };
        } catch (e) {
            return { preview: null, error: userError(e) };
        }
    }, [id, mode]);
    const preview = result?.preview;
    return (
        <Dialog
            title={
                kind === "habit" ? "حذف العادة نهائيًا" : "حذف المسار نهائيًا"
            }
            onClose={onClose}
            canClose={() => !lock.current}
        >
            {kind === "path" && (
                <fieldset className="habit-delete-options">
                    <legend>ماذا تريد حذفه؟</legend>
                    {(
                        [
                            [
                                "path-only",
                                "حذف المسار فقط والاحتفاظ بعاداته مستقلة",
                            ],
                            [
                                "path-with-habits",
                                "حذف المسار وعاداته المرتبطة حاليًا نهائيًا",
                            ],
                        ] as const
                    ).map(([value, label]) => (
                        <label key={value}>
                            <input
                                type="radio"
                                name="path-delete-mode"
                                value={value}
                                checked={mode === value}
                                disabled={busy}
                                onChange={() => {
                                    setMode(value);
                                    setConfirmed(null);
                                    setError("");
                                }}
                            />
                            {label}
                        </label>
                    ))}
                    <p className="small muted">
                        العادات التي فُصلت أو نُقلت سابقًا، بما فيها عادات
                        المسار المؤرشف، لا تُحذف مع المسار.
                    </p>
                </fieldset>
            )}
            {!result ? (
                <p role="status">جارٍ حساب البيانات المتأثرة…</p>
            ) : preview ? (
                <>
                    <p className="habit-delete-name">
                        حذف نهائي: <strong>{preview.title}</strong>
                    </p>
                    <ul className="habit-delete-impact">
                        <li>
                            {preview.paths} مسارات · {preview.habits} عادات
                        </li>
                        <li>
                            {preview.entries} تسجيلات · {preview.assessments}{" "}
                            تقييمات أو مدد محفوظة
                        </li>
                        <li>
                            {preview.plans} خطط ومستويات · {preview.suggestions}{" "}
                            اقتراحات وقرارات
                        </li>
                        <li>
                            {preview.receipts} إيصالات استيراد ستُنظف مراجعها
                        </li>
                        {preview.detachedPlans > 0 && (
                            <li>
                                فصل {preview.detachedPlans} مراجع خطط عن المسار
                                مع حفظ المستويات وأثر الإيقافات
                            </li>
                        )}
                        {preview.invalidatedSuggestions > 0 && (
                            <li>
                                إنهاء صلاحية {preview.invalidatedSuggestions}{" "}
                                اقتراحات معلّقة لتغيّر عضوية المسار
                            </li>
                        )}
                    </ul>
                    {mode === "path-only" && (
                        <p className="small">
                            تبقى {preview.retainedHabits} عادات مستقلة، مع
                            سجلاتها ومستوياتها وأثر الإيقافات السابقة. لا تُعاد
                            كتابة نتائج الأداء.
                        </p>
                    )}
                    <p className="warning">
                        هذه العملية نهائية ولا يمكن التراجع عنها داخل التطبيق.
                        لا تُعدّل ملفات النسخ الاحتياطية أو نسخ الأمان المحفوظة؛
                        قد تعيد البيانات عند استعادتها.
                    </p>
                    <label className="delete-consent">
                        <input
                            type="checkbox"
                            checked={confirmed === preview.token}
                            disabled={busy}
                            onChange={(e) =>
                                setConfirmed(
                                    e.target.checked ? preview.token : null,
                                )
                            }
                        />
                        أفهم أثر الحذف النهائي لهذه البيانات
                    </label>
                </>
            ) : (
                <p className="warning" role="alert">
                    {result.error}
                </p>
            )}
            {error && (
                <p className="warning" role="alert">
                    {error}
                </p>
            )}
            <div className="habit-actions">
                <button
                    type="button"
                    className="btn danger"
                    aria-busy={busy}
                    disabled={!preview || confirmed !== preview.token || busy}
                    onClick={async () => {
                        if (
                            !preview ||
                            confirmed !== preview.token ||
                            lock.current
                        )
                            return;
                        lock.current = true;
                        setBusy(true);
                        setError("");
                        try {
                            await deleteHabitPermanently(preview);
                            onDeleted();
                        } catch (e) {
                            setError(userError(e));
                            setConfirmed(null);
                        } finally {
                            lock.current = false;
                            setBusy(false);
                        }
                    }}
                >
                    {busy ? "جارٍ الحذف…" : "تأكيد الحذف النهائي"}
                </button>
                <button
                    type="button"
                    className="btn secondary"
                    disabled={busy}
                    onClick={onClose}
                >
                    إلغاء
                </button>
            </div>
        </Dialog>
    );
}
