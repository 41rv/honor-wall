import "fake-indexeddb/auto";
import { currentCycle } from "../app/taskSchedule";
import { saveProjectGoal, setProjectPaused } from "../app/projectPaceStore";
import Dexie from "dexie";
import { it, expect, beforeEach, afterEach, vi } from "vitest";
import {
    db,
    Database,
    snapshot,
    importBackup,
    mergeBackup,
    create,
    setCycleStatus,
    setBranchCompletion,
    restoreImpact,
} from "../app/db";
import {
    recoveryDB,
    latestRecovery,
    backupDigest,
    sha256,
} from "../app/backupRecovery";
import { flushBackupWrites, trackBackupWrite } from "../app/backupWrites";
import { backupStores, habitStores, legacyStores } from "../app/backupTables";
import { validateBackup, type Snapshot } from "../app/model";
import { habitFixture } from "./habitFixtures";
const clock = "2026-10-21T10:00:00.000Z";
beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(clock));
    await db.transaction("rw", db.tables, async () => {
        for (const t of db.tables) await t.clear();
    });
    await recoveryDB.points.clear();
});
afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});
const raw = () =>
    db.transaction("r", db.tables, async () =>
        Object.fromEntries(
            await Promise.all(
                backupStores.map(async (n) => [n, await db.table(n).toArray()]),
            ),
        ),
    );
