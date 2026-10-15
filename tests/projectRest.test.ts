import { describe, expect, it } from "vitest";
import { buildHierarchy } from "../app/hierarchy";
import type { Project, Step } from "../app/model";
import type { PaceSettings, ProjectPlan, StepWork } from "../app/paceTypes";
import {
    projectPace,
    makeGoal,
    effectiveTarget,
    accelerationOptions,
    recommendationCandidates,
} from "../app/projectPace";
import {
    availableProjectDays,
    finishOnWorkDay,
    isProjectRest,
    projectRestSettings,
    remainingWorkDays,
    withProjectRestDefaults,
} from "../app/projectRest";
import { inactivityDays, activityPeriods } from "../app/projectInsights";
const since = "2026-10-01T00:00:00.000Z";
const date = (s: string) => new Date(s);
function settings(
    days = [5, 6],
    stamp = since,
    timeZone = "UTC",
): PaceSettings {
    return {
        id: "pace",
        activeLimit: 3,
        restHistory: [{ since: stamp, days, timeZone }],
    };
}
function fixture(count = 40) {
    const p: Project = {
        id: "p",
        title: "مشروع",
        notes: "",
        createdAt: since,
        updatedAt: since,
        status: "active",
        archived: false,
    };
    const steps: Step[] = Array.from({ length: count }, (_, n) => ({
        ...p,
        id: `s${n}`,
        projectId: "p",
        parentId: null,
        kind: "step",
        order: n,
        status: "todo",
    }));
    const plan: ProjectPlan = {
        projectId: "p",
        since,
        revision: 0,
        workOrder: 0,
        pauses: [],
        goal: makeGoal("duration", 20, "flexible", date(since), "UTC"),
    };
    const pace = (
        at = date(since),
        rows: StepWork[] = [],
        calendar = settings(),
    ) => projectPace(p, plan, buildHierarchy(steps), rows, at, calendar);
    return { p, steps, plan, pace };
}
function rows(days: string[], count = 2) {
    let n = 0;
    return days.flatMap((day) =>
        Array.from({ length: count }, (): StepWork => ({
            id: `${++n}`,
            order: n,
            stepId: `s${n - 1}`,
            projectId: "p",
            complete: true,
            at: `${day}T09:00:00.000Z`,
        })),
    );
}
it("افتراضي الجمعة والسبت ويحفظ حد المشاريع ووصولات الدمج", () => {
    const s = withProjectRestDefaults(
        { id: "pace", activeLimit: 8, importDigests: ["receipt"] },
        date(since),
    );
    expect(s.activeLimit).toBe(8);
    expect(s.importDigests).toEqual(["receipt"]);
    expect(s.restHistory?.[0].days).toEqual([5, 6]);
    expect(withProjectRestDefaults(s, date("2027-01-01"))).toEqual(s);
});
it("40 خطوة في20 يومًا تقويميًا تُوزع على14 يوم عمل دون تمديد الهدف", () => {
    const { pace, plan } = fixture();
    const result = pace();
    expect(result.days).toBe(20);
    expect(result.workingDays).toBe(14);
    expect(result.required).toBe(40 / 14);
    expect(result.allocation).toEqual({
        low: 2,
        high: 3,
        highDays: 12,
        lowDays: 2,
    });
    expect(result.today).toBe(3);
    expect(result.target).toBe("2026-10-20");
    expect(plan.goal!.days).toBe(20);
});
it("تحديث المتبقي وبنية المشروع لا يغير الهدف", () => {
    const { pace, steps, plan } = fixture();
    steps[0].status = "done";
    expect(pace().required).toBe(39 / 14);
    steps.pop();
    expect(pace().required).toBe(38 / 14);
    expect(plan.goal!.targetDate).toBe("2026-10-20");
});
it("إلغاء الراحة يسمح بالأيام التقويمية السبعة", () => {
    const { pace } = fixture();
    const r = pace(date(since), [], settings([]));
    expect(r.required).toBe(2);
    expect(r.workingDays).toBe(20);
});
it("كل الأسبوع راحة: لا قسمة على صفر ولا اقتراح أو توقع أو تغيير حالة", () => {
    const { p, pace } = fixture();
    const r = pace(date(since), [], settings([0, 1, 2, 3, 4, 5, 6]));
    expect(r.required).toBeUndefined();
    expect(r.workingDays).toBe(0);
    expect(r.today).toBe(0);
    expect(r.forecast).toBeUndefined();
    expect(p.status).toBe("active");
    expect(accelerationOptions(r, date(since), "UTC")).toEqual([]);
    expect(
        finishOnWorkDay(date(since), 1, r.restSettings, "UTC"),
    ).toBeUndefined();
});
it("الراحة تخفي اقتراح اليوم دون إيقاف المشروع أو إنشاء تراكم", () => {
    const { pace, plan } = fixture();
    const friday = pace(date("2026-10-02"));
    const sunday = pace(date("2026-10-04"));
    expect(friday.restDay).toBe(true);
    expect(friday.today).toBe(0);
    expect(friday.paused).toBe(false);
    expect(plan.pauses).toEqual([]);
    expect(sunday.today).toBe(4);
});
it("غياب أيام العمل قبل الموعد والمنتهي يعرض حالة قابلة للفهم", () => {
    const { pace, plan } = fixture();
    plan.goal = makeGoal("duration", 2, "fixed", date("2026-10-02"), "UTC");
    expect(pace(date("2026-10-02")).workingDays).toBe(0);
    expect(pace(date("2026-10-02")).days).toBe(2);
    expect(pace(date("2026-10-04")).days).toBe(0);
    expect(pace(date("2026-10-04")).today).toBe(0);
});
it("التوقع يستخدم أيام العمل المقبلة ويستثني الويكند غير النشط من المقام", () => {
    const { pace, steps } = fixture();
    const work = rows([
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
    ]);
    steps.slice(0, 20).forEach((s) => (s.status = "done"));
    const r = pace(date("2026-10-15"), work);
    expect(r.observationDays).toBe(10);
    expect(r.actual).toBe(2);
    expect(r.forecastRate).toBe(2);
    expect(r.forecast).toBe("2026-10-28");
    expect(finishOnWorkDay(date("2026-10-15"), 2, settings(), "UTC")).toBe(
        "2026-10-18",
    );
});
it("إنجاز الراحة يقلل المتبقي والتوقع دون تضخيم معدل العمل أو اعتباره عادة", () => {
    const { pace, steps } = fixture(200);
    const work = rows([
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
    ]);
    steps.slice(0, 20).forEach((s) => (s.status = "done"));
    const a = pace(date("2026-10-15"), work);
    const optional = Array.from({ length: 100 }, (_, n): StepWork => ({
        id: `${n + 21}`,
        order: n + 21,
        projectId: "p",
        stepId: `s${n + 20}`,
        complete: true,
        at: "2026-10-09T10:00:00.000Z",
    }));
    steps.slice(20, 120).forEach((s) => (s.status = "done"));
    const b = pace(date("2026-10-15"), [...work, ...optional]);
    expect(b.restCompleted).toBe(100);
    expect(b.actual).toBe(a.actual);
    expect(b.forecastRate).toBe(a.forecastRate);
    expect(b.forecast! < a.forecast!).toBe(true);
    expect(isProjectRest(date("2026-10-16"), settings())).toBe(true);
});
it("سجل الراحة وحده لا يكفي لتوقع شخصي", () => {
    const { pace } = fixture(100);
    const r = pace(
        date("2026-10-15"),
        rows(["2026-10-02", "2026-10-03", "2026-10-09", "2026-10-10"], 10),
    );
    expect(r.restCompleted).toBe(40);
    expect(r.workDays).toBe(0);
    expect(r.sufficient).toBe(false);
    expect(r.forecast).toBeUndefined();
});
it("تغيير جدول الراحة لا يعيد تفسير أيام العمل السابقة", () => {
    const old = settings();
    const changed = settings();
    changed.restHistory!.push({
        since: "2026-10-08T00:00:00.000Z",
        days: [],
        timeZone: "UTC",
    });
    const a = +date(since),
        b = +date("2026-10-08"),
        c = +date("2026-10-15");
    expect(availableProjectDays(a, b, changed, [], "UTC")).toBe(5);
    expect(availableProjectDays(a, b, changed, [], "UTC")).toBe(
        availableProjectDays(a, b, old, [], "UTC"),
    );
    expect(availableProjectDays(a, c, changed, [], "UTC")).toBe(12);
});
it("تغيير منتصف يوم الراحة يحفظ الجزء الماضي ويطبق التعديل من لحظته", () => {
    const s = settings();
    s.restHistory!.push({
        since: "2026-10-02T12:00:00.000Z",
        days: [],
        timeZone: "UTC",
    });
    expect(
        availableProjectDays(
            +date("2026-10-02"),
            +date("2026-10-03"),
            s,
            [],
            "UTC",
        ),
    ).toBe(0.5);
    expect(isProjectRest(date("2026-10-02T11:59:59Z"), s)).toBe(true);
    expect(isProjectRest(date("2026-10-02T12:00:00Z"), s)).toBe(false);
});
it("لا تُختلق راحة تاريخية قبل ترحيل المستخدم الحالي", () => {
    const s = settings([5, 6], "2026-10-08T00:00:00.000Z");
    expect(
        availableProjectDays(+date(since), +date("2026-10-08"), s, [], "UTC"),
    ).toBe(7);
});
it("اتحاد الإيقاف والراحة لا يُخصم مرتين والمرن يتجمد تقويميًا فقط", () => {
    const { pace, plan } = fixture();
    plan.pauses = [{ start: since, end: "2026-10-04T00:00:00.000Z" }];
    const r = pace(date("2026-10-08"));
    expect(r.observationDays).toBe(4);
    expect(r.target).toBe("2026-10-23");
    expect(effectiveTarget(plan, date("2026-10-08"))).toBe("2026-10-23");
    plan.goal!.deadline = "fixed";
    expect(pace(date("2026-10-08")).target).toBe("2026-10-20");
});
it("لا تصدر توصيات مشاريع يوم الراحة ولا توصية تخفيف بسبب الجمعة والسبت", () => {
    const { p, plan, steps } = fixture();
    plan.approvedAt = since;
    plan.approvedPace = 2;
    const work = rows([
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
    ]);
    const ctx = {
        projects: [p],
        plans: [plan],
        work,
        hierarchy: buildHierarchy(steps),
        tasks: [],
        settings: settings(),
    };
    expect(recommendationCandidates(ctx, date("2026-10-16"))).toEqual([]);
    expect(
        recommendationCandidates(ctx, date("2026-10-15")).some(
            (r) => r.type === "ease",
        ),
    ).toBe(false);
});
it("مستويات التسريع تحسب موعدها عبر أيام العمل دون تعديل الخطة", () => {
    const { pace, plan } = fixture();
    const original = structuredClone(plan);
    const r = pace();
    for (const option of accelerationOptions(r, date(since), "UTC"))
        expect(option.finish).toBe(
            finishOnWorkDay(
                date(since),
                Math.ceil(r.remaining / option.daily),
                settings(),
                "UTC",
            ),
        );
    expect(plan).toEqual(original);
});
it("الدمج يحفظ جدول المصدر للماضي ويستخدم جدول الجهاز للمستقبل", () => {
    const { plan } = fixture();
    plan.restBefore = {
        until: "2026-10-08T00:00:00.000Z",
        history: settings([5, 6]).restHistory!,
    };
    const local = settings([], "2026-10-01T00:00:00.000Z");
    const calendar = projectRestSettings(local, plan);
    expect(isProjectRest(date("2026-10-02"), calendar)).toBe(true);
    expect(isProjectRest(date("2026-10-09"), calendar)).toBe(false);
});
describe("التقويم المحلي والحدود", () => {
    it.each(["2026-03-08T05:00:00.000Z", "2026-11-01T04:00:00.000Z"])(
        "DST: يوم العمل الكامل يزن واحدًا في%s",
        (stamp) => {
            const day = stamp.startsWith("2026-03")
                ? "2026-03-09T04:00:00.000Z"
                : "2026-11-02T05:00:00.000Z";
            expect(
                availableProjectDays(
                    +date(stamp),
                    +date(day),
                    settings(
                        [],
                        since.replace("10-01", "01-01"),
                        "America/New_York",
                    ),
                    [],
                    "America/New_York",
                ),
            ).toBe(1);
            expect(
                availableProjectDays(
                    +date(stamp),
                    +date(day),
                    settings(
                        [0],
                        since.replace("10-01", "01-01"),
                        "America/New_York",
                    ),
                    [],
                    "America/New_York",
                ),
            ).toBe(0);
        },
    );
    it("منتصف الليل في الرياض وبداية السنة لا يعتمدان UTC لاسم اليوم", () => {
        const s = settings([5, 6], since, "Asia/Riyadh");
        expect(isProjectRest(date("2026-10-01T20:59:59Z"), s)).toBe(false);
        expect(isProjectRest(date("2026-10-01T21:00:00Z"), s)).toBe(true);
        expect(
            remainingWorkDays(
                "2026-12-31",
                "2027-01-03",
                s,
                date("2026-12-31T00:00:00Z"),
                "Asia/Riyadh",
            ),
        ).toBe(2);
        expect(
            finishOnWorkDay(date("2026-12-31T10:00:00Z"), 2, s, "Asia/Riyadh"),
        ).toBe("2027-01-03");
    });
    it("هدف100عام يُحسب دون المرور على كل يوم", () => {
        const s = settings();
        expect(
            remainingWorkDays(
                "2026-10-01",
                "2126-09-30",
                s,
                date(since),
                "UTC",
            ),
        ).toBeGreaterThan(26000);
    });
});
it("الرؤى لا تصف الجمعة والسبت سكونًا أو أيام تقصير", () => {
    const tracking = {
        projectId: "p",
        since: "2026-10-02T00:00:00.000Z",
        lastOrder: 0,
        initialPercent: 0,
        origin: "new" as const,
    };
    expect(
        inactivityDays(
            tracking,
            date("2026-10-04"),
            "UTC",
            undefined,
            settings(),
        ),
    ).toBe(0);
    expect(
        activityPeriods(
            [],
            tracking,
            date("2026-10-04"),
            "UTC",
            undefined,
            settings(),
        ).idle,
    ).toEqual([]);
});
it("تقويم راحة الرياض لا يتجزأ إلى يومي هدفUTC والتوقع يستخدم نهاية يوم العمل", () => {
    const s = settings([5, 6], since, "Asia/Riyadh");
    expect(finishOnWorkDay(date("2026-10-03T10:00:00Z"), 1, s, "UTC")).toBe(
        "2026-10-04",
    );
    // The Sunday UTC deadline includes the rest of Sunday and three hours of Monday in Riyadh.
    expect(
        remainingWorkDays(
            "2026-10-04",
            "2026-10-04",
            s,
            date("2026-10-04T09:00:00Z"),
            "UTC",
        ),
    ).toBe(2);
    const { pace, steps } = fixture();
    const work = rows([
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
    ]);
    steps.slice(0, 20).forEach((s) => (s.status = "done"));
    const r = pace(date("2026-10-15T09:00:00Z"), work, s);
    expect(r.observationDays).toBe(9.875);
    expect(r.actual).toBeCloseTo(20 / 9.875);
    expect(r.workDays).toBe(10);
    expect(r.forecast).toBe("2026-10-28");
});
