import { appUrl } from "./url";
import { test, expect, type Page } from "@playwright/test";
import { importData, sizedFixture, readStore, openCreate } from "./helpers";
import fs from "node:fs";
import AxeBuilder from "@axe-core/playwright";
const out = "docs/navigation-phase1";
const before = process.env.MASAR_NAV_STAGE === "before";
fs.mkdirSync(out, { recursive: true });
test.use({ timezoneId: "Asia/Riyadh", hasTouch: true });
async function settle(page: Page) {
    await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        await Promise.all(
            document.getAnimations().map((a) => a.finished.catch(() => {})),
        );
    });
}
async function seed(page: Page, theme = "light", count = 20) {
    await page.addInitScript(
        (mode) => localStorage.setItem("masar-theme", mode),
        theme,
    );
    await page.clock.install({ time: new Date("2026-10-21T10:00:00Z") });
    await importData(page, sizedFixture(count));
    const close = page.getByRole("button", {
        name: "إخفاء الرسالة",
        exact: true,
    });
    if (await close.isVisible()) await close.click();
}
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
    const list: string[] = [];
    errors.set(page, list);
    page.on("pageerror", (e) => list.push(e.message));
    page.on("console", (m) => {
        if (m.type() === "error") list.push(m.text());
    });
});
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));
for (const width of [320, 390])
    for (const theme of ["light", "dark"]) {
        test(`navigation screenshots ${width} ${theme}`, async ({ page }) => {
            await page.setViewportSize({ width, height: 844 });
            await seed(page, theme);
            for (const route of before
                ? ["home", "projects", "tasks", "ideas", "progress"]
                : [
                      "habits",
                      "home",
                      "projects",
                      "tasks",
                      "ideas",
                      "progress",
                  ]) {
                await page.goto(appUrl("/#" + route));
                await settle(page);
                expect(
                    await page.evaluate(
                        () =>
                            document.documentElement.scrollWidth <= innerWidth,
                    ),
                ).toBe(true);
                await page.screenshot({
                    path: `${out}/${before ? "before" : "after"}-${route}-${theme}-${width}.png`,
                });
            }
        });
    }

for (const width of [320, 390, 768, 1366])
    test(`three primary sections and reachable gateway ${width}`, async ({
        page,
    }) => {
        await page.setViewportSize({ width, height: 900 });
        await seed(page);
        await page.goto(appUrl("/#home"));
        const nav = page.getByRole("navigation", {
            name: "التنقل الرئيسي",
            exact: true,
        });
        await expect(nav.getByRole("link")).toHaveText([
            "العادات",
            "الرئيسية",
            "المشاريع",
        ]);
        for (const route of ["habits", "home", "projects"]) {
            await nav.locator(`a[href='#${route}']`).click();
            await expect(page.locator("main")).toHaveAttribute(
                "data-route",
                route,
            );
            await expect(nav.locator("[aria-current=page]")).toHaveAttribute(
                "href",
                "#" + route,
            );
            await settle(page);
            if (width < 761) {
                const boxes = await Promise.all(
                    ["habits", "home", "projects"].map((r) =>
                        nav.locator(`a[href='#${r}']`).boundingBox(),
                    ),
                );
                expect(boxes[0]!.x).toBeGreaterThan(boxes[1]!.x);
                expect(boxes[1]!.x).toBeGreaterThan(boxes[2]!.x);
                const a = await nav.locator(`[href='#${route}']`).boundingBox(),
                    b = await nav
                        .locator(".nav-active-indicator")
                        .boundingBox();
                expect(
                    Math.abs(a!.x + a!.width / 2 - b!.x - b!.width / 2),
                ).toBeLessThan(2);
            }
            expect(
                await page.evaluate(
                    () => document.documentElement.scrollWidth <= innerWidth,
                ),
            ).toBe(true);
        }
        for (const route of ["tasks", "ideas", "progress"]) {
            await page.locator(`.project-gateway a[href='#${route}']`).click();
            await expect(page.locator("main")).toHaveAttribute(
                "data-route",
                route,
            );
            await expect(nav.locator("[aria-current=page]")).toHaveAttribute(
                "href",
                "#projects",
            );
            await page
                .getByRole("link", {
                    name: "بوابة المشاريع",
                    exact: true,
                })
                .click();
            await expect(page.locator(".project-gateway")).toBeVisible();
        }
        await page.screenshot({
            path: `${out}/after-gateway-${width}.png`,
        });
    });

