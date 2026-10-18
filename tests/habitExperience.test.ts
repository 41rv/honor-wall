import "fake-indexeddb/auto";
import Dexie from "dexie";
import { backupStores, habitStores } from "../app/backupTables";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { db, Database, importBackup, mergeBackup, snapshot } from "../app/db";
import { habitFixture } from "./habitFixtures";
import {
    recordGradedHabit,
    recordSimpleHabit,
    saveHabitFeedback,
} from "../app/habitStore";
import { habitQuantityRange, quantityChange } from "../app/habitQuantity";
import { feedbackText } from "../app/habitFeedback";
import { assessedHabitEntries } from "../app/habitAssessments";
import {
    habitAdvice,
    refreshHabitAdvice,
    decideHabitAdvice,
} from "../app/habitAdvice";
import { validateBackup } from "../app/model";
import type { HabitEntry } from "../app/habitTypes";
const at = new Date("2026-10-21T10:00:00Z");
beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(at);
    await db.transaction("rw", db.tables, async () => {
        for (const t of db.tables) await t.clear();
    });
    await importBackup(habitFixture());
});
afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});
it.each([
    ["خطوة", 1000, 100],
    ["خطوات", 5000, 100],
    ["صفحة", 20, 1],
    ["تكرار", 10, 1],
    ["ثانية", 30, 5],
    ["seconds", 60, 5],
    ["كوب", 0.5, 0.5],
    ["خطوة", 50, 50],
] as const)("slider unit %s goal %s step %s", (unit, goal, step) => {
    const range = habitQuantityRange(unit, goal);
    expect(range.step).toBe(step);
    expect(range.max).toBeGreaterThan(goal);
    expect(range.min).toBe(0);
});
it.each([0, 0.001, 0.5, 1, 30, 1e6, 1e9])(
    "finite slider for goal %s, including zero/maximum",
    (target) => {
        const r = habitQuantityRange("صفحة", target, 1e9);
        expect(r.step).toBeGreaterThan(0);
        expect(r.max).toBe(1e9);
        expect(r.max).toBeGreaterThanOrEqual(target);
        expect(quantityChange(0, -r.step)).toBe(0);
        expect(quantityChange(1e9, r.step)).toBe(1e9);
    },
);
it("feedback is optional, separate from duration, and preserves legacy assessment and identity", async () => {
    const before = (await db.habitEntries.get("read1"))!;
    await saveHabitFeedback("read1", {
        effortRating: 5,
        durationMinutes: 12.5,
    });
    const after = (await db.habitEntries.get("read1"))!;
    expect(after).toMatchObject({
        ...before,
        updatedAt: at.toISOString(),
        effortRating: 5,
        durationMinutes: 12.5,
    });
    expect(after.updatedAt).toBe(at.toISOString());
    expect(feedbackText(after)).toContain("صعب جدًا");
    expect(feedbackText(after)).toContain("12.5 دقيقة");
    await saveHabitFeedback("read1", { effortRating: null });
    expect((await db.habitEntries.get("read1"))!).toMatchObject({
        difficulty: "easy",
        durationMinutes: 12.5,
    });
    expect((await db.habitEntries.get("read1"))!.effortRating).toBeUndefined();
});
it.each([0, 6, 1.5, NaN, Infinity])(
    "rejects invalid rating %s without writing",
    async (n) => {
        const before = await db.habitEntries.get("read1");
        await expect(
            saveHabitFeedback("read1", { effortRating: n as 1 }),
        ).rejects.toThrow();
        expect(await db.habitEntries.get("read1")).toEqual(before);
    },
);
it.each([-1, 0, 1440.001, NaN, Infinity, 1.0001])(
    "rejects invalid actual minutes %s atomically",
    async (n) => {
        const before = await db.habitEntries.get("read1");
        await expect(
            saveHabitFeedback("read1", { durationMinutes: n }),
        ).rejects.toThrow();
        expect(await db.habitEntries.get("read1")).toEqual(before);
    },
);
it("concurrent quantity and assessment edits preserve both fields and one row", async () => {
    await Promise.all([
        recordGradedHabit("reading", "2026-10-05", 7),
        saveHabitFeedback("read1", { effortRating: 4, durationMinutes: 5 }),
    ]);
    const rows = await db.habitEntries
        .where("[habitId+localDate]")
        .equals(["reading", "2026-10-05"])
        .toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
        id: "read1",
        result: { amount: 7, threshold: 1 },
        effortRating: 4,
        durationMinutes: 5,
        difficulty: "easy",
    });
});
it("retries save same entry and undo cannot resurrect it via a stale feedback form", async () => {
    await Promise.all(
        Array.from({ length: 10 }, () =>
            saveHabitFeedback("read1", { effortRating: 2, durationMinutes: 3 }),
        ),
    );
    expect(
        await db.habitEntries.where("habitId").equals("reading").count(),
    ).toBe(2);
    await recordGradedHabit("reading", "2026-10-05", null);
    await expect(
        saveHabitFeedback("read1", { effortRating: 3 }),
    ).rejects.toThrow();
    expect(await db.habitEntries.get("read1")).toBeUndefined();
});
it("simple recordings support feedback without affecting one-tap undo or other dates", async () => {
    const id = await recordSimpleHabit("bed", "2026-10-21", true);
    await saveHabitFeedback(id, { effortRating: 1 });
    await recordSimpleHabit("bed", "2026-10-21", false);
    expect(await db.habitEntries.get(id)).toMatchObject({
        effortRating: 1,
        result: { done: false },
    });
    await recordSimpleHabit("bed", "2026-10-21", true);
    expect(await db.habitEntries.get(id)).toMatchObject({
        effortRating: 1,
        result: { done: true },
    });
    expect((await db.habitEntries.get("bed1"))!.effortRating).toBeUndefined();
});
it("old Snapshot5 remains exact; new optional feedback roundtrips and merges with ID collisions", async () => {
    const original = habitFixture();
    expect((await snapshot()).habitEntries).toEqual(
        [...original.habitEntries!].sort((a, b) => a.id.localeCompare(b.id)),
    );
    await saveHabitFeedback("read1", { effortRating: 4, durationMinutes: 4 });
    const copy = validateBackup(await snapshot());
    await importBackup(JSON.parse(JSON.stringify(copy)));
    expect((await db.habitEntries.get("read1"))!).toMatchObject({
        effortRating: 4,
        durationMinutes: 4,
        difficulty: "easy",
    });
    await mergeBackup(copy);
    const rows = await db.habitEntries.toArray();
    expect(rows.filter((e) => e.effortRating === 4)).toHaveLength(2);
    validateBackup(await snapshot());
    const count = await db.habitEntries.count();
    await mergeBackup(copy);
    expect(await db.habitEntries.count()).toBe(count);
});
it("backup rejects null or unknown feedback fields instead of silently discarding them", () => {
    for (const patch of [
        { effortRating: null },
        { durationMinutes: null },
        { effortRating: 9 },
        { durationMinutes: -2 },
        { durationSeconds: 60 },
    ]) {
        const copy = habitFixture();
        Object.assign(copy.habitEntries![0], patch);
        expect(() => validateBackup(copy)).toThrow();
    }
});
async function adviceFixture(
    options: {
        rating?: 1 | 2 | 3 | 4 | 5;
        durations?: number[];
        amount?: number;
    } = {},
) {
    const habit = (await db.habits.get("reading"))!,
        plan = (await db.habitPlans.get("hp2"))!;
    const entries: HabitEntry[] = Array.from({ length: 7 }, (_, i) => {
        const day = `2026-10-${String(14 + i).padStart(2, "0")}`;
        return {
            id: "sample" + i,
            habitId: habit.id,
            planId: plan.id,
            localDate: day,
            dayStart: `2026-10-${String(13 + i).padStart(2, "0")}T21:00:00.000Z`,
            dayEnd: `${day}T21:00:00.000Z`,
            timeZone: habit.timeZone,
            recordedAt: `${day}T10:00:00.000Z`,
            updatedAt: `${day}T10:00:00.000Z`,
            result: {
                kind: "graded",
                phaseKey: "pages",
                unit: "صفحات",
                threshold: 2,
                amount: options.amount ?? 2,
            },
            ...(options.rating ? { effortRating: options.rating } : {}),
            ...(options.durations?.[i] !== undefined
                ? { durationMinutes: options.durations[i] }
                : {}),
        };
    });
    return {
        habit,
        plan,
        entries,
        advice: habitAdvice(habit, [plan], [], entries, at),
    };
}
it("missing ratings/durations remain neutral and 6/7 evidence can still recommend increase", async () => {
    expect((await adviceFixture()).advice?.type).toBe("increase");
});
it("repeated high numeric ratings block promotion even when all daily goals are met", async () => {
    const f = await adviceFixture({ rating: 5 });
    expect(f.advice?.type).toBe("maintain");
    expect(f.advice?.change).toBeUndefined();
    expect(f.advice?.reason).toContain("الصعوبة");
});
it("one hard session is insufficient to change level recommendation", async () => {
    const f = await adviceFixture();
    f.entries[6].effortRating = 5;
    expect(habitAdvice(f.habit, [f.plan], [], f.entries, at)?.type).toBe(
        "increase",
    );
});
it("persistent below-target hard sessions suggest one optional easing, not automatic changes", async () => {
    const f = await adviceFixture({ rating: 4, amount: 1 });
    expect(f.advice).toMatchObject({ type: "ease", change: { target: 1 } });
    expect((await db.habitPlans.get("hp2"))!.current!.target).toBe(2);
});
it("duration alone is not a penalty; six comparable sessions plus repeated high effort can support maintain", async () => {
    const f = await adviceFixture({ durations: [1, 1, 1, 1, 5, 5, 5] });
    expect(f.advice?.type).toBe("increase");
    f.entries[5].effortRating = 4;
    f.entries[6].effortRating = 4;
    const a = habitAdvice(f.habit, [f.plan], [], f.entries, at);
    expect(a?.type).toBe("maintain");
    expect(a?.reason).toContain("الدقائق الفعلية لكل وحدة");
});
it("one unusual duration, or fewer than six samples, cannot block otherwise proven increase", async () => {
    for (const durations of [
        [1, 1, 1, 1, 1, 1, 100],
        [1, 1, 1],
    ]) {
        const f = await adviceFixture({ durations });
        expect(f.advice?.type).toBe("increase");
    }
});
it("changing an assessment invalidates an old proposed increase at decision time", async () => {
    const f = await adviceFixture();
    await db.habitEntries.bulkAdd(f.entries);
    const s = (await refreshHabitAdvice(f.habit.id))!;
    expect(s.type).toBe("increase");
    await saveHabitFeedback(f.entries[6].id, { effortRating: 5 });
    expect(await decideHabitAdvice(s.id, true)).toEqual({
        applied: false,
        stale: true,
    });
    expect(await db.habitPlans.count()).toBe(3);
});

