import { useState, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ActiveProjectLimitError, db } from "./db";
import { activeProject } from "./projectPace";
import { setActiveLimit, setProjectPaused } from "./projectPaceStore";
import { userError } from "./userError";
export function CapacityOptions({
    error,
    onResolved,
    onCancel,
}: {
    error: ActiveProjectLimitError;
    onResolved: () => void;
    onCancel?: () => void;
}) {
    const projects = useLiveQuery(() => db.projects.toArray(), [], []),
        plans = useLiveQuery(() => db.projectPlans.toArray(), [], []);
    const [selection, setSelection] = useState(""),
        [limit, setLimit] = useState(String(error.limit + 1)),
        [message, setMessage] = useState(""),
        [busy, setBusy] = useState(false),
        lock = useRef(false);
    return (
        <section
            className="capacity-options"
            aria-label="خيارات حد المشاريع"
            onKeyDownCapture={(e) => {
                if (
                    e.key === "Enter" &&
                    (e.target as HTMLElement).tagName === "INPUT"
                )
                    e.preventDefault();
            }}
        >
            <p className="warning">{error.message}</p>
            <label className="field">
                القرار
                <select
                    aria-label="القرار"
                    value={selection}
                    onChange={(e) => setSelection(e.target.value)}
                    disabled={busy}
                >
                    <option value="">اختر إجراءً</option>
                    {projects
                        .filter(
                            (p) =>
                                p.id !== error.excludeId &&
                                activeProject(
                                    p,
                                    plans.find((r) => r.projectId === p.id),
                                ),
                        )
                        .map((p) => (
                            <option key={p.id} value={p.id}>
                                إيقاف «{p.title}» مؤقتًا
                            </option>
                        ))}
                    <option value="limit">تعديل الحد النشط</option>
                </select>
            </label>
            {selection === "limit" && (
                <label className="field">
                    الحد الجديد
                    <input
                        type="number"
                        min="1"
                        max="1000"
                        value={limit}
                        onChange={(e) => setLimit(e.target.value)}
                        disabled={busy}
                    />
                </label>
            )}
            <p className="small muted">
                لن يتوقف أي مشروع دون اختيارك. بعد تأكيد هذا القرار، أعد محاولة
                الإضافة أو التنشيط.
            </p>
            <div className="dialog-buttons">
                {onCancel && (
                    <button
                        type="button"
                        className="btn secondary"
                        disabled={busy}
                        onClick={onCancel}
                    >
                        إلغاء العملية
                    </button>
                )}
                <button
                    type="button"
                    className="btn primary"
                    disabled={!selection || busy}
                    onClick={async () => {
                        if (lock.current) return;
                        lock.current = true;
                        setBusy(true);
                        setMessage("");
                        try {
                            if (selection === "limit")
                                await setActiveLimit(Number(limit));
                            else await setProjectPaused(selection, true);
                            onResolved();
                        } catch (e) {
                            setMessage(userError(e));
                        } finally {
                            lock.current = false;
                            setBusy(false);
                        }
                    }}
                >
                    تأكيد القرار
                </button>
            </div>
            {message && <p role="alert">{message}</p>}
        </section>
    );
}
export function ProjectCapacitySettings() {
    const setting = useLiveQuery(() => db.paceSettings.get("pace"));
    const [draft, setDraft] = useState<string | null>(null),
        [message, setMessage] = useState(""),
        [busy, setBusy] = useState(false);
    return (
        <details className="surface pace-settings">
            <summary>إعداد المشاريع النشطة</summary>
            <p className="muted small">
                الحد الافتراضي 3. لا يمس عدد مشاريعك الإجمالي، ولا يوقف مشاريعك
                القديمة تلقائيًا.
            </p>
            <form
                onSubmit={async (e) => {
                    e.preventDefault();
                    if (busy) return;
                    setBusy(true);
                    try {
                        await setActiveLimit(
                            Number(draft ?? setting?.activeLimit ?? 3),
                        );
                        setDraft(null);
                        setMessage("حُفظ الحد دون تغيير حالات المشاريع.");
                    } catch (e) {
                        setMessage(userError(e));
                    } finally {
                        setBusy(false);
                    }
                }}
            >
                <label className="field">
                    الحد الأقصى للمشاريع النشطة
                    <input
                        type="number"
                        min="1"
                        max="1000"
                        value={draft ?? String(setting?.activeLimit ?? 3)}
                        onChange={(e) => setDraft(e.target.value)}
                    />
                </label>
                <button className="btn secondary" disabled={busy}>
                    حفظ حد المشاريع
                </button>
            </form>
            {message && <p role="status">{message}</p>}
        </details>
    );
}
