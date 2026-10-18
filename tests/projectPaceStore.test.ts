import { it, expect, beforeEach, afterEach, vi } from "vitest";
import "fake-indexeddb/auto";
import Dexie from "dexie";
import {
    db,
    Database,
    create,
    setBranchCompletion,
    changeStatus,
    setProjectCompletion,
    projectState,
    remove,
    undo,
    snapshot,
    importBackup,
    mergeBackup,
    importProject,
    ActiveProjectLimitError,
} from "../app/db";
import {
    saveProjectGoal,
    setProjectPaused,
    setActiveLimit,
    refreshRecommendations,
    rejectRecommendation,
    acceptRecommendation,
    adoptAcceleration,
} from "../app/projectPaceStore";
import { buildHierarchy } from "../app/hierarchy";
import { projectPace, accelerationOptions } from "../app/projectPace";
import { validateBackup } from "../app/model";
const initial = "2026-10-01T00:00:00.000Z";
beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(initial));
    await db.transaction("rw", db.tables, async () => {
        for (const t of db.tables) await t.clear();
    });
    // These regression scenarios explicitly use the supported seven-workday calendar.
    await db.paceSettings.put({
        id: "pace",
        activeLimit: 3,
        restHistory: [{ since: initial, days: [], timeZone: "UTC" }],
    });
});
afterEach(() => vi.useRealTimers());
async function fixture(count = 40, days = 40) {
    const id = await create("project", "مشروع"),
        ids: string[] = [];
    for (let n = 0; n < count; n++)
        ids.push(await create("step", `خطوة ${n}`, "ملاحظة", id));
    await saveProjectGoal(id, {
        kind: "duration",
        value: days,
        deadline: "flexible",
    });
    return { id, ids };
}
async function observed() {
    const f = await fixture();
    for (let day = 0; day < 7; day++) {
        vi.setSystemTime(new Date(`2026-10-0${day + 1}T09:00:00Z`));
        for (const id of f.ids.slice(day * 2, day * 2 + 2))
            await setBranchCompletion(id, true);
    }
    vi.setSystemTime(new Date("2026-10-08T00:00:00Z"));
    return f;
}
async function pace(id: string) {
    return projectPace(
        (await db.projects.get(id))!,
        await db.projectPlans.get(id),
        buildHierarchy(await db.steps.toArray()),
        await db.stepWork.toArray(),
        new Date(),
    );
}
it("يحفظ الهدف بعد إغلاق IndexedDB وإعادة فتحه دون تغيير المشروع", async () => {
    const { id } = await fixture();
    const old = await db.projects.get(id),
        plan = await db.projectPlans.get(id);
    db.close();
    await db.open();
    expect(await db.projectPlans.get(id)).toEqual(plan);
    expect(await db.projects.get(id)).toEqual(old);
    expect((await pace(id)).required).toBe(1);
});
it("الضغط المتكرر يسجل حدث عمل واحد فقط، والتراجع وإعادة الإنجاز لا يضاعفان العدد", async () => {
    const { id, ids } = await fixture();
    await Promise.all(
        Array.from({ length: 8 }, () => setBranchCompletion(ids[0], true)),
    );
    expect(await db.stepWork.count()).toBe(1);
    await setBranchCompletion(ids[0], false);
    await changeStatus("step", ids[0], "done");
    expect(await db.stepWork.count()).toBe(3);
    expect((await pace(id)).completedToday).toBe(1);
    expect(validateBackup(await snapshot()).stepWork).toHaveLength(3);
});
it("إنجاز مرحلة يسجل أوراقها فقط حتى لو لم تتغير النسبة المقربة", async () => {
    const id = await create("project", "مراحل"),
        stage = await create("step", "محطة", "", id, null, true);
    await create("step", "واحد", "", id, stage);
    await create("step", "اثنان", "", id, stage);
    await setBranchCompletion(stage, true);
    expect(await db.stepWork.count()).toBe(2);
    expect(
        new Set((await db.stepWork.toArray()).map((w) => w.stepId)).size,
    ).toBe(2);
});
it("فشل سجل العمل يتراجع عن الإنجاز وكل السجلات ذريًا", async () => {
    const { ids } = await fixture(3);
    const before = await snapshot(),
        fail = () => {
            throw Error("work disk failure");
        };
    db.stepWork.hook("creating", fail);
    try {
        await expect(setBranchCompletion(ids[0], true)).rejects.toThrow(
            "work disk failure",
        );
    } finally {
        db.stepWork.hook("creating").unsubscribe(fail);
    }
    const after = await snapshot();
    expect(after.steps).toEqual(before.steps);
    expect(after.events).toEqual(before.events);
    expect(after.projectPlans).toEqual(before.projectPlans);
    expect(after.projectProgress).toEqual(before.projectProgress);
});
it("إيقاف5أيام واستئناف يحفظ20يومًا ويمر عبر إعادة الفتح والنسخ الاحتياطي", async () => {
    const { id } = await fixture(40, 20);
    await setProjectPaused(id, true);
    vi.setSystemTime(new Date("2026-10-06T00:00:00Z"));
    expect((await pace(id)).days).toBe(20);
    expect((await pace(id)).today).toBe(0);
    const b = await snapshot();
    await importBackup(b);
    await setProjectPaused(id, false);
    expect((await pace(id)).days).toBe(20);
    expect((await db.projectPlans.get(id))!.pauses).toEqual([
        { start: initial, end: "2026-10-06T00:00:00.000Z" },
    ]);
});
it("الموعد الإلزامي ثابت واعتماد التسريع يغير الوتيرة فقط", async () => {
    const { id } = await fixture();
    await saveProjectGoal(id, {
        kind: "date",
        value: "2026-10-20",
        deadline: "fixed",
    });
    const p = (await db.projectPlans.get(id))!;
    await adoptAcceleration(id, 3, "2026-10-14", p.revision, 40, true);
    expect((await db.projectPlans.get(id))!.goal).toEqual(p.goal);
    expect((await db.projectPlans.get(id))!.approvedPace).toBe(3);
    await setProjectPaused(id, true);
    vi.setSystemTime(new Date("2026-10-06"));
    expect((await pace(id)).target).toBe("2026-10-20");
});
it("الحد الافتراضي3 يحمي الإنشاء وإعادة الفتح والتحويل والاستيراد", async () => {
    const ids = await Promise.all([
        create("project", "1"),
        create("project", "2"),
        create("project", "3"),
    ]);
    await expect(create("project", "4")).rejects.toBeInstanceOf(
        ActiveProjectLimitError,
    );
    expect(await db.projects.count()).toBe(3);
    await setProjectCompletion(ids[0], true);
    const fourth = await create("project", "4");
    await expect(setProjectCompletion(ids[0], false)).rejects.toBeInstanceOf(
        ActiveProjectLimitError,
    );
    await expect(
        importProject({
            format: "masar.project",
            version: 1,
            project: { title: "ملف", stages: [] },
        }),
    ).rejects.toBeInstanceOf(ActiveProjectLimitError);
    await setProjectPaused(fourth, true);
    await setProjectCompletion(ids[0], false);
    expect(await db.projects.count()).toBe(4);
});
it("استئناف وأرشفة واستعادة المشروع لا تتجاوز الحد بصمت", async () => {
    const { id } = await fixture(1);
    await setProjectPaused(id, true);
    await create("project", "2");
    await create("project", "3");
    await create("project", "4");
    await expect(setProjectPaused(id, false)).rejects.toBeInstanceOf(
        ActiveProjectLimitError,
    );
    expect((await db.projectPlans.get(id))!.pauses[0].end).toBeUndefined();
    await projectState(id, "archive");
    await projectState(id, "archive"); // remains paused; no new active slot
    await setActiveLimit(4);
    await setProjectPaused(id, false);
    const d = (await remove("project", id))!;
    await create("project", "بديل");
    await expect(undo(d)).rejects.toBeInstanceOf(ActiveProjectLimitError);
});
it("تعديل الحد يحافظ على إيصالات الدمج ولا يوقف مشاريع قديمة", async () => {
    const { id } = await fixture(1);
    await db.paceSettings.put({
        id: "pace",
        activeLimit: 3,
        importDigests: ["a".repeat(64)],
    });
    await setActiveLimit(1);
    expect((await db.paceSettings.get("pace"))!.importDigests).toHaveLength(1);
    expect((await db.projects.get(id))!.status).toBe("active");
    await expect(setActiveLimit(0)).rejects.toThrow();
});
it("المعاينة وحدها ورفض الاقتراح لا يغيران الأهداف", async () => {
    const { id } = await observed();
    await refreshRecommendations();
    const rec = (await db.recommendations.toArray()).find(
        (r) => r.status === "new",
    )!;
    expect(rec).toBeTruthy();
    const old = await db.projectPlans.get(id);
    await expect(acceptRecommendation(rec, false)).rejects.toThrow("التأكيد");
    expect(await db.projectPlans.get(id)).toEqual(old);
    await rejectRecommendation(rec.id);
    await expect(acceptRecommendation(rec, true)).rejects.toThrow("متاحة");
    expect(await db.projectPlans.get(id)).toEqual(old);
});
it("التوصية المرفوضة لا تتكرر في اليوم التالي أو بعد يومين", async () => {
    await observed();
    await refreshRecommendations();
    const old = (await db.recommendations.toArray())[0];
    await rejectRecommendation(old.id);
    for (const day of [9, 10]) {
        vi.setSystemTime(
            new Date(`2026-10-${String(day).padStart(2, "0")}T00:00:00Z`),
        );
        await refreshRecommendations();
    }
    expect(
        (await db.recommendations.toArray()).filter((r) => r.status === "new"),
    ).toHaveLength(0);
});
it("تغير الهدف صراحة يسمح باقتراح جديد بعد الرفض", async () => {
    const { id } = await observed();
    await refreshRecommendations();
    await rejectRecommendation((await db.recommendations.toArray())[0].id);
    await saveProjectGoal(id, {
        kind: "duration",
        value: 60,
        deadline: "flexible",
    });
    await refreshRecommendations();
    expect(
        (await db.recommendations.toArray()).filter((r) => r.status === "new"),
    ).toHaveLength(1);
});
it("اعتماد الاقتراح مؤكد وذري ويحفظ القرار ويمنع تكراره", async () => {
    const { id } = await observed();
    await refreshRecommendations();
    const rec = (await db.recommendations.toArray()).find(
        (r) => r.status === "new",
    )!;
    const old = await db.projectPlans.get(id);
    await Promise.all([
        acceptRecommendation(rec, true),
        acceptRecommendation(rec, true),
    ]);
    const p = (await db.projectPlans.get(id))!;
    expect(p.revision).toBe(old!.revision + 1);
    expect(p.goal?.targetDate).toBe(
        rec.changes[0].type === "target" ? rec.changes[0].targetDate : "",
    );
    expect((await db.recommendations.get(rec.id))!.approvedChanges).toEqual(
        rec.changes,
    );
    expect(validateBackup(await snapshot()).recommendations).toHaveLength(1);
});
it("يرفض اعتماد معاينة قديمة بعد تغير المتبقي ولا يطبق نصف التغييرات", async () => {
    const { id, ids } = await observed();
    await refreshRecommendations();
    const r = (await db.recommendations.toArray()).find(
        (r) => r.status === "new",
    )!;
    const old = await db.projectPlans.get(id);
    await setBranchCompletion(ids[15], true);
    await expect(acceptRecommendation(r, true)).rejects.toThrow(
        "تغيرت البيانات",
    );
    expect((await db.projectPlans.get(id))!.goal).toEqual(old!.goal);
    expect((await db.recommendations.get(r.id))!.status).toBe("invalid");
});
it("قبول مستوى افتراضي يحتاج تأكيدًا ويُسجل القرار ويرفض إعادة المعاينة القديمة", async () => {
    const { id } = await fixture();
    const plan = (await db.projectPlans.get(id))!,
        o = accelerationOptions(await pace(id), new Date(), "UTC")[0];
    await expect(
        adoptAcceleration(id, o.daily, o.finish, plan.revision, 40, false),
    ).rejects.toThrow("تأكيد");
    await adoptAcceleration(id, o.daily, o.finish, plan.revision, 40, true);
    expect((await db.projectPlans.get(id))!.approvedPace).toBe(o.daily);
    await expect(
        adoptAcceleration(id, o.daily, o.finish, plan.revision, 40, true),
    ).rejects.toThrow("تغير");
    expect(await db.recommendations.count()).toBe(1);
});
it("النسخة4 تستعيد الخطط والإيقاف والعمل والتوصيات دون تكرار", async () => {
    const { id } = await observed();
    await refreshRecommendations();
    await rejectRecommendation((await db.recommendations.toArray())[0].id);
    await setProjectPaused(id, true);
    const old = await snapshot();
    expect(old.version).toBe(6);
    validateBackup(old);
    for (let i = 0; i < 2; i++) await importBackup(old);
    const next = await snapshot();
    for (const key of [
        "projects",
        "steps",
        "tasks",
        "events",
        "projectPlans",
        "stepWork",
        "recommendations",
        "paceSettings",
    ] as const)
        expect(next[key]).toEqual(old[key]);
});
it("رفض النسخة التالفة يحافظ على البيانات قبل أي كتابة", async () => {
    await observed();
    const b = await snapshot();
    const mutations = [
        (d: typeof b) => d.projectPlans![0].workOrder++,
        (d: typeof b) => (d.stepWork![0].projectId = "missing"),
        (d: typeof b) => (d.projectPlans![0].goal!.days = 0),
        (d: typeof b) =>
            (d.projectPlans![0].pauses = [
                { start: initial },
                { start: initial },
            ]),
        (d: typeof b) => (d.paceSettings![0].activeLimit = 0),
    ];
    for (const mutate of mutations) {
        const bad = structuredClone(b);
        mutate(bad);
        await expect(importBackup(bad)).rejects.toThrow("غير صالحة");
        expect((await snapshot()).projectPlans).toEqual(b.projectPlans);
    }
});
it.each([1, 2, 3] as const)(
    "النسخة القديمةv%s محفوظة بلا اختلاق تاريخ",
    async (version) => {
        const { id } = await fixture(2);
        await setBranchCompletion((await db.steps.toArray())[0].id, true);
        const current = await snapshot();
        const legacy = {
            ...current,
            version,
            projectPlans: undefined,
            stepWork: undefined,
            recommendations: undefined,
            paceSettings: undefined,
            ...(version < 3
                ? { projectProgress: undefined, projectTracking: undefined }
                : {}),
            ...(version === 1 ? { taskCycles: undefined } : {}),
        };
        vi.setSystemTime(new Date("2026-10-12"));
        await importBackup(legacy);
        expect(await db.stepWork.count()).toBe(0);
        expect((await db.projectPlans.get(id))!.since).toBe(
            "2026-10-12T00:00:00.000Z",
        );
        expect((await db.projectPlans.get(id))!.goal).toBeUndefined();
        expect(
            (await db.steps.toArray()).filter((s) => s.status === "done"),
        ).toHaveLength(1);
    },
);
it("دمج نسخة متعارضة يعيد ربط كل المعرفات ولا يكرر الملف عند الضغط المتكرر", async () => {
    const { id } = await observed();
    await refreshRecommendations();
    await acceptRecommendation((await db.recommendations.toArray())[0], true);
    const b = await snapshot();
    const result = await Promise.all([mergeBackup(b), mergeBackup(b)]);
    expect(result.sort()).toEqual([false, true]);
    const d = await snapshot();
    expect(d.projects).toHaveLength(2);
    expect(d.projects.filter((p) => p.id === id)).toEqual(b.projects);
    expect(d.stepWork).toHaveLength(b.stepWork!.length * 2);
    expect(d.recommendations).toHaveLength(2);
    validateBackup(d);
    await setActiveLimit(4);
    expect(await mergeBackup(b)).toBe(false);
});
it("حذف واستعادة مشروع يحتفظان بجميع معلومات الوتيرة والقرارات", async () => {
    const { id } = await observed();
    await refreshRecommendations();
    const b = await snapshot(),
        deleted = (await remove("project", id))!;
    expect(await db.stepWork.count()).toBe(0);
    await undo(deleted);
    const a = await snapshot();
    expect(a.stepWork).toEqual(b.stepWork);
    expect(a.projectPlans).toEqual(b.projectPlans);
    expect(a.recommendations).toEqual(b.recommendations);
    validateBackup(a);
});
it("ترحيل Dexie4→7 إضافي يحافظ على كل صف قديم حرفيًا", async () => {
    await observed();
    const b = await snapshot(),
        name = "pace-migration-" + crypto.randomUUID(),
        old = new Dexie(name);
    old.version(4).stores({
        projects: "id,updatedAt,status,archived",
        steps: "id,projectId,parentId,order,status",
        tasks: "id,status,completedAt,schedule.repeat",
        ideas: "id,archived,updatedAt",
        events: "id,entityId,at,action",
        taskCycles:
            "id,taskId,[taskId+revision+start],[status+end],end,status,completedAt,scheduledAt",
        projectProgress: "id,projectId,[projectId+order],at,reason",
        projectTracking: "projectId,since",
    });
    for (const store of [
        "projects",
        "steps",
        "tasks",
        "ideas",
        "events",
        "taskCycles",
        "projectProgress",
        "projectTracking",
    ] as const)
        await old.table(store).bulkAdd(b[store] ?? []);
    old.close();
    const next = new Database(name);
    try {
        await next.open();
        expect(next.verno).toBe(8);
        for (const store of [
            "projects",
            "steps",
            "tasks",
            "ideas",
            "events",
            "taskCycles",
            "projectProgress",
            "projectTracking",
        ] as const)
            expect(await next.table(store).toArray()).toEqual(b[store]);
        expect(await next.stepWork.count()).toBe(0);
        expect((await next.projectPlans.toArray())[0]).toMatchObject({
            since: new Date().toISOString(),
            revision: 0,
            workOrder: 0,
            pauses: [],
        });
        expect(await next.paceSettings.get("pace")).toMatchObject({
            id: "pace",
            activeLimit: 3,
            restHistory: [{ since: new Date().toISOString(), days: [5, 6] }],
        });
    } finally {
        await next.delete();
    }
});