test("task shortcut is one click from every current page and habits is storage-neutral", async ({
    page,
}) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await seed(page);
    const original = await readStore(page, "tasks");
    for (const route of [
        "habits",
        "home",
        "projects",
        "ideas",
        "progress",
        "calendar",
        "backup",
        "project/p",
        "step/s0",
        "task/t0",
        "idea/idea",
        "today",
    ]) {
        await page.goto(appUrl("/#" + route));
        await expect(page.locator(".task-shortcut")).toBeVisible();
        await page.locator(".task-shortcut").click();
        await expect(page).toHaveURL(/#tasks$/);
        await expect(page.locator(".task-controls")).toBeVisible();
    }
    expect(await readStore(page, "tasks")).toEqual(original);
    const database = await page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const r = indexedDB.open("masar-v1");
            r.onsuccess = () => resolve(r.result);
            r.onerror = () => reject(r.error);
        });
        const result = {
            version: db.version,
            stores: Array.from(db.objectStoreNames),
        };
        db.close();
        return result;
    });
    expect(database.version).toBe(70);
    expect(database.stores.length).toBe(19);
    expect(
        database.stores.filter((s) => /habit|reminder/i.test(s)),
    ).toHaveLength(7);
    for (const name of database.stores.filter((s) => /habit|reminder/i.test(s)))
        expect(
            await readStore(page, name as Parameters<typeof readStore>[1]),
        ).toEqual([]);
});

test("back and forward preserve gateway origin, reload and safe direct-link fallbacks", async ({
    page,
    context,
}) => {
    await seed(page);
    await page.goto(appUrl("/#projects"));
    await page.locator(".project-gateway a[href='#tasks']").click();
    // Reload the committed destination, not a hash navigation still queued
    // by the browser: history markers are recorded with the route commit.
    await expect(page.locator("main")).toHaveAttribute("data-route", "tasks");
    await page.reload();
    await page.getByRole("button", { name: "الرجوع", exact: true }).click();
    await expect(page).toHaveURL(/#projects$/);
    await page.goForward();
    await expect(page).toHaveURL(/#tasks$/);
    await page.locator(".task-main").first().click();
    await page.getByRole("button", { name: "الرجوع", exact: true }).click();
    await expect(page).toHaveURL(/#tasks$/);
    for (const [route, fallback] of [
        ["task/t0", "tasks"],
        ["step/s0", "project/p"],
        ["idea/idea", "ideas"],
        ["project/p", "projects"],
    ]) {
        const direct = await context.newPage();
        await direct.goto(appUrl("/#" + route));
        await direct
            .getByRole("button", { name: "الرجوع", exact: true })
            .click();
        await expect(direct).toHaveURL(new RegExp("#" + fallback + "$"));
        await direct.close();
    }
});

test("task-list and project-tree scroll positions survive section navigation", async ({
    page,
}) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seed(page, "dark", 100);
    await page.goto(appUrl("/#project/p"));
    await page
        .locator('[data-step-id="s70"] .tree-title')
        .scrollIntoViewIfNeeded();
    await settle(page);
    const top = await page
        .locator('[data-step-id="s70"]')
        .evaluate((n) => n.getBoundingClientRect().top);
    await page.locator(".navigation a[href='#habits']").click();
    await page.goBack();
    await expect(page).toHaveURL(/#project\/p$/);
    await settle(page);
    await expect
        .poll(async () =>
            Math.abs(
                (await page
                    .locator('[data-step-id="s70"]')
                    .evaluate((n) => n.getBoundingClientRect().top)) - top,
            ),
        )
        .toBeLessThan(4);
    await page.locator(".task-shortcut").click();
    await settle(page);
    await page.evaluate(() => scrollTo(0, 800));
    const y = await page.evaluate(() => scrollY);
    await page.locator(".navigation a[href='#home']").click();
    await page.locator(".task-shortcut").click();
    await settle(page);
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(y);
});

test("legacy creation, completion and accessible light/dark shell remain available", async ({
    page,
}) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await seed(page);
    for (const route of ["habits", "projects", "tasks", "ideas", "progress"]) {
        await page.goto(appUrl("/#" + route));
        await openCreate(page, "task");
        await page
            .getByRole("dialog")
            .getByLabel("الاسم", { exact: true })
            .fill("مهمة من " + route);
        await page
            .getByRole("dialog")
            .getByRole("button", { name: "إضافة", exact: true })
            .click();
        await expect(page.getByRole("dialog")).not.toBeVisible();
    }
    await page.goto(appUrl("/#tasks"));
    await page
        .getByRole("button", {
            name: "إكمال مهمة من habits",
            exact: true,
        })
        .click();
    await expect
        .poll(
            async () =>
                (await readStore(page, "tasks")).find(
                    (t) => t.title === "مهمة من habits",
                )?.status,
        )
        .toBe("done");
    for (const theme of ["light", "dark"]) {
        await page.evaluate(
            (mode) => localStorage.setItem("masar-theme", mode),
            theme,
        );
        await page.reload();
        for (const route of ["habits", "projects", "tasks", "backup"]) {
            await page.goto(appUrl("/#" + route));
            await settle(page);
            const audit = await new AxeBuilder({ page })
                .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
                .analyze();
            expect(audit.violations).toEqual([]);
        }
    }
});
