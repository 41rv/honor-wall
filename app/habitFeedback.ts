import type { HabitEntry } from "./habitTypes";

export const effortLabels = ["سهل جدًا", "سهل", "متوسط", "صعب", "صعب جدًا"];
export interface HabitFeedbackInput {
    effortRating?: HabitEntry["effortRating"] | null;
    durationMinutes?: number | null;
    clearLegacyDifficulty?: boolean;
}
export function validFeedback(input: HabitFeedbackInput) {
    const rating = input.effortRating,
        minutes = input.durationMinutes;
    return (
        (input.clearLegacyDifficulty === undefined ||
            typeof input.clearLegacyDifficulty === "boolean") &&
        (rating == null ||
            (Number.isInteger(rating) && rating >= 1 && rating <= 5)) &&
        (minutes == null ||
            (Number.isFinite(minutes) &&
                minutes > 0 &&
                minutes <= 1440 &&
                Math.abs(minutes * 1000 - Math.round(minutes * 1000)) < 1e-7))
    );
}
export function recordedPerformance(entry?: HabitEntry) {
    return (
        !!entry &&
        (entry.result.kind === "simple"
            ? entry.result.done
            : entry.result.amount >= 0)
    );
}
export function hardEffort(entry: HabitEntry) {
    // The new explicit rating takes precedence; never invent a numeric rating
    // or a duration for an old easy/okay/hard entry.
    return entry.effortRating !== undefined
        ? entry.effortRating >= 4
        : entry.difficulty === "hard";
}
export function feedbackText(entry: HabitEntry) {
    return [
        entry.effortRating !== undefined
            ? `${entry.effortRating}/5 · ${effortLabels[entry.effortRating - 1]}`
            : entry.difficulty
              ? `تقييم سابق: ${{ easy: "سهل", okay: "مناسب", hard: "مرهق" }[entry.difficulty]}`
              : "",
        entry.durationMinutes !== undefined
            ? `${entry.durationMinutes} دقيقة فعلية`
            : "",
    ]
        .filter(Boolean)
        .join(" · ");
}
