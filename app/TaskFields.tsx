import type { TaskOptions, TaskSchedule, Priority } from "./taskTypes";
import { priorities } from "./taskTypes";
import { localDay, localZone, weekdays } from "./taskSchedule";
export function TaskFields({
    value,
    onChange,
    disabled = false,
}: {
    value: TaskOptions;
    onChange: (v: TaskOptions) => void;
    disabled?: boolean;
}) {
    const s = value.schedule;
    function patch(fields: Partial<TaskSchedule>) {
        onChange({
            ...value,
            schedule: {
                date: localDay().toString(),
                timeZone: localZone(),
                repeat: "none",
                leadDays: 1,
                ...s,
                ...fields,
            },
        });
    }
    return (
        <fieldset className="task-fields" disabled={disabled}>
            <legend>
                الموعد والأولوية <span className="muted">(اختياري)</span>
            </legend>
            <label className="field">
                الأولوية
                <select
                    aria-label="الأولوية"
                    value={value.priority ?? ""}
                    onChange={(e) =>
                        onChange({
                            ...value,
                            priority: (e.target.value || undefined) as
                                Priority | undefined,
                        })
                    }
                >
                    <option value="">بدون تصنيف</option>
                    {Object.entries(priorities).map(([key, p]) => (
                        <option key={key} value={key}>
                            {p.name}
                        </option>
                    ))}
                </select>
            </label>
            <label className="field">
                التكرار
                <select
                    aria-label="التكرار"
                    value={s?.repeat ?? "none"}
                    onChange={(e) => {
                        const repeat = e.target.value as TaskSchedule["repeat"];
                        patch({
                            repeat,
                            weekdays:
                                repeat === "weekly"
                                    ? (s?.weekdays ?? [
                                          localDay().dayOfWeek % 7,
                                      ])
                                    : undefined,
                            monthDay:
                                repeat === "monthly"
                                    ? (s?.monthDay ?? localDay().day)
                                    : undefined,
                        });
                    }}
                >
                    <option value="none">بدون تكرار</option>
                    <option value="daily">يوميًا</option>
                    <option value="weekly">أسبوعيًا</option>
                    <option value="monthly">شهريًا</option>
                </select>
            </label>
            <label className="field">
                {s?.repeat && s.repeat !== "none"
                    ? "تاريخ بداية التكرار"
                    : "تاريخ التنفيذ"}
                <input
                    type="date"
                    min="1900-01-01"
                    value={s?.date ?? ""}
                    onChange={(e) => {
                        if (e.target.value) patch({ date: e.target.value });
                        else
                            onChange({
                                ...value,
                                schedule:
                                    s?.repeat !== "none" && s
                                        ? { ...s, date: localDay().toString() }
                                        : undefined,
                            });
                    }}
                />
            </label>
            {s && (
                <>
                    <label className="field">
                        الوقت <span className="muted">(اختياري)</span>
                        <input
                            type="time"
                            value={s.time ?? ""}
                            onChange={(e) =>
                                patch({ time: e.target.value || undefined })
                            }
                        />
                    </label>
                    {s.repeat === "weekly" && (
                        <fieldset className="weekdays">
                            <legend>أيام التكرار الأسبوعي</legend>
                            {weekdays.map((name, day) => (
                                <label key={day}>
                                    <input
                                        type="checkbox"
                                        checked={
                                            s.weekdays?.includes(day) ?? false
                                        }
                                        onChange={(e) =>
                                            patch({
                                                weekdays: e.target.checked
                                                    ? [
                                                          ...(s.weekdays ?? []),
                                                          day,
                                                      ]
                                                    : s.weekdays?.filter(
                                                          (d) => d !== day,
                                                      ),
                                            })
                                        }
                                    />
                                    {name}
                                </label>
                            ))}
                        </fieldset>
                    )}
                    {s.repeat === "monthly" && (
                        <>
                            <label className="field">
                                يوم الشهر
                                <select
                                    aria-label="يوم الشهر"
                                    value={s.monthDay ?? 1}
                                    onChange={(e) =>
                                        patch({
                                            monthDay: Number(e.target.value),
                                        })
                                    }
                                >
                                    {Array.from({ length: 31 }, (_, i) => (
                                        <option key={i} value={i + 1}>
                                            {i + 1}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <p className="muted small">
                                إذا لم يوجد اليوم المختار، يُستخدم آخر يوم من
                                الشهر.
                            </p>
                        </>
                    )}
                    <label className="field">
                        إظهار «اقترب الموعد»
                        <select
                            aria-label="إظهار «اقترب الموعد»"
                            value={s.leadDays}
                            onChange={(e) =>
                                patch({
                                    leadDays: Number(
                                        e.target.value,
                                    ) as TaskSchedule["leadDays"],
                                })
                            }
                        >
                            <option value="0">في يوم الموعد فقط</option>
                            <option value="1">قبل يوم</option>
                            <option value="3">قبل ٣ أيام</option>
                            <option value="7">قبل ٧ أيام</option>
                        </select>
                    </label>
                    {s.repeat !== "none" && (
                        <p className="muted small">
                            تنجز الدورة حتى الموعد التالي دون تأخير؛ اليومية
                            تنتهي عند بداية اليوم التالي. يبدأ الجدول الجديد عند
                            الحفظ، دون إنشاء دورات سابقة لتاريخ إنشائه.
                        </p>
                    )}
                    <p className="muted small">
                        التوقيت المحلي للجدول:{" "}
                        <span dir="ltr">{s.timeZone}</span>. تُحفظ منطقة الجدول
                        كي لا تتكرر دوراته عند الانتقال بين الأجهزة.
                    </p>
                    <button
                        type="button"
                        className="text-btn"
                        onClick={() =>
                            onChange({ ...value, schedule: undefined })
                        }
                    >
                        إلغاء الموعد والتكرار
                    </button>
                </>
            )}
        </fieldset>
    );
}
