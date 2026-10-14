import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { importData, largeFixture, readStore } from "./helpers";
const example = {
    name: "project.json",
    mimeType: "application/json",
    buffer: readFileSync(
        new URL("../../examples/project-import.json", import.meta.url),
    ),
};
const opening = (page: import("@playwright/test").Page) =>
    page.getByRole("dialog", { name: "استيراد مشروع", exact: true });
test.describe("فتح الاستيراد على شاشة أندرويد محاكاة", () => {
    test.use({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
    });
    test("الفتح والإغلاق المتكرر مستقلان عن البيانات والملفات والمنتقي الأصلي", async ({
        page,
    }) => {
        // Keep the opening probe separate from the independent minute-based
        // task-cycle reconciliation. The test timeout cannot reach this tick.
        await page.clock.install({ time: new Date("2026-10-14T12:00:00Z") });
        await importData(page, largeFixture());
        await page.goto("/#projects");
        await expect(page.locator(".project-card")).toHaveCount(20);
        await page.evaluate(async () => await navigator.serviceWorker.ready);
        await page.evaluate(() => {
            const probe = { operations: 0, fileReads: 0 };
            (window as unknown as { probe: typeof probe }).probe = probe;
            for (const prototype of [
                IDBObjectStore.prototype,
                IDBIndex.prototype,
            ])
                for (const key of [
                    "get",
                    "getAll",
                    "getAllKeys",
                    "openCursor",
                    "openKeyCursor",
                    "count",
                    "put",
                    "add",
                    "delete",
                    "clear",
                ]) {
                    const target = prototype as unknown as Record<
                        string,
                        (...args: unknown[]) => unknown
                    >;
                    const original = target[key];
                    if (!original) continue;
                    target[key] = function (...args) {
                        probe.operations++;
                        return original.apply(this, args);
                    };
                }
            const text = File.prototype.text;
            File.prototype.text = function () {
                probe.fileReads++;
                return text.call(this);
            };
        });
        let chooserRequests = 0;
        page.on("filechooser", () => chooserRequests++);
        const button = page.getByRole("button", {
            name: "استيراد مشروع",
            exact: true,
        });
        for (let i = 0; i < 6; i++) {
            await button.tap();
            await expect(opening(page)).toBeVisible();
            await expect(
                opening(page).getByRole("button", { name: "اختيار ملف JSON" }),
            ).toBeFocused();
            await button.evaluate((button) => {
                for (let n = 0; n < 12; n++)
                    (button as HTMLButtonElement).click();
            });
            await expect(page.locator("dialog[open]")).toHaveCount(1);
            expect(chooserRequests).toBe(0);
            if (i === 0) {
                expect(
                    (await new AxeBuilder({ page }).include("dialog").analyze())
                        .violations,
                ).toEqual([]);
                await page.screenshot({
                    path: "docs/project-import-open/initial-dialog-390.png",
                });
            }
            if (i % 3 === 0) await page.keyboard.press("Escape");
            else
                await opening(page)
                    .getByRole("button", {
                        name: i % 3 === 1 ? "إلغاء" : "إغلاق",
                        exact: true,
                    })
                    .tap();
            await expect(opening(page)).not.toBeVisible();
            await expect(button).toBeFocused();
        }
        expect(
            await page.evaluate(
                () =>
                    (
                        window as unknown as {
                            probe: { operations: number; fileReads: number };
                        }
                    ).probe,
            ),
        ).toEqual({ operations: 0, fileReads: 0 });
        expect(await readStore(page, "projects")).toHaveLength(20);
    });
    test("المنتقي يُفتح بطلب منفصل مرة واحدة ويعمل إلغاؤه وإعادة فتحه ثم المعاينة والحفظ", async ({
        page,
    }) => {
        await page.goto("/#projects");
        let requests = 0;
        page.on("filechooser", () => requests++);
        await page
            .getByRole("button", { name: "استيراد مشروع", exact: true })
            .tap();
        expect(requests).toBe(0);
        const first = page.waitForEvent("filechooser");
        await opening(page)
            .getByRole("button", { name: "اختيار ملف JSON" })
            .evaluate((button) => {
                for (let i = 0; i < 12; i++)
                    (button as HTMLButtonElement).click();
            });
        const cancelled = await first;
        expect(requests).toBe(1);
        await cancelled.setFiles([]);
        // Headless interception doesn't display/cancel an Android activity.
        // Dispatch the native input event to exercise the browser's cancel contract.
        await page
            .locator(".project-import input[type=file]")
            .dispatchEvent("cancel");
        await expect(opening(page)).toBeVisible();
        const second = page.waitForEvent("filechooser");
        await opening(page)
            .getByRole("button", { name: "اختيار ملف JSON" })
            .tap();
        await (await second).setFiles(example);
        expect(requests).toBe(2);
        await expect(
            page.getByRole("dialog", { name: "معاينة استيراد المشروع" }),
        ).toBeVisible();
        await expect(
            page
                .getByRole("dialog")
                .getByRole("button", { name: "إغلاق", exact: true }),
        ).toBeFocused();
        await page
            .getByRole("button", { name: "تأكيد استيراد المشروع" })
            .evaluate((button) => {
                for (let i = 0; i < 12; i++)
                    (button as HTMLButtonElement).click();
            });
        await expect(page).toHaveURL(/#project\//);
        await expect(page.getByRole("progressbar")).toHaveAttribute(
            "aria-valuenow",
            "0",
        );
        expect(await readStore(page, "projects")).toHaveLength(1);
        expect(await readStore(page, "steps")).toHaveLength(8);
    });
    test("فشل JSON في واجهة الفتح يتيح إعادة الاختيار ولا يحفظ بيانات", async ({
        page,
    }) => {
        await page.goto("/#projects");
        await page
            .getByRole("button", { name: "استيراد مشروع", exact: true })
            .tap();
        const first = page.waitForEvent("filechooser");
        await opening(page)
            .getByRole("button", { name: "اختيار ملف JSON" })
            .tap();
        await (await first).setFiles({ ...example, buffer: Buffer.from("{") });
        await expect(opening(page).getByRole("alert")).toContainText(
            "تعذر قراءة JSON",
        );
        expect(await readStore(page, "projects")).toHaveLength(0);
        const retry = page.waitForEvent("filechooser");
        await opening(page)
            .getByRole("button", { name: "اختيار ملف JSON" })
            .tap();
        await (await retry).setFiles(example);
        await expect(
            page.getByRole("dialog", { name: "معاينة استيراد المشروع" }),
        ).toBeVisible();
        await expect(
            page
                .getByRole("dialog")
                .getByRole("button", { name: "إغلاق", exact: true }),
        ).toBeFocused();
        await page.getByRole("button", { name: "إلغاء", exact: true }).tap();
        await page
            .getByRole("button", { name: "استيراد مشروع", exact: true })
            .tap();
        await expect(opening(page)).toBeVisible();
        await expect(opening(page).getByRole("alert")).toHaveCount(0);
        expect(await readStore(page, "projects")).toHaveLength(0);
    });
    test("عودة التركيز تعيد إتاحة المنتقي للمتصفحات التي لا ترسل cancel", async ({
        page,
    }) => {
        await page.goto("/#projects");
        await page
            .getByRole("button", { name: "استيراد مشروع", exact: true })
            .tap();
        const first = page.waitForEvent("filechooser");
        await opening(page)
            .getByRole("button", { name: "اختيار ملف JSON" })
            .tap();
        await (await first).setFiles([]);
        await page.evaluate(() => window.dispatchEvent(new Event("focus")));
        const second = page.waitForEvent("filechooser");
        await opening(page)
            .getByRole("button", { name: "اختيار ملف JSON" })
            .tap();
        await (await second).setFiles(example);
        await expect(
            page.getByRole("dialog", { name: "معاينة استيراد المشروع" }),
        ).toBeVisible();
        await expect(
            page
                .getByRole("dialog")
                .getByRole("button", { name: "إغلاق", exact: true }),
        ).toBeFocused();
    });
});
