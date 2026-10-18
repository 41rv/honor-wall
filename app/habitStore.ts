import { db } from "./db";
import { trackBackupWrite } from "./backupWrites";
import { uid } from "./model";
import {
    addHabitDays,
    effectiveHabitPlan,
    habitDate,
    habitDayBounds,
    habitPaused,
} from "./habitCalendar";
import type {
    Habit,
    HabitEntry,
    HabitPath,
    HabitPause,
    HabitPlan,
    HabitSchedule,
    HabitPhase,
    HabitLevel,
} from "./habitTypes";

import { validateHabitLevels } from "./habitProgression";
import { scaledQuantity } from "./habitValidation";
import { assessedHabitEntries, assessmentFromEntry } from "./habitAssessments";
import {
    recordedPerformance,
    validFeedback,
    type HabitFeedbackInput,
} from "./habitFeedback";

const stores = [
    db.habits,
    db.habitPaths,
    db.habitPlans,
    db.habitEntries,
    db.habitAssessments,
];
function write<T>(operation: () => Promise<T>) {
    return trackBackupWrite(() => db.transaction("rw", stores, operation));
}
function title(value: string) {
    const text = value.trim();
    if (!text || text.length > 300)
        throw new Error("اكتب اسمًا من حرف إلى300 حرف.");
    return text;
}
function assertTime(row: { updatedAt: string }, at: Date) {
    if (at.toISOString() < row.updatedAt)
        throw new Error(
            "وقت الجهاز يسبق آخر تغيير محفوظ. تحقق من ساعة الجهاز.",
        );
}
function schedule(value: HabitSchedule): HabitSchedule {
    if (value.repeat === "daily") return { repeat: "daily" };
    if (
        value.repeat !== "weekly" ||
        !Array.isArray(value.weekdays) ||
        !value.weekdays.length ||
        value.weekdays.length > 7 ||
        new Set(value.weekdays).size !== value.weekdays.length ||
        value.weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)
    )
        throw new Error("اختر يومًا أسبوعيًا واحدًا على الأقل.");
    return {
        repeat: "weekly",
        weekdays: [...value.weekdays].sort((a, b) => a - b),
    };
}
async function activePath(pathId: string | null) {
    if (pathId === null) return;
    const path = await db.habitPaths.get(pathId);
    if (!path || path.deletedAt)
        throw new Error("المسار غير متاح. اختر مسارًا آخر أو عادة مستقلة.");
}
function changedPauses(pauses: HabitPause[], paused: boolean, at: Date) {
    const stamp = at.toISOString();
    const last = pauses.at(-1);
    if (last && stamp < (last.end ?? last.start))
        throw new Error(
            "وقت الجهاز يسبق آخر تغيير محفوظ. تحقق من ساعة الجهاز.",
        );
    if (habitPaused(pauses, at) === paused) return pauses;
    return paused
        ? [...pauses, { start: stamp }]
        : pauses.map((p, i) =>
              i === pauses.length - 1 ? { ...p, end: stamp } : p,
          );
}
export function saveHabitPath(
    input: { title: string; id?: string },
    at = new Date(),
) {
    return write(async () => {
        const name = title(input.title),
            stamp = at.toISOString();
        if (input.id) {
            const old = await db.habitPaths.get(input.id);
            if (!old || old.deletedAt)
                throw new Error("المسار غير متاح للتعديل.");
            assertTime(old, at);
            await db.habitPaths.put({ ...old, title: name, updatedAt: stamp });
            return old.id;
        }
        const id = uid();
        await db.habitPaths.add({
            id,
            title: name,
            order: (await db.habitPaths.toArray()).reduce(
                (m, p) => Math.max(m, p.order + 1),
                0,
            ),
            createdAt: stamp,
            updatedAt: stamp,
            pauses: [],
        });
        return id;
    });
}
export interface SimpleHabitInput {
    id?: string;
    title: string;
    pathId: string | null;
    schedule: HabitSchedule;
    startDate?: string;
    timeZone?: string;
}
async function revise(
    habit: Habit,
    pathId: string | null,
    nextSchedule: HabitSchedule,
    at: Date,
) {
    const plans = await db.habitPlans
        .where("habitId")
        .equals(habit.id)
        .sortBy("revision");
    const latest = plans.at(-1);
    if (!latest) throw new Error("تعذر العثور على خطة العادة.");
    if (
        latest.pathId === pathId &&
        JSON.stringify(latest.schedule) === JSON.stringify(nextSchedule)
    )
        return;
    if (at.toISOString() < latest.createdAt)
        throw new Error("تحقق من ساعة الجهاز قبل تعديل الخطة.");
    const tomorrow = addHabitDays(habitDate(at, habit.timeZone), 1);
    const effectiveDate =
        latest.effectiveDate > tomorrow ? latest.effectiveDate : tomorrow;
    const plan: HabitPlan = {
        ...latest,
        id: uid(),
        revision: latest.revision + 1,
        createdAt: at.toISOString(),
        effectiveDate,
        pathId,
        schedule: nextSchedule,
    };
    await db.habitPlans.add(plan);
}
export function saveSimpleHabit(input: SimpleHabitInput, at = new Date()) {
    return write(async () => {
        const name = title(input.title),
            nextSchedule = schedule(input.schedule),
            stamp = at.toISOString();
        await activePath(input.pathId);
        if (input.id) {
            const old = await db.habits.get(input.id);
            if (!old || old.kind !== "simple")
                throw new Error("العادة غير متاحة للتعديل في هذه المرحلة.");
            assertTime(old, at);
            await revise(old, input.pathId, nextSchedule, at);
            await db.habits.put({
                ...old,
                title: name,
                pathId: input.pathId,
                updatedAt: stamp,
            });
            return old.id;
        }
        const zone =
            input.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
        const today = habitDate(at, zone),
            start = input.startDate ?? today;
        habitDayBounds(start, zone);
        if (!/^\d{4}-\d\d-\d\d$/.test(start) || start < today)
            throw new Error("تاريخ البداية يجب أن يكون اليوم أو بعده.");
        const id = uid();
        const habit: Habit = {
            id,
            title: name,
            kind: "simple",
            pathId: input.pathId,
            timeZone: zone,
            createdAt: stamp,
            updatedAt: stamp,
            archived: false,
            pauses: [],
        };
        await db.habits.add(habit);
        await db.habitPlans.add({
            id: uid(),
            habitId: id,
            revision: 1,
            createdAt: stamp,
            effectiveDate: start,
            timeZone: zone,
            pathId: input.pathId,
            schedule: nextSchedule,
            phases: [],
        });
        return id;
    });
}
export function setHabitPaused(
    kind: "habit" | "path",
    id: string,
    paused: boolean,
    at = new Date(),
) {
    return write(async () => {
        if (kind === "habit") {
            const old = await db.habits.get(id);
            if (!old) throw new Error("العادة غير موجودة.");
            assertTime(old, at);
            await db.habits.put({
                ...old,
                pauses: changedPauses(old.pauses, paused, at),
                updatedAt: at.toISOString(),
            });
        } else {
            const old = await db.habitPaths.get(id);
            if (!old || old.deletedAt) throw new Error("المسار غير متاح.");
            assertTime(old, at);
            await db.habitPaths.put({
                ...old,
                pauses: changedPauses(old.pauses, paused, at),
                updatedAt: at.toISOString(),
            });
        }
    });
}
/** Archival uses the approved path tombstone, not a new schema/field. Current
 * children become independent; immutable historical membership is retained. */
