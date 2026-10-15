import { it, expect, describe } from "vitest";
import { base, type Project, type Step } from "../app/model";
import { buildHierarchy } from "../app/hierarchy";
import {
    projectPace,
    makeGoal,
    effectiveTarget,
    dailySteps,
    accelerationOptions,
    recommendationCandidates,
    activeProject,
} from "../app/projectPace";
import type { ProjectPlan, StepWork } from "../app/paceTypes";
const since = "2026-10-01T00:00:00.000Z",
    at = new Date(since);
function fixture(n = 40, days = 20) {
    const p: Project = {
        ...base("مشروع"),
        id: "p",
        createdAt: since,
        updatedAt: since,
        status: "active",
        archived: false,
    };
    const steps: Step[] = Array.from({ length: n }, (_, i) => ({
        ...base(`خطوة ${i}`),
        id: `s${i}`,
        projectId: p.id,
        parentId: null,
        kind: "step",
        order: i,
        status: "todo",
    }));
    const plan: ProjectPlan = {
        projectId: p.id,
        since,
        revision: 0,
        workOrder: 0,
        pauses: [],
        goal: makeGoal("duration", days, "flexible", at, "UTC"),
    };
    return { p, steps, plan };
}
function work(counts: number[]): StepWork[] {
    let order = 0;
    return counts.flatMap((count, day) =>
        Array.from({ length: count }, () => ({
            id: String(++order),
            order,
            projectId: "p",
            stepId: "work" + order,
            complete: true,
            at: `2026-10-${String(day + 1).padStart(2, "0")}T09:00:00.000Z`,
        })),
    );
}
it("40 خطوة في20 يومًا = خطوتان يوميًا والمرساة ثابتة", () => {
    const { p, steps, plan } = fixture();
    const r = projectPace(p, plan, buildHierarchy(steps), [], at);
    expect(r.required).toBe(2);
    expect(r.days).toBe(20);
    expect(r.target).toBe("2026-10-20");
    expect(
        projectPace(
            p,
            JSON.parse(JSON.stringify(plan)),
            buildHierarchy(steps),
            [],
            new Date("2026-10-02"),
        ).days,
    ).toBe(19);
});
it("تتغير الوتيرة بعد الإنجاز وإضافة وحذف خطوات، دون تغيير الهدف", () => {
    const { p, steps, plan } = fixture();
    steps[0].status = "done";
    const r = projectPace(p, plan, buildHierarchy(steps), [], at);
    expect(r.required).toBe(39 / 20);
    expect(
        projectPace(p, plan, buildHierarchy(steps.slice(0, 20)), [], at)
            .required,
    ).toBe(19 / 20);
    expect(plan.goal?.targetDate).toBe("2026-10-20");
});
it("توزيع كسري صحيح بلا أجزاء خطوة", () => {
    const { p, steps, plan } = fixture(7, 3);
    const r = projectPace(p, plan, buildHierarchy(steps), [], at);
    expect(r.allocation).toEqual({ low: 2, high: 3, highDays: 1, lowDays: 2 });
    expect(r.today).toBe(3);
});
it("يتعامل مع الأيام التي لا تحتاج خطوة وبالمشروع الفارغ والمكتمل", () => {
    const { p, steps, plan } = fixture(2, 5);
    expect(
        projectPace(p, plan, buildHierarchy(steps), [], at).allocation?.low,
    ).toBe(0);
    expect(projectPace(p, plan, buildHierarchy([]), [], at).required).toBe(0);
    steps.forEach((s) => (s.status = "done"));
    const r = projectPace(p, plan, buildHierarchy(steps), [], at);
    expect(r.remaining).toBe(0);
    expect(r.today).toBe(0);
});
it("لا يعد المحطات والأصل مع فروعه أكثر من مرة", () => {
    const { p, steps, plan } = fixture(4);
    steps[0].kind = "stage";
    steps[1].parentId = steps[0].id;
    steps[2].parentId = steps[1].id;
    expect(projectPace(p, plan, buildHierarchy(steps), [], at).total).toBe(2);
    expect(
        dailySteps(p.id, buildHierarchy(steps), 10).map((s) => s.id),
    ).toEqual(["s2", "s3"]);
});
it("الموعد المنتهي لا ينتج قسمة على صفر أو هدفًا جديدًا", () => {
    const { p, steps, plan } = fixture();
    const r = projectPace(
        p,
        plan,
        buildHierarchy(steps),
        [],
        new Date("2026-11-01"),
    );
    expect(r.days).toBe(0);
    expect(r.required).toBeUndefined();
    expect(r.target).toBe("2026-10-20");
});
it("المشروع القديم دون هدف أو سجل لا يملك توقعًا مختلقًا", () => {
    const { p, steps } = fixture();
    const r = projectPace(p, undefined, buildHierarchy(steps), [], at);
    expect(r.forecast).toBeUndefined();
    expect(r.target).toBeUndefined();
    expect(r.actual).toBeUndefined();
});
it("السرعة المرصودة تشمل أيام السكون والتوقع يحتاج3أيام إنجاز و7رصد", () => {
    const { p, steps, plan } = fixture();
    const rows = work([2, 2, 2, 2, 2, 2, 2]);
    const r = projectPace(
        p,
        plan,
        buildHierarchy(steps),
        rows,
        new Date("2026-10-08"),
    );
    expect(r.actual).toBe(2);
    expect(r.forecast).toBe("2026-10-27");
    expect(r.sufficient).toBe(true);
    const sparse = projectPace(
        p,
        plan,
        buildHierarchy(steps),
        work([14]),
        new Date("2026-10-08"),
    );
    expect(sparse.actual).toBe(2);
    expect(sparse.forecast).toBeUndefined();
    const zeros = projectPace(
        p,
        plan,
        buildHierarchy(steps),
        work([1, 0, 1, 0, 1, 0, 0]),
        new Date("2026-10-08"),
    );
    expect(zeros.actual).toBe(3 / 7);
});
it("لا يستدل على تحسن مستدام من دفعة واحدة أو سجل أقل من7أيام", () => {
    const { p, steps, plan } = fixture();
    for (const date of ["2026-10-02", "2026-10-04", "2026-10-07"]) {
        expect(
            projectPace(
                p,
                plan,
                buildHierarchy(steps),
                work([100]),
                new Date(date),
            ).sufficient,
        ).toBe(false);
    }
});
it("ترتيب المعرفات العشوائي لا يكرر خطوة بعد إنجاز وتراجع وإعادة إنجاز", () => {
    const { p, steps, plan } = fixture();
    const row = work([1])[0];
    const rows = [
        { ...row, order: 3, complete: true },
        { ...row, order: 1, complete: true },
        { ...row, order: 2, complete: false },
    ];
    expect(
        projectPace(
            p,
            plan,
            buildHierarchy(steps),
            rows,
            new Date("2026-10-08"),
        ).actual,
    ).toBe(1 / 7);
    rows.push({ ...row, order: 4, complete: false });
    expect(
        projectPace(
            p,
            plan,
            buildHierarchy(steps),
            rows,
            new Date("2026-10-08"),
        ).actual,
    ).toBe(0);
});
it("خمسة أيام إيقاف تجمد المدة المرنة قبل وبعد الاستئناف", () => {
    const { p, steps, plan } = fixture(40, 20);
    plan.pauses = [{ start: since }];
    const now = new Date("2026-10-06T00:00:00Z");
    expect(effectiveTarget(plan, now)).toBe("2026-10-25");
    const r = projectPace(p, plan, buildHierarchy(steps), [], now);
    expect(r.days).toBe(20);
    expect(r.today).toBe(0);
    plan.pauses[0].end = now.toISOString();
    expect(effectiveTarget(plan, new Date("2026-10-07"))).toBe("2026-10-25");
    expect(projectPace(p, plan, buildHierarchy(steps), [], now).days).toBe(20);
});
it("الموعد الإلزامي لا يتأجل أثناء الإيقاف", () => {
    const { p, steps, plan } = fixture();
    plan.goal!.deadline = "fixed";
    plan.pauses = [{ start: since }];
    expect(effectiveTarget(plan, new Date("2026-10-06"))).toBe("2026-10-20");
    expect(
        projectPace(p, plan, buildHierarchy(steps), [], new Date("2026-10-06"))
            .days,
    ).toBe(15);
});
it("الرصد يستبعد أيام الإيقاف والإنجاز خلالها ولا يعتبرها ضعف أداء", () => {
    const { p, steps, plan } = fixture();
    plan.pauses = [
        { start: "2026-10-03T00:00:00.000Z", end: "2026-10-08T00:00:00.000Z" },
    ];
    const r = projectPace(
        p,
        plan,
        buildHierarchy(steps),
        work([2, 2, 99, 99, 99, 99, 99, 2, 2, 2, 2, 2]),
        new Date("2026-10-13"),
    );
    expect(r.observationDays).toBe(7);
    expect(r.actual).toBe(2);
    expect(r.workDays).toBe(7);
});
it("لا يضيف إيقافًا قديمًا لهدف جديد", () => {
    const { plan } = fixture();
    plan.goal = makeGoal(
        "duration",
        20,
        "flexible",
        new Date("2026-10-10"),
        "UTC",
    );
    plan.pauses = [{ start: since, end: "2026-10-05T00:00:00.000Z" }];
    expect(effectiveTarget(plan, new Date("2026-10-11"))).toBe("2026-10-29");
});
it("الاقتراح اليومي مستقل عن المهام، والإنجاز اليومي يخفضه", () => {
    const { p, steps, plan } = fixture();
    const rows = work([1]);
    rows[0].at = "2026-10-01T01:00:00.000Z";
    expect(
        projectPace(
            p,
            plan,
            buildHierarchy(steps),
            rows,
            new Date("2026-10-01T02:00:00Z"),
        ).today,
    ).toBe(1);
    expect(dailySteps(p.id, buildHierarchy(steps), 2)).toHaveLength(2);
    expect(activeProject(p, { ...plan, pauses: [{ start: since }] })).toBe(
        false,
    );
});
it("خيارات التسريع الناقصة معلّمة افتراضية ولا تغير الخطة", () => {
    const { p, steps, plan } = fixture();
    const r = projectPace(p, plan, buildHierarchy(steps), [], at),
        before = JSON.stringify(plan);
    const o = accelerationOptions(r, at, "UTC");
    expect(o).toHaveLength(3);
    expect(o.map((o) => o.daily)).toEqual([3, 4, 5]);
    expect(o.every((o) => o.hypothetical && o.saved > 0)).toBe(true);
    expect(JSON.stringify(plan)).toBe(before);
});
it("لا يولد توصية شخصية بلا سجل كافٍ", () => {
    const { p, steps, plan } = fixture();
    expect(
        recommendationCandidates(
            {
                projects: [p],
                plans: [plan],
                hierarchy: buildHierarchy(steps),
                work: [],
                tasks: [],
            },
            at,
        ),
    ).toHaveLength(0);
});
describe("حدود التوقيت المحلي", () => {
    it.each(["Asia/Riyadh", "America/New_York"])(
        "يحتفظ بالأيام الصحيحة عبر تغيير السنة وDST في%s",
        (zone) => {
            const { p, steps, plan } = fixture();
            plan.since = "2026-12-31T00:00:00.000Z";
            plan.goal = makeGoal(
                "duration",
                2,
                "flexible",
                new Date("2026-12-31T12:00:00Z"),
                zone,
            );
            expect(plan.goal.targetDate).toBe("2027-01-01");
            expect(
                projectPace(
                    p,
                    plan,
                    buildHierarchy(steps),
                    [],
                    new Date("2027-01-01T12:00:00Z"),
                ).days,
            ).toBe(1);
            plan.goal = makeGoal(
                "duration",
                2,
                "flexible",
                new Date("2026-03-07T12:00:00Z"),
                zone,
            );
            expect(plan.goal.targetDate).toBe("2026-03-08");
        },
    );
    it("يرفض المدة والتاريخ غير الصالحين", () => {
        for (const days of [0, -1, 1.5, Infinity])
            expect(() =>
                makeGoal("duration", days, "flexible", at, "UTC"),
            ).toThrow();
        for (const day of ["2026-02-30", "bad", "2026-09-30"])
            expect(() => makeGoal("date", day, "fixed", at, "UTC")).toThrow();
    });
});
it("التوقع لا يتضخم بدفعة واحدة مع إنجازين صغيرين", () => {
    const { p, steps, plan } = fixture(200, 200);
    const r = projectPace(
        p,
        plan,
        buildHierarchy(steps),
        work([100, 1, 1, 0, 0, 0, 0]),
        new Date("2026-10-08"),
    );
    expect(r.actual).toBe(102 / 7);
    expect(r.forecastRate).toBe(3 / 7);
    expect(
        accelerationOptions(r, new Date("2026-10-08"), "UTC").every(
            (o) => o.daily <= 1,
        ),
    ).toBe(true);
});
it("تعديل الهيكل يعيد حساب التوقع دون تغيير سرعة الرصد أو الهدف", () => {
    const { p, steps, plan } = fixture();
    const rows = work([2, 2, 2, 2, 2, 2, 2]),
        at = new Date("2026-10-08");
    expect(projectPace(p, plan, buildHierarchy(steps), rows, at).forecast).toBe(
        "2026-10-27",
    );
    expect(
        projectPace(p, plan, buildHierarchy(steps.slice(0, 20)), rows, at)
            .forecast,
    ).toBe("2026-10-17");
    const added = { ...steps[0], id: "extra", order: 41 };
    expect(
        projectPace(p, plan, buildHierarchy([...steps, added]), rows, at)
            .forecast,
    ).toBe("2026-10-28");
    expect(plan.goal!.targetDate).toBe("2026-10-20");
});
it("دفعة حديثة واحدة لا تستبدل نمطًا أقدم متواضعًا بتوقع إنتاجية عالية", () => {
    const { p, steps, plan } = fixture(200, 200);
    const counts = [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100],
        r = projectPace(
            p,
            plan,
            buildHierarchy(steps),
            work(counts),
            new Date("2026-10-15"),
        );
    expect(r.sufficient).toBe(true);
    expect(r.recentWorkDays).toBe(1);
    expect(r.forecastRate).toBe(1 / 7);
    expect(r.actual).toBe(102 / 14);
});
