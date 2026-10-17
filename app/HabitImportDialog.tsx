import { useRef, useState } from "react";
import { Dialog } from "./Dialog";
import {
    DuplicateHabitImport,
    importHabits,
    parseHabitsImport,
    type HabitsImport,
} from "./habitImport";
import { habitDate, habitDayNames } from "./habitCalendar";
import { userError } from "./userError";
export function HabitImportDialog({ onClose }: { onClose: () => void }) {
    const [raw, setRaw] = useState(""),
        [doc, setDoc] = useState<HabitsImport | null>(null),
        [error, setError] = useState(""),
        [busy, setBusy] = useState(false),
        [copy, setCopy] = useState(false),
        [existing, setExisting] = useState("");
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const [date, setDate] = useState(habitDate(new Date(), zone)),
        [timeZone, setTimeZone] = useState(zone);
    const lock = useRef(false),
        fileVersion = useRef(0);
    const read = (value: string) => {
        try {
            const d = parseHabitsImport(value);
            setRaw(JSON.stringify(d, null, 2));
            setDoc(d);
            setError("");
            setCopy(false);
            setExisting("");
        } catch (e) {
            setDoc(null);
            setError(userError(e));
        }
    };
    return (
        <Dialog
            title="استيراد العادات والمسارات"
            onClose={onClose}
            canClose={() => !lock.current}
            className="habit-dialog"
        >
            <p className="muted small">
                masar.habits · الإصدار1. ينشئ عناصر جديدة فقط؛ لا يستبدل بياناتك
                أو ينشئ سجل إنجاز سابقًا.
            </p>
            <label className="field">
                ملف JSON للعادات
                <input
                    type="file"
                    accept=".json,application/json"
                    disabled={busy}
                    onChange={async (e) => {
                        const f = e.target.files?.[0],
                            version = ++fileVersion.current;
                        setDoc(null);
                        setExisting("");
                        setError("");
                        if (!f) return;
                        if (f.size > 1024 * 1024) {
                            setError("حجم الملف يتجاوز1MiB.");
                            return;
                        }
                        try {
                            const content = await f.text();
                            if (version === fileVersion.current) read(content);
                        } catch (err) {
                            if (version === fileVersion.current)
                                setError(userError(err));
                        }
                    }}
                />
            </label>
            {doc && (
                <section aria-label="معاينة استيراد العادات">
                    <h3>
                        {doc.kind === "path" ? doc.path.title : doc.habit.title}
                    </h3>
                    <p>
                        {doc.kind === "path"
                            ? `${doc.path.habits.length} عادات ضمن مسار جديد`
                            : "عادة مستقلة جديدة"}
                    </p>
                    <ul className="habit-import-preview">
                        {(doc.kind === "path"
                            ? doc.path.habits
                            : [doc.habit]
                        ).map((h) => (
                            <li key={h.key}>
                                <strong>{h.title}</strong>
                                <p className="small">
                                    {h.schedule.repeat === "daily"
                                        ? "كل يوم"
                                        : h.schedule.weekdays
                                              .map((d) => habitDayNames[d])
                                              .join("، ")}{" "}
                                    ·{" "}
                                    {h.kind === "simple"
                                        ? "تم / لم يتم"
                                        : h.phases
                                              ?.map(
                                                  (p) =>
                                                      `${p.title}: ${p.start}–${p.goal} ${p.unit}`,
                                              )
                                              .join(" / ")}
                                </p>
                                {h.current && (
                                    <p className="small">
                                        البداية المعتمدة: {h.current.target}{" "}
                                        {
                                            h.phases?.find(
                                                (p) =>
                                                    p.key ===
                                                    h.current?.phaseKey,
                                            )?.unit
                                        }
                                    </p>
                                )}
                            </li>
                        ))}
                    </ul>
                </section>
            )}
            {(raw || doc) && (
                <details>
                    <summary>تعديل المحتوى قبل الاستيراد</summary>
                    <label className="field">
                        JSON القابل للتعديل
                        <textarea
                            dir="ltr"
                            rows={10}
                            value={raw}
                            disabled={busy}
                            onChange={(e) => {
                                setRaw(e.target.value);
                                setDoc(null);
                                setCopy(false);
                                setExisting("");
                            }}
                        />
                    </label>
                    <button
                        className="btn secondary"
                        disabled={busy}
                        onClick={() => read(raw)}
                    >
                        تحديث المعاينة والتحقق
                    </button>
                </details>
            )}
            {doc && (
                <>
                    <label className="field">
                        تاريخ بدء العادات
                        <input
                            type="date"
                            value={date}
                            min={habitDate(new Date(), zone)}
                            disabled={busy}
                            onChange={(e) => setDate(e.target.value)}
                        />
                    </label>
                    <label className="field">
                        المنطقة الزمنية
                        <input
                            dir="ltr"
                            value={timeZone}
                            disabled={busy}
                            onChange={(e) => setTimeZone(e.target.value)}
                        />
                    </label>
                </>
            )}
            {error && (
                <p className="warning" role="alert">
                    {error}
                </p>
            )}
            {existing && (
                <p>
                    <a
                        className="text-btn"
                        href={`#${existing}`}
                        onClick={onClose}
                    >
                        فتح العناصر المستوردة
                    </a>
                </p>
            )}
            {existing && (
                <label className="check-row">
                    <input
                        type="checkbox"
                        checked={copy}
                        disabled={busy}
                        onChange={(e) => setCopy(e.target.checked)}
                    />
                    أوافق على إنشاء نسخة إضافية مستقلة
                </label>
            )}
            <div className="habit-actions">
                <button
                    className="btn primary"
                    disabled={!doc || busy || (!!existing && !copy)}
                    onClick={async () => {
                        if (lock.current || !doc) return;
                        lock.current = true;
                        setBusy(true);
                        setError("");
                        try {
                            const route = await importHabits(doc, {
                                startDate: date,
                                timeZone,
                                allowCopy: copy,
                            });
                            onClose();
                            location.hash = route;
                        } catch (e) {
                            if (e instanceof DuplicateHabitImport)
                                setExisting(e.route);
                            setError(userError(e));
                        } finally {
                            lock.current = false;
                            setBusy(false);
                        }
                    }}
                >
                    {busy ? "جارٍ الاستيراد…" : "تأكيد استيراد العادات"}
                </button>
                <button
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
