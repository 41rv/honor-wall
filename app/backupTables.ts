export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
/** The original stores are never removed or renamed by schema7. */
export const legacyStores = [
    "projects",
    "steps",
    "tasks",
    "ideas",
    "events",
    "taskCycles",
    "projectProgress",
    "projectTracking",
    "projectPlans",
    "stepWork",
    "recommendations",
    "paceSettings",
] as const;
export const schema7HabitStores = [
    "habitPaths",
    "habits",
    "habitPlans",
    "habitEntries",
    "habitSuggestions",
    "reminders",
    "habitImportReceipts",
] as const;
export const habitStores = [...schema7HabitStores, "habitAssessments"] as const;
export const backupStores = [...legacyStores, ...habitStores] as const;
export type BackupStore = (typeof backupStores)[number];
export type ReceiptStore = Exclude<
    BackupStore,
    "paceSettings" | "habitImportReceipts"
>;
export const receiptStores = backupStores.filter(
    (name): name is ReceiptStore =>
        name !== "paceSettings" && name !== "habitImportReceipts",
);
