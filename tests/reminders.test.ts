import "fake-indexeddb/auto";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { db, snapshot, importBackup, mergeBackup } from "../app/db";
import {
    saveReminder,
    reviewReminder,
    deleteReminder,
    orderReminders,
} from "../app/reminderStore";
import { validateBackup } from "../app/model";
import { habitFixture } from "./habitFixtures";
beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-21T10:00:00Z"));
    await db.transaction("rw", db.tables, async () => {
        for (const t of db.tables) await t.clear();
    });
});
afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});
it("title-only reminder creates no task/idea/event or scheduling fields", async () => {
    const id = await saveReminder({ title: "كتاب" });
    expect(await db.reminders.get(id)).toEqual({
        id,
        title: "كتاب",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    });
    for (const n of ["tasks", "ideas", "events", "habits"])
        expect(await db.table(n).count()).toBe(0);
    validateBackup(await snapshot());
});
it.each(["", "x".repeat(301)])("rejects title %s", async (title) => {
    await expect(saveReminder({ title })).rejects.toThrow();
    expect(await db.reminders.count()).toBe(0);
});
it("category optional/extensible, can remove, preserves reviewed state and identity", async () => {
    const id = await saveReminder({ title: "موقع", category: "custom" });
    await reviewReminder(id, true);
    const old = await db.reminders.get(id);
    await saveReminder({ id, title: "موقع جديد" });
    expect(await db.reminders.get(id)).toEqual({
        ...old!,
        title: "موقع جديد",
        category: undefined,
    });
});
it("absolute concurrent review is idempotent; undo does not create duplicate", async () => {
    const id = await saveReminder({ title: "كتاب" });
    await Promise.all(
        Array.from({ length: 12 }, () => reviewReminder(id, true)),
    );
    expect(await db.reminders.count()).toBe(1);
    await reviewReminder(id, false);
    expect((await db.reminders.get(id))?.reviewedAt).toBeUndefined();
});
it("unreviewed first then stable latest creation order", async () => {
    const a = await saveReminder({ title: "أول" });
    vi.setSystemTime(new Date("2026-10-22T10:00:00Z"));
    const b = await saveReminder({ title: "ثاني" });
    await reviewReminder(b, true);
    expect(
        orderReminders(await db.reminders.toArray()).map((r) => r.id),
    ).toEqual([a, b]);
    await reviewReminder(b, false);
    expect(
        orderReminders(await db.reminders.toArray()).map((r) => r.id),
    ).toEqual([b, a]);
});
it("delete only requested reminder", async () => {
    const a = await saveReminder({ title: "أول" }),
        b = await saveReminder({ title: "ثاني" });
    await deleteReminder(a);
    expect((await db.reminders.toArray()).map((r) => r.id)).toEqual([b]);
});
it("clock backwards prevents edit/review without corrupting snapshot", async () => {
    const id = await saveReminder({ title: "كتاب" });
    vi.setSystemTime(new Date("2026-10-20T10:00:00Z"));
    await expect(reviewReminder(id, true)).rejects.toThrow();
    await expect(saveReminder({ id, title: "تعديل" })).rejects.toThrow();
});
it("Snapshot5 round trip and merge retain reminders; old backup conservatively keeps them", async () => {
    const id = await saveReminder({ title: "كتاب", category: "book" });
    const s = await snapshot();
    await importBackup(s);
    expect(await db.reminders.get(id)).toBeDefined();
    await mergeBackup(s);
    expect(await db.reminders.count()).toBe(2);
    const old = { ...habitFixture(), version: 4 } as unknown;
    for (const key of [
        "habitPaths",
        "habits",
        "habitPlans",
        "habitEntries",
        "habitSuggestions",
        "habitImportReceipts",
        "reminders",
    ])
        delete (old as Record<string, unknown>)[key];
    await importBackup(old as Parameters<typeof importBackup>[0]);
    expect(await db.reminders.count()).toBe(2);
    validateBackup(await snapshot());
});
