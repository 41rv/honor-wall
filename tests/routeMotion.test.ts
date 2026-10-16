import { describe, expect, it } from "vitest";
import { routeOffset } from "../app/useRouteMotion";

describe("اتجاه حركة تبويبات مسار", () => {
    it("يدخل التبويب التالي من اليسار في RTL ويعكسه الرجوع", () => {
        const tabs = ["home", "projects", "tasks", "ideas", "progress"];
        for (let i = 0; i < tabs.length; i++)
            for (let j = i + 1; j < tabs.length; j++) {
                expect(routeOffset(tabs[i], tabs[j])).toBe(-10);
                expect(routeOffset(tabs[j], tabs[i])).toBe(10);
            }
    });
    it("يعكس الاتجاه عند استخدام واجهة LTR", () => {
        expect(routeOffset("home", "tasks", false)).toBe(10);
        expect(routeOffset("tasks", "home", false)).toBe(-10);
    });
    it("لا يعيد الحركة عند تحديث البيانات في الصفحة نفسها", () => {
        expect(routeOffset("tasks", "tasks")).toBe(0);
    });
    it("لا يخمن اتجاه التفاصيل والروابط المجهولة", () => {
        for (const route of ["task/abc", "project", "calendar", "backup", ""]) {
            expect(routeOffset(route, "home")).toBe(0);
            expect(routeOffset("home", route)).toBe(0);
        }
    });
});
