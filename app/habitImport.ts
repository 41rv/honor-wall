import { db } from "./db";
import { trackBackupWrite } from "./backupWrites";
import { uid } from "./model";
import { habitDate, habitDayBounds } from "./habitCalendar";
import { validateHabitLevels } from "./habitProgression";
import { receiptPresent } from "./habitBackupMerge";
import type {
    Habit,
    HabitLevel,
    HabitPhase,
    HabitPlan,
    HabitSchedule,
} from "./habitTypes";
export interface HabitDefinition {
    key: string;
    title: string;
    kind: "simple" | "progressive";
    schedule: HabitSchedule;
    phases?: {
        key: string;
        title: string;
        unit: string;
        start: number;
        goal: number;
        step: number;
    }[];
    current?: HabitLevel;
}
export type HabitsImport =
    | {
          format: "masar.habits";
          version: 1;
          kind: "habit";
          habit: HabitDefinition;
      }
    | {
          format: "masar.habits";
          version: 1;
          kind: "path";
          path: { title: string; habits: HabitDefinition[] };
      };
const fail = (where: string): never => {
    throw new Error(`ملف العادات غير صالح: ${where}.`);
};
function object(
    value: unknown,
    allowed: string[],
    where: string,
): Record<string, unknown> {
    if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        Object.keys(value).some((k) => !allowed.includes(k))
    )
        return fail(where);
    return value as Record<string, unknown>;
}
function text(value: unknown, where: string, max = 300): string {
    if (typeof value !== "string" || !value.trim() || value.length > max)
        return fail(where);
    return value.trim();
}
export function definitionPhases(h: HabitDefinition): HabitPhase[] {
    return (h.phases ?? []).map((p) => ({
        key: p.key,
        label: p.title,
        unit: p.unit,
        start: p.start,
        target: p.goal,
        step: p.step,
    }));
}
function definition(value: unknown): HabitDefinition {
    const v = object(
            value,
            ["key", "title", "kind", "schedule", "phases", "current"],
            "حقول العادة",
        ),
        key = text(v.key, "مفتاح العادة", 100),
        title = text(v.title, "اسم العادة");
    if (v.kind !== "simple" && v.kind !== "progressive")
        return fail("نوع العادة");
    const s = object(v.schedule, ["repeat", "weekdays"], "جدول العادة");
    let schedule: HabitSchedule;
    if (s.repeat === "daily" && !("weekdays" in s))
        schedule = { repeat: "daily" };
    else if (
        s.repeat === "weekly" &&
        Array.isArray(s.weekdays) &&
        s.weekdays.length > 0 &&
        s.weekdays.length <= 7 &&
        new Set(s.weekdays).size === s.weekdays.length &&
        s.weekdays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    )
        schedule = {
            repeat: "weekly",
            weekdays: [...s.weekdays].sort((a, b) => a - b),
        };
    else
        return fail(
            "اختر يومًا أسبوعيًا واحدًا على الأقل دون تكرار، أو تكرارًا يوميًا",
        );
    if (v.kind === "simple") {
        if ("phases" in v || "current" in v)
            return fail("العادة البسيطة لا تقبل مراحل أو مستوى كمي");
        return { key, title, kind: "simple", schedule };
    }
    if (!Array.isArray(v.phases) || v.phases.length < 1 || v.phases.length > 30)
        return fail("عدد المراحل من1 إلى30");
    const phases = v.phases.map((p) => {
        const r = object(
            p,
            ["key", "title", "unit", "start", "goal", "step"],
            "حقول المرحلة",
        );
        return {
            key: text(r.key, "مفتاح المرحلة", 100),
            title: text(r.title, "اسم المرحلة"),
            unit: text(r.unit, "الوحدة", 50),
            start: r.start as number,
            goal: r.goal as number,
            step: r.step as number,
        };
    });
    const c = object(v.current, ["phaseKey", "target"], "المستوى الحالي");
    const current = {
        phaseKey: text(c.phaseKey, "مرجع المرحلة", 100),
        target: c.target as number,
    };
    const result: HabitDefinition = {
        key,
        title,
        kind: "progressive",
        schedule,
        phases,
        current,
    };
    validateHabitLevels(definitionPhases(result), current);
    return result;
}
export function parseHabitsImport(raw: string): HabitsImport {
    if (new TextEncoder().encode(raw).byteLength > 1024 * 1024)
        throw new Error("حجم الملف يتجاوز1MiB.");
    let value: unknown;
    try {
        value = JSON.parse(raw);
    } catch {
        throw new Error("تعذر قراءة JSON. راجع الفواصل والأقواس.");
    }
    const v = object(
        value,
        ["format", "version", "kind", "path", "habit"],
        "حقول الملف",
    );
    if (v.format !== "masar.habits" || v.version !== 1)
        return fail("الصيغة المطلوبة masar.habits بالإصدار1");
    if (v.kind === "habit" && !("path" in v))
        return {
            format: "masar.habits",
            version: 1,
            kind: "habit",
            habit: definition(v.habit),
        };
    if (v.kind !== "path" || "habit" in v) return fail("نوع الملف أو محتواه");
    const p = object(v.path, ["title", "habits"], "حقول المسار");
    if (!Array.isArray(p.habits) || !p.habits.length || p.habits.length > 200)
        return fail("عدد العادات من1 إلى200");
    const habits = p.habits.map(definition);
    if (new Set(habits.map((h) => h.key)).size !== habits.length)
        return fail("مفاتيح العادات مكررة");
    return {
        format: "masar.habits",
        version: 1,
        kind: "path",
        path: { title: text(p.title, "اسم المسار"), habits },
    };
}
export async function habitImportDigest(doc: HabitsImport) {
    // Definitions have a fixed property order; weekly day order is canonical.
    const bytes = new TextEncoder().encode(
        JSON.stringify(parseHabitsImport(JSON.stringify(doc))),
    );
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(hash)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}
export class DuplicateHabitImport extends Error {
    constructor(public route: string) {
        super(
            "هذا الملف مستورد بالفعل. افتح العناصر الموجودة، أو اختر صراحةً إنشاء نسخة إضافية.",
        );
    }
}
export async function importHabits(
    input: HabitsImport,
    options: {
        startDate?: string;
        timeZone?: string;
        allowCopy?: boolean;
    } = {},
    at = new Date(),
) {
    const doc = parseHabitsImport(JSON.stringify(input)),
        digest = await habitImportDigest(doc);
    const zone =
            options.timeZone ??
            Intl.DateTimeFormat().resolvedOptions().timeZone,
        today = habitDate(at, zone),
        date = options.startDate ?? today;
    habitDayBounds(date, zone);
    if (date < today)
        throw new Error("تاريخ البداية يجب أن يكون اليوم أو بعده.");
    return trackBackupWrite(() =>
        db.transaction(
            "rw",
            [db.habitPaths, db.habits, db.habitPlans, db.habitImportReceipts],
            async () => {
                if (!options.allowCopy)
                    for (const r of await db.habitImportReceipts
                        .where("digest")
                        .equals(digest)
                        .toArray())
                        if (
                            r.kind !== "backup" &&
                            (await receiptPresent(db, r))
                        ) {
                            throw new DuplicateHabitImport(
                                r.kind === "path"
                                    ? `habit-path/${r.outputs.habitPaths![0]}`
                                    : `habit/${r.outputs.habits![0]}`,
                            );
                        }
                const stamp = at.toISOString(),
                    pathId = doc.kind === "path" ? uid() : null;
                if (doc.kind === "path")
                    await db.habitPaths.add({
                        id: pathId!,
                        title: doc.path.title,
                        order: (await db.habitPaths.toArray()).reduce(
                            (m, p) => Math.max(m, p.order + 1),
                            0,
                        ),
                        createdAt: stamp,
                        updatedAt: stamp,
                        pauses: [],
                    });
                const batch = uid();
                const habits: Habit[] = [],
                    plans: HabitPlan[] = [];
                for (const h of doc.kind === "path"
                    ? doc.path.habits
                    : [doc.habit]) {
                    const id = `${batch}-${String(habits.length).padStart(3, "0")}`;
                    habits.push({
                        id,
                        title: h.title,
                        kind: h.kind === "simple" ? "simple" : "graded",
                        pathId,
                        timeZone: zone,
                        createdAt: stamp,
                        updatedAt: stamp,
                        archived: false,
                        pauses: [],
                    });
                    plans.push({
                        id: uid(),
                        habitId: id,
                        revision: 1,
                        createdAt: stamp,
                        effectiveDate: date,
                        timeZone: zone,
                        pathId,
                        schedule: h.schedule,
                        phases: definitionPhases(h),
                        ...(h.current
                            ? {
                                  baseline: { ...h.current },
                                  current: { ...h.current },
                              }
                            : {}),
                    });
                }
                await db.habits.bulkAdd(habits);
                await db.habitPlans.bulkAdd(plans);
                await db.habitImportReceipts.add({
                    id: uid(),
                    digest,
                    kind: doc.kind,
                    createdAt: stamp,
                    outputs: {
                        ...(pathId ? { habitPaths: [pathId] } : {}),
                        habits: habits.map((h) => h.id),
                        habitPlans: plans.map((p) => p.id),
                    },
                });
                return pathId
                    ? `habit-path/${pathId}`
                    : `habit/${habits[0].id}`;
            },
        ),
    );
}
