import type { Database } from "./db";
import type { HabitEntry, HabitAssessment } from "./habitTypes";

export function assessmentFromEntry(
    entry: HabitEntry,
): HabitAssessment | undefined {
    if (entry.effortRating === undefined && entry.durationMinutes === undefined)
        return;
    return {
        id: entry.id,
        habitId: entry.habitId,
        planId: entry.planId,
        localDate: entry.localDate,
        updatedAt: entry.updatedAt,
        ...(entry.effortRating !== undefined
            ? { effortRating: entry.effortRating }
            : {}),
        ...(entry.durationMinutes !== undefined
            ? { durationMinutes: entry.durationMinutes }
            : {}),
    };
}
export function assessmentMatches(
    entry: HabitEntry | undefined,
    assessment: HabitAssessment,
) {
    return (
        !!entry &&
        entry.id === assessment.id &&
        entry.habitId === assessment.habitId &&
        entry.planId === assessment.planId &&
        entry.localDate === assessment.localDate &&
        // An old-format replacement may reuse IDs with a newer recording.
        // Feedback cannot predate its parent; keep the safety copy, not a
        // dangling association that would make the next export invalid.
        assessment.updatedAt >= entry.recordedAt
    );
}
export function withHabitAssessments(
    entries: HabitEntry[],
    assessments: HabitAssessment[],
) {
    const index = new Map(assessments.map((a) => [a.id, a]));
    return entries.map((entry) => {
        const a = index.get(entry.id);
        if (!a || !assessmentMatches(entry, a)) return entry;
        const {
            effortRating: _rating,
            durationMinutes: _minutes,
            ...base
        } = entry;
        return {
            ...base,
            updatedAt:
                entry.updatedAt > a.updatedAt ? entry.updatedAt : a.updatedAt,
            ...(a.effortRating !== undefined
                ? { effortRating: a.effortRating }
                : {}),
            ...(a.durationMinutes !== undefined
                ? { durationMinutes: a.durationMinutes }
                : {}),
        };
    });
}
export async function assessedHabitEntries(
    database: Database,
    entries: HabitEntry[],
) {
    if (!entries.length) return entries;
    const rows = await database.habitAssessments.bulkGet(
        entries.map((e) => e.id),
    );
    return withHabitAssessments(
        entries,
        rows.filter((a): a is HabitAssessment => !!a),
    );
}
/** Called in an existing write transaction. Only feedback whose original
 * recording was explicitly removed/replaced is pruned. Never recreate entries. */
export async function reconcileHabitAssessments(database: Database) {
    const rows = await database.habitAssessments.toArray();
    if (!rows.length) return;
    const entries = await database.habitEntries.bulkGet(rows.map((a) => a.id));
    const orphaned = rows.filter((a, i) => !assessmentMatches(entries[i], a));
    if (orphaned.length)
        await database.habitAssessments.bulkDelete(orphaned.map((a) => a.id));
}
