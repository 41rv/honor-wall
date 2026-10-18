import "fake-indexeddb/auto";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { db, snapshot, importBackup, mergeBackup } from "../app/db";
import {
    saveGradedHabit,
    recordGradedHabit,
    saveSimpleHabit,
    setHabitPaused,
} from "../app/habitStore";
import { habitCommitment, habitToday, habitDay } from "../app/habitCalendar";
import { habitEvolution, validateHabitLevels } from "../app/habitProgression";
import { validateBackup } from "../app/model";
import type { GradedHabitInput } from "../app/habitStore";
const start = "2026-10-01T10:00:00.000Z";
const input: GradedHabitInput = {
    title: "قراءة",
    pathId: null,
    timeZone: "Asia/Riyadh",
    schedule: { repeat: "daily" },
    phases: [
        {
            key: "pages",
            label: "قراءة",
            unit: "صفحة",
            start: 1,
            target: 20,
            step: 1,
        },
    ],
    current: { phaseKey: "pages", target: 1 },
};
beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(start));
    await db.transaction("rw", db.tables, async () => {
        for (const t of db.tables) await t.clear();
    });
});
afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});
async function data(id: string) {
    return {
        h: (await db.habits.get(id))!,
        p: await db.habitPlans.where("habitId").equals(id).sortBy("revision"),
        e: await db.habitEntries.where("habitId").equals(id).toArray(),
    };
}
it("creates graded without changing schema8 tables or legacy stores", async () => {
    await saveGradedHabit(input);
    expect(db.verno).toBe(8);
    validateBackup(await snapshot());
    expect(await db.tasks.count()).toBe(0);
    expect(await db.events.count()).toBe(0);
});
it.each([NaN, Infinity, -1, 1.0001, 1e9 + 1])(
    "rejects amount %s atomically",
    async (amount) => {
        const id = await saveGradedHabit(input);
        await expect(
            recordGradedHabit(id, "2026-10-01", amount),
        ).rejects.toThrow();
        expect(await db.habitEntries.count()).toBe(0);
    },
);
it("quantity and undo retain one row, no task records", async () => {
    const id = await saveGradedHabit(input);
    await Promise.all(
        Array.from({ length: 20 }, () =>
            recordGradedHabit(id, "2026-10-01", 3),
        ),
    );
    const first = (await data(id)).e[0];
    await recordGradedHabit(id, "2026-10-01", 8, "hard");
    expect((await data(id)).e).toHaveLength(1);
    expect((await data(id)).e[0]).toMatchObject({
        id: first.id,
        recordedAt: first.recordedAt,
        result: { amount: 8, threshold: 1 },
        difficulty: "hard",
    });
    await recordGradedHabit(id, "2026-10-01", null);
    expect((await data(id)).e).toHaveLength(0);
});
it("retains historical unit/threshold and applies tomorrow", async () => {
    const id = await saveGradedHabit(input);
    await recordGradedHabit(id, "2026-10-01", 3);
    await saveGradedHabit({
        ...input,
        id,
        current: { phaseKey: "pages", target: 5 },
    });
    expect((await data(id)).p[1].effectiveDate).toBe("2026-10-02");
    await recordGradedHabit(id, "2026-10-01", 4);
    vi.setSystemTime(new Date("2026-10-02T10:00:00Z"));
    await recordGradedHabit(id, "2026-10-02", 6);
    expect(
        (await data(id)).e
            .sort((a, b) => a.localDate.localeCompare(b.localDate))
            .map((e) => e.result),
    ).toMatchObject([
        { threshold: 1, amount: 4 },
        { threshold: 5, amount: 6 },
    ]);
    validateBackup(await snapshot());
});
it("rejects changing saved unit even if no entry", async () => {
    const id = await saveGradedHabit(input);
    await expect(
        saveGradedHabit({
            ...input,
            id,
            phases: [{ ...input.phases[0], unit: "دقيقة" }],
        }),
    ).rejects.toThrow();
    expect((await data(id)).p).toHaveLength(1);
});
it("difficulty stage is independent unit and new plan", async () => {
    const id = await saveGradedHabit(input);
    const next = {
        ...input,
        id,
        phases: [
            ...input.phases,
            {
                key: "walk",
                label: "مشية",
                unit: "خطوة",
                start: 1,
                target: 40,
                step: 1,
            },
        ],
        current: { phaseKey: "walk", target: 1 },
    };
    await saveGradedHabit(next);
    expect((await data(id)).p).toHaveLength(2);
    validateBackup(await snapshot());
});
it("closed eligible graded days use threshold not recording alone", async () => {
    const id = await saveGradedHabit({
        ...input,
        current: { phaseKey: "pages", target: 3 },
    });
    await recordGradedHabit(id, "2026-10-01", 2);
    vi.setSystemTime(new Date("2026-10-02T10:00:00Z"));
    await recordGradedHabit(id, "2026-10-02", 8);
    let d = await data(id);
    expect(
        habitCommitment(
            d.h,
            d.p,
            [],
            d.e,
            "2026-10-01",
            "2026-10-02",
            new Date(),
        ),
    ).toEqual({ eligible: 1, done: 0, percent: 0 });
    expect(habitToday([d.h], d.p, [], d.e, new Date())[0].done).toBe(true);
});
it("manual level raise is not proven evolution", async () => {
    const id = await saveGradedHabit(input);
    await saveGradedHabit({
        ...input,
        id,
        current: { phaseKey: "pages", target: 20 },
    });
    vi.setSystemTime(new Date("2026-10-03T10:00:00Z"));
    const d = await data(id);
    expect(
        habitEvolution(d.h, d.p, [], d.e, d.p[1], new Date()).percent,
    ).toBeNull();
});
it("three separate closed eligible days prove level, interruption does not erase", async () => {
    const id = await saveGradedHabit(input);
    await saveGradedHabit({
        ...input,
        id,
        current: { phaseKey: "pages", target: 20 },
    });
    for (const day of ["02", "03", "04"]) {
        vi.setSystemTime(new Date(`2026-10-${day}T10:00:00Z`));
        await recordGradedHabit(id, `2026-10-${day}`, 20);
    }
    vi.setSystemTime(new Date("2026-11-03T10:00:00Z"));
    let d = await data(id);
    expect(habitEvolution(d.h, d.p, [], d.e, d.p[1], new Date()).percent).toBe(
        100,
    );
    await recordGradedHabit(id, "2026-10-03", 2);
    d = await data(id);
    expect(
        habitEvolution(d.h, d.p, [], d.e, d.p[1], new Date()).percent,
    ).toBeNull();
});
it("neutral performance is recorded but not proof", async () => {
    const id = await saveGradedHabit(input);
    await setHabitPaused("habit", id, true);
    await recordGradedHabit(id, "2026-10-01", 30);
    vi.setSystemTime(new Date("2026-10-02T10:00:00Z"));
    const d = await data(id);
    const day = habitDay(d.h, d.p, [], d.e, "2026-10-01", new Date());
    expect(day).toMatchObject({
        done: true,
        eligible: false,
        state: "neutral",
    });
});
it("new target scale does not repaint earlier proof", async () => {
    const id = await saveGradedHabit(input);
    await saveGradedHabit({
        ...input,
        id,
        phases: [{ ...input.phases[0], target: 40 }],
    });
    const d = await data(id);
    expect(d.p[0].phases[0].target).toBe(20);
    expect(d.p[1].baseline).toEqual(input.current);
});
it("fractional levels use integer alignment, final target is allowed", () => {
    const phases = [{ ...input.phases[0], start: 0.1, target: 0.8, step: 0.2 }];
    expect(() =>
        validateHabitLevels(phases, { phaseKey: "pages", target: 0.3 }),
    ).not.toThrow();
    expect(() =>
        validateHabitLevels(phases, { phaseKey: "pages", target: 0.8 }),
    ).not.toThrow();
    expect(() =>
        validateHabitLevels(phases, { phaseKey: "pages", target: 0.4 }),
    ).toThrow();
});
it("simple kind cannot be converted and erase old plan meaning", async () => {
    const id = await saveSimpleHabit({ ...input });
    await expect(saveGradedHabit({ ...input, id })).rejects.toThrow();
});
it("snapshot5 restore and merge preserve graded graph", async () => {
    const id = await saveGradedHabit(input);
    await recordGradedHabit(id, "2026-10-01", 4);
    const backup = await snapshot();
    await importBackup(backup);
    validateBackup(await snapshot());
    await mergeBackup(backup);
    const after = await snapshot();
    validateBackup(after);
    expect(after.habits).toHaveLength(2);
    expect(after.habitEntries).toHaveLength(2);
});
it("future date fails without any write", async () => {
    const id = await saveGradedHabit(input);
    await expect(recordGradedHabit(id, "2026-10-02", 2)).rejects.toThrow();
    expect(await db.habitEntries.count()).toBe(0);
});
it("clearing optional difficulty removes only the assessment, preserving quantity and row identity", async () => {
    const id = await saveGradedHabit(input);
    await recordGradedHabit(id, "2026-10-01", 2, "hard");
    const before = (await data(id)).e[0];
    await recordGradedHabit(id, "2026-10-01", 2, null);
    const after = (await data(id)).e[0];
    expect(after.id).toBe(before.id);
    expect(after.result).toEqual(before.result);
    expect(after.difficulty).toBeUndefined();
    validateBackup(await snapshot());
});
it("DST graded records use local23 and25 hour day boundaries", async () => {
    vi.setSystemTime(new Date("2026-01-01T10:00:00Z"));
    const id = await saveGradedHabit({
        ...input,
        timeZone: "America/New_York",
    });
    for (const [date, hours] of [
        ["2026-03-08", 23],
        ["2026-11-01", 25],
    ] as const) {
        vi.setSystemTime(new Date(date + "T20:00:00Z"));
        await recordGradedHabit(id, date, 2);
        const entry = (await data(id)).e.find((e) => e.localDate === date)!;
        expect(Date.parse(entry.dayEnd) - Date.parse(entry.dayStart)).toBe(
            hours * 3600000,
        );
    }
    validateBackup(await snapshot());
});
it("fixed quantity goal has no artificial growth range or division by zero", async () => {
    const id = await saveGradedHabit({
        ...input,
        phases: [{ ...input.phases[0], target: 1 }],
    });
    const d = await data(id);
    expect(habitEvolution(d.h, d.p, [], d.e, d.p[0], new Date())).toMatchObject(
        { percent: null, reason: "الخطة لا تحتوي نطاق زيادة" },
    );
});
