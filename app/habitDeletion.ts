import { db } from "./db";
import { trackBackupWrite } from "./backupWrites";
import type { HabitImportReceipt } from "./habitTypes";
import type { ReceiptStore } from "./backupTables";

export type HabitDeletionMode = "habit" | "path-only" | "path-with-habits";
const tables = [
    db.habitPaths,
    db.habits,
    db.habitPlans,
    db.habitEntries,
    db.habitSuggestions,
    db.habitImportReceipts,
    db.habitAssessments,
];
async function inspect(id: string, mode: HabitDeletionMode) {
    const path = mode === "habit" ? undefined : await db.habitPaths.get(id);
    const habit = mode === "habit" ? await db.habits.get(id) : undefined;
    if (!path && !habit)
        throw new Error("العنصر لم يعد موجودًا. لم يُحذف أي عنصر آخر.");
    const members = path
        ? await db.habits.where("pathId").equals(id).toArray()
        : [];
    const removed = habit
        ? [habit]
        : mode === "path-with-habits"
          ? members
          : [];
    const removedIds = new Set(removed.map((h) => h.id));
    const pathPlans = path
        ? await db.habitPlans.filter((p) => p.pathId === id).toArray()
        : [];
    const plans = (
        await Promise.all(
            removed.map((h) =>
                db.habitPlans.where("habitId").equals(h.id).toArray(),
            ),
        )
    ).flat();
    const retainedPlans = pathPlans.filter((p) => !removedIds.has(p.habitId));
    const entries = (
        await Promise.all(
            removed.map((h) =>
                db.habitEntries.where("habitId").equals(h.id).toArray(),
            ),
        )
    ).flat();
    const assessmentRows = (
        await Promise.all(
            removed.map((h) =>
                db.habitAssessments.where("habitId").equals(h.id).toArray(),
            ),
        )
    ).flat();
    const impactedHabits = [
        ...new Set([
            ...removed.map((h) => h.id),
            ...retainedPlans.map((p) => p.habitId),
        ]),
    ];
    const suggestions = (
        await Promise.all(
            impactedHabits.map((h) =>
                db.habitSuggestions.where("habitId").equals(h).toArray(),
            ),
        )
    ).flat();
    const removedSuggestions = suggestions.filter((s) =>
        removedIds.has(s.habitId),
    );
    const removedRefs: Partial<Record<ReceiptStore, Set<string>>> = {
        habits: removedIds,
        habitPlans: new Set(plans.map((p) => p.id)),
        habitEntries: new Set(entries.map((e) => e.id)),
        habitSuggestions: new Set(removedSuggestions.map((s) => s.id)),
        habitAssessments: new Set(assessmentRows.map((a) => a.id)),
        ...(path ? { habitPaths: new Set([id]) } : {}),
    };
    const receipts = await db.habitImportReceipts
        .filter((r) =>
            Object.entries(r.outputs).some(([name, ids]) =>
                ids!.some((ref) => removedRefs[name as ReceiptStore]?.has(ref)),
            ),
        )
        .toArray();
    const canonical = (rows: { id: string }[]) =>
        [...rows].sort((a, b) => a.id.localeCompare(b.id));
    const token = JSON.stringify([
        mode,
        path,
        habit,
        canonical(members),
        canonical(plans),
        canonical(retainedPlans),
        canonical(entries),
        canonical(assessmentRows),
        canonical(suggestions),
        canonical(receipts),
    ]);
    const preview = {
        id,
        mode,
        title: (path ?? habit)!.title,
        token,
        paths: path ? 1 : 0,
        habits: removed.length,
        retainedHabits: mode === "path-only" ? members.length : 0,
        entries: entries.length,
        plans: plans.length,
        assessments: new Set([
            ...assessmentRows.map((a) => a.id),
            ...entries
                .filter(
                    (e) =>
                        e.effortRating !== undefined ||
                        e.durationMinutes !== undefined ||
                        e.difficulty !== undefined,
                )
                .map((e) => e.id),
        ]).size,
        suggestions: removedSuggestions.length,
        receipts: receipts.length,
        detachedPlans: retainedPlans.length,
        invalidatedSuggestions: suggestions.filter(
            (s) => !removedIds.has(s.habitId) && s.status === "new",
        ).length,
    };
    return {
        preview,
        members,
        plans,
        retainedPlans,
        entries,
        assessmentRows,
        suggestions,
        removedSuggestions,
        removedRefs,
        receipts,
        path,
        removed,
    };
}
export type HabitDeletionPreview = Awaited<
    ReturnType<typeof inspect>
