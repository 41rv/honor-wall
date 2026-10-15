import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { setProjectRestDays } from "./projectPaceStore";
import { defaultProjectRestDays, projectWeekDays } from "./projectRest";
import { userError } from "./userError";

export function ProjectRestSettings() {
    const settings = useLiveQuery(() => db.paceSettings.get("pace"));
    const [draft, setDraft] = useState<number[] | null>(null);
    const [message, setMessage] = useState("");
    const [busy, setBusy] = useState(false);
    const selected =
        draft ?? settings?.restHistory?.at(-1)?.days ?? defaultProjectRestDays;
    return (
        <details className="surface pace-settings project-rest-settings">
            <summary>أيام راحة المشاريع</summary>
            <p className="muted small">
                للمشاريع فقط؛ لا تتغير مواعيد المهام أو تكرارها. تبقى مدة الهدف
                تقويمية ولا تتأجل بسبب الراحة.
            </p>
            <form
                onSubmit={async (e) => {
                    e.preventDefault();
                    if (busy) return;
                    setBusy(true);
                    setMessage("");
                    try {
                        await setProjectRestDays(selected);
                        setDraft(null);
                        setMessage(
                            "حُفظت أيام الراحة. التغيير من الآن؛ يبقى الرصد السابق بجدوله التاريخي.",
                        );
                    } catch (error) {
                        setMessage(userError(error));
                    } finally {
                        setBusy(false);
                    }
                }}
            >
                <fieldset className="rest-weekdays" disabled={busy}>
                    <legend>اختر أيام الراحة الأسبوعية</legend>
                    {projectWeekDays.map(([value, title]) => (
                        <label key={value}>
                            <input
                                type="checkbox"
                                checked={selected.includes(value)}
                                onChange={(e) => {
                                    setDraft(
                                        e.target.checked
                                            ? [...selected, value]
                                            : selected.filter(
                                                  (d) => d !== value,
                                              ),
                                    );
                                    setMessage("");
                                }}
                            />
                            {title}
                        </label>
                    ))}
                </fieldset>
                {selected.length === 7 && (
                    <p role="status" className="muted small">
                        كل الأيام راحة: لا اقتراحات يومية للمشاريع ولا أيام عمل
                        متاحة لحساب الوتيرة والتوقع. الإنجاز اليدوي متاح.
                    </p>
                )}
                {selected.length === 0 && (
                    <p className="muted small">
                        كل أيام الأسبوع متاحة للمشاريع.
                    </p>
                )}
                <button className="btn secondary" disabled={busy}>
                    حفظ أيام الراحة
                </button>
            </form>
            {message && <p role="status">{message}</p>}
        </details>
    );
}
