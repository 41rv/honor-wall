import "fake-indexeddb/auto";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { db, snapshot } from "../app/db";
import {
    saveGradedHabit,
    recordGradedHabit,
    setHabitPaused,
} from "../app/habitStore";
import {
    habitAdvice,
    refreshHabitAdvice,
    decideHabitAdvice,
} from "../app/habitAdvice";
import { validateBackup } from "../app/model";
import type { GradedHabitInput } from "../app/habitStore";
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
const time = (day: number) =>
    vi.setSystemTime(
        new Date(`2026-10-${String(day).padStart(2, "0")}T10:00:00Z`),
    );
beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    time(1);
    await db.transaction("rw", db.tables, async () => {
        for (const t of db.tables) await t.clear();
    });
});
afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});
async function make(
    options: Partial<GradedHabitInput> = {},
    amounts: (number | null)[] = Array(7).fill(1),
    hard = false,
) {
    const id = await saveGradedHabit({ ...input, ...options });
    for (let i = 0; i < 7; i++) {
        time(i + 1);
        if (amounts[i] !== null)
            await recordGradedHabit(
                id,
                `2026-10-0${i + 1}`,
                amounts[i],
                hard && i >= 4 ? "hard" : "okay",
            );
    }
    time(8);
    return id;
}
async function pure(id: string, required = 6) {
    const h = (await db.habits.get(id))!,
        p = await db.habitPlans.where("habitId").equals(id).toArray(),
        e = await db.habitEntries.where("habitId").equals(id).toArray();
    return habitAdvice(h, p, [], e, new Date(), required);
}
it("6/7 produces explainable one-step suggestion, no automatic plan change", async () => {
    const id = await make({}, [1, 1, 1, 1, 1, 1, null]);
    const s = await refreshHabitAdvice(id);
    expect(s).toMatchObject({
        type: "increase",
        change: { phaseKey: "pages", target: 2 },
        status: "new",
    });
    expect(await db.habitPlans.count()).toBe(1);
    expect(s?.effect).toContain("الغد");
});
it("threshold adjustable for this evaluation, floor3 and fixed sample7", async () => {
    const id = await make({}, [1, 1, 1, 1, 1, null, null]);
    expect((await pure(id))?.type).toBe("maintain");
    expect((await pure(id, 5))?.type).toBe("increase");
    await expect(pure(id, 2)).rejects.toThrow();
});
it("fewer than7 closed eligible days does not recommend promotion", async () => {
    const id = await make();
    time(7);
    expect(await pure(id)).toBeNull();
});
it("backfilling7 days at once cannot establish sustainable performance", async () => {
    const id = await saveGradedHabit(input);
    time(8);
    for (let i = 1; i <= 7; i++)
        await recordGradedHabit(id, `2026-10-0${i}`, 10);
    expect((await pure(id))?.type).toBe("maintain");
});
it("three separate on-day records remain required even with lower threshold", async () => {
    const id = await make({}, [1, 1, null, null, null, null, null]);
    expect((await pure(id, 3))?.type).toBe("maintain");
});
it("advance starts next difficulty stage easy, no unit arithmetic", async () => {
    const id = await make({
        phases: [
            { ...input.phases[0], target: 1 },
            {
                key: "walk",
                label: "مشي",
                unit: "خطوة",
                start: 2,
                target: 100,
                step: 2,
            },
        ],
    });
    expect(await pure(id)).toMatchObject({
        type: "advance",
        change: { phaseKey: "walk", target: 2 },
    });
});
it("ease only with repeated explicit hard below threshold", async () => {
    const id = await make(
        { current: { phaseKey: "pages", target: 5 } },
        [2, 2, 2, 2, 2, 2, 2],
        true,
    );
    expect(await pure(id)).toMatchObject({
        type: "ease",
        change: { target: 4 },
    });
});
it("absence alone never lowers or resets level", async () => {
    const id = await make(
        { current: { phaseKey: "pages", target: 5 } },
        Array(7).fill(null),
    );
    expect((await pure(id))?.type).toBe("maintain");
    expect((await db.habitPlans.toArray())[0].current?.target).toBe(5);
});
it("repeat recomputation produces one suggestion", async () => {
    const id = await make();
    await Promise.all(Array.from({ length: 8 }, () => refreshHabitAdvice(id)));
    expect(await db.habitSuggestions.count()).toBe(1);
});
it("reject changes no plan; two days alone do not reissue", async () => {
    const id = await make();
    const s = (await refreshHabitAdvice(id))!;
    await decideHabitAdvice(s.id, false);
    for (let day = 8; day <= 9; day++) {
        time(day);
        vi.setSystemTime(new Date(Date.now() + 60_000));
        await recordGradedHabit(id, `2026-10-0${day}`, 2);
    }
    time(10);
    expect(await refreshHabitAdvice(id)).toBeNull();
    expect(await db.habitPlans.count()).toBe(1);
    expect(await db.habitSuggestions.count()).toBe(1);
});
it("reissue requires3 new on-day recordings and material change", async () => {
    const id = await make();
    await decideHabitAdvice((await refreshHabitAdvice(id))!.id, false);
    for (let day = 8; day <= 10; day++) {
        time(day);
        vi.setSystemTime(new Date(Date.now() + 60_000));
        await recordGradedHabit(
            id,
            `2026-10-${String(day).padStart(2, "0")}`,
            2,
        );
    }
    time(11);
    expect((await refreshHabitAdvice(id))?.status).toBe("new");
    expect(await db.habitSuggestions.count()).toBe(2);
});
it("three more unchanged performance days still do not repeat rejected advice", async () => {
    const id = await make();
    await decideHabitAdvice((await refreshHabitAdvice(id))!.id, false);
    for (let day = 8; day <= 10; day++) {
        time(day);
        vi.setSystemTime(new Date(Date.now() + 60_000));
        await recordGradedHabit(
            id,
            `2026-10-${String(day).padStart(2, "0")}`,
            1,
        );
    }
    time(11);
    expect(await refreshHabitAdvice(id)).toBeNull();
});
it("accept only after explicit decision and apply tomorrow, idempotent concurrent clicks", async () => {
    const id = await make(),
        s = (await refreshHabitAdvice(id))!;
    const results = await Promise.all([
        decideHabitAdvice(s.id, true),
        decideHabitAdvice(s.id, true),
    ]);
    expect(results.filter((r) => r.applied)).toHaveLength(1);
    const p = await db.habitPlans
        .where("habitId")
        .equals(id)
        .sortBy("revision");
    expect(p[1]).toMatchObject({
        effectiveDate: "2026-10-09",
        current: { target: 2 },
    });
    validateBackup(await snapshot());
});
it("stale record invalidates recommendation without changing plan", async () => {
    const id = await make(),
        s = (await refreshHabitAdvice(id))!;
    await recordGradedHabit(id, "2026-10-07", 0);
    expect(await decideHabitAdvice(s.id, true)).toEqual({
        applied: false,
        stale: true,
    });
    expect((await db.habitSuggestions.get(s.id))?.status).toBe("invalid");
    expect(await db.habitPlans.count()).toBe(1);
});
it("pause suppresses and invalidates old recommendation", async () => {
    const id = await make(),
        s = (await refreshHabitAdvice(id))!;
    await setHabitPaused("habit", id, true);
    expect(await pure(id)).toBeNull();
    expect((await decideHabitAdvice(s.id, true)).stale).toBe(true);
});
it("future manual plan prevents competing recommendation", async () => {
    const id = await make();
    await saveGradedHabit({
        ...input,
        id,
        current: { phaseKey: "pages", target: 4 },
    });
    expect(await refreshHabitAdvice(id)).toBeNull();
});
it("failed decision write rolls plan and decision back atomically", async () => {
    const id = await make(),
        s = (await refreshHabitAdvice(id))!;
    vi.spyOn(db.habitSuggestions, "put").mockRejectedValueOnce(
        new Error("quota"),
    );
    await expect(decideHabitAdvice(s.id, true)).rejects.toThrow();
    expect(await db.habitPlans.count()).toBe(1);
    expect((await db.habitSuggestions.get(s.id))?.status).toBe("new");
});
it("a valid evaluation may be revisited after invalidation, without reviving rejected decisions", async () => {
    const id = await make();
    const a = (await refreshHabitAdvice(id, 6))!;
    const b = (await refreshHabitAdvice(id, 7))!;
    expect((await db.habitSuggestions.get(a.id))?.status).toBe("invalid");
    const c = (await refreshHabitAdvice(id, 6))!;
    expect(c.status).toBe("new");
    expect(c.basisHash).toBe(a.basisHash);
    expect((await db.habitSuggestions.get(b.id))?.status).toBe("invalid");
    await refreshHabitAdvice(id, 6);
    expect(
        (await db.habitSuggestions.toArray()).filter((s) => s.status === "new"),
    ).toHaveLength(1);
});
it("backward clock never writes an invalid decision timestamp", async () => {
    const id = await make();
    await refreshHabitAdvice(id);
    const before = await db.habitSuggestions.toArray();
    time(7);
    await expect(refreshHabitAdvice(id)).rejects.toThrow();
    expect(await db.habitSuggestions.toArray()).toEqual(before);
});
it("ease uses last5 recorded eligible days, not missing days as effort assessments", async () => {
    const id = await make({ current: { phaseKey: "pages", target: 5 } }, [
        2,
        2,
        2,
        2,
        2,
        null,
        null,
    ]);
    for (const day of ["01", "02", "03"])
        await recordGradedHabit(id, `2026-10-${day}`, 2, "hard");
    expect(await pure(id)).toMatchObject({
        type: "ease",
        change: { target: 4 },
    });
});
it("five explicit effort recordings may justify optional ease before a7-day promotion sample exists", async () => {
    const id = await saveGradedHabit({
        ...input,
        current: { phaseKey: "pages", target: 5 },
    });
    for (let day = 1; day <= 5; day++) {
        time(day);
        await recordGradedHabit(
            id,
            `2026-10-0${day}`,
            2,
            day <= 3 ? "hard" : "okay",
        );
    }
    time(6);
    expect(await pure(id)).toMatchObject({
        type: "ease",
        change: { target: 4 },
    });
});
