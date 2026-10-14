import {
    db,
    changeStatus,
    setBranchCompletion,
    setProjectCompletion,
    setCycleStatus,
    restoreTodaySelections,
} from "./db";
const prefix = "masar-pending-completion/";
const storageKey = (key: string) => prefix + encodeURIComponent(key);
export function rememberCompletion(
    key: string,
    desired: boolean,
    at = new Date().toISOString(),
    mode: "completion" | "doing" = "completion",
) {
    try {
        localStorage.setItem(
            storageKey(key),
            JSON.stringify({ key, desired, at, mode }),
        );
    } catch {
        /* IndexedDB remains primary when local recovery storage is unavailable. */
    }
}
export function settleCompletion(key: string, desired: boolean) {
    try {
        const record = JSON.parse(
            localStorage.getItem(storageKey(key)) ?? "null",
        );
        if (record?.key === key && record.desired === desired)
            localStorage.removeItem(storageKey(key));
    } catch {
        /* Do not affect a successful primary write. */
    }
}
export async function restoreCompletions() {
    let keys: string[];
    try {
        keys = Object.keys(localStorage).filter((key) =>
            key.startsWith(prefix),
        );
    } catch {
        return;
    }
    for (const storedKey of keys) {
        let record: {
            key: string;
            desired: boolean;
            at?: string;
            mode?: "completion" | "doing";
        };
        try {
            record = JSON.parse(localStorage.getItem(storedKey) ?? "null");
            if (
                !record ||
                typeof record.key !== "string" ||
                typeof record.desired !== "boolean" ||
                storageKey(record.key) !== storedKey
            ) {
                localStorage.removeItem(storedKey);
                continue;
            }
        } catch {
            try {
                localStorage.removeItem(storedKey);
            } catch {}
            continue;
        }
        const separator = record.key.indexOf("/");
        const kind = record.key.slice(0, separator),
            id = record.key.slice(separator + 1);
        const table =
            kind === "taskCycle"
                ? db.taskCycles
                : kind === "task"
                  ? db.tasks
                  : kind === "step"
                    ? db.steps
                    : kind === "project"
                      ? db.projects
                      : undefined;
        if (!table || !id || (kind !== "taskCycle" && !(await table.get(id)))) {
            settleCompletion(record.key, record.desired);
            continue;
        }
        // Primary APIs preserve atomic updates, dates and idempotent event logs.
        if (kind === "taskCycle") {
            if (!record.at || !Number.isFinite(Date.parse(record.at))) {
                settleCompletion(record.key, record.desired);
                continue;
            }
            try {
                await setCycleStatus(
                    id,
                    record.mode === "doing"
                        ? "doing"
                        : record.desired
                          ? "done"
                          : "todo",
                    record.at,
                );
            } catch (err) {
                if (
                    err instanceof Error &&
                    /الدورة غير موجودة|تغير جدولها|انتهت هذه الدورة/.test(
                        err.message,
                    )
                ) {
                    settleCompletion(record.key, record.desired);
                    continue;
                }
                throw err;
            }
        } else if (
            kind === "task" &&
            (await db.tasks.get(id))?.schedule?.repeat &&
            (await db.tasks.get(id))?.schedule?.repeat !== "none"
        ) {
            // An old one-off intent must never complete a newly recurring task.
        } else if (kind === "task")
            await changeStatus(
                "task",
                id,
                record.mode === "doing"
                    ? "doing"
                    : record.desired
                      ? "done"
                      : "todo",
            );
        else if (kind === "step") await setBranchCompletion(id, record.desired);
        else await setProjectCompletion(id, record.desired);
        settleCompletion(record.key, record.desired);
    }
}
let startup: Promise<void> | undefined;
export function startCompletionRecovery() {
    return (startup ??= restoreCompletions().then(restoreTodaySelections));
}
