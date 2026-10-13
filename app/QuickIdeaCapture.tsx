import { memo, useRef, useState } from "react";
import { Lightbulb, Plus, Check } from "lucide-react";
import { userError } from "./userError";
const key = "masar-draft-quick-idea";
export const QuickIdeaCapture = memo(function QuickIdeaCapture({
    save,
}: {
    save: (title: string, notes: string) => Promise<string>;
}) {
    function initial() {
        try {
            const d = JSON.parse(localStorage.getItem(key) ?? "null");
            if (d && typeof d.title === "string" && typeof d.notes === "string")
                return d;
        } catch {}
        return { title: "", notes: "" };
    }
    const [draft, setDraft] = useState<{ title: string; notes: string }>(
        initial,
    );
    const latest = useRef(draft);
    const [details, setDetails] = useState(false);
    const [busy, setBusy] = useState(false);
    const lock = useRef(false);
    const [error, setError] = useState("");
    const [saved, setSaved] = useState<string | null>(null);
    function edit(next: typeof draft) {
        latest.current = next;
        setDraft(next);
        setSaved(null);
        setError("");
        try {
            localStorage.setItem(key, JSON.stringify(next));
        } catch {
            setError(
                "تعذر حفظ المسودة؛ أبقِ هذه الصفحة مفتوحة حتى تحفظ الفكرة.",
            );
        }
    }
    return (
        <section
            className="surface quick-idea-capture"
            aria-label="التقاط فكرة سريع"
        >
            <div className="capture-heading">
                <Lightbulb size={24} />
                <div>
                    <h2>فكرة في بالك؟ سجّلها.</h2>
                    <p>عنوان واحد يكفي. التفاصيل تأتي لاحقًا.</p>
                </div>
            </div>
            <form
                onSubmit={async (e) => {
                    e.preventDefault();
                    if (lock.current) return;
                    if (!draft.title.trim()) {
                        setError("اكتب عنوان الفكرة أولًا.");
                        return;
                    }
                    lock.current = true;
                    setBusy(true);
                    setError("");
                    const sent = { ...latest.current };
                    try {
                        const id = await save(sent.title, sent.notes);
                        setSaved(id);
                        if (
                            latest.current.title === sent.title &&
                            latest.current.notes === sent.notes
                        ) {
                            latest.current = { title: "", notes: "" };
                            setDraft(latest.current);
                            try {
                                localStorage.removeItem(key);
                            } catch {}
                        }
                    } catch (e) {
                        setError(
                            userError(
                                e,
                                "تعذر حفظ الفكرة؛ نصك باقٍ، أعد المحاولة.",
                            ),
                        );
                    } finally {
                        lock.current = false;
                        setBusy(false);
                    }
                }}
            >
                <div className="capture-fields">
                    <input
                        aria-label="عنوان الفكرة السريعة"
                        disabled={busy}
                        required
                        maxLength={300}
                        placeholder="اكتب الفكرة هنا…"
                        value={draft.title}
                        onChange={(e) =>
                            edit({ ...latest.current, title: e.target.value })
                        }
                    />
                    <button
                        type="submit"
                        className="btn primary"
                        disabled={busy}
                    >
                        <Plus size={17} />
                        {busy ? "جارٍ الحفظ…" : "حفظ الفكرة"}
                    </button>
                </div>
                <button
                    className="text-btn capture-details"
                    type="button"
                    aria-expanded={details}
                    onClick={() => setDetails(!details)}
                >
                    {details ? "إخفاء التفاصيل" : "إضافة تفاصيل"}
                </button>
                {details && (
                    <label className="field">
                        تفاصيل الفكرة
                        <textarea
                            aria-label="تفاصيل الفكرة السريعة"
                            disabled={busy}
                            rows={3}
                            value={draft.notes}
                            onChange={(e) =>
                                edit({
                                    ...latest.current,
                                    notes: e.target.value,
                                })
                            }
                        />
                    </label>
                )}
                {error && (
                    <p className="error" role="alert">
                        {error}
                    </p>
                )}
                {saved && (
                    <p className="capture-saved" role="status">
                        <Check size={16} />
                        حُفظت الفكرة{" "}
                        <button
                            type="button"
                            className="text-btn"
                            onClick={() => {
                                location.hash = `idea/${saved}`;
                            }}
                        >
                            عرض الفكرة
                        </button>
                    </p>
                )}
            </form>
        </section>
    );
});