it("اقتراح التخفيف بعد أسبوع دون القدرة المعتمدة لا ينفذ نفسه، ويعمل بعد انتهاء الهدف", async () => {
    const { id, ids } = await fixture(40, 5);
    const plan = (await db.projectPlans.get(id))!;
    await db.projectPlans.put({
        ...plan,
        approvedPace: 8,
        approvedAt: initial,
    });
    for (let day = 1; day <= 14; day++) {
        vi.setSystemTime(
            new Date(`2026-10-${String(day).padStart(2, "0")}T09:00:00Z`),
        );
        await setBranchCompletion(ids[day - 1], true);
    }
    vi.setSystemTime(new Date("2026-10-15"));
    await refreshRecommendations();
    const r = (await db.recommendations.toArray()).find(
        (r) => r.type === "ease" && r.status === "new",
    )!;
    expect(r).toBeTruthy();
    expect((await db.projectPlans.get(id))!.goal!.targetDate).toBe(
        "2026-10-05",
    );
    await acceptRecommendation(r, true);
    expect((await db.projectPlans.get(id))!.approvedPace).toBe(1);
    expect((await db.projectPlans.get(id))!.goal!.targetDate).toBe(
        "2026-11-09",
    );
});
it("توصية التركيز تشرح مشروعين ولا توقف أحدهما قبل التأكيد", async () => {
    const fast = await fixture(80, 60),
        slow = await fixture(80, 60);
    for (let day = 1; day <= 14; day++) {
        vi.setSystemTime(
            new Date(`2026-10-${String(day).padStart(2, "0")}T09:00:00Z`),
        );
        await setBranchCompletion(fast.ids[day - 1], true);
        if (day > 7) await setBranchCompletion(fast.ids[day + 13], true);
        if (day <= 7) await setBranchCompletion(slow.ids[day - 1], true);
    }
    vi.setSystemTime(new Date("2026-10-15"));
    await refreshRecommendations();
    const r = (await db.recommendations.toArray()).find(
        (r) => r.type === "focus",
    )!;
    expect(r.projectIds).toEqual([fast.id, slow.id]);
    expect((await db.projectPlans.get(slow.id))!.pauses).toHaveLength(0);
    await acceptRecommendation(r, true);
    expect((await db.projectPlans.get(slow.id))!.pauses).toHaveLength(1);
    expect((await db.projectPlans.get(fast.id))!.pauses).toHaveLength(0);
    validateBackup(await snapshot());
});
it("فشل حفظ قرار توصية يؤثر في أكثر من مشروع يعيد كل التغييرات", async () => {
    const { id } = await observed();
    await refreshRecommendations();
    const r = (await db.recommendations.toArray()).find(
            (r) => r.status === "new",
        )!,
        before = await db.projectPlans.get(id);
    const fail = () => {
        throw Error("decision quota");
    };
    db.recommendations.hook("updating", fail);
    try {
        await expect(acceptRecommendation(r, true)).rejects.toThrow(
            "decision quota",
        );
    } finally {
        db.recommendations.hook("updating").unsubscribe(fail);
    }
    expect(await db.projectPlans.get(id)).toEqual(before);
    expect((await db.recommendations.get(r.id))!.status).toBe("new");
});
it("وجود مهمة عاجلة اليوم يمنع دفع المستخدم إلى تسريع شخصي", async () => {
    await observed();
    await create("task", "عاجلة", "", undefined, null, false, {
        priority: "important-urgent",
        schedule: {
            date: "2026-10-08",
            timeZone: "UTC",
            repeat: "none",
            leadDays: 0,
        },
    });
    await refreshRecommendations();
    expect(
        (await db.recommendations.toArray()).filter(
            (r) => r.type === "accelerate" && r.status === "new",
        ),
    ).toHaveLength(0);
});
it("الدورات المنجزة لا تُحسب التزامًا عاجلًا حاليًا عند توليد التوصيات", async () => {
    const { currentCycle } = await import("../app/taskSchedule"),
        { setCycleStatus } = await import("../app/db");
    await observed();
    const t = await create("task", "دورية عاجلة", "", undefined, null, false, {
        priority: "important-urgent",
        schedule: {
            date: "2026-10-08",
            timeZone: "UTC",
            repeat: "daily",
            leadDays: 0,
        },
    });
    await setCycleStatus(currentCycle((await db.tasks.get(t))!)!.id, "done");
    await refreshRecommendations();
    expect(
        (await db.recommendations.toArray()).filter(
            (r) => r.type === "accelerate" && r.status === "new",
        ),
    ).toHaveLength(1);
});
it("تغير يوم المعاينة قبل اعتماد التسريع يرفض الهدف العددي القديم", async () => {
    const { id } = await fixture();
    const plan = (await db.projectPlans.get(id))!,
        o = accelerationOptions(await pace(id), new Date(), "UTC")[0];
    vi.setSystemTime(new Date("2026-10-02"));
    await expect(
        adoptAcceleration(id, o.daily, o.finish, plan.revision, 40, true),
    ).rejects.toThrow("المعاينة");
    expect((await db.projectPlans.get(id))!.goal!.targetDate).toBe(
        "2026-11-09",
    );
});
it("تنشيط مشروع آخر بعد المعاينة يبطل توصية تسريع قديمة", async () => {
    const { id } = await observed();
    await refreshRecommendations();
    const r = (await db.recommendations.toArray()).find(
            (r) => r.status === "new",
        )!,
        old = await db.projectPlans.get(id);
    await create("project", "التزام إضافي");
    await expect(acceptRecommendation(r, true)).rejects.toThrow(
        "تغيرت البيانات",
    );
    expect((await db.projectPlans.get(id))!.goal).toEqual(old!.goal);
});
it("أسبوع بلا إنجاز يدعم تخفيفًا تجريبيًا بدل ادعاء قدرة أو إهمال التعثر", async () => {
    const { id } = await fixture(40, 5);
    const p = (await db.projectPlans.get(id))!;
    await db.projectPlans.put({ ...p, approvedPace: 8, approvedAt: initial });
    vi.setSystemTime(new Date("2026-10-08"));
    await refreshRecommendations();
    const r = (await db.recommendations.toArray()).find(
        (r) => r.type === "ease",
    );
    expect(r?.reason).toContain("تجريبية");
    expect((await db.projectPlans.get(id))!.approvedPace).toBe(8);
    expect((await pace(id)).forecast).toBeUndefined();
});
it("يرفض سجل عمل منسوبًا لخطوة مشروع آخر قبل استبدال البيانات", async () => {
    const { id, ids } = await observed();
    const other = await create("project", "آخر"),
        step = await create("step", "خطوة أخرى", "", other),
        b = await snapshot();
    b.stepWork![0].stepId = step;
    await expect(importBackup(b)).rejects.toThrow("غير صالحة");
    expect((await db.steps.get(ids[0]))!.projectId).toBe(id);
});
it("فشل الترحيل يرجع النسخة4 دون فقد الصفوف أو مخططها", async () => {
    const { id } = await fixture(1),
        name = "pace-abort-" + crypto.randomUUID(),
        old = new Dexie(name),
        p = (await db.projects.get(id))!;
    old.version(4).stores({
        projects: "id,updatedAt,status,archived",
        steps: "id,projectId,parentId,order,status",
        tasks: "id,status,completedAt,schedule.repeat",
        ideas: "id,archived,updatedAt",
        events: "id,entityId,at,action",
        taskCycles:
            "id,taskId,[taskId+revision+start],[status+end],end,status,completedAt,scheduledAt",
        projectProgress: "id,projectId,[projectId+order],at,reason",
        projectTracking: "projectId,since",
    });
    await old.table("projects").add(p);
    old.close();
    const next = new Database(name),
        fail = () => {
            throw Error("migration quota");
        };
    next.projectPlans.hook("creating", fail);
    try {
        await expect(next.open()).rejects.toThrow("migration quota");
        const previous = new Dexie(name);
        await previous.open();
        expect(previous.verno).toBe(4);
        expect(await previous.table("projects").toArray()).toEqual([p]);
        expect(previous.tables.some((t) => t.name === "projectPlans")).toBe(
            false,
        );
        previous.close();
    } finally {
        next.close();
        await Dexie.delete(name);
    }
});
it("توصية تسريع لموعد إلزامي تعتمد الوتيرة فقط ولا تتكرر بعد قبولها", async () => {
    const { id } = await observed();
    await saveProjectGoal(id, {
        kind: "date",
        value: "2026-11-09",
        deadline: "fixed",
    });
    const old = (await db.projectPlans.get(id))!.goal;
    await refreshRecommendations();
    const r = (await db.recommendations.toArray()).find(
        (r) => r.status === "new",
    )!;
    expect(r.changes[0].type).toBe("pace");
    await acceptRecommendation(r, true);
    expect((await db.projectPlans.get(id))!.goal).toEqual(old);
    expect((await db.projectPlans.get(id))!.approvedPace).toBe(2);
    await refreshRecommendations();
    expect(
        (await db.recommendations.toArray()).filter((r) => r.status === "new"),
    ).toHaveLength(0);
    validateBackup(await snapshot());
});
