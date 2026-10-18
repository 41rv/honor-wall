import "fake-indexeddb/auto";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { db, importBackup, snapshot, mergeBackup, create } from "../app/db";
import { habitFixture } from "./habitFixtures";
import {
    previewHabitDeletion,
    deleteHabitPermanently,
} from "../app/habitDeletion";
import {
    archiveHabitPath,
    recordGradedHabit,
    saveHabitFeedback,
    setHabitArchived,
    saveHabitPath,
    saveGradedHabit,
} from "../app/habitStore";
import { habitCommitment } from "../app/habitCalendar";
import { validateBackup } from "../app/model";
import { importHabits, DuplicateHabitImport } from "../app/habitImport";
import type { HabitsImport } from "../app/habitImport";
import { backupStores, legacyStores } from "../app/backupTables";
const at = new Date("2026-10-21T10:00:00Z");
const raw = () =>
    Promise.all(
        backupStores.map(async (n) => [n, await db.table(n).toArray()]),
    );
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
it("habit deletion previews dependent counts and removes only its graph atomically", async () => {
    await saveHabitFeedback("read1", { effortRating: 5, durationMinutes: 9 });
    await create("task", "مهمة مستقلة", "");
    const before = await snapshot(),
        p = await previewHabitDeletion("reading", "habit");
    expect(p).toMatchObject({
        title: "قراءة",
        habits: 1,
        plans: 2,
        entries: 2,
        assessments: 1,
        suggestions: 3,
        receipts: 1,
    });
    await deleteHabitPermanently(p);
    expect(await db.habits.get("reading")).toBeUndefined();
    expect(await db.habitPlans.where("habitId").equals("reading").count()).toBe(
        0,
    );
    expect(
        await db.habitEntries.where("habitId").equals("reading").count(),
    ).toBe(0);
    expect(
        await db.habitSuggestions.where("habitId").equals("reading").count(),
    ).toBe(0);
    expect(
        await db.habitAssessments.where("habitId").equals("reading").count(),
    ).toBe(0);
    const after = await snapshot();
    for (const n of legacyStores) expect(after[n]).toEqual(before[n]);
    expect(after.habits).toEqual(
        before.habits!.filter((h) => h.id !== "reading"),
    );
    expect(after.habitPaths).toEqual(before.habitPaths);
    validateBackup(after);
    expect(after.habitImportReceipts![0]).toMatchObject({
        partial: true,
        outputs: { habitPaths: ["culture"] },
    });
});
it("archived habits can be permanently removed without touching unrelated archives", async () => {
    await setHabitArchived("reading", true);
    await setHabitArchived("bed", true);
    await deleteHabitPermanently(
        await previewHabitDeletion("reading", "habit"),
    );
    expect((await db.habits.get("bed"))!.archived).toBe(true);
    expect(await db.habitEntries.get("bed1")).toBeDefined();
    validateBackup(await snapshot());
});
it("path-only deletion preserves entries, levels, outcomes and historical neutral days without orphan IDs", async () => {
    await db.habitPaths.update("culture", {
        pauses: [
            {
                start: "2026-10-04T10:00:00.000Z",
                end: "2026-10-06T10:00:00.000Z",
            },
        ],
    });
    const before = await snapshot(),
        habit =
            before.habits![0].id === "reading"
                ? before.habits![0]
                : before.habits![1];
    const metric = habitCommitment(
        habit,
        before.habitPlans!.filter((p) => p.habitId === habit.id),
        before.habitPaths!,
        before.habitEntries!,
        "2026-10-01",
        "2026-10-20",
        at,
    );
    const p = await previewHabitDeletion("culture", "path-only");
    expect(p).toMatchObject({ habits: 0, retainedHabits: 1, entries: 0 });
    await deleteHabitPermanently(p);
    const after = await snapshot();
    expect(after.habitPaths).toHaveLength(0);
    expect(after.habitEntries).toEqual(before.habitEntries);
    expect((await db.habits.get("reading"))!.pathId).toBeNull();
    expect(after.habitPlans!.every((p) => p.pathId === null)).toBe(true);
    const plans = after.habitPlans!.filter((p) => p.habitId === "reading");
    expect(plans.map((p) => p.current)).toEqual(
        before
            .habitPlans!.filter((p) => p.habitId === "reading")
            .map((p) => p.current),
    );
    expect(
        habitCommitment(
            habit,
            plans,
            [],
            after.habitEntries!,
            "2026-10-01",
            "2026-10-20",
            at,
        ),
    ).toEqual(metric);
    expect(plans[0].detachedPath).toMatchObject({ title: "المسار الثقافي" });
    validateBackup(after);
    await importBackup(after);
    validateBackup(await snapshot());
    await mergeBackup(after);
    validateBackup(await snapshot());
});
it("open pause is capped exactly at path deletion and does not pause independent habits tomorrow", async () => {
    await db.habitPaths.update("culture", {
        pauses: [{ start: "2026-10-19T10:00:00.000Z" }],
    });
    await deleteHabitPermanently(
        await previewHabitDeletion("culture", "path-only"),
    );
    const s = await snapshot();
    expect(
        s.habitPlans!.find((p) => p.id === "hp2")!.detachedPath!.pauses[0].end,
    ).toBe(at.toISOString());
    validateBackup(s);
});
it("cascade deletes current members and their graphs but preserves independent habits/reminders and legacy stores", async () => {
    const before = await snapshot();
    await deleteHabitPermanently(
        await previewHabitDeletion("culture", "path-with-habits"),
    );
    const after = await snapshot();
    expect(after.habits!.map((h) => h.id)).toEqual(["bed"]);
    expect(after.habitEntries!.map((e) => e.id)).toEqual(["bed1"]);
    expect(after.reminders).toEqual(before.reminders);
    expect(after.habitImportReceipts).toHaveLength(0);
    for (const n of legacyStores) expect(after[n]).toEqual(before[n]);
    validateBackup(after);
});
it("deleting an archived path does not delete habits previously detached by archival", async () => {
    await archiveHabitPath("culture");
    const before = await snapshot();
    const p = await previewHabitDeletion("culture", "path-with-habits");
    expect(p.habits).toBe(0);
    await deleteHabitPermanently(p);
    const after = await snapshot();
    expect(after.habits).toEqual(before.habits);
    expect(after.habitEntries).toEqual(before.habitEntries);
    expect(after.habitPlans!.every((p) => p.pathId !== "culture")).toBe(true);
    validateBackup(after);
});
it("any dependent write failure rolls back deleted rows, receipts and detachments", async () => {
    await saveHabitFeedback("read1", { effortRating: 5, durationMinutes: 10 });
    const before = await raw();
    vi.spyOn(db.habitPlans, "bulkDelete").mockRejectedValueOnce(
        new Error("quota"),
    );
    await expect(
        deleteHabitPermanently(
            await previewHabitDeletion("culture", "path-with-habits"),
        ),
    ).rejects.toThrow("quota");
    expect(await raw()).toEqual(before);
});
it("a new recording after preview requires reconfirmation and deletes nothing", async () => {
    const p = await previewHabitDeletion("reading", "habit");
    await recordGradedHabit("reading", "2026-10-21", 3);
    const before = await raw();
    await expect(deleteHabitPermanently(p)).rejects.toThrow("تغيرت البيانات");
    expect(await raw()).toEqual(before);
});
it("concurrent duplicate deletion does not remove any unrelated graph", async () => {
    const p = await previewHabitDeletion("reading", "habit");
    const result = await Promise.allSettled([
        deleteHabitPermanently(p),
        deleteHabitPermanently(p),
    ]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.habits.get("bed")).toBeDefined();
    validateBackup(await snapshot());
});
it("a concurrent recorder cannot leave an orphan after deletion", async () => {
    const p = await previewHabitDeletion("reading", "habit");
    await Promise.allSettled([
        deleteHabitPermanently(p),
        recordGradedHabit("reading", "2026-10-21", 4),
    ]);
    expect(await db.habits.get("reading")).toBeUndefined();
    expect(
        await db.habitEntries.where("habitId").equals("reading").count(),
    ).toBe(0);
    validateBackup(await snapshot());
});
const single: HabitsImport = {
    format: "masar.habits",
    version: 1,
    kind: "habit",
    habit: {
        key: "single",
        title: "مستورد",
        kind: "simple",
        schedule: { repeat: "daily" },
    },
};
it("complete deletion permits deliberate reimport and prevents duplicate import again", async () => {
    const route = await importHabits(single);
    const id = route.split("/")[1];
    await deleteHabitPermanently(await previewHabitDeletion(id, "habit"));
    const next = await importHabits(single);
    expect(next).not.toBe(route);
    await expect(importHabits(single)).rejects.toBeInstanceOf(
        DuplicateHabitImport,
    );
    validateBackup(await snapshot());
});
it("partial deletion prunes receipt references but requires explicit copy consent for surviving outputs", async () => {
    const doc: HabitsImport = {
        format: "masar.habits",
        version: 1,
        kind: "path",
        path: {
            title: "مسار مستورد",
            habits: [
                single.habit,
                { ...single.habit, key: "other", title: "باقية" },
            ],
        },
    };
    const route = await importHabits(doc),
        id = route.split("/")[1],
        members = await db.habits.where("pathId").equals(id).toArray();
    await deleteHabitPermanently(
        await previewHabitDeletion(members[0].id, "habit"),
    );
    const receipt = (await db.habitImportReceipts.toArray()).find((r) =>
        r.outputs.habitPaths?.includes(id),
    )!;
    expect(receipt.partial).toBe(true);
    expect(receipt.outputs.habits).toEqual([members[1].id]);
    await expect(importHabits(doc)).rejects.toBeInstanceOf(
        DuplicateHabitImport,
    );
    await importHabits(doc, { allowCopy: true });
    validateBackup(await snapshot());
});
it("invalid optional detached snapshots and partial markers are rejected before restore", () => {
    for (const patch of [
        { title: "", pauses: [] },
        { title: "تاريخ", pauses: [{ start: "2026-10-01T00:00:00.000Z" }] },
    ]) {
        const s = habitFixture();
        s.habitPlans![0].detachedPath = patch;
        expect(() => validateBackup(s)).toThrow();
    }
    const s = habitFixture();
    Object.assign(s.habitImportReceipts![0], { partial: false });
    expect(() => validateBackup(s)).toThrow();
});