export function archiveHabitPath(id: string, at = new Date()) {
    return write(async () => {
        const path = await db.habitPaths.get(id);
        if (!path || path.deletedAt) return;
        assertTime(path, at);
        for (const habit of await db.habits
            .where("pathId")
            .equals(id)
            .toArray()) {
            const latest = (
                await db.habitPlans
                    .where("habitId")
                    .equals(habit.id)
                    .sortBy("revision")
            ).at(-1)!;
            await revise(habit, null, latest.schedule, at);
            await db.habits.put({
                ...habit,
                pathId: null,
                updatedAt: at.toISOString(),
            });
        }
        await db.habitPaths.put({
            ...path,
            deletedAt: at.toISOString(),
            updatedAt: at.toISOString(),
            pauses: changedPauses(path.pauses, true, at),
        });
    });
}
export function restoreHabitPath(id: string, at = new Date()) {
    return write(async () => {
        const old = await db.habitPaths.get(id);
        if (!old?.deletedAt) return;
        assertTime(old, at);
        const path: HabitPath = { ...old, updatedAt: at.toISOString() };
        delete path.deletedAt;
        // Keep its pause independent. Restoration never resumes habits.
        await db.habitPaths.put(path);
    });
}
export function setHabitArchived(
    id: string,
    archived: boolean,
    at = new Date(),
) {
    return write(async () => {
        const old = await db.habits.get(id);
        if (!old) throw new Error("العادة غير موجودة.");
        assertTime(old, at);
        await db.habits.put({
            ...old,
            archived,
            updatedAt: at.toISOString(),
            pauses: archived ? changedPauses(old.pauses, true, at) : old.pauses,
        });
    });
}
/** Absolute desired state, never read-toggle-write. Same-day concurrent writes
 * serialize over the unique compound key; the original row/id stays stable. */