>["preview"];
export function previewHabitDeletion(id: string, mode: HabitDeletionMode) {
    return db.transaction(
        "r",
        tables,
        async () => (await inspect(id, mode)).preview,
    );
}
/** Preview token is rechecked within the same all-related-store transaction.
 * A concurrent recording/import must either precede this preview or require a
 * fresh confirmation; no unreviewed dependent data can be silently deleted. */
export function deleteHabitPermanently(
    preview: HabitDeletionPreview,
    at = new Date(),
) {
    return trackBackupWrite(() =>
        db.transaction("rw", tables, async () => {
            const graph = await inspect(preview.id, preview.mode);
            if (graph.preview.token !== preview.token)
                throw new Error(
                    "تغيرت البيانات منذ المعاينة. راجع الأعداد الجديدة وأكّد الحذف مرة أخرى.",
                );
            const stamp = at.toISOString();
            if (
                [graph.path, ...graph.members, ...graph.removed].some(
                    (r) => r && r.updatedAt > stamp,
                )
            )
                throw new Error(
                    "وقت الجهاز يسبق آخر تغيير محفوظ. تحقق من ساعة الجهاز.",
                );
            // Preserve exact past neutral intervals before removing the parent.
            if (graph.path) {
                const pauses = graph.path.pauses.map((p) => ({
                    ...p,
                    end: p.end ?? stamp,
                }));
                for (const p of graph.retainedPlans)
                    await db.habitPlans.put({
                        ...p,
                        pathId: null,
                        detachedPath: { title: graph.path.title, pauses },
                    });
                for (const h of graph.members.filter(
                    (h) => !graph.removedRefs.habits!.has(h.id),
                ))
                    await db.habits.put({
                        ...h,
                        pathId: null,
                        updatedAt: stamp,
                    });
                for (const s of graph.suggestions.filter(
                    (s) =>
                        !graph.removedRefs.habits!.has(s.habitId) &&
                        s.status === "new",
                ))
                    await db.habitSuggestions.put({
                        ...s,
                        status: "invalid",
                        decidedAt: new Date(
                            Math.max(at.getTime(), Date.parse(s.createdAt)),
                        ).toISOString(),
                    });
            }
            await db.habitAssessments.bulkDelete(
                graph.assessmentRows.map((a) => a.id),
            );
            await db.habitEntries.bulkDelete(graph.entries.map((e) => e.id));
            await db.habitSuggestions.bulkDelete(
                graph.removedSuggestions.map((s) => s.id),
            );
            await db.habitPlans.bulkDelete(graph.plans.map((p) => p.id));
            await db.habits.bulkDelete(graph.removed.map((h) => h.id));
            if (graph.path) await db.habitPaths.delete(graph.path.id);
            for (const receipt of graph.receipts) {
                const outputs: HabitImportReceipt["outputs"] = {};
                for (const [name, ids] of Object.entries(receipt.outputs)) {
                    const remaining = ids!.filter(
                        (id) =>
                            !graph.removedRefs[name as ReceiptStore]?.has(id),
                    );
                    if (remaining.length)
                        outputs[name as ReceiptStore] = remaining;
                }
                if (!Object.keys(outputs).length)
                    await db.habitImportReceipts.delete(receipt.id);
                else
                    await db.habitImportReceipts.put({
                        ...receipt,
                        outputs,
                        partial: true,
                    });
            }
        }),
    );
}
