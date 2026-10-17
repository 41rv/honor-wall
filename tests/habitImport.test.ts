import "fake-indexeddb/auto";
import { it, expect, beforeEach, afterEach, vi } from "vitest";
import { db, snapshot } from "../app/db";
import {
    parseHabitsImport,
    importHabits,
    habitImportDigest,
    DuplicateHabitImport,
    type HabitsImport,
} from "../app/habitImport";
import { validateBackup } from "../app/model";
const simple = {
    key: "bed",
    title: "سرير",
    kind: "simple",
    schedule: { repeat: "daily" },
};
const graded = {
    key: "read",
    title: "قراءة",
    kind: "progressive",
    schedule: { repeat: "weekly", weekdays: [6, 1] },
    phases: [
        {
            key: "pages",
            title: "صفحات",
            unit: "صفحة",
            start: 1,
            goal: 20,
            step: 1,
        },
    ],
    current: { phaseKey: "pages", target: 1 },
};
const base = {
    format: "masar.habits",
    version: 1,
    kind: "path",
    path: { title: "ثقافي", habits: [simple, graded] },
};
const parse = (value: unknown = base) =>
    parseHabitsImport(JSON.stringify(value));
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
it("imports path atomically into valid Snapshot5, no invented entries or old data", async () => {
    const route = await importHabits(parse());
    expect(route).toMatch(/^habit-path\//);
    const s = await snapshot();
    validateBackup(s);
    expect(s.habits).toHaveLength(2);
    expect(s.habitEntries).toEqual([]);
    expect(s.tasks).toEqual([]);
    expect(s.projects).toEqual([]);
    const gradedHabit = s.habits!.find((h) => h.kind === "graded")!;
    expect(
        s.habitPlans!.find((p) => p.habitId === gradedHabit.id)?.baseline,
    ).toEqual({ phaseKey: "pages", target: 1 });
});
it("standalone habit has no path", async () => {
    await importHabits(
        parse({
            format: "masar.habits",
            version: 1,
            kind: "habit",
            habit: graded,
        }),
    );
    expect((await db.habits.toArray())[0]).toMatchObject({
        pathId: null,
        kind: "graded",
    });
    expect(await db.habitPaths.count()).toBe(0);
});
it.each([
    { ...base, format: "masar.project" },
    { ...base, version: 2 },
    { ...base, unknown: true },
    { ...base, habit: simple },
    { ...base, path: { ...base.path, habits: [] } },
    { ...base, path: { ...base.path, habits: [simple, simple] } },
    ...[
        { ...simple, phases: [] },
        { ...graded, current: { phaseKey: "absent", target: 1 } },
        { ...graded, current: { phaseKey: "pages", target: 1.0001 } },
        { ...graded, phases: [{ ...graded.phases[0], step: 0 }] },
        { ...simple, schedule: { repeat: "weekly", weekdays: [1, 1] } },
        { ...graded, history: [] },
    ].map((habit) => ({
        format: "masar.habits",
        version: 1,
        kind: "habit",
        habit,
    })),
])("strict structure/refs fails closed %#", async (value) => {
    expect(() => parse(value)).toThrow();
    expect(await db.habits.count()).toBe(0);
});
it("limits file and habit count", () => {
    expect(() => parseHabitsImport(" ".repeat(1024 * 1024 + 1))).toThrow();
    expect(() =>
        parse({
            ...base,
            path: {
                title: "كثير",
                habits: Array.from({ length: 201 }, (_, i) => ({
                    ...simple,
                    key: String(i),
                })),
            },
        }),
    ).toThrow();
});
it("canonical digest ignores whitespace, object key and weekday order", async () => {
    const a = parse(),
        b = parse({
            ...base,
            path: {
                title: "ثقافي",
                habits: [
                    simple,
                    {
                        ...graded,
                        schedule: { weekdays: [1, 6], repeat: "weekly" },
                    },
                ],
            },
        });
    expect(await habitImportDigest(a)).toBe(await habitImportDigest(b));
});
it("concurrent confirmation across tabs serializes persistent duplicate guard", async () => {
    const results = await Promise.allSettled(
        Array.from({ length: 10 }, () => importHabits(parse())),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
        results.filter(
            (r) =>
                r.status === "rejected" &&
                r.reason instanceof DuplicateHabitImport,
        ),
    ).toHaveLength(9);
    expect(await db.habits.count()).toBe(2);
    expect(await db.habitImportReceipts.count()).toBe(1);
});
it("explicit second copy allowed, never overwrites first", async () => {
    await importHabits(parse());
    const first = await db.habits.toArray();
    await importHabits(parse(), { allowCopy: true });
    expect(await db.habits.count()).toBe(4);
    for (const h of first) expect(await db.habits.get(h.id)).toEqual(h);
});
it("rolls path and habits back when plan or receipt fails", async () => {
    vi.spyOn(db.habitImportReceipts, "add").mockRejectedValueOnce(
        new Error("disk full"),
    );
    await expect(importHabits(parse())).rejects.toThrow();
    for (const n of [
        "habitPaths",
        "habits",
        "habitPlans",
        "habitImportReceipts",
    ])
        expect(await db.table(n).count()).toBe(0);
});
it("future start and timezone snapshot, past fails without write", async () => {
    await expect(
        importHabits(parse(), { startDate: "2026-10-20" }),
    ).rejects.toThrow();
    await expect(
        importHabits(parse(), { timeZone: "invalid/zone" }),
    ).rejects.toThrow();
    await importHabits(parse(), {
        startDate: "2026-11-01",
        timeZone: "America/New_York",
    });
    expect((await db.habitPlans.toArray())[0]).toMatchObject({
        effectiveDate: "2026-11-01",
        timeZone: "America/New_York",
    });
    validateBackup(await snapshot());
});
it("prototype/unknown phase fields rejected, strings remain text", () => {
    expect(() =>
        parseHabitsImport(
            '{"format":"masar.habits","version":1,"kind":"habit","habit":{"__proto__":{},"key":"x","title":"x","kind":"simple","schedule":{"repeat":"daily"}}}',
        ),
    ).toThrow();
    const s = parse({
        format: "masar.habits",
        version: 1,
        kind: "habit",
        habit: { ...simple, title: "<script>alert(1)</script>" },
    }) as Extract<HabitsImport, { kind: "habit" }>;
    expect(s.habit.title).toContain("<script>");
});