it("typed namespaces protect unrelated reminder/path IDs that collide with deleted habit/entry IDs", async () => {
    const stamp = at.toISOString();
    await db.habitPaths.add({
        id: "reading",
        title: "مسار آخر",
        order: 1,
        createdAt: stamp,
        updatedAt: stamp,
        pauses: [],
    });
    await db.reminders.add({
        id: "read1",
        title: "تذكير آخر",
        createdAt: stamp,
        updatedAt: stamp,
    });
    await deleteHabitPermanently(
        await previewHabitDeletion("reading", "habit"),
    );
    expect(await db.habitPaths.get("reading")).toBeDefined();
    expect(await db.reminders.get("read1")).toBeDefined();
    validateBackup(await snapshot());
});
it("cascade of a former path never deletes a moved habit; historical path references are safely detached", async () => {
    const id = await saveHabitPath({ title: "مسار جديد" }),
        p = (await db.habitPlans.get("hp2"))!;
    await saveGradedHabit({
        id: "reading",
        title: "قراءة",
        pathId: id,
        schedule: p.schedule,
        phases: p.phases,
        current: p.current!,
    });
    const original = await db.habitEntries.toArray();
    const preview = await previewHabitDeletion("culture", "path-with-habits");
    expect(preview.habits).toBe(0);
    await deleteHabitPermanently(preview);
    expect((await db.habits.get("reading"))!.pathId).toBe(id);
    expect(await db.habitEntries.toArray()).toEqual(original);
    expect(
        (await db.habitPlans.toArray()).some((p) => p.pathId === "culture"),
    ).toBe(false);
    validateBackup(await snapshot());
});
