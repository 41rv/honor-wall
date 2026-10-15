import { beforeEach, afterEach, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import Dexie from "dexie";
import {
    db,
    Database,
    create,
    ensurePacePlans,
    snapshot,
    importBackup,
    mergeBackup,
    setBranchCompletion,
    updateTaskOptions,
    setCycleStatus,
} from "../app/db";
import {
    setProjectRestDays,
    setActiveLimit,
    saveProjectGoal,
    refreshRecommendations,
    rejectRecommendation,
    acceptRecommendation,
} from "../app/projectPaceStore";
import { validateBackup } from "../app/model";
import { buildHierarchy } from "../app/hierarchy";
import { projectPace } from "../app/projectPace";
import {
    availableProjectDays,
    isProjectRest,
    projectRestSettings,
} from "../app/projectRest";
const since = "2026-10-01T00:00:00.000Z";
beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(since));
    await db.transaction("rw", db.tables, async () => {
        for (const table of db.tables) await table.clear();
    });
});
afterEach(() => vi.useRealTimers());
async function project(count = 2) {
    const id = await create("project", "راحة");
    const ids = [];
    for (let n = 0; n < count; n++)
        ids.push(await create("step", `خطوة ${n}`, "ملاحظات محفوظة", id));
    await saveProjectGoal(id, {
        kind: "duration",
        value: 20,
        deadline: "flexible",
    });
    return { id, ids };
}
it("تهيئة المستخدم الجديد والقديم دون تغيير حدوده وإيصالات الدمج", async () => {
    await db.paceSettings.put({
        id: "pace",
        activeLimit: 8,
        importDigests: ["receipt"],
    });
    await ensurePacePlans();
    const s = (await db.paceSettings.get("pace"))!;
    expect(s.activeLimit).toBe(8);
    expect(s.importDigests).toEqual(["receipt"]);
    expect(s.restHistory![0].days).toEqual([5, 6]);
    await ensurePacePlans();
    expect(await db.paceSettings.get("pace")).toEqual(s);
});
it("التعديل المتكرر لا يضاعف السجل ويحفظ التوقيت والإعدادات بعد إعادة الفتح", async () => {
    await ensurePacePlans();
    await setActiveLimit(7);
    vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
    await Promise.all([
        setProjectRestDays([1, 5]),
        setProjectRestDays([5, 1]),
        setProjectRestDays([1, 5]),
    ]);
    const s = (await db.paceSettings.get("pace"))!;
    expect(s.restHistory).toHaveLength(2);
    expect(s.restHistory![1].days).toEqual([1, 5]);
    expect(s.activeLimit).toBe(7);
    db.close();
    await db.open();
    expect(await db.paceSettings.get("pace")).toEqual(s);
    await setProjectRestDays([]);
    expect(
        (await db.paceSettings.get("pace"))!.restHistory!.at(-1)!.days,
    ).toEqual([]);
    await setProjectRestDays([0, 1, 2, 3, 4, 5, 6]);
    expect(
        (await db.paceSettings.get("pace"))!.restHistory!.at(-1)!.days,
    ).toHaveLength(7);
});
it.each([[7], [-1], [1, 1], [1.5]].map((days) => ({ days })))(
    "يرفض أيامًا غير صالحة%s دون تعديل الإعداد",
    async ({ days }) => {
        await ensurePacePlans();
        const s = await db.paceSettings.get("pace");
        await expect(setProjectRestDays(days)).rejects.toThrow();
        expect(await db.paceSettings.get("pace")).toEqual(s);
    },
);
it("الإنجاز الاختياري في الجمعة محفوظ دون تغيير الراحة أو المهام أو الهدف", async () => {
    const { id, ids } = await project();
    await create("task", "مهمة الجمعة");
    vi.setSystemTime(new Date("2026-10-02T10:00:00Z"));
    const before = await snapshot();
    await setBranchCompletion(ids[0], true);
    const after = await snapshot();
    expect(after.paceSettings).toEqual(before.paceSettings);
    expect(after.tasks).toEqual(before.tasks);
    expect(after.taskCycles).toEqual(before.taskCycles);
    expect(after.projectPlans![0].goal).toEqual(before.projectPlans![0].goal);
    const r = projectPace(
        after.projects[0],
        after.projectPlans![0],
        buildHierarchy(after.steps),
        after.stepWork!,
        new Date(),
        after.paceSettings![0],
    );
    expect(r.today).toBe(0);
    expect(r.restCompleted).toBe(1);
    expect(r.remaining).toBe(1);
    expect(after.stepWork).toHaveLength(1);
    expect((await db.projects.get(id))!.status).toBe("active");
    await setBranchCompletion(ids[0], false);
    expect((await snapshot()).stepWork).toHaveLength(2);
});
it("تغيير الراحة لا يمس البيانات ولا الهدف ويحفظ تاريخ الرصد", async () => {
    await project();
    const before = await snapshot();
    vi.setSystemTime(new Date("2026-10-08"));
    await setProjectRestDays([]);
    const after = await snapshot();
    for (const name of [
        "projects",
        "steps",
        "tasks",
        "ideas",
        "events",
        "taskCycles",
        "projectProgress",
        "projectTracking",
        "projectPlans",
        "stepWork",
    ] as const)
        expect(after[name]).toEqual(before[name]);
    expect(
        availableProjectDays(
            Date.parse(since),
            Date.parse("2026-10-08"),
            after.paceSettings![0],
            [],
            "UTC",
        ),
    ).toBe(5);
});
it("نسخة4 جديدة تستعيد الجدول وتاريخه والسجلات حرفيًا", async () => {
    const { ids } = await project();
    vi.setSystemTime(new Date("2026-10-02"));
    await setProjectRestDays([2, 5]);
    await setBranchCompletion(ids[0], true);
    const b = await snapshot();
    validateBackup(b);
    await setProjectRestDays([]);
    await importBackup(b);
    const a = await snapshot();
    for (const t of db.tables)
        expect(a[t.name as keyof typeof a]).toEqual(
            b[t.name as keyof typeof b],
        );
});
it.each([1, 2, 3, 4] as const)(
    "النسخة القديمةv%s دون إعداد الراحة تُستعاد بالقيم الافتراضية دون فقد",
    async (version) => {
        await project();
        const b = await snapshot();
        const old = {
            ...b,
            version,
            ...(version < 4
                ? {
                      projectPlans: undefined,
                      stepWork: undefined,
                      recommendations: undefined,
                      paceSettings: undefined,
                  }
                : { paceSettings: [{ id: "pace", activeLimit: 9 }] }),
            ...(version < 3
                ? { projectProgress: undefined, projectTracking: undefined }
                : {}),
            ...(version < 2 ? { taskCycles: undefined } : {}),
        };
        vi.setSystemTime(new Date("2026-10-08"));
        await importBackup(old);
        const a = await snapshot();
        expect(a.projects).toEqual(b.projects);
        expect(a.steps).toEqual(b.steps);
        expect(a.paceSettings![0].restHistory![0].days).toEqual([5, 6]);
        expect(a.paceSettings![0].restHistory![0].since).toBe(
            "2026-10-08T00:00:00.000Z",
        );
        if (version === 4) expect(a.paceSettings![0].activeLimit).toBe(9);
    },
);
it("الدمج يحفظ التقويم التاريخي للمصدر والإعداد المحلي ولا يكرر الملف", async () => {
    await project();
    vi.setSystemTime(new Date("2026-10-08"));
    const source = await snapshot();
    await setProjectRestDays([]);
    expect(await mergeBackup(source)).toBe(true);
    expect(await mergeBackup(source)).toBe(false);
    const b = validateBackup(await snapshot());
    expect(b.paceSettings![0].restHistory!.at(-1)!.days).toEqual([]);
    const imported = b.projectPlans!.find(
        (p) => p.projectId !== source.projects[0].id,
    )!;
    const calendar = projectRestSettings(b.paceSettings![0], imported);
    expect(isProjectRest(new Date("2026-10-02"), calendar)).toBe(true);
    expect(isProjectRest(new Date("2026-10-09"), calendar)).toBe(false);
    await importBackup(b);
    expect((await snapshot()).projectPlans).toEqual(b.projectPlans);
});
it("ترحيل5→6 يحفظ الجداول11 والإعدادات ويضيف الجدول الافتراضي فقط", async () => {
    const { ids } = await project();
    await setBranchCompletion(ids[0], true);
    const b = await snapshot();
    const name = "rest-migration-" + crypto.randomUUID();
    const old = new Dexie(name);
    old.version(5).stores(
        Object.fromEntries(
            db.tables.map((t) => [
                t.name,
                [
                    t.schema.primKey.src,
                    ...t.schema.indexes.map((i) => i.src),
                ].join(","),
            ]),
        ),
    );
    for (const t of db.tables)
        await old.table(t.name).bulkAdd(
            t.name === "paceSettings"
                ? [
                      {
                          id: "pace",
                          activeLimit: 8,
                          importDigests: ["receipt"],
                      },
                  ]
                : (b[t.name as keyof typeof b] as object[]),
        );
    old.close();
    vi.setSystemTime(new Date("2026-10-08"));
    const next = new Database(name);
    try {
        await next.open();
        expect(next.verno).toBe(6);
        for (const t of next.tables)
            if (t.name !== "paceSettings")
                expect(await t.toArray()).toEqual(b[t.name as keyof typeof b]);
        expect(await next.paceSettings.get("pace")).toMatchObject({
            activeLimit: 8,
            importDigests: ["receipt"],
            restHistory: [{ since: "2026-10-08T00:00:00.000Z", days: [5, 6] }],
        });
    } finally {
        await next.delete();
    }
});
it("فشل الترحيل لا يترك قاعدة نصف محدثة أو يفقد البيانات", async () => {
    const name = "rest-quota-" + crypto.randomUUID();
    const old = new Dexie(name);
    old.version(5).stores(
        Object.fromEntries(
            db.tables.map((t) => [
                t.name,
                [
                    t.schema.primKey.src,
                    ...t.schema.indexes.map((i) => i.src),
                ].join(","),
            ]),
        ),
    );
    await old.table("paceSettings").put({ id: "pace", activeLimit: 9 });
    old.close();
    const next = new Database(name);
    next.paceSettings.hook("updating", () => {
        throw new Error("rest quota");
    });
    await expect(next.open()).rejects.toThrow();
    next.close();
    await old.open();
    expect(old.verno).toBe(5);
    expect(await old.table("paceSettings").get("pace")).toEqual({
        id: "pace",
        activeLimit: 9,
    });
    await old.delete();
});
it("رفض تواريخ وتكرارات جدول غير صحيحة في النسخ الاحتياطية", async () => {
    await project();
    const b = await snapshot();
    for (const restHistory of [
        [],
        [{ since, days: [5, 5], timeZone: "UTC" }],
        [{ since, days: [7], timeZone: "UTC" }],
        [{ since: "bad", days: [], timeZone: "UTC" }],
        [{ since, days: [], timeZone: "bad/zone" }],
        [
            { since, days: [], timeZone: "UTC" },
            { since, days: [5], timeZone: "UTC" },
        ],
    ])
        expect(() =>
            validateBackup({
                ...b,
                paceSettings: [{ ...b.paceSettings![0], restHistory }],
            }),
        ).toThrow();
});
it("مهام الجمعة والمتكررة وأولوياتها ودوراتها لا تتغير عند اختيار الراحة كلها", async () => {
    vi.setSystemTime(new Date("2026-10-02T10:00:00Z"));
    const a = await create("task", "مستقلة"),
        r = await create("task", "متكررة");
    await updateTaskOptions(a, {
        schedule: {
            date: "2026-10-02",
            repeat: "none",
            timeZone: "UTC",
            leadDays: 3,
        },
        priority: "important-urgent",
    });
    await updateTaskOptions(r, {
        schedule: {
            date: "2026-10-02",
            repeat: "weekly",
            weekdays: [5],
            timeZone: "UTC",
            leadDays: 1,
        },
        priority: "urgent",
    });
    await setCycleStatus(
        (await import("../app/taskSchedule")).currentCycle(
            (await db.tasks.get(r))!,
        )!.id,
        "done",
    );
    const before = await snapshot();
    await setProjectRestDays([0, 1, 2, 3, 4, 5, 6]);
    const after = await snapshot();
    expect(after.tasks).toEqual(before.tasks);
    expect(after.taskCycles).toEqual(before.taskCycles);
    expect(after.events).toEqual(before.events);
});

