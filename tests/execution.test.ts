import { describe, it, expect } from "vitest";
import { buildHierarchy } from "../app/hierarchy";
import { buildExecution, projectExecution, resumeStep } from "../app/execution";
import type { Project, Step } from "../app/model";
const at = "2026-10-13T00:00:00.000Z";
const base = (id: string) => ({
    id,
    title: id,
    notes: "",
    createdAt: at,
    updatedAt: at,
});
const project = (id = "p"): Project => ({
    ...base(id),
    status: "active",
    archived: false,
});
const step = (
    id: string,
    parentId: string | null = null,
    order = 0,
    patch: Partial<Step> = {},
): Step => ({
    ...base(id),
    projectId: "p",
    parentId,
    order,
    kind: "step",
    status: "todo",
    ...patch,
});
function resolve(
    steps: Step[],
    visited: string | null,
    projects = [project()],
) {
    const hierarchy = buildHierarchy(steps);
    return resumeStep(
        projects,
        hierarchy,
        buildExecution(projects, hierarchy),
        visited,
    );
}
describe("الخطوة الحالية ونقطة الاستكمال", () => {
    it("يختار أول خطوة نهائية بترتيب المشروع بصرف النظر عن ترتيب التخزين", () => {
        const steps = [
            step("second", "phase", 1),
            step("nested", "branch"),
            step("branch", "phase"),
            step("phase", null, 1, { kind: "stage" }),
            step("first", null, 0),
        ];
        const hierarchy = buildHierarchy(steps.reverse());
        expect(projectExecution(hierarchy, "p").current?.id).toBe("first");
        steps.find((s) => s.id === "first")!.status = "done";
        const next = projectExecution(buildHierarchy(steps), "p");
        expect(next.current?.id).toBe("nested");
        expect(next.stage?.id).toBe("phase");
        expect(next.total).toBe(3);
    });
    it("يقدم جار العمل الأحدث ويكسر التعادل بترتيب المشروع", () => {
        const steps = [
            step("todo"),
            step("older", null, 1, { status: "doing" }),
            step("newer", null, 2, {
                status: "doing",
                updatedAt: "2026-10-14T00:00:00.000Z",
            }),
        ];
        expect(projectExecution(buildHierarchy(steps), "p").current?.id).toBe(
            "newer",
        );
        steps[2].updatedAt = at;
        expect(
            projectExecution(buildHierarchy(steps.reverse()), "p").current?.id,
        ).toBe("older");
    });
    it("لا يختار الأب الجاري أو المرحلة الفارغة كالتزام نهائي", () => {
        const steps = [
            step("parent", null, 0, { status: "doing" }),
            step("leaf", "parent"),
            step("empty", null, 1, { kind: "stage", status: "doing" }),
        ];
        const result = projectExecution(buildHierarchy(steps), "p");
        expect(result.current?.id).toBe("leaf");
        expect(result.total).toBe(1);
    });
    it("لا يختلق خطوة في مشروع فارغ أو مكتمل ويحفظ آخر إنجاز", () => {
        expect(
            projectExecution(
                buildHierarchy([step("empty", null, 0, { kind: "stage" })]),
                "p",
            ),
        ).toEqual({
            current: undefined,
            stage: undefined,
            lastCompleted: undefined,
            total: 0,
        });
        const result = projectExecution(
            buildHierarchy([
                step("a", null, 0, { status: "done", completedAt: at }),
                step("b", null, 1, {
                    status: "done",
                    completedAt: "2026-10-14T00:00:00.000Z",
                }),
            ]),
            "p",
        );
        expect(result.current).toBeUndefined();
        expect(result.lastCompleted?.id).toBe("b");
    });
    it("يفضل آخر خطوة زارها المستخدم على مشروع أحدث وعلى خطوة جارية", () => {
        expect(
            resolve(
                [
                    step("visited"),
                    step("working", null, 1, { status: "doing" }),
                ],
                "visited",
            )?.id,
        ).toBe("visited");
    });
    it("يعيد المستخدم إلى الخطوة المتفرعة التي زارها دون تحويلها إلى التزام إضافي", () => {
        expect(
            resolve([step("parent"), step("leaf", "parent")], "parent")?.id,
        ).toBe("parent");
        expect(
            projectExecution(
                buildHierarchy([step("parent"), step("leaf", "parent")]),
                "p",
            ).current?.id,
        ).toBe("leaf");
    });
    it.each(["missing", "completed", null])(
        "يستبدل مرجعًا غير صالح %s بخطوة جارية",
        (visited) => {
            expect(
                resolve(
                    [
                        step("completed", null, 0, {
                            status: "done",
                            completedAt: at,
                        }),
                        step("parent", null, 1),
                        step("working", "parent", 0, { status: "doing" }),
                    ],
                    visited,
                )?.id,
            ).toBe("working");
        },
    );
    it("يستبعد مشاريع الأرشيف والمغلقة من نقطة الاستكمال", () => {
        const projects = [
            project(),
            { ...project("archived"), archived: true },
            {
                ...project("closed"),
                status: "closed" as const,
                completedAt: at,
            },
        ];
        const steps = [
            step("fallback"),
            step("archivedStep", null, 0, {
                projectId: "archived",
                status: "doing",
            }),
            step("closedStep", null, 0, {
                projectId: "closed",
                status: "doing",
            }),
        ];
        expect(resolve(steps, "archivedStep", projects)?.id).toBe("fallback");
        expect(resolve(steps, "closedStep", projects)?.id).toBe("fallback");
        expect(resolve([], "missing", projects)).toBeUndefined();
    });
});
