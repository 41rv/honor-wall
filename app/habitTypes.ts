import type { ReceiptStore } from "./backupTables";
/** Storage contracts only. Recording, progression and suggestions are later phases. */
export interface HabitPause {
    start: string;
    end?: string;
}
export interface HabitPath {
    id: string;
    title: string;
    order: number;
    createdAt: string;
    updatedAt: string;
    pauses: HabitPause[];
    // A tombstone preserves historical plan membership after a path is removed.
    deletedAt?: string;
}
export interface Habit {
    id: string;
    title: string;
    kind: "simple" | "graded";
    pathId: string | null;
    timeZone: string;
    createdAt: string;
    updatedAt: string;
    archived: boolean;
    pauses: HabitPause[];
}
export interface HabitPhase {
    key: string;
    label: string;
    unit: string;
    start: number;
    target: number;
    step: number;
}
export interface HabitLevel {
    phaseKey: string;
    target: number;
}
export type HabitSchedule =
    { repeat: "daily" } | { repeat: "weekly"; weekdays: number[] };
export interface HabitPlan {
    id: string;
    habitId: string;
    revision: number;
    createdAt: string;
    effectiveDate: string;
    timeZone: string;
    pathId: string | null;
    schedule: HabitSchedule;
    phases: HabitPhase[];
    baseline?: HabitLevel;
    current?: HabitLevel;
}
export interface HabitEntry {
    id: string;
    habitId: string;
    planId: string;
    localDate: string;
    dayStart: string;
    dayEnd: string;
    timeZone: string;
    recordedAt: string;
    updatedAt: string;
    result:
        | { kind: "simple"; done: boolean }
        | {
              kind: "graded";
              phaseKey: string;
              unit: string;
              threshold: number;
              amount: number;
          };
    difficulty?: "easy" | "okay" | "hard";
}
export interface HabitSuggestion {
    id: string;
    habitId: string;
    planId: string;
    type: "increase" | "advance" | "maintain" | "ease";
    reason: string;
    effect: string;
    basisHash: string;
    createdAt: string;
    status: "new" | "accepted" | "rejected" | "invalid";
    decidedAt?: string;
    change?: HabitLevel;
    appliedPlanId?: string;
}
export interface Reminder {
    id: string;
    title: string;
    category?: string;
    createdAt: string;
    updatedAt: string;
    reviewedAt?: string;
}
export interface HabitImportReceipt {
    id: string;
    digest: string;
    kind: "path" | "habit" | "backup";
    createdAt: string;
    // References may become stale after deliberate deletion. Never treat digest
    // alone as proof that the imported items still exist, or rebind stale IDs.
    outputs: Partial<Record<ReceiptStore, string[]>>;
}
export interface HabitData {
    habitPaths?: HabitPath[];
    habits?: Habit[];
    habitPlans?: HabitPlan[];
    habitEntries?: HabitEntry[];
    habitSuggestions?: HabitSuggestion[];
    reminders?: Reminder[];
    habitImportReceipts?: HabitImportReceipt[];
}
