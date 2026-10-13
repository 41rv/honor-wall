import {
    db,
    changeStatus,
    setBranchCompletion,
    setProjectCompletion,
} from "./db";
const prefix = "masar-pending-completion/";
const storageKey = (key: string) => prefix + encodeURIComponent(key);
export function rememberCompletion(key: string, desired: boolean) {
    try {
        localStorage.setItem(storageKey(key), JSON.stringify({ key, desired }));
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
        let record: { key: string; desired: boolean };
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
            kind === "task"
                ? db.tasks
                : kind === "step"
                  ? db.steps
                  : kind === "project"
                    ? db.projects
                    : undefined;
        if (!table || !id || !(await table.get(id))) {
            settleCompletion(record.key, record.desired);
            continue;
        }
        // Primary APIs preserve atomic updates, dates and idempotent event logs.
        if (kind === "task")
            await changeStatus("task", id, record.desired ? "done" : "todo");
        else if (kind === "step") await setBranchCompletion(id, record.desired);
        else await setProjectCompletion(id, record.desired);
        settleCompletion(record.key, record.desired);
    }
}
let startup: Promise<void> | undefined;
export function startCompletionRecovery() {
    return (startup ??= restoreCompletions());
}
