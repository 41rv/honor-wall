import { describe, expect, it } from "vitest";
import {
    primarySections,
    primarySection,
    workspacePage,
} from "../app/navigation";
import { routeOffset } from "../app/useRouteMotion";
describe("ثلاثة أقسام مع الحفاظ على الروابط القديمة", () => {
    it("يحافظ على الترتيب البصري المعتمد في RTL", () =>
        expect(primarySections).toEqual(["habits", "home", "projects"]));
    it.each([
        "projects",
        "project/p",
        "step/s",
        "tasks",
        "task/t",
        "ideas",
        "idea/i",
        "progress",
        "progress/insights",
        "progress/recommendations",
        "calendar",
    ])("%s ينتمي إلى المشاريع", (route) =>
        expect(primarySection(route)).toBe("projects"),
    );
    it.each(["home", "today"])("%s ينتمي إلى الرئيسية", (route) =>
        expect(primarySection(route)).toBe("home"),
    );
    it.each(["habits", "habit/h", "habit-path/p"])(
        "%s ينتمي إلى العادات",
        (route) => expect(primarySection(route)).toBe("habits"),
    );
    it.each(["backup", "unknown", ""])(
        "لا يحدد تبويبًا لوجهة عامة أو مجهولة %s",
        (route) => expect(primarySection(route)).toBeNull(),
    );
    it("يحدد صفحات بوابة التنظيم دون عرض رجوع إضافي في التفاصيل", () => {
        for (const route of ["tasks", "ideas", "progress/history", "calendar"])
            expect(workspacePage(route)).toBe(true);
        for (const route of [
            "projects",
            "task/t",
            "project/p",
            "home",
            "habits",
            "backup",
        ])
            expect(workspacePage(route)).toBe(false);
    });
    it("يحرك الأقسام الجديدة ويفصل الحركة داخل صفحات المشاريع", () => {
        expect(routeOffset("habits", "home")).toBe(-10);
        expect(routeOffset("home", "projects")).toBe(-10);
        expect(routeOffset("projects", "home")).toBe(10);
        expect(routeOffset("home", "habits")).toBe(10);
        expect(routeOffset("tasks", "ideas")).toBe(-10);
        expect(routeOffset("ideas", "tasks")).toBe(10);
        expect(routeOffset("task/t", "project/p")).toBe(0);
    });
});