it("explicit removal can clear legacy assessment, while duration-only edits never erase it", async () => {
    await saveHabitFeedback("read1", { durationMinutes: 8 });
    expect((await db.habitEntries.get("read1"))!.difficulty).toBe("easy");
    await saveHabitFeedback("read1", {
        effortRating: null,
        clearLegacyDifficulty: true,
    });
    expect((await db.habitEntries.get("read1"))!.difficulty).toBeUndefined();
    expect((await db.habitEntries.get("read1"))!.durationMinutes).toBe(8);
});
it("manual fractional draft and existing above-target amount remain exactly representable on slider", () => {
    expect(habitQuantityRange("خطوة", 5000, 0.5).step).toBe(0.5);
    expect(habitQuantityRange("صفحة", 2, 0.25).step).toBe(0.25);
});
it("an explicitly recorded zero quantity can be assessed without counting it as target achievement", async () => {
    const id = await recordGradedHabit("reading", "2026-10-21", 0);
    await saveHabitFeedback(id!, { effortRating: 5, durationMinutes: 1 });
    expect(await db.habitEntries.get(id!)).toMatchObject({
        result: { amount: 0, threshold: 2 },
        effortRating: 5,
        durationMinutes: 1,
    });
});
it("concurrent independent assessment patches preserve both fields rather than clearing the other tab", async () => {
    await Promise.all([
        saveHabitFeedback("read1", { effortRating: 4 }),
        saveHabitFeedback("read1", { durationMinutes: 8 }),
    ]);
    expect(await db.habitEntries.get("read1")).toMatchObject({
        effortRating: 4,
        durationMinutes: 8,
        difficulty: "easy",
    });
});