async function observedRecommendation() {
    const f = await project(40);
    await saveProjectGoal(f.id, {
        kind: "duration",
        value: 40,
        deadline: "flexible",
    });
    let n = 0;
    for (const day of [
        "2026-10-01",
        "2026-10-04",
        "2026-10-05",
        "2026-10-06",
        "2026-10-07",
        "2026-10-08",
        "2026-10-11",
        "2026-10-12",
        "2026-10-13",
        "2026-10-14",
    ]) {
        vi.setSystemTime(new Date(day + "T09:00:00Z"));
        for (let i = 0; i < 2; i++) await setBranchCompletion(f.ids[n++], true);
    }
    vi.setSystemTime(new Date("2026-10-15T09:00:00Z"));
    await refreshRecommendations();
    const rec = (await db.recommendations.toArray()).find(
        (r) => r.status === "new",
    );
    expect(rec).toBeTruthy();
    return { f, rec: rec! };
}
it("التوصية السابقة والسجل يبقيان محفوظين يوم الجمعة دون توليد أو تغيير خطة", async () => {
    await observedRecommendation();
    const before = await snapshot();
    vi.setSystemTime(new Date("2026-10-16T09:00:00Z"));
    await refreshRecommendations();
    const after = await snapshot();
    expect(after.recommendations).toEqual(before.recommendations);
    expect(after.projectPlans).toEqual(before.projectPlans);
});
it("اعتماد معاينة قديمة بعد تغيير الراحة يرفض بلا تعديل المشروع", async () => {
    const { rec } = await observedRecommendation();
    const before = await db.projectPlans.toArray();
    await setProjectRestDays([0, 1, 2, 3, 4, 5, 6]);
    await expect(acceptRecommendation(rec, true)).rejects.toThrow(
        "تغيرت البيانات",
    );
    expect(await db.projectPlans.toArray()).toEqual(before);
});
it("التوصية المرفوضة لا تعود لمجرد مرور عطلة نهاية الأسبوع", async () => {
    const { rec } = await observedRecommendation();
    await rejectRecommendation(rec.id);
    for (const day of ["2026-10-16", "2026-10-17", "2026-10-18"]) {
        vi.setSystemTime(new Date(day + "T09:00:00Z"));
        await refreshRecommendations();
    }
    expect(
        (await db.recommendations.toArray()).filter((r) => r.status === "new"),
    ).toEqual([]);
    expect((await db.recommendations.get(rec.id))!.status).toBe("rejected");
});
