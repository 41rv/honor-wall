import type { Database } from "./db";
import type { Snapshot } from "./model";
import { uid, now } from "./model";
import { habitStores, receiptStores, type ReceiptStore } from "./backupTables";
import type { HabitImportReceipt, HabitLevel } from "./habitTypes";

export async function receiptPresent(
    database: Database,
    receipt: HabitImportReceipt,
) {
    const groups = Object.entries(receipt.outputs);
    if (!groups.length) return false;
    for (const [name, ids] of groups) {
        if (!receiptStores.includes(name as ReceiptStore) || !ids) return false;
        if (
            (await database.table(name).bulkGet(ids)).some(
                (row) => row === undefined,
            )
        )
            return false;
    }
    return true;
}
/** Called inside the caller's all-store transaction. Typed namespaces and phase
 * remapping prevent IDs in another table or a stale receipt from binding locally. */
export async function mergeHabitGraph(
    database: Database,
    data: Snapshot,
    legacy: (store: ReceiptStore, id: string) => string,
) {
    const mappings = new Map<string, Map<string, string>>();
    const map = (store: string, id: string) => {
        if (!(habitStores as readonly string[]).includes(store))
            return legacy(store as ReceiptStore, id);
        let group = mappings.get(store);
        if (!group) mappings.set(store, (group = new Map()));
        if (!group.has(id)) group.set(id, uid());
        return group.get(id)!;
    };
    const phases = new Map<string, string>();
    const phase = (habit: string, key: string) => {
        const old = JSON.stringify([habit, key]);
        if (!phases.has(old)) phases.set(old, uid());
        return phases.get(old)!;
    };
    const level = (habit: string, row?: HabitLevel) =>
        row ? { ...row, phaseKey: phase(habit, row.phaseKey) } : undefined;
    const graph = {
        habitPaths: (data.habitPaths ?? []).map((p) => ({
            ...p,
            id: map("habitPaths", p.id),
        })),
        habits: (data.habits ?? []).map((h) => ({
            ...h,
            id: map("habits", h.id),
            pathId: h.pathId === null ? null : map("habitPaths", h.pathId),
        })),
        habitPlans: (data.habitPlans ?? []).map((p) => ({
            ...p,
            id: map("habitPlans", p.id),
            habitId: map("habits", p.habitId),
            pathId: p.pathId === null ? null : map("habitPaths", p.pathId),
            phases: p.phases.map((v) => ({
                ...v,
                key: phase(p.habitId, v.key),
            })),
            baseline: level(p.habitId, p.baseline),
            current: level(p.habitId, p.current),
        })),
        habitEntries: (data.habitEntries ?? []).map((e) => ({
            ...e,
            id: map("habitEntries", e.id),
            habitId: map("habits", e.habitId),
            planId: map("habitPlans", e.planId),
            result:
                e.result.kind === "simple"
                    ? e.result
                    : {
                          ...e.result,
                          phaseKey: phase(e.habitId, e.result.phaseKey),
                      },
        })),
        habitSuggestions: (data.habitSuggestions ?? []).map((s) => ({
            ...s,
            id: map("habitSuggestions", s.id),
            habitId: map("habits", s.habitId),
            planId: map("habitPlans", s.planId),
            change: level(s.habitId, s.change),
            appliedPlanId: s.appliedPlanId
                ? map("habitPlans", s.appliedPlanId)
                : undefined,
            // Decisions remain history. Pending advice cannot be applied against
            // identities/workload that changed during an additive restore.
            status: s.status === "new" ? ("invalid" as const) : s.status,
            decidedAt:
                s.status === "new"
                    ? new Date(
                          Math.max(Date.now(), Date.parse(s.createdAt)),
                      ).toISOString()
                    : s.decidedAt,
        })),
        reminders: (data.reminders ?? []).map((r) => ({
            ...r,
            id: map("reminders", r.id),
        })),
        habitImportReceipts: (data.habitImportReceipts ?? []).map((r) => ({
            ...r,
            id: map("habitImportReceipts", r.id),
            outputs: Object.fromEntries(
                Object.entries(r.outputs).map(([name, ids]) => [
                    name,
                    ids!.map((id) => map(name, id)),
                ]),
            ),
        })),
    };
    for (const name of habitStores)
        await database.table(name).bulkAdd(graph[name]);
    const outputs: HabitImportReceipt["outputs"] = {};
    for (const name of habitStores)
        if (name !== "habitImportReceipts")
            outputs[name] = graph[name].map((row) => row.id);
    return outputs;
}
export function backupReceipt(
    digest: string,
    outputs: HabitImportReceipt["outputs"],
): HabitImportReceipt {
    return { id: uid(), digest, kind: "backup", createdAt: now(), outputs };
}
