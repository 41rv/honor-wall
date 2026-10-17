import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, MoreVertical } from "lucide-react";
import { db } from "./db";
import { Dialog } from "./Dialog";
import type { Reminder } from "./habitTypes";
import {
    deleteReminder,
    orderReminders,
    reminderCategories,
    reviewReminder,
    saveReminder,
} from "./reminderStore";
import { userError } from "./userError";
export function ReminderEditor({
    reminder,
    onClose,
}: {
    reminder?: Reminder;
    onClose: () => void;
}) {
    const [title, setTitle] = useState(reminder?.title ?? ""),
        [category, setCategory] = useState(reminder?.category ?? ""),
        [busy, setBusy] = useState(false),
        [error, setError] = useState("");
    const lock = useRef(false);
    return (
        <Dialog
            title={reminder ? "تعديل التذكير" : "تذكير جديد"}
            onClose={onClose}
            canClose={() => !lock.current}
        >
            <form
                onSubmit={async (e) => {
                    e.preventDefault();
                    if (lock.current) return;
                    lock.current = true;
                    setBusy(true);
                    setError("");
                    try {
                        await saveReminder({
                            id: reminder?.id,
                            title,
                            category: category || undefined,
                        });
                        onClose();
                    } catch (err) {
                        setError(userError(err));
                    } finally {
                        lock.current = false;
                        setBusy(false);
                    }
                }}
            >
                <label className="field">
                    عنوان التذكير
                    <input
                        required
                        maxLength={300}
                        autoFocus
                        data-dialog-autofocus
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                    />
                </label>
                <label className="field">
                    تصنيف التذكير
                    <select
                        aria-label="تصنيف التذكير"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                    >
                        <option value="">بدون تصنيف</option>
                        {reminderCategories.map(([key, name]) => (
                            <option key={key} value={key}>
                                {name}
                            </option>
                        ))}
                        {category &&
                            !reminderCategories.some(
                                ([k]) => k === category,
                            ) && <option value={category}>{category}</option>}
                    </select>
                </label>
                <p className="small muted">
                    قائمة حفظ سريعة، دون موعد أو تنبيه.
                </p>
                {error && (
                    <p className="warning" role="alert">
                        {error}
                    </p>
                )}
                <div className="habit-actions">
                    <button className="btn primary" disabled={busy}>
                        حفظ التذكير
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
            </form>
        </Dialog>
    );
}
function ReminderRow({ row, onMenu }: { row: Reminder; onMenu: () => void }) {
    const [busy, setBusy] = useState(false),
        [error, setError] = useState("");
    const lock = useRef(false);
    return (
        <div
            className={`habit-row reminder-row ${row.reviewedAt ? "is-done" : ""}`}
            data-reminder-id={row.id}
        >
            <button
                className={`task-check ${row.reviewedAt ? "checked" : ""}`}
                aria-label={`${row.reviewedAt ? "التراجع عن مراجعة" : "مراجعة"} «${row.title}»`}
                aria-pressed={!!row.reviewedAt}
                disabled={busy}
                onClick={async () => {
                    if (lock.current) return;
                    lock.current = true;
                    setBusy(true);
                    setError("");
                    try {
                        await reviewReminder(row.id, !row.reviewedAt);
                    } catch (e) {
                        setError(userError(e));
                    } finally {
                        lock.current = false;
                        setBusy(false);
                    }
                }}
            >
                {row.reviewedAt && <Check size={18} />}
            </button>
            <div className="habit-row-copy">
                <strong>{row.title}</strong>
                <small className="muted">
                    {reminderCategories.find(
                        ([k]) => k === row.category,
                    )?.[1] ??
                        row.category ??
                        "بدون تصنيف"}{" "}
                    · {new Date(row.createdAt).toLocaleDateString("ar")}
                </small>
                {error && (
                    <p role="alert" className="warning">
                        {error}
                    </p>
                )}
            </div>
            <button
                className="icon-btn"
                aria-label={`خيارات التذكير «${row.title}»`}
                onClick={onMenu}
            >
                <MoreVertical size={18} />
            </button>
        </div>
    );
}
export function Reminders() {
    const result = useLiveQuery(async () => {
        try {
            return {
                rows: orderReminders(await db.reminders.toArray()),
                error: "",
            };
        } catch {
            return {
                rows: [],
                error: "تعذر قراءة التذكيرات من التخزين المحلي.",
            };
        }
    }, []);
    const [title, setTitle] = useState(""),
        [busy, setBusy] = useState(false),
        [error, setError] = useState(""),
        [menu, setMenu] = useState<Reminder | null>(null),
        [editing, setEditing] = useState<Reminder | null>(null),
        [remove, setRemove] = useState<Reminder | null>(null),
        [limit, setLimit] = useState(30);
    const lock = useRef(false);
    return (
        <section className="reminders-area" aria-label="التذكيرات">
            <p className="muted small">
                احفظ اسمًا للرجوع إليه: كتاب، مسلسل، موقع أو أي شيء بسيط.
            </p>
            <form
                className="surface sky-glass reminder-capture"
                onSubmit={async (e) => {
                    e.preventDefault();
                    if (lock.current) return;
                    lock.current = true;
                    setBusy(true);
                    setError("");
                    try {
                        await saveReminder({ title });
                        setTitle("");
                    } catch (err) {
                        setError(userError(err));
                    } finally {
                        lock.current = false;
                        setBusy(false);
                    }
                }}
            >
                <label className="field">
                    عنوان التذكير
                    <input
                        required
                        maxLength={300}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="شيء أود الرجوع إليه…"
                    />
                </label>
                <button className="btn primary" disabled={busy}>
                    حفظ سريع
                </button>
            </form>
            {error && (
                <p role="alert" className="warning">
                    {error}
                </p>
            )}
            {!result ? (
                <p role="status">جارٍ قراءة التذكيرات…</p>
            ) : result.error ? (
                <p role="alert">{result.error}</p>
            ) : (
                <>
                    <p className="muted small">
                        {result.rows.filter((r) => !r.reviewedAt).length} غير
                        مراجعة · {result.rows.length} إجمالًا
                    </p>
                    <div className="surface sky-glass habit-list">
                        {result.rows.slice(0, limit).map((row) => (
                            <ReminderRow
                                key={row.id}
                                row={row}
                                onMenu={() => setMenu(row)}
                            />
                        ))}
                        {!result.rows.length && (
                            <p className="muted">لا تذكيرات محفوظة بعد.</p>
                        )}
                    </div>
                    {result.rows.length > limit && (
                        <button
                            className="text-btn"
                            onClick={() => setLimit((n) => n + 30)}
                        >
                            عرض المزيد من التذكيرات
                        </button>
                    )}
                </>
            )}
            {menu && (
                <Dialog
                    title="خيارات التذكير"
                    className="context-sheet"
                    onClose={() => setMenu(null)}
                >
                    <div className="habit-menu">
                        <button
                            className="btn secondary"
                            onClick={() => {
                                setEditing(menu);
                                setMenu(null);
                            }}
                        >
                            تعديل التذكير
                        </button>
                        <button
                            className="btn danger"
                            onClick={() => {
                                setRemove(menu);
                                setMenu(null);
                            }}
                        >
                            حذف التذكير
                        </button>
                    </div>
                </Dialog>
            )}
            {editing && (
                <ReminderEditor
                    reminder={editing}
                    onClose={() => setEditing(null)}
                />
            )}
            {remove && (
                <Dialog
                    title="حذف التذكير؟"
                    onClose={() => setRemove(null)}
                    canClose={() => !lock.current}
                >
                    <p>{remove.title}</p>
                    {error && <p role="alert">{error}</p>}
                    <div className="habit-actions">
                        <button
                            className="btn danger"
                            disabled={busy}
                            onClick={async () => {
                                if (lock.current) return;
                                lock.current = true;
                                setBusy(true);
                                setError("");
                                try {
                                    await deleteReminder(remove.id);
                                    setRemove(null);
                                } catch (err) {
                                    setError(userError(err));
                                } finally {
                                    lock.current = false;
                                    setBusy(false);
                                }
                            }}
                        >
                            تأكيد حذف التذكير
                        </button>
                        <button
                            className="btn secondary"
                            disabled={busy}
                            onClick={() => setRemove(null)}
                        >
                            إلغاء
                        </button>
                    </div>
                </Dialog>
            )}
        </section>
    );
}