export function recordSimpleHabit(
    id: string,
    date: string,
    done: boolean,
    at = new Date(),
) {
    return write(async () => {
        if (typeof done !== "boolean")
            throw new Error("حالة التسجيل غير صحيحة.");
        const habit = await db.habits.get(id);
        if (!habit || habit.kind !== "simple")
            throw new Error("هذه العادة لا تدعم التسجيل البسيط.");
        if (date > habitDate(at, habit.timeZone))
            throw new Error("لا يمكن تسجيل يوم مستقبلي.");
        const plans = await db.habitPlans.where("habitId").equals(id).toArray();
        const plan = effectiveHabitPlan(plans, date);
        if (!plan) throw new Error("هذا اليوم يسبق بداية العادة.");
        const bounds = habitDayBounds(date, habit.timeZone);
        if (
            !/^\d{4}-\d\d-\d\d$/.test(date) ||
            bounds.end <= Date.parse(habit.createdAt)
        )
            throw new Error("تاريخ التسجيل غير صالح.");
        const raw = await db.habitEntries
            .where("[habitId+localDate]")
            .equals([id, date])
            .first();
        const old = raw
            ? (await assessedHabitEntries(db, [raw]))[0]
            : undefined;
        if (old?.result.kind === "simple" && old.result.done === done)
            return old.id;
        const stamp = at.toISOString();
        if (stamp < (old?.updatedAt ?? plan.createdAt))
            throw new Error("وقت الجهاز يسبق آخر تسجيل محفوظ.");
        const entry: HabitEntry = {
            id: old?.id ?? uid(),
            habitId: id,
            planId: plan.id,
            localDate: date,
            dayStart: new Date(bounds.start).toISOString(),
            dayEnd: new Date(bounds.end).toISOString(),
            timeZone: habit.timeZone,
            recordedAt: old?.recordedAt ?? stamp,
            updatedAt: stamp,
            result: { kind: "simple", done },
            ...(old?.difficulty ? { difficulty: old.difficulty } : {}),
            ...(old?.effortRating !== undefined
                ? { effortRating: old.effortRating }
                : {}),
            ...(old?.durationMinutes !== undefined
                ? { durationMinutes: old.durationMinutes }
                : {}),
        };
        await db.habitEntries.put(entry);
        return entry.id;
    });
}

