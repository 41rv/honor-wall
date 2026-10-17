import "fake-indexeddb/auto";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { db, snapshot, importBackup, mergeBackup, create } from "../app/db";
import {
    saveHabitPath,
    saveSimpleHabit,
    recordSimpleHabit,
    setHabitPaused,
    archiveHabitPath,
    restoreHabitPath,
    setHabitArchived,
} from "../app/habitStore";
import { habitCommitment, habitToday } from "../app/habitCalendar";
import { flushBackupWrites } from "../app/backupWrites";
import { validateBackup } from "../app/model";
import { backupStores, legacyStores } from "../app/backupTables";
const start = "2026-10-01T09:00:00.000Z";
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
const make = (extra = {}) =>
    saveSimpleHabit({
        title: "ترتيب السرير",
        pathId: null,
        schedule: { repeat: "daily" },
        timeZone: "Asia/Riyadh",
        ...extra,
    });
const raw = () =>
    db.transaction("r", db.tables, async () =>
        Object.fromEntries(
            await Promise.all(
                backupStores.map(async (n) => [n, await db.table(n).toArray()]),
            ),
        ),
    );
it("ينشئ مستقلةبخطةبسيطة دون أي بياناتتلقائية أخرى", async () => {
    const id = await make();
    expect(await db.habits.get(id)).toMatchObject({
        kind: "simple",
        pathId: null,
        archived: false,
    });
    expect(await db.habitPlans.count()).toBe(1);
    for (const n of [
        ...legacyStores,
        "habitSuggestions",
        "reminders",
        "habitImportReceipts",
    ] as const)
        expect(await db.table(n).count()).toBe(0);
    validateBackup(await snapshot());
});
it("مسار جديد وتعديله يحفظالمعرف والتاريخ", async () => {
    const id = await saveHabitPath({ title: "ثقافي" });
    await saveHabitPath({ id, title: "الثقافة" });
    expect(await db.habitPaths.count()).toBe(1);
    expect((await db.habitPaths.get(id))?.createdAt).toBe(start);
});
it.each(["", "x".repeat(301)])(
    "يرفض الاسمغيرالصحيح دونكتابة",
    async (title) => {
        await expect(make({ title })).rejects.toThrow();
        expect(await db.habits.count()).toBe(0);
    },
);
it.each([[], [0, 0], [7], [-1], [1.5]].map((weekdays) => ({ weekdays })))(
    "يرفضأيام الأسبوعغيرالصالحة %s",
    async ({ weekdays }) => {
        await expect(
            make({ schedule: { repeat: "weekly", weekdays } }),
        ).rejects.toThrow();
        expect(await db.habits.count()).toBe(0);
    },
);
it("يرفض مسارًا غائبًا أو مؤرشفًا", async () => {
    await expect(make({ pathId: "missing" })).rejects.toThrow();
    const pathId = await saveHabitPath({ title: "مسار" });
    await archiveHabitPath(pathId);
    await expect(make({ pathId })).rejects.toThrow();
});
it("يرفض البدايةالماضية والمستحيلة ويقبلالمستقبل", async () => {
    await expect(make({ startDate: "2026-09-30" })).rejects.toThrow();
    await expect(make({ startDate: "2026-02-31" })).rejects.toThrow();
    const id = await make({ startDate: "2026-11-01" });
    expect(
        (await db.habitPlans.where("habitId").equals(id).first())
            ?.effectiveDate,
    ).toBe("2026-11-01");
});
it("إتمام وتراجع وتصحيحالسابق يحدث نفسالصف ويحفظوقتالإدخال", async () => {
    const id = await make();
    const e = await recordSimpleHabit(id, "2026-10-01", true);
    const before = await db.habitEntries.get(e);
    vi.setSystemTime(new Date("2026-10-03T09:00:00Z"));
    await recordSimpleHabit(id, "2026-10-01", false);
    expect(await db.habitEntries.count()).toBe(1);
    expect(await db.habitEntries.get(e)).toMatchObject({
        id: e,
        recordedAt: before!.recordedAt,
        updatedAt: "2026-10-03T09:00:00.000Z",
        result: { kind: "simple", done: false },
    });
    validateBackup(await snapshot());
});
it("تكرار الحالة نفسها لا يغيروقتها ولايولدسجلًا", async () => {
    const id = await make();
    await recordSimpleHabit(id, "2026-10-01", true);
    const before = await db.habitEntries.toArray();
    vi.setSystemTime(new Date("2026-10-02T09:00:00Z"));
    await recordSimpleHabit(id, "2026-10-01", true);
    expect(await db.habitEntries.toArray()).toEqual(before);
});
it("20تسجيلًا متزامنًا ينتج صفًا واحدًا والحالةالمطلوبة فقط", async () => {
    const id = await make();
    await Promise.all(
        Array.from({ length: 20 }, () =>
            recordSimpleHabit(id, "2026-10-01", true),
        ),
    );
    expect(await db.habitEntries.count()).toBe(1);
    await Promise.all([
        recordSimpleHabit(id, "2026-10-01", false),
        recordSimpleHabit(id, "2026-10-01", true),
    ]);
    expect((await db.habitEntries.toArray())[0].result).toEqual({
        kind: "simple",
        done: true,
    });
});
it("المستقبل وقبلالبداية لايكتبان شيئًا", async () => {
    const id = await make({ startDate: "2026-10-02" });
    await expect(recordSimpleHabit(id, "2026-10-01", true)).rejects.toThrow();
    await expect(recordSimpleHabit(id, "2026-10-03", true)).rejects.toThrow();
    expect(await db.habitEntries.count()).toBe(0);
});
it("تعديل الجدول يسريغدًا ولايغيرخطة تسجيلاليوم", async () => {
    const id = await make();
    await recordSimpleHabit(id, "2026-10-01", true);
    const before = await db.habitEntries.toArray();
    await saveSimpleHabit({
        id,
        title: "عنوان جديد",
        pathId: null,
        schedule: { repeat: "weekly", weekdays: [6] },
    });
    const plans = await db.habitPlans
        .where("habitId")
        .equals(id)
        .sortBy("revision");
    expect(plans.map((p) => p.effectiveDate)).toEqual([
        "2026-10-01",
        "2026-10-02",
    ]);
    expect(await db.habitEntries.toArray()).toEqual(before);
    validateBackup(await snapshot());
});
it("آخر تعديل للغد يسريويحفظجميعالمراجعات", async () => {
    const id = await make();
    for (const day of [0, 1, 2])
        await saveSimpleHabit({
            id,
            title: "عادة",
            pathId: null,
            schedule: { repeat: "weekly", weekdays: [day] },
        });
    expect(
        (
            await db.habitPlans.where("habitId").equals(id).sortBy("revision")
        ).map((p) => p.revision),
    ).toEqual([1, 2, 3, 4]);
    vi.setSystemTime(new Date("2026-10-02T09:00:00Z"));
    await recordSimpleHabit(id, "2026-10-02", true);
    const e = (await db.habitEntries.toArray())[0];
    expect((await db.habitPlans.get(e.planId))?.revision).toBe(4);
    validateBackup(await snapshot());
});
it("تعديل عادةلمتبدأ لايقدمبدايتها ولايؤخر تسلسل المراجعات", async () => {
    const id = await make({ startDate: "2026-11-01" });
    await saveSimpleHabit({
        id,
        title: "عادة",
        pathId: null,
        schedule: { repeat: "weekly", weekdays: [0] },
    });
    expect(
        (await db.habitPlans.where("habitId").equals(id).toArray()).every(
            (p) => p.effectiveDate === "2026-11-01",
        ),
    ).toBe(true);
    validateBackup(await snapshot());
});
it("إضافةلمسار ثم نقل ثم فصل يحفظالسجل والمعرفوالعضويةالتاريخية", async () => {
    const a = await saveHabitPath({ title: "أ" }),
        b = await saveHabitPath({ title: "ب" });
    const id = await make({ pathId: a });
    await recordSimpleHabit(id, "2026-10-01", true);
    const old = await db.habitEntries.toArray();
    vi.setSystemTime(new Date("2026-10-02T09:00:00Z"));
    await saveSimpleHabit({
        id,
        title: "عادة",
        pathId: b,
        schedule: { repeat: "daily" },
    });
    vi.setSystemTime(new Date("2026-10-04T09:00:00Z"));
    await saveSimpleHabit({
        id,
        title: "عادة",
        pathId: null,
        schedule: { repeat: "daily" },
    });
    expect(
        (
            await db.habitPlans.where("habitId").equals(id).sortBy("revision")
        ).map((p) => p.pathId),
    ).toEqual([a, b, null]);
    expect(await db.habitEntries.toArray()).toEqual(old);
    expect((await db.habits.get(id))?.pathId).toBeNull();
    validateBackup(await snapshot());
});
it("الإيقاف والاستئناف متكرران بأمان والاستئناف لايلغيتوقفالعادة", async () => {
    const pathId = await saveHabitPath({ title: "مسار" });
    const id = await make({ pathId });
    await setHabitPaused("habit", id, true);
    await setHabitPaused("habit", id, true);
    await setHabitPaused("path", pathId, true);
    vi.setSystemTime(new Date("2026-10-02T09:00:00Z"));
    await setHabitPaused("path", pathId, false);
    const d = await snapshot();
    expect(d.habits![0].pauses).toHaveLength(1);
    expect(d.habits![0].pauses[0].end).toBeUndefined();
    expect(
        habitToday(
            d.habits!,
            d.habitPlans!,
            d.habitPaths!,
            d.habitEntries!,
            new Date(),
        ),
    ).toHaveLength(0);
    validateBackup(d);
});
it("أداءاختياري أثناءالإيقاف محفوظولايدخلالالتزام", async () => {
    const id = await make();
    await setHabitPaused("habit", id, true);
    await recordSimpleHabit(id, "2026-10-01", true);
    vi.setSystemTime(new Date("2026-10-02T09:00:00Z"));
    const d = await snapshot();
    expect(
        habitCommitment(
            d.habits![0],
            d.habitPlans!,
            d.habitPaths!,
            d.habitEntries!,
            "2026-10-01",
            "2026-10-02",
            new Date(),
        ),
    ).toEqual({ eligible: 0, done: 0, percent: null });
    expect(d.habitEntries).toHaveLength(1);
});
it("أرشفةالمسار تفصلالحاضر وتحفظالخططوالسجل ولا تحذفأيصف", async () => {
    const pathId = await saveHabitPath({ title: "مسار" });
    const id = await make({ pathId });
    await recordSimpleHabit(id, "2026-10-01", true);
    const before = await db.habitEntries.toArray();
    await archiveHabitPath(pathId);
    await archiveHabitPath(pathId);
    expect((await db.habits.get(id))?.pathId).toBeNull();
    expect(await db.habitEntries.toArray()).toEqual(before);
    expect(await db.habitPlans.count()).toBe(2);
    await restoreHabitPath(pathId);
    expect((await db.habitPaths.get(pathId))?.deletedAt).toBeUndefined();
    expect((await db.habits.get(id))?.pathId).toBeNull();
    validateBackup(await snapshot());
});
it("أرشفةالعادة واستعادتها تحفظالإيقاف حتىاستئنافصريح", async () => {
    const id = await make();
    await setHabitArchived(id, true);
    await setHabitArchived(id, false);
    const h = await db.habits.get(id);
    expect(h?.archived).toBe(false);
    expect(h?.pauses[0].end).toBeUndefined();
});
it("حفظالعادةوخطةالبداية ذري عندفشلإدراجالخطة", async () => {
    const fail = () => {
        throw new Error("injected-plan-failure");
    };
    db.habitPlans.hook("creating", fail);
    try {
        await expect(make()).rejects.toThrow("injected");
        expect(await db.habits.count()).toBe(0);
    } finally {
        db.habitPlans.hook("creating").unsubscribe(fail);
    }
});
it("أرشفةالمسارذرية عندفشل تعديلطفل", async () => {
    const pathId = await saveHabitPath({ title: "مسار" });
    await make({ pathId });
    const before = await raw();
    const fail = () => {
        throw new Error("injected-child-failure");
    };
    db.habitPlans.hook("creating", fail);
    try {
        await expect(archiveHabitPath(pathId)).rejects.toThrow();
        expect(await raw()).toEqual(before);
    } finally {
        db.habitPlans.hook("creating").unsubscribe(fail);
    }
});
it("النسخالاحتياطي ينتظرالتسجيلالمعلق ويحفظالجداولالقديمة", async () => {
    await create("project", "مشروع");
    await create("task", "مهمة");
    await create("idea", "فكرة");
    const id = await make();
    const legacy: Record<string, unknown[]> = Object.fromEntries(
        legacyStores.map((n) => [n, []]),
    );
    for (const n of legacyStores) legacy[n] = await db.table(n).toArray();
    const writing = recordSimpleHabit(id, "2026-10-01", true);
    const d = await snapshot();
    await writing;
    expect(d.habitEntries).toHaveLength(1);
    for (const n of ["projects", "tasks", "ideas", "events"] as const)
        expect(d[n]).toEqual(legacy[n]);
    validateBackup(d);
});
it("تصدير واستعادة ودمج بياناتالمرحلةالثالثة دونتكرارأوخللروابط", async () => {
    const pathId = await saveHabitPath({ title: "مسار" });
    const id = await make({ pathId });
    await recordSimpleHabit(id, "2026-10-01", true);
    await setHabitPaused("habit", id, true);
    await flushBackupWrites();
    const d = await snapshot();
    validateBackup(d);
    await importBackup(d);
    expect((await snapshot()).habitEntries).toEqual(d.habitEntries);
    expect(await mergeBackup(d)).toBe(true);
    expect(await mergeBackup(d)).toBe(false);
    expect(await db.habitEntries.count()).toBe(2);
    validateBackup(await snapshot());
});
it("التسجيلفيDST23/25ساعة يطابقعقدSnapshot5", async () => {
    for (const [date, hours] of [
        ["2026-03-08", 23],
        ["2026-11-01", 25],
    ] as const) {
        vi.setSystemTime(new Date(date + "T05:00:00Z"));
        const id = await make({ timeZone: "America/New_York" });
        await recordSimpleHabit(id, date, true);
        const e = await db.habitEntries.where("habitId").equals(id).first();
        expect(
            (Date.parse(e!.dayEnd) - Date.parse(e!.dayStart)) / 3600000,
        ).toBe(hours);
    }
    validateBackup(await snapshot());
});
it("تغيرالساعةللخلف لايكسرتاريخالتسجيل", async () => {
    const id = await make();
    await recordSimpleHabit(id, "2026-10-01", true);
    vi.setSystemTime(new Date("2026-10-01T08:00:00Z"));
    await expect(recordSimpleHabit(id, "2026-10-01", false)).rejects.toThrow();
    expect((await db.habitEntries.toArray())[0].result).toEqual({
        kind: "simple",
        done: true,
    });
});
it("ساعةأقدممنآخرحفظلايمكنهاكتابةإيقافأومراجعةغيرصالحة", async () => {
    const pathId = await saveHabitPath({ title: "مسار" });
    const id = await make({ pathId });
    const before = await raw();
    vi.setSystemTime(new Date("2026-10-01T08:00:00Z"));
    await expect(
        saveHabitPath({ id: pathId, title: "تعديل" }),
    ).rejects.toThrow();
    await expect(
        saveSimpleHabit({
            id,
            title: "تعديل",
            pathId,
            schedule: { repeat: "daily" },
        }),
    ).rejects.toThrow();
    await expect(setHabitPaused("habit", id, true)).rejects.toThrow();
    await expect(setHabitPaused("path", pathId, true)).rejects.toThrow();
    await expect(archiveHabitPath(pathId)).rejects.toThrow();
    expect(await raw()).toEqual(before);
});
it("تعديلتسجيلبسيطيحفظإفادةصعوبةقديمةدونإضافةواجهةلجمعها", async () => {
    const id = await make();
    const key = await recordSimpleHabit(id, "2026-10-01", true);
    await db.habitEntries.update(key, { difficulty: "hard" });
    await recordSimpleHabit(id, "2026-10-01", false);
    expect(await db.habitEntries.get(key)).toMatchObject({
        difficulty: "hard",
        recordedAt: start,
        result: { kind: "simple", done: false },
    });
    validateBackup(await snapshot());
});