async function seed() {
    const d = habitFixture();
    await importBackup(d);
    await recoveryDB.points.clear();
    return d;
}
const legacy = (version: 1 | 2 | 3 | 4) => {
    const d = habitFixture();
    d.version = version;
    for (const name of habitStores) delete d[name];
    return d;
};
it("قاعدة جديدة:20 مخزنًا،80 أصليًا،بلا عادات أو تذكيرات أو إعدادات افتراضية مصطنعة", async () => {
    const database = new Database("habit-empty-" + crypto.randomUUID());
    try {
        await database.open();
        expect(database.verno).toBe(8);
        expect(database.backendDB().version).toBe(80);
        expect(database.tables).toHaveLength(20);
        for (const name of habitStores)
            expect(await database.table(name).count()).toBe(0);
    } finally {
        await database.delete();
    }
});
const schema6 = {
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
};
it("ترحيل6→8 عبر7 يحفظ كل صف وفهرس من الجداول12 حرفيًا ثم يفتح مرة ثانية دون توليد تاريخ", async () => {
    const p = await create("project", "مشروع قديم", "ملاحظة أصلية");
    const step = await create("step", "خطوة قديمة", "تفاصيل", p);
    await create("step", "خطوة ثانية", "", p);
    const task = await create(
        "task",
        "متكررة قديمة",
        "",
        undefined,
        null,
        false,
        {
            schedule: {
                repeat: "daily",
                date: "2026-10-21",
                timeZone: "Asia/Riyadh",
                leadDays: 3,
            },
        },
    );
    await setCycleStatus(currentCycle((await db.tasks.get(task))!)!.id, "done");
    await setBranchCompletion(step, true);
    await create("idea", "فكرة قديمة");
    await saveProjectGoal(p, {
        kind: "duration",
        value: 20,
        deadline: "flexible",
    });
    await setProjectPaused(p, true);
    vi.setSystemTime(new Date("2026-10-23T10:00:00.000Z"));
    await setProjectPaused(p, false);
    await db.recommendations.add({
        id: "old-decision",
        key: "old-decision",
        type: "focus",
        projectIds: [p],
        reason: "قرار محفوظ",
        effect: "لم يطبق",
        createdAt: clock,
        status: "rejected",
        decidedAt: clock,
        changes: [{ type: "pause", projectId: p }],
        basis: "old-fixture",
    });
    const oldData = await snapshot(),
        name = "habit-upgrade-" + crypto.randomUUID(),
        old = new Dexie(name);
    old.version(6).stores(schema6);
    await old.open();
    for (const store of legacyStores)
        expect(oldData[store]!.length).toBeGreaterThan(0);
    for (const store of legacyStores)
        await old.table(store).bulkAdd(oldData[store] ?? []);
    // Unknown legacy fields are not stripped by the migration.
    await old
        .table("tasks")
        .update(oldData.tasks[0].id, { customLegacyField: { keep: true } });
    const before = Object.fromEntries(
        await Promise.all(
            legacyStores.map(async (n) => [n, await old.table(n).toArray()]),
        ),
    );
    const indexes = Object.fromEntries(
        old.tables.map((t) => [t.name, JSON.stringify(t.schema)]),
    );
    old.close();
    const upgraded = new Database(name);
    try {
        await upgraded.open();
        expect(upgraded.backendDB().version).toBe(80);
        for (const n of legacyStores) {
            expect(await upgraded.table(n).toArray()).toEqual(before[n]);
            expect(JSON.stringify(upgraded.table(n).schema)).toBe(indexes[n]);
        }
        for (const n of habitStores)
            expect(await upgraded.table(n).count()).toBe(0);
        upgraded.close();
        await upgraded.open();
        for (const n of legacyStores)
            expect(await upgraded.table(n).toArray()).toEqual(before[n]);
    } finally {
        await upgraded.delete();
    }
});
it("اتصال قديم يستقبلversionchange ويغلق قبل الترقية دون فقد بيانات", async () => {
    const name = "habit-two-tabs-" + crypto.randomUUID(),
        old = new Dexie(name);
    old.version(6).stores(schema6);
    await old.open();
    let changed = false;
    old.on("versionchange", () => {
        changed = true;
        old.close();
    });
    const next = new Database(name);
    try {
        await next.open();
        expect(changed).toBe(true);
        expect(next.backendDB().version).toBe(80);
    } finally {
        old.close();
        await next.delete();
    }
});
it("الترقية المحجوبة تنتظر إغلاق الاتصال الآخر ولا تعيد إنشاء القاعدة", async () => {
    const name = "habit-blocked-" + crypto.randomUUID(),
        old = new Dexie(name);
    old.version(6).stores(schema6);
    await old.open();
    old.on("versionchange", () => false);
    const next = new Database(name);
    let blocked = false;
    next.on("blocked", () => {
        blocked = true;
        old.close();
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
        await next.open();
        expect(blocked).toBe(true);
        expect(next.backendDB().version).toBe(80);
    } finally {
        old.close();
        await next.delete();
        warn.mockRestore();
    }
});
it("Snapshot6 يصدر ويستعيد جميع الجداول20 ويحفظ اللقطات القديمة والمراجعات", async () => {
    await seed();
    const before = await snapshot();
    expect(before.version).toBe(6);
    validateBackup(before);
    await importBackup(JSON.parse(JSON.stringify(before)));
    expect(await raw()).toEqual(
        Object.fromEntries(backupStores.map((n) => [n, before[n] ?? []])),
    );
    expect((await latestRecovery())!.habitEntries).toEqual(before.habitEntries);
});
it.each([1, 2, 3, 4] as const)(
    "الاستعادة المحافظة للنسخة%s تحافظ على أقسام العادات السبعة حرفيًا",
    async (version) => {
        await seed();
        const before = await raw();
        await importBackup(legacy(version));
        const after = await raw();
        for (const n of habitStores) expect(after[n]).toEqual(before[n]);
        const copy = await latestRecovery();
        expect(copy!.version).toBe(6);
        expect(copy!.habitEntries).toEqual(before.habitEntries);
    },
);
it("الاستبدال الكامل غير المصرح به لا يكتب نسخة أمان ولا يمس البيانات", async () => {
    await seed();
    const before = await raw();
    await expect(importBackup(legacy(4), { mode: "full" })).rejects.toThrow(
        "موافقة صريحة",
    );
    expect(await raw()).toEqual(before);
    expect(await recoveryDB.points.count()).toBe(0);
});
it("الاستبدال الكامل الصريح يمسح الغائب ثم تستعيد نسخة الأمان كل البيانات", async () => {
    await seed();
    const before = await raw();
    await importBackup(legacy(4), { mode: "full", confirmFull: true });
    for (const n of habitStores) expect(await db.table(n).count()).toBe(0);
    const copy = await latestRecovery();
    validateBackup(copy);
    await importBackup(copy);
    expect(await raw()).toEqual(before);
});
it("المصفوفة الفارغة الموجودة في5 تُستعاد فارغة دون تفسيرها كقسم غائب", async () => {
    await seed();
    const d = habitFixture();
    for (const n of habitStores) d[n] = [];
    await importBackup(d);
    for (const n of habitStores) expect(await db.table(n).count()).toBe(0);
    expect((await latestRecovery())!.habits).toHaveLength(2);
});
it("فشل مساحة نسخة الأمان يمنع جميعclear ويترك الجداول19 كما كانت", async () => {
    await seed();
    const before = await raw();
    vi.spyOn(recoveryDB.points, "add").mockRejectedValueOnce(
        new DOMException("full", "QuotaExceededError"),
    );
    const clear = vi.spyOn(db.projects, "clear");
    await expect(
        importBackup(legacy(4), { mode: "full", confirmFull: true }),
    ).rejects.toThrow("نسخة أمان");
    expect(clear).not.toHaveBeenCalled();
    expect(await raw()).toEqual(before);
});
it("فشل الكتابة بعد المسح يتراجع عن الجداول19 ونسخة الأمان مستقلة وموجودة", async () => {
    await seed();
    const before = await raw();
    const fail = () => {
        throw new Error("simulated IDB failure");
    };
    db.reminders.hook("creating", fail);
    try {
        await expect(importBackup(habitFixture())).rejects.toThrow("simulated");
        expect(await raw()).toEqual(before);
        expect((await latestRecovery())!.habitEntries).toEqual(
            before.habitEntries,
        );
    } finally {
        db.reminders.hook("creating").unsubscribe(fail);
    }
});
it("ملف فاسد لا يغير شيئًا ولا يستهلك مساحة نسخة أمان", async () => {
    await seed();
    const before = await raw(),
        bad = habitFixture();
    bad.habitPlans![0].habitId = "missing";
    await expect(importBackup(bad)).rejects.toThrow("غير صالحة");
    expect(await raw()).toEqual(before);
    expect(await recoveryDB.points.count()).toBe(0);
});
it("تغير أعداد البيانات بعد المعاينة يمنع الاستبدال حتى إعادة الموافقة", async () => {
    await seed();
    const counts = await restoreImpact();
    await db.reminders.add({ ...habitFixture().reminders![0], id: "new-item" });
    const before = await raw();
    await expect(
        importBackup(legacy(4), { expectedCounts: counts }),
    ).rejects.toThrow("تغيرت البيانات");
    expect(await raw()).toEqual(before);
    expect(await recoveryDB.points.count()).toBe(0);
});
it("فهرس اليوم الفريد يمنع تسجيلين حتى من اتصالين مختلفين", async () => {
    await seed();
    const other = new Database(db.name);
    await other.open();
    try {
        await expect(
            other.habitEntries.add({
                ...habitFixture().habitEntries![0],
                id: "duplicate",
            }),
        ).rejects.toThrow();
        expect(await db.habitEntries.count()).toBe(3);
        await expect(
            other.habitPlans.add({
                ...habitFixture().habitPlans![0],
                id: "duplicate-plan",
            }),
        ).rejects.toThrow();
        expect(await db.habitPlans.count()).toBe(3);
    } finally {
        other.close();
    }
});
it("دمج معرفات متعارضة يضيف رسمًا جديدًا ويعيد ربط كل مرحلة وخطة وتسجيل وقرار", async () => {
    await seed();
    const before = await raw();
    expect(await mergeBackup(habitFixture())).toBe(true);
    for (const n of habitStores)
        for (const row of before[n])
            expect(await db.table(n).get(row.id)).toEqual(row);
    const merged = validateBackup(await snapshot()),
        habit = merged.habits!.find(
            (h) => h.id !== "reading" && h.title === "قراءة",
        )!;
    expect(habit.id).not.toBe("reading");
    expect(habit.pathId).not.toBe("culture");
    const plans = merged.habitPlans!.filter((p) => p.habitId === habit.id);
    expect(plans).toHaveLength(2);
    expect(plans[0].phases[0].key).not.toBe("pages");
    expect(plans[0].phases[0].key).toBe(plans[1].phases[0].key);
    const entries = merged.habitEntries!.filter((e) => e.habitId === habit.id);
    expect(entries).toHaveLength(2);
    for (const e of entries) {
        expect(plans.some((p) => p.id === e.planId)).toBe(true);
        expect(e.result.kind === "graded" && e.result.phaseKey).toBe(
            plans[0].phases[0].key,
        );
    }
    const accepted = merged.habitSuggestions!.find(
        (s) => s.habitId === habit.id && s.status === "accepted",
    )!;
    expect(plans.some((p) => p.id === accepted.appliedPlanId)).toBe(true);
    expect(
        merged.habitSuggestions!.find(
            (s) => s.habitId === habit.id && s.reason === "أداء مستقر",
        )!.status,
    ).toBe("invalid");
    expect(
        merged.habitSuggestions!.find(
            (s) => s.habitId === habit.id && s.status === "rejected",
        )!.change?.phaseKey,
    ).toBe(plans[0].phases[0].key);
});
it("المعرف نفسه في مخزنين لا يخلط المسار والملكية", async () => {
    const d = habitFixture();
    d.habitPaths![0].id = "reading";
    d.habits![0].pathId = "reading";
    d.habitPlans!.filter((p) => p.pathId).forEach(
        (p) => (p.pathId = "reading"),
    );
    d.habitImportReceipts![0].outputs.habitPaths = ["reading"];
    await mergeBackup(d);
    const data = validateBackup(await snapshot());
    const h = data.habits!.find((h) => h.kind === "graded")!;
    expect(data.habitPaths![0].id).not.toBe(h.id);
    expect(h.pathId).toBe(data.habitPaths![0].id);
});
it("ضغط متزامن أو ملف أعيد ترتيب مفاتيحه وسجلاته لا يكرر الدمج", async () => {
    const source = habitFixture();
    expect(
        (await Promise.all([mergeBackup(source), mergeBackup(source)])).sort(),
    ).toEqual([false, true]);
    const before = await raw();
    // A recursive key reorder without dropping nested fields.
    const reorder = (x: unknown): unknown =>
        Array.isArray(x)
            ? x.map(reorder)
            : x && typeof x === "object"
              ? Object.fromEntries(
                    Object.entries(x)
                        .reverse()
                        .map(([k, v]) => [k, reorder(v)]),
                )
              : x;
    const other = reorder(source) as Snapshot;
    other.habits!.reverse();
    other.habitEntries!.reverse();
    other.exportedAt = "2026-10-22T10:00:00.000Z";
    expect(await mergeBackup(other)).toBe(false);
    expect(await raw()).toEqual(before);
});
it("الإيصال المحلي الفعال لا يستبدله إيصال مستورد بنفس البصمة أوالمعرف", async () => {
    const d = habitFixture();
    await mergeBackup(d);
    const receipt = (await db.habitImportReceipts.toArray()).find(
        (r) => r.kind === "backup",
    )!;
    const other = habitFixture();
    other.reminders![0].title = "نسخة أخرى";
    other.habitImportReceipts!.push({ ...receipt });
    await mergeBackup(other);
    expect(await db.habitImportReceipts.get(receipt.id)).toEqual(receipt);
    validateBackup(await snapshot());
});
it("الإيصال ذو العناصر المحذوفة لا يمنع إعادة الدمج، والمراجع الغائبة لا ترتبط بمحلي قديم", async () => {
    const d = habitFixture();
    d.habitImportReceipts![0].outputs.habits = ["removed"];
    await mergeBackup(d);
    const imported = (await db.habitImportReceipts.toArray()).find(
        (r) => r.kind === "path",
    )!;
    expect(imported.outputs.habits).not.toEqual(["removed"]);
    await db.reminders.clear();
    expect(await mergeBackup(d)).toBe(true);
    expect(await db.reminders.count()).toBe(1);
    validateBackup(await snapshot());
});
it("بصمات الدمج الدقيقة قبل schema7 تبقى محترمة", async () => {
    const source = legacy(4),
        digest = await sha256(JSON.stringify({ ...source, exportedAt: "" }));
    await db.paceSettings.put({
        id: "pace",
        activeLimit: 3,
        importDigests: [digest],
    });
    expect(await mergeBackup(source)).toBe(false);
    expect(await db.habits.count()).toBe(0);
});
it("بيانات العادات الجديدة تدخل البصمة ولا تمنع نسختين مختلفتين فعليًا", async () => {
    const a = habitFixture(),
        b = habitFixture();
    b.habitEntries![0].result = {
        kind: "graded",
        phaseKey: "pages",
        unit: "صفحات",
        threshold: 1,
        amount: 2,
    };
    expect(await backupDigest(a)).not.toBe(await backupDigest(b));
    expect(await mergeBackup(a)).toBe(true);
    expect(await mergeBackup(b)).toBe(true);
    expect(await db.habits.count()).toBe(4);
});
it("فشل في منتصف الدمج يتراجع عن الرسم والبصمات والإيصالات معًا", async () => {
    await seed();
    const before = await raw();
    const fail = () => {
        throw new Error("merge failure");
    };
    db.habitSuggestions.hook("creating", fail);
    try {
        await expect(mergeBackup(habitFixture())).rejects.toThrow(
            "merge failure",
        );
        expect(await raw()).toEqual(before);
    } finally {
        db.habitSuggestions.hook("creating").unsubscribe(fail);
    }
});
it("تلف نسخة الأمان يُكشف بدل تنزيل ملف غير موثوق", async () => {
    await seed();
    await importBackup(legacy(4));
    const point = (await recoveryDB.points.toArray()).at(-1)!;
    await recoveryDB.points.update(point.id!, { digest: "0".repeat(64) });
    await expect(latestRecovery()).rejects.toThrow("سلامة");
});
it("PWA ينتظر الكتابات القائمة ويتعامل مع الرفض دون تسرب وعد غير معالج", async () => {
    let finish!: () => void;
    const operation = trackBackupWrite(
        () =>
            new Promise<void>((r) => {
                finish = r;
            }),
    );
    let done = false;
    const flush = flushBackupWrites().then(() => {
        done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);
    finish();
    await operation;
    await flush;
    expect(done).toBe(true);
    await expect(
        trackBackupWrite(() => Promise.reject(new Error("write error"))),
    ).rejects.toThrow("write error");
    await expect(flushBackupWrites()).resolves.toBeUndefined();
});

it("يمنع المسح إذا تجاوز حجم نسخة الأمان حد الاستيراد القابل للاستعادة", async () => {
    const data = habitFixture();
    data.tasks = [
        {
            id: "large",
            title: "بيانات كبيرة",
            notes: "x".repeat(20 * 1024 * 1024),
            status: "todo",
            createdAt: clock,
            updatedAt: clock,
        },
    ];
    const { saveRecovery } = await import("../app/backupRecovery");
    await expect(saveRecovery(data)).rejects.toThrow("حد الاستيراد");
    expect(await recoveryDB.points.count()).toBe(0);
});

it("فشل ترقية7 يتراجع إلى الإصدار6 والجداول القديمة دون فقد", async () => {
    const name = "habit-upgrade-abort-" + crypto.randomUUID();
    const original = new Dexie(name);
    original.version(6).stores(schema6);
    await original.open();
    const data = legacy(4);
    data.ideas = [
        {
            id: "keep",
            title: "لا تفقد",
            notes: "سجل سابق",
            createdAt: clock,
            updatedAt: clock,
            archived: false,
        },
    ];
    await original.table("ideas").bulkAdd(data.ideas);
    const before = await original.table("ideas").toArray();
    original.close();
    const failed = new Database(name);
    failed.version(7).upgrade(() => {
        throw new Error("simulated upgrade abort");
    });
    await expect(failed.open()).rejects.toThrow("simulated upgrade abort");
    failed.close();
    const reopened = new Dexie(name);
    reopened.version(6).stores(schema6);
    try {
        await reopened.open();
        expect(reopened.backendDB().version).toBe(60);
        expect(reopened.tables).toHaveLength(12);
        expect(await reopened.table("ideas").toArray()).toEqual(before);
    } finally {
        await reopened.delete();
    }
});