export interface GradedHabitInput extends SimpleHabitInput {
    phases: HabitPhase[];
    current: HabitLevel;
}
export function saveGradedHabit(input: GradedHabitInput, at = new Date()) {
    return write(async () => {
        const name = title(input.title),
            nextSchedule = schedule(input.schedule),
            stamp = at.toISOString();
        await activePath(input.pathId);
        const old = input.id ? await db.habits.get(input.id) : undefined;
        if (input.id && (!old || old.kind !== "graded"))
            throw new Error(
                "نوع العادة ثابت لحماية سجلها. أنشئ عادة متدرجة مستقلة.",
            );
        if (old) assertTime(old, at);
        const previous = old
            ? await db.habitPlans
                  .where("habitId")
                  .equals(old.id)
                  .sortBy("revision")
            : [];
        const latest = previous.at(-1);
        const baseline = latest?.baseline ?? input.current;
        validateHabitLevels(input.phases, input.current, baseline);
        for (const p of previous)
            for (const phase of p.phases) {
                const next = input.phases.find((n) => n.key === phase.key);
                if (next && next.unit !== phase.unit)
                    throw new Error(
                        "لا تغير وحدة مرحلة محفوظة. أضف مرحلة بمفتاح جديد بدل إعادة تفسير السجل.",
                    );
            }
        const zone =
            old?.timeZone ??
            input.timeZone ??
            Intl.DateTimeFormat().resolvedOptions().timeZone;
        const today = habitDate(at, zone),
            start = input.startDate ?? today;
        if (!old && start < today)
            throw new Error("تاريخ البداية يجب أن يكون اليوم أو بعده.");
        habitDayBounds(start, zone);
        const id = old?.id ?? uid();
        const habit: Habit = old
            ? { ...old, title: name, pathId: input.pathId, updatedAt: stamp }
            : {
                  id,
                  title: name,
                  kind: "graded",
                  pathId: input.pathId,
                  timeZone: zone,
                  createdAt: stamp,
                  updatedAt: stamp,
                  archived: false,
                  pauses: [],
              };
        const unchanged =
            latest &&
            JSON.stringify([
                latest.phases,
                latest.current,
                latest.schedule,
                latest.pathId,
            ]) ===
                JSON.stringify([
                    input.phases,
                    input.current,
                    nextSchedule,
                    input.pathId,
                ]);
        if (!unchanged) {
            if (latest && stamp < latest.createdAt)
                throw new Error("تحقق من ساعة الجهاز قبل تعديل الخطة.");
            const tomorrow = addHabitDays(today, 1);
            await db.habitPlans.add({
                id: uid(),
                habitId: id,
                revision: (latest?.revision ?? 0) + 1,
                createdAt: stamp,
                effectiveDate: latest
                    ? latest.effectiveDate > tomorrow
                        ? latest.effectiveDate
                        : tomorrow
                    : start,
                timeZone: zone,
                pathId: input.pathId,
                schedule: nextSchedule,
                phases: structuredClone(input.phases),
                baseline: { ...baseline },
                current: { ...input.current },
            });
        }
        await db.habits.put(habit);
        return id;
    });
}
/** Absolute quantity, single row/day. null removes the daily recording; editing preserves its identity and snapshot. */
export function recordGradedHabit(
    id: string,
    date: string,
    amount: number | null,
    difficulty?: HabitEntry["difficulty"] | null,
    at = new Date(),
) {
    return write(async () => {
        if (
            (amount !== null && scaledQuantity(amount) === null) ||
            (difficulty != null &&
                !["easy", "okay", "hard"].includes(difficulty))
        )
            throw new Error("أدخل كمية غير سالبة، بدقة حتى3 منازل عشرية.");
        const habit = await db.habits.get(id);
        if (!habit || habit.kind !== "graded")
            throw new Error("العادة المتدرجة غير متاحة.");
        if (date > habitDate(at, habit.timeZone))
            throw new Error("لا يمكن تسجيل يوم مستقبلي.");
        const plan = effectiveHabitPlan(
            await db.habitPlans.where("habitId").equals(id).toArray(),
            date,
        );
        if (!plan?.current) throw new Error("هذا اليوم يسبق بداية العادة.");
        const bounds = habitDayBounds(date, habit.timeZone);
        if (bounds.end <= Date.parse(habit.createdAt))
            throw new Error("تاريخ التسجيل غير صالح.");
        const raw = await db.habitEntries
            .where("[habitId+localDate]")
            .equals([id, date])
            .first();
        const old = raw
            ? (await assessedHabitEntries(db, [raw]))[0]
            : undefined;
        const stamp = at.toISOString();
        if (stamp < (old?.updatedAt ?? plan.createdAt))
            throw new Error("وقت الجهاز يسبق آخر تسجيل محفوظ.");
        if (amount === null) {
            if (old) {
                await db.habitEntries.delete(old.id);
                await db.habitAssessments.delete(old.id);
            }
            return old?.id;
        }
        const phase = plan.phases.find(
            (p) => p.key === plan.current!.phaseKey,
        )!;
        const result: HabitEntry["result"] = {
            kind: "graded",
            phaseKey: phase.key,
            unit: phase.unit,
            threshold: plan.current.target,
            amount,
        };
        const nextDifficulty =
            difficulty === null ? undefined : (difficulty ?? old?.difficulty);
        if (
            old &&
            JSON.stringify(old.result) === JSON.stringify(result) &&
            old.difficulty === nextDifficulty
        )
            return old.id;
        const entry: HabitEntry = {
            id: old?.id ?? uid(),
            habitId: id,
            planId: plan.id,
            localDate: date,
            dayStart: new Date(bounds.start).toISOString(),
            dayEnd: new Date(bounds.end).toISOString(),
            timeZone: habit.timeZone,
            recordedAt: old?.recordedAt ?? stamp,
            updatedAt: stamp,
            result,
            ...(nextDifficulty ? { difficulty: nextDifficulty } : {}),
            ...(old?.effortRating !== undefined
                ? { effortRating: old.effortRating }
                : {}),
            ...(old?.durationMinutes !== undefined
                ? { durationMinutes: old.durationMinutes }
                : {}),
        };
        await db.habitEntries.put(entry);
        return entry.id;
    });
}