it("schema7→8 canonical feedback survives an old Dexie writer without rewriting the previous19 tables", async () => {
    const name = "habit-writer-fence-" + crypto.randomUUID();
    const old = new Dexie(name),
        next = new Database(name);
    // Exact previous19-store schema; migration adds one canonical metadata store.
    old.version(7).stores({
        projects: "id,updatedAt,status,archived",
        steps: "id,projectId,parentId,order,status",
        tasks: "id,status,completedAt,schedule.repeat",
        ideas: "id,archived,updatedAt",
        events: "id,entityId,at,action",
        taskCycles:
            "id,taskId,[taskId+revision+start],[status+end],end,status,completedAt,scheduledAt",
        projectProgress: "id,projectId,[projectId+order],at,reason",
        projectTracking: "projectId,since",
        projectPlans: "projectId,since",
        stepWork: "id,projectId,[projectId+at],at,stepId",
        recommendations: "id,key,status,createdAt,*projectIds",
        paceSettings: "id",
        habitPaths: "id,updatedAt",
        habits: "id,pathId,updatedAt",
        habitPlans: "id,habitId,&[habitId+revision],[habitId+effectiveDate]",
        habitEntries: "id,&[habitId+localDate],localDate,habitId,planId",
        habitSuggestions: "id,habitId,[habitId+status],basisHash",
        reminders: "id,createdAt,reviewedAt",
        habitImportReceipts: "id,digest",
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
        await old.open();
        expect(old.backendDB().version).toBe(70);
        const data = habitFixture();
        const originalStores = backupStores.filter(
            (n) => n !== "habitAssessments",
        );
        for (const n of originalStores)
            await old.table(n).bulkAdd(data[n] ?? []);
        await old
            .table("habitEntries")
            .update("read1", { effortRating: 5, durationMinutes: 2 });
        const before = Object.fromEntries(
            await Promise.all(
                originalStores.map(async (n) => [
                    n,
                    await old.table(n).toArray(),
                ]),
            ),
        );
        const indexes = old.tables.map((t) => [
            t.name,
            t.schema.primKey.src,
            t.schema.indexes.map((i) => i.src),
        ]);
        await next.open();
        expect(next.verno).toBe(8);
        expect(next.backendDB().version).toBe(80);
        expect(old.isOpen()).toBe(false);
        expect(
            next.tables
                .filter((t) => t.name !== "habitAssessments")
                .map((t) => [
                    t.name,
                    t.schema.primKey.src,
                    t.schema.indexes.map((i) => i.src),
                ]),
        ).toEqual(indexes);
        for (const n of originalStores)
            expect(await next.table(n).toArray()).toEqual(before[n]);
        expect(await next.habitAssessments.count()).toBe(1);
        // Dexie v4 retries without an explicit version: a bump alone cannot
        // prevent an old writer. Protect canonical metadata instead.
        await old.open();
        expect(old.backendDB().version).toBe(80);
        const raw = await old.table("habitEntries").get("read1");
        const {
            effortRating: _rating,
            durationMinutes: _minutes,
            ...known
        } = raw;
        await old
            .table("habitEntries")
            .put({ ...known, result: { ...known.result, amount: 4 } });
        expect(
            (await next.habitEntries.get("read1"))!.effortRating,
        ).toBeUndefined();
        expect(await next.habitAssessments.get("read1")).toMatchObject({
            effortRating: 5,
            durationMinutes: 2,
        });
        expect(
            (
                await assessedHabitEntries(next, [
                    (await next.habitEntries.get("read1"))!,
                ])
            )[0],
        ).toMatchObject({
            result: { amount: 4 },
            effortRating: 5,
            durationMinutes: 2,
            difficulty: "easy",
        });
    } finally {
        old.close();
        await next.delete();
        warn.mockRestore();
    }
});

it("Snapshot6 exports canonical metadata after old writer erased inline fields and merge remaps its entry namespace", async () => {
    await saveHabitFeedback("read1", { effortRating: 4, durationMinutes: 8 });
    const raw = (await db.habitEntries.get("read1"))!;
    const { effortRating: _r, durationMinutes: _m, ...old } = raw;
    await db.habitEntries.put(old);
    const copy = validateBackup(await snapshot());
    expect(copy.version).toBe(6);
    expect(copy.habitEntries!.find((e) => e.id === "read1")).toMatchObject({
        effortRating: 4,
        durationMinutes: 8,
    });
    expect(copy.habitAssessments).toHaveLength(1);
    await mergeBackup(copy);
    const assessments = await db.habitAssessments.toArray();
    expect(assessments).toHaveLength(2);
    for (const a of assessments)
        expect(await db.habitEntries.get(a.id)).toMatchObject({
            habitId: a.habitId,
            planId: a.planId,
            localDate: a.localDate,
        });
    const count = await db.habitAssessments.count();
    await mergeBackup(copy);
    expect(await db.habitAssessments.count()).toBe(count);
    validateBackup(await snapshot());
});
it("Snapshot5 derives real inline metadata, preserves matching canonical data when missing, and prunes explicitly removed parents", async () => {
    const old = habitFixture();
    old.habitEntries![0].effortRating = 5;
    await importBackup(old);
    expect(
        await db.habitAssessments.get(old.habitEntries![0].id),
    ).toMatchObject({ effortRating: 5 });
    await saveHabitFeedback("read1", { effortRating: 4, durationMinutes: 9 });
    await importBackup(habitFixture());
    expect(
        (
            await assessedHabitEntries(db, [
                (await db.habitEntries.get("read1"))!,
            ])
        )[0],
    ).toMatchObject({ effortRating: 4, durationMinutes: 9 });
    const removed = habitFixture();
    removed.habitEntries = removed.habitEntries!.filter(
        (e) => e.id !== "read1",
    );
    // Receipt must describe the actual incoming graph.
    removed.habitImportReceipts = [];
    await importBackup(removed);
    expect(await db.habitAssessments.get("read1")).toBeUndefined();
    validateBackup(await snapshot());
});
it("legacy Snapshot5 inline assessment merge remains valid and idempotent", async () => {
    const old = habitFixture();
    old.habitEntries![0].durationMinutes = 2;
    await mergeBackup(old);
    const rows = await db.habitAssessments.toArray();
    expect(rows).toHaveLength(1);
    expect(await db.habitEntries.get(rows[0].id)).toMatchObject({
        habitId: rows[0].habitId,
        durationMinutes: 2,
    });
    await mergeBackup(old);
    expect(await db.habitAssessments.count()).toBe(1);
    validateBackup(await snapshot());
});
it("Snapshot6 rejects orphaned, conflicting, invalid and mismatched canonical assessments before any write", async () => {
    await saveHabitFeedback("read1", { effortRating: 4, durationMinutes: 2 });
    const copy = await snapshot(),
        before = JSON.stringify(copy);
    for (const patch of [
        { id: "orphan" },
        { habitId: "bed" },
        { planId: "hp2" },
        { localDate: "2026-10-06" },
        { effortRating: 5 },
        { durationMinutes: null },
        { effortRating: undefined, durationMinutes: undefined },
    ]) {
        const invalid = structuredClone(copy);
        Object.assign(invalid.habitAssessments![0], patch);
        expect(() => validateBackup(invalid)).toThrow();
        await expect(importBackup(invalid)).rejects.toThrow();
    }
    expect(JSON.stringify(await snapshot())).toBe(before);
});
it("version5 cannot silently smuggle a version6 assessment table", async () => {
    const old = habitFixture();
    await saveHabitFeedback("read1", { effortRating: 4 });
    old.habitAssessments = (await snapshot()).habitAssessments;
    expect(() => validateBackup(old)).toThrow();
});
it("new reopen prunes only assessment metadata whose original recording old code removed", async () => {
    const name = "assessment-reopen-" + crypto.randomUUID();
    let current = new Database(name);
    try {
        await current.open();
        const f = habitFixture();
        for (const n of backupStores)
            await current.table(n).bulkAdd(f[n] ?? []);
        const entry = (await current.habitEntries.get("read1"))!;
        await current.habitAssessments.add({
            id: entry.id,
            habitId: entry.habitId,
            planId: entry.planId,
            localDate: entry.localDate,
            updatedAt: at.toISOString(),
            effortRating: 5,
        });
        await current.habitEntries.delete(entry.id);
        current.close();
        current = new Database(name);
        await current.open();
        expect(await current.habitAssessments.count()).toBe(0);
        expect(await current.habitEntries.count()).toBe(
            f.habitEntries!.length - 1,
        );
    } finally {
        await current.delete();
    }
});
it("canonical metadata remains inside recovery snapshot before explicit full replacement", async () => {
    await saveHabitFeedback("read1", { effortRating: 4, durationMinutes: 10 });
    const old = habitFixture();
    old.habitEntries = [];
    old.habitImportReceipts = [];
    await importBackup(old, { mode: "full", confirmFull: true });
    expect(await db.habitAssessments.count()).toBe(0);
    const { latestRecovery } = await import("../app/backupRecovery");
    const recovery = (await latestRecovery())!;
    expect(recovery.version).toBe(6);
    expect(recovery.habitAssessments).toHaveLength(1);
    await importBackup(recovery);
    expect(await db.habitAssessments.get("read1")).toMatchObject({
        effortRating: 4,
        durationMinutes: 10,
    });
});
it("advice uses canonical ratings even after old entry writer erases all inline mirrors", async () => {
    const f = await adviceFixture();
    await db.habitEntries.bulkAdd(f.entries);
    for (const e of f.entries)
        await saveHabitFeedback(e.id, { effortRating: 5 });
    for (const e of f.entries) await db.habitEntries.put(e);
    expect((await refreshHabitAdvice(f.habit.id))!.type).toBe("maintain");
});

it.each([1, 2, 3, 4] as const)(
    "old backup%s preserves canonical feedback absent from its format",
    async (version) => {
        await saveHabitFeedback("read1", {
            effortRating: 5,
            durationMinutes: 2,
        });
        const old = habitFixture();
        old.version = version;
        for (const n of habitStores) delete old[n];
        const before = await db.habitAssessments.toArray();
        await importBackup(old);
        expect(await db.habitAssessments.toArray()).toEqual(before);
        validateBackup(await snapshot());
    },
);

it("restoring an old backup with a replaced recording timestamp cannot attach an older assessment to that replacement", async () => {
    await saveHabitFeedback("read1", { effortRating: 5, durationMinutes: 3 });
    const replacement = habitFixture();
    const entry = replacement.habitEntries!.find((e) => e.id === "read1")!;
    entry.recordedAt = "2026-10-21T10:00:01.000Z";
    entry.updatedAt = entry.recordedAt;
    replacement.exportedAt = "2026-10-21T10:00:02.000Z";
    vi.setSystemTime(new Date(replacement.exportedAt));
    validateBackup(replacement);
    await importBackup(replacement);
    validateBackup(await snapshot());
    expect(await db.habitAssessments.get("read1")).toBeUndefined();
    const { latestRecovery } = await import("../app/backupRecovery");
    const recovery = (await latestRecovery())!;
    validateBackup(recovery);
    expect(
        recovery.habitAssessments!.find((a) => a.id === "read1"),
    ).toMatchObject({ effortRating: 5, durationMinutes: 3 });
    await importBackup(recovery);
    expect(await db.habitAssessments.get("read1")).toMatchObject({
        effortRating: 5,
        durationMinutes: 3,
    });
});
