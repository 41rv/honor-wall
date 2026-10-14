import { test, expect } from "@playwright/test";
import { openCreate } from "./helpers";

const backgrounds = {
    "green-light": "rgb(246, 247, 242)",
    "green-dark": "rgb(16, 27, 23)",
    "mono-light": "rgb(245, 245, 245)",
    "mono-dark": "rgb(18, 18, 18)",
};
for (const identity of ["green", "mono"] as const)
    for (const mode of ["light", "dark"] as const)
        test(`قبل React وCSS: الثيم المحفوظ ${identity}/${mode} يحدد خلفية البداية وألوان النظام`, async ({
            page,
        }) => {
            await page.emulateMedia({
                colorScheme: mode === "dark" ? "light" : "dark",
            });
            await page.addInitScript(
                ({ identity, mode }) => {
                    localStorage.setItem("masar-identity", identity);
                    localStorage.setItem("masar-theme", mode);
                },
                { identity, mode },
            );
            await page.route(/\/assets\/.*\.(js|css)$/, (route) =>
                route.fulfill({
                    status: 200,
                    contentType: route.request().url().endsWith(".css")
                        ? "text/css"
                        : "application/javascript",
                    body: "",
                }),
            );
            await page.goto("/#home");
            await expect(page.locator("#root")).toBeEmpty();
            await expect(page.locator("html")).toHaveAttribute(
                "data-theme",
                mode,
            );
            await expect(page.locator("html")).toHaveAttribute(
                "data-identity",
                identity,
            );
            await expect(page.locator("html")).toHaveCSS(
                "background-color",
                backgrounds[`${identity}-${mode}`],
            );
            await expect(
                page.locator('meta[name="color-scheme"]'),
            ).toHaveAttribute("content", mode);
            const meta = await page
                .locator('meta[name="theme-color"]')
                .getAttribute("content");
            expect(meta).toBe(
                mode === "dark"
                    ? identity === "mono"
                        ? "#121212"
                        : "#101b17"
                    : identity === "mono"
                      ? "#f5f5f5"
                      : "#f6f7f2",
            );
            if (mode === "dark")
                await page.screenshot({
                    path: `docs/dark-mode-audit/boot-${identity}-dark.png`,
                });
        });

test("التنقل بالرجوع يغلق قائمة الإضافة ولا يترك نافذة على صفحة أخرى", async ({
    page,
}) => {
    await page.goto("/#home");
    await page.locator('.navigation a[href="#tasks"]').click();
    await page
        .getByRole("button", { name: "إضافة سريعة", exact: true })
        .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/#home$/);
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await openCreate(page, "task");
    await expect(
        page.getByRole("dialog").getByLabel("الاسم", { exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
});