/** Patch one existing recording, never upsert or recreate a deleted entry. */
export function saveHabitFeedback(
    entryId: string,
    input: HabitFeedbackInput,
    at = new Date(),
) {
    return write(async () => {
        if (!validFeedback(input))
            throw new Error(
                "اختر تقييمًا من1 إلى5، ومدة موجبة لا تتجاوز1440 دقيقة بدقة حتى3 منازل عشرية.",
            );
        const raw = await db.habitEntries.get(entryId);
        const old = raw
            ? (await assessedHabitEntries(db, [raw]))[0]
            : undefined;
        if (
            !old ||
            !(await db.habits.get(old.habitId)) ||
            !recordedPerformance(old)
        )
            throw new Error(
                "التسجيل غير متاح. أعد فتح اليوم قبل تعديل تقييمه.",
            );
        assertTime(old, at);
        const next = { ...old };
        if (input.effortRating === null) delete next.effortRating;
        else if (input.effortRating !== undefined)
            next.effortRating = input.effortRating;
        if (input.durationMinutes === null) delete next.durationMinutes;
        else if (input.durationMinutes !== undefined)
            next.durationMinutes = input.durationMinutes;
        if (input.clearLegacyDifficulty) delete next.difficulty;
        if (
            old.effortRating === next.effortRating &&
            old.durationMinutes === next.durationMinutes &&
            old.difficulty === next.difficulty
        )
            return old.id;
        const updated = { ...next, updatedAt: at.toISOString() };
        await db.habitEntries.put(updated);
        const assessment = assessmentFromEntry(updated);
        if (assessment) await db.habitAssessments.put(assessment);
        else await db.habitAssessments.delete(entryId);
        return old.id;
    });
}
