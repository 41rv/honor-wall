import { appUrl } from "./url";
import { navigateView } from "./helpers";
import { test, expect, type Page } from "@playwright/test";
import { importData, sizedFixture, readStore, openCreate } from "./helpers";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";

const output = "docs/smooth-controls";
const before = process.env.MASAR_CONTROLS_STAGE === "before";
const guardBaseline = process.env.MASAR_CONTROLS_GUARD_BASELINE === "1";
const routes = ["home", "projects", "tasks", "ideas", "progress"];
const primaryRoutes = ["habits", "home", "projects"];
fs.mkdirSync(output, { recursive: true });
test.use({
    timezoneId: "Asia/Riyadh",
    hasTouch: true,
    serviceWorkers: before || guardBaseline ? "block" : "allow",
});

async function setup(page: Page, theme = "light", count = 24) {
    await page.addInitScript((mode) => {
        if (!localStorage.getItem("masar-theme"))
            localStorage.setItem("masar-theme", mode);
    }, theme);
    const data = sizedFixture(count);
    const now = await page.evaluate(() =>
        new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" }),
    );
    data.tasks = Array.from({ length: count === 500 ? 500 : 10 }, (_, i) => ({
        ...data.tasks[i % data.tasks.length],
        id: `t${i}`,
        title:
            ["قراءة عشر صفحات", "ترتيب مساحة العمل", "مراجعة خطة الأسبوع"][
                i % 3
            ] + (i > 2 ? ` ${i}` : ""),
        ...(i < 3 ? { today: { date: now, timeZone: "Asia/Riyadh" } } : {}),
    }));
    await importData(page, data);
    await page.goto(appUrl("/#home"));
    await page.evaluate(() => document.fonts.ready);
    const close = page.getByRole("button", {
        name: "إخفاء الرسالة",
        exact: true,
    });
    if (await close.isVisible()) await close.click();
}
async function settled(page: Page) {
    await page.evaluate(async () => {
        await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
        );
        await Promise.all(
            document.getAnimations().map((a) => a.finished.catch(() => {})),
        );
    });
}
test.beforeEach(async ({ page }) => {
    if (before || guardBaseline) {
        // Actual published 1.4.1 bytes, retained before any source changes.
        // Same controlled time/fixtures as After, without rebuilding old code.
        await page.route("**/*", async (route) => {
            const relative =
                new URL(route.request().url()).pathname
                    .replace(/^\/honor-wall\//, "/")
                    .slice(1) || "index.html";
            const file = path.join(
                guardBaseline
                    ? "/tmp/masar-controls-before-guard-production"
                    : "/tmp/masar-release-141-production",
                relative,
            );
            const types: Record<string, string> = {
                ".html": "text/html",
                ".js": "application/javascript",
                ".css": "text/css",
                ".woff": "font/woff",
                ".woff2": "font/woff2",
                ".svg": "image/svg+xml",
                ".png": "image/png",
                ".webmanifest": "application/manifest+json",
            };
            await route.fulfill({
                body: fs.readFileSync(file),
                contentType:
                    types[path.extname(file)] || "application/octet-stream",
            });
        });
    }
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
    });
    await page.exposeFunction("controlsErrors", () => errors);
});
test.afterEach(async ({ page }) => {
    if (!page.isClosed())
        expect(
            await page.evaluate(() =>
                (
                    window as unknown as {
                        controlsErrors: () => Promise<string[]>;
                    }
                ).controlsErrors(),
            ),
        ).toEqual([]);
});

for (const width of [320, 390, 768, 1366]) {
    for (const theme of ["light", "dark"]) {
        test(`صور الخامة والقوائم ${theme} ${width}`, async ({ page }) => {
            await page.clock.setFixedTime(new Date("2026-10-21T10:00:00Z"));
            await page.setViewportSize({ width, height: 844 });
            await setup(page, theme);
            await settled(page);
            const stage = before ? "before" : "after";
            await page.screenshot({
                path: `${output}/${stage}-${theme}-${width}.png`,
            });
            await page.locator(".mobile-fab").click();
            await expect(
                page.getByRole("dialog", {
                    name: "ماذا تريد أن تضيف؟",
                    exact: true,
                }),
            ).toBeVisible();
            await settled(page);
            await page.screenshot({
                path: `${output}/${stage}-menu-${theme}-${width}.png`,
            });
            await page.keyboard.press("Escape");
            await expect(page.getByRole("dialog")).not.toBeVisible();
            await expect(page.locator(".mobile-fab")).toBeFocused();
        });
    }
}

test("قياس التنقل والتمرير مع500 مهمة وCPU أبطأ أربع مرات", async ({
    page,
}) => {
    test.setTimeout(90000);
    await page.clock.setFixedTime(new Date("2026-10-21T10:00:00Z"));
    await page.setViewportSize({ width: 390, height: 844 });
    await setup(page, "dark", 500);
    await settled(page);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const metrics = await page.evaluate(async (routes) => {
        const frames: number[] = [],
            longs: number[] = [],
            nav: number[] = [];
        let running = true,
            previous = performance.now();
        const frame = (now: number) => {
            frames.push(now - previous);
            previous = now;
            if (running) requestAnimationFrame(frame);
        };
        const observer = new PerformanceObserver((list) => {
            longs.push(...list.getEntries().map((e) => e.duration));
        });
        observer.observe({ type: "longtask", buffered: false });
        requestAnimationFrame(frame);
        const twoFrames = () =>
            new Promise<void>((resolve) =>
                requestAnimationFrame(() =>
                    requestAnimationFrame(() => resolve()),
                ),
            );
        for (let i = 0; i < 15; i++) {
            const route = routes[(i + 1) % routes.length];
            const start = performance.now();
            (
                document.querySelector(
                    `.navigation a[href="#${route}"]`,
                ) as HTMLElement
            ).click();
            await new Promise<void>((resolve) => {
                const check = () => {
                    if (
                        document.querySelector(
                            `.navigation a[href="#${route}"][aria-current="page"]`,
                        )
                    )
                        resolve();
                    else requestAnimationFrame(check);
                };
                check();
            });
            await twoFrames();
            nav.push(performance.now() - start);
            await new Promise((resolve) => setTimeout(resolve, 280));
        }
        (document.querySelector(".task-shortcut") as HTMLElement).click();
        await new Promise((resolve) => setTimeout(resolve, 350));
        for (let i = 0; i < 30; i++) {
            window.scrollBy(0, 240);
            await twoFrames();
        }
        running = false;
        observer.disconnect();
        const percentile = (values: number[], p: number) =>
            [...values].sort((a, b) => a - b)[
                Math.min(values.length - 1, Math.floor(values.length * p))
            ];
        return {
            navigation_ms: nav,
            navigation_p95_ms: percentile(nav, 0.95),
            frame_count: frames.length,
            frame_median_ms: percentile(frames, 0.5),
            frame_p95_ms: percentile(frames, 0.95),
            frames_over_50ms: frames.filter((x) => x > 50).length,
            long_tasks_ms: longs,
        };
    }, primaryRoutes);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    expect(await page.locator(".task-row").count()).toBe(500);
    fs.writeFileSync(
        `${output}/${before ? "before" : "after"}-performance.json`,
        JSON.stringify(
            { ...metrics, cpu_throttle: 4, physical_android: false },
            null,
            2,
        ),
    );
    expect(metrics.navigation_p95_ms).toBeLessThan(700);
});

if (!before) {
    for (const count of [24, 500]) {
        test(`منع الإغلاق أثناء الحفظ وقبوله بعد انتهاء القفل ${count}`, async ({
            page,
        }) => {
            await page.setViewportSize({ width: 390, height: 844 });
            await setup(page, "dark", count);
            await navigateView(page, "tasks");
            await settled(page);
            await page.evaluate(() => {
                const w = window as unknown as {
                    holdWrites: boolean;
                    heldWrites: Array<() => void>;
                    releaseWrites: () => void;
                };
                w.holdWrites = false;
                w.heldWrites = [];
                const descriptor = Object.getOwnPropertyDescriptor(
                    IDBTransaction.prototype,
                    "oncomplete",
                )!;
                Object.defineProperty(IDBTransaction.prototype, "oncomplete", {
                    ...descriptor,
                    set(
                        this: IDBTransaction,
                        listener:
                            | ((this: IDBTransaction, event: Event) => void)
                            | null,
                    ) {
                        if (!listener) return descriptor.set!.call(this, null);
                        descriptor.set!.call(this, (event: Event) => {
                            const deliver = () => listener.call(this, event);
                            if (
                                w.holdWrites &&
                                this.mode === "readwrite" &&
                                this.objectStoreNames.contains("tasks")
                            )
                                w.heldWrites.push(deliver);
                            else deliver();
                        });
                    },
                });
                w.releaseWrites = () => {
                    w.holdWrites = false;
                    w.heldWrites.splice(0).forEach((deliver) => deliver());
                };
            });
            for (const duringExit of [false, true]) {
                await openCreate(page, "task");
                await settled(page);
                const dialog = page.getByRole("dialog");
                const title = `حفظ محمي ${duringExit ? "أثناء الخروج" : "قبل الخروج"}`;
                await dialog.getByLabel("الاسم", { exact: true }).fill(title);
                await page.evaluate(() => {
                    (window as unknown as { holdWrites: boolean }).holdWrites =
                        true;
                });
                if (duringExit) {
                    await page.keyboard.press("Escape");
                    await expect(dialog).toHaveAttribute(
                        "data-motion",
                        "closing",
                    );
                    await dialog
                        .locator("form")
                        .evaluate((n) =>
                            (n as HTMLFormElement).requestSubmit(),
                        );
                } else
                    await dialog
                        .getByRole("button", { name: "إضافة", exact: true })
                        .click();
                await expect
                    .poll(() =>
                        page.evaluate(
                            () =>
                                (
                                    window as unknown as {
                                        heldWrites: Array<() => void>;
                                    }
                                ).heldWrites.length,
                        ),
                    )
                    .toBeGreaterThan(0);
                await dialog
                    .getByRole("button", { name: "إغلاق", exact: true })
                    .focus();
                if (!duringExit) await page.keyboard.press("Escape");
                await expect(dialog).toBeVisible();
                await expect(dialog).not.toHaveAttribute(
                    "data-motion",
                    "closing",
                );
                await expect(dialog).toHaveCSS("opacity", "1");
                expect(
                    await dialog.evaluate((n) =>
                        n.contains(document.activeElement),
                    ),
                ).toBe(true);
                await page.evaluate(() =>
                    (
                        window as unknown as { releaseWrites: () => void }
                    ).releaseWrites(),
                );
                await expect(dialog).not.toBeVisible();
                expect(
                    (await readStore(page, "tasks")).filter(
                        (t) => t.title === title,
                    ),
                ).toHaveLength(1);
            }
        });
    }
    for (const width of [320, 390, 768, 1366]) {
        test(`التنقل في الاتجاهين والرجوع والسياق الزجاجي ${width}`, async ({
            page,
        }) => {
            await page.setViewportSize({ width, height: 844 });
            await setup(page);
            const originalTasks = await readStore(page, "tasks");
            await page.evaluate(() => {
                const w = window as unknown as {
                    preservedSky: Element | null;
                    routeMotions: Array<{
                        offset: string;
                        duration: number;
                        route: string | undefined;
                    }>;
                };
                w.preservedSky = document.querySelector(".living-sky");
                w.routeMotions = [];
                const main = document.querySelector("main")!;
                const animate = main.animate.bind(main);
                main.animate = ((
                    frames: Keyframe[],
                    options: KeyframeAnimationOptions,
                ) => {
                    w.routeMotions.push({
                        offset: String(frames[0].transform),
                        duration: Number(options.duration),
                        route: main.dataset.route,
                    });
                    return animate(frames, options);
                }) as typeof main.animate;
            });
            await navigateView(page, "habits");
            await settled(page);
            await page.evaluate(() => {
                (
                    window as unknown as { routeMotions: unknown[] }
                ).routeMotions = [];
            });
            for (const route of [
                ...primaryRoutes.slice(1),
                ...primaryRoutes.slice(0, -1).reverse(),
            ]) {
                await navigateView(page, route);
                await expect(page.locator("main")).toHaveAttribute(
                    "data-route",
                    route,
                );
                await expect(
                    page.locator(`.navigation a[href="#${route}"]`),
                ).toHaveAttribute("aria-current", "page");
                expect(
                    await page.evaluate(
                        () =>
                            (window as unknown as { preservedSky: Element })
                                .preservedSky ===
                            document.querySelector(".living-sky"),
                    ),
                ).toBe(true);
                expect(
                    await page.evaluate(
                        () =>
                            document.documentElement.scrollWidth <= innerWidth,
                    ),
                ).toBe(true);
                await settled(page);
                if (width < 761) {
                    const target = await page
                        .locator(`.navigation a[href="#${route}"]`)
                        .boundingBox();
                    const indicator = await page
                        .locator(".nav-active-indicator")
                        .boundingBox();
                    expect(
                        Math.abs(
                            indicator!.x +
                                indicator!.width / 2 -
                                target!.x -
                                target!.width / 2,
                        ),
                    ).toBeLessThan(1);
                    expect(target!.width).toBeGreaterThanOrEqual(44);
                    expect(target!.height).toBeGreaterThanOrEqual(44);
                }
            }
            const motions = await page.evaluate(
                () =>
                    (
                        window as unknown as {
                            routeMotions: Array<{
                                offset: string;
                                duration: number;
                            }>;
                        }
                    ).routeMotions,
            );
            expect(motions.map((m) => m.duration)).toEqual(Array(4).fill(240));
            expect(motions.map((m) => m.offset)).toEqual([
                ...Array(2).fill("translateX(-10px)"),
                ...Array(2).fill("translateX(10px)"),
            ]);
            await page.goBack();
            await expect(page.locator("main")).toHaveAttribute(
                "data-route",
                "home",
            );
            await page.goForward();
            await expect(page.locator("main")).toHaveAttribute(
                "data-route",
                "habits",
            );
            expect(await readStore(page, "tasks")).toEqual(originalTasks);
        });
    }

    test("النقر السريع يلغي الحركة السابقة ولا ينسخ المحتوى أو السماء", async ({
        page,
    }) => {
        await page.setViewportSize({ width: 320, height: 844 });
        await setup(page);
        const result = await page.evaluate(async (routes) => {
            const sky = document.querySelector(".living-sky");
            let maxAnimations = 0,
                minOpacity = 1;
            for (let i = 0; i < 40; i++) {
                (
                    document.querySelector(
                        `.navigation a[href="#${routes[(i + 1) % routes.length]}"]`,
                    ) as HTMLElement
                ).click();
                await new Promise((resolve) => setTimeout(resolve, 12));
                const main = document.querySelector("main")!;
                maxAnimations = Math.max(
                    maxAnimations,
                    main.getAnimations().length,
                );
                minOpacity = Math.min(
                    minOpacity,
                    Number(getComputedStyle(main).opacity),
                );
                if (
                    document.querySelectorAll("main").length !== 1 ||
                    sky !== document.querySelector(".living-sky")
                )
                    throw Error("Duplicated page or remounted sky");
            }
            return { maxAnimations, minOpacity };
        }, primaryRoutes);
        expect(result.maxAnimations).toBeLessThanOrEqual(1);
        expect(result.minOpacity).toBeGreaterThanOrEqual(0.91);
        await expect(page.locator("main")).toHaveAttribute(
            "data-route",
            "home",
        );
        await settled(page);
        expect(
            await page
                .locator("main")
                .evaluate((n) => n.getAnimations().length),
        ).toBe(0);
        await expect(
            page.locator(".navigation [aria-current=page]"),
        ).toHaveCount(1);
        await expect(page.locator(".home-today")).toHaveCount(1);
        for (const route of ["tasks", "ideas", "home"])
            await navigateView(page, route, true);
        await expect(page.locator("main")).toHaveAttribute(
            "data-route",
            "home",
        );
    });

    test("موضع التمرير محفوظ عند العودة إلى القائمة الطويلة", async ({
        page,
    }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await setup(page, "dark", 500);
        await navigateView(page, "tasks");
        await settled(page);
        await page.evaluate(() => window.scrollTo(0, 1200));
        await expect
            .poll(() => page.evaluate(() => scrollY))
            .toBeGreaterThan(1100);
        const y = await page.evaluate(() => scrollY);
        await navigateView(page, "ideas");
        await expect(page.locator("main")).toHaveAttribute(
            "data-route",
            "ideas",
        );
        await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
        await navigateView(page, "tasks");
        await settled(page);
        await expect
            .poll(() => page.evaluate((saved) => Math.abs(scrollY - saved), y))
            .toBeLessThan(2);
    });

    for (const count of [24, 500]) {
        test(`النوافذ وEscape وحصر التركيز وإعادته ${count}`, async ({
            page,
        }) => {
            await page.setViewportSize({ width: 390, height: 844 });
            await setup(page, "dark", count);
            await navigateView(page, "tasks");
            await settled(page);
            for (let i = 0; i < 3; i++) {
                await page.locator(".mobile-fab").click();
                const menu = page.getByRole("dialog", {
                    name: "ماذا تريد أن تضيف؟",
                    exact: true,
                });
                await expect(menu).toBeVisible();
                expect(await page.locator(".dialog-overlay").count()).toBe(
                    count === 500 ? 1 : 0,
                );
                await settled(page);
                await page.keyboard.press("Shift+Tab");
                expect(
                    await menu.evaluate((n) =>
                        n.contains(document.activeElement),
                    ),
                ).toBe(true);
                await page.keyboard.press("Tab");
                expect(
                    await menu.evaluate((n) =>
                        n.contains(document.activeElement),
                    ),
                ).toBe(true);
                await page.keyboard.press("Escape");
                await page.keyboard.press("Escape");
                await expect(menu).not.toBeVisible();
                await expect(page.locator(".mobile-fab")).toBeFocused();
                await expect(page.locator("#root")).not.toHaveAttribute(
                    "aria-hidden",
                    "true",
                );
                expect(
                    await page.evaluate(() => document.body.style.overflow),
                ).not.toBe("hidden");
                await expect
                    .poll(() =>
                        page.evaluate(
                            () =>
                                document
                                    .getAnimations()
                                    .filter((a) => a.playState === "running")
                                    .length,
                        ),
                    )
                    .toBe(0);
            }
            await openCreate(page, "task");
            await expect(page.getByRole("dialog")).toHaveCount(1);
            const form = page.getByRole("dialog");
            await form
                .getByLabel("الاسم", { exact: true })
                .fill("مهمة من النموذج المتحرك");
            await form
                .getByRole("button", { name: "إضافة", exact: true })
                .click();
            await expect(form).not.toBeVisible();
            await expect(
                page.getByRole("button", {
                    name: "إكمال مهمة من النموذج المتحرك",
                    exact: true,
                }),
            ).toBeVisible();
            const record = (await readStore(page, "tasks")).find(
                (t) => t.title === "مهمة من النموذج المتحرك",
            );
            expect(record?.status).toBe("todo");
            await page
                .getByRole("button", {
                    name: "إجراءات المهمة «مهمة من النموذج المتحرك»",
                    exact: true,
                })
                .click();
            await expect(page.getByRole("dialog")).toHaveClass(/context-sheet/);
            await settled(page);
            await page.keyboard.press("Escape");
            await expect(page.getByRole("dialog")).not.toBeVisible();
            await expect(
                page.getByRole("button", {
                    name: "إجراءات المهمة «مهمة من النموذج المتحرك»",
                    exact: true,
                }),
            ).toBeFocused();
        });
    }

    test("تقليل الحركة منذ البداية وعند تغييره أثناء الانتقال", async ({
        page,
    }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.emulateMedia({ reducedMotion: "reduce" });
        await setup(page);
        for (const route of routes.slice(1)) {
            await navigateView(page, route);
            await expect(page.locator("main")).toHaveAttribute(
                "data-route",
                route,
            );
            expect(
                await page
                    .locator("main")
                    .evaluate((n) => n.getAnimations().length),
            ).toBe(0);
        }
        await expect(page.locator(".nav-active-indicator")).toHaveCSS(
            "transition-duration",
            "0s",
        );
        await page.locator(".mobile-fab").click();
        await expect(page.getByRole("dialog")).toHaveCSS(
            "animation-name",
            "none",
        );
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).not.toBeVisible();
        await page.emulateMedia({ reducedMotion: "no-preference" });
        await navigateView(page, "tasks");
        await page.evaluate(() =>
            document
                .querySelector("main")!
                .getAnimations()
                .forEach((a) => a.pause()),
        );
        await page.emulateMedia({ reducedMotion: "reduce" });
        await expect(page.locator("main")).toHaveCSS("transform", "none");
        expect(
            await page
                .locator("main")
                .evaluate((n) => n.getAnimations().length),
        ).toBe(0);
    });

    test("الزر عائم فعليًا والضغط .94 والمساحة الآمنة والأطراف لا تعترض اللمس", async ({
        page,
        context,
    }) => {
        await page.setViewportSize({ width: 320, height: 844 });
        await setup(page, "dark");
        const cdp = await context.newCDPSession(page);
        for (const bottom of [0, 24]) {
            await cdp.send("Emulation.setSafeAreaInsetsOverride", {
                insets: { bottom },
            });
            for (const route of routes) {
                await navigateView(page, route);
                await settled(page);
                const nav = await page.locator(".sidebar").boundingBox();
                const fab = await page.locator(".mobile-fab").boundingBox();
                expect(fab!.height).toBe(48);
                expect(fab!.width).toBe(48);
                expect(fab!.y + fab!.height).toBeLessThan(nav!.y);
                expect(
                    await page
                        .locator(".sidebar")
                        .evaluate(
                            (n) => getComputedStyle(n, "::before").content,
                        ),
                ).toBe("none");
                expect(
                    await page
                        .locator(".sidebar")
                        .evaluate(
                            (n) => getComputedStyle(n, "::after").pointerEvents,
                        ),
                ).toBe("none");
                expect(
                    await page.evaluate(
                        (y) =>
                            !!document
                                .elementFromPoint(24, y)
                                ?.closest(".sidebar"),
                        nav!.y - 35,
                    ),
                ).toBe(false);
                await expect(page.locator(".sidebar")).toHaveCSS(
                    "padding-bottom",
                    `${bottom}px`,
                );
            }
        }
        const fab = page.locator(".mobile-fab");
        const rect = await fab.boundingBox();
        await page.mouse.move(rect!.x + 24, rect!.y + 24);
        await page.mouse.down();
        await expect(fab).toHaveCSS(
            "transform",
            "matrix(0.94, 0, 0, 0.94, 0, 0)",
        );
        await page.mouse.up();
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.mouse.click(12, 90);
        await expect(page.getByRole("dialog")).not.toBeVisible();
    });

    test("تباين الأيقونات والنصوص الزجاجية في المشاهد الخمسة والثيمين", async ({
        page,
    }) => {
        test.setTimeout(90000);
        await page.clock.install({ time: new Date("2026-10-21T09:00:00Z") });
        await page.setViewportSize({ width: 390, height: 844 });
        await setup(page);
        await page.emulateMedia({ reducedMotion: "reduce" });
        const tmp = fs.mkdtempSync(
            path.join(os.tmpdir(), "masar-controls-contrast-"),
        );
        const results = [];
        for (const theme of ["light", "dark"]) {
            await page.evaluate((mode) => {
                localStorage.setItem("masar-theme", mode);
            }, theme);
            await page.reload();
            for (const hour of [6, 9, 13, 17, 23]) {
                await page.clock.setSystemTime(
                    new Date(
                        `2026-10-21T${String(hour - 3).padStart(2, "0")}:00:00Z`,
                    ),
                );
                await page.evaluate(() =>
                    window.dispatchEvent(new Event("focus")),
                );
                for (const route of ["home", "tasks"]) {
                    await navigateView(page, route);
                    const rows = await page.evaluate(() =>
                        [
                            ...document.querySelectorAll<HTMLElement>(
                                ".navigation a > span, .navigation a > svg, .mobile-fab > svg",
                            ),
                        ].map((n) => {
                            const box = n.getBoundingClientRect();
                            const ink = getComputedStyle(n)
                                .color.match(/[\d.]+/g)!
                                .map(Number);
                            return {
                                label:
                                    n.textContent ||
                                    n.parentElement?.getAttribute(
                                        "aria-label",
                                    ) ||
                                    "أيقونة تنقل",
                                rect: [box.x, box.y, box.right, box.bottom],
                                rgb: ink.slice(0, 3),
                                alpha: ink[3] ?? 1,
                                required:
                                    n.tagName.toLowerCase() === "svg" ? 3 : 4.5,
                            };
                        }),
                    );
                    fs.writeFileSync(
                        path.join(tmp, "rows.json"),
                        JSON.stringify(rows),
                    );
                    const style = await page.addStyleTag({
                        content:
                            ".navigation a > span,.navigation a > svg,.mobile-fab > svg {visibility:hidden!important}",
                    });
                    await page.screenshot({
                        path: path.join(tmp, "background.png"),
                    });
                    await style.evaluate((n) => n.parentNode?.removeChild(n));
                    if (route === "home" && [13, 17, 23].includes(hour))
                        await page.screenshot({
                            path: `${output}/scene-${hour}-${theme}-390.png`,
                        });
                    const measured = JSON.parse(
                        execFileSync(
                            "python3",
                            [
                                "docs/living-sky-shell/measure-contrast.py",
                                path.join(tmp, "background.png"),
                                path.join(tmp, "rows.json"),
                            ],
                            { encoding: "utf8" },
                        ),
                    );
                    results.push({ theme, hour, route, rows: measured });
                }
            }
        }
        fs.writeFileSync(
            `${output}/control-contrast.json`,
            JSON.stringify(results, null, 2),
        );
        expect(results.flatMap((c) => c.rows).filter((r) => !r.passes)).toEqual(
            [],
        );
    });

    test("Axe للثيمين والمقاسات الأربعة وحوار الإضافة", async ({ page }) => {
        test.setTimeout(90000);
        const results = [];
        for (const width of [320, 390, 768, 1366]) {
            await page.setViewportSize({ width, height: 844 });
            for (const theme of ["light", "dark"]) {
                if (width === 320 && theme === "light") await setup(page);
                await page.evaluate(
                    (mode) => localStorage.setItem("masar-theme", mode),
                    theme,
                );
                await page.reload();
                await settled(page);
                for (const dialog of [false, true]) {
                    if (dialog) {
                        await page.locator(".mobile-fab").click();
                        await settled(page);
                    }
                    const result = await new AxeBuilder({ page })
                        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
                        .analyze();
                    results.push({
                        width,
                        theme,
                        dialog,
                        violations: result.violations,
                    });
                    if (dialog) {
                        await page.keyboard.press("Escape");
                        await expect(
                            page.getByRole("dialog"),
                        ).not.toBeVisible();
                    }
                }
            }
        }
        fs.writeFileSync(
            `${output}/accessibility.json`,
            JSON.stringify(results, null, 2),
        );
        expect(results.flatMap((r) => r.violations)).toEqual([]);
    });

    test("حفظ الإنجاز والبيانات وإعادة الفتح دون اتصال مع التحكم المتحرك", async ({
        page,
        context,
    }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await setup(page, "dark");
        await page.evaluate(async () => navigator.serviceWorker.ready);
        await page.reload();
        await expect
            .poll(() =>
                page.evaluate(() => !!navigator.serviceWorker.controller),
            )
            .toBe(true);
        await navigateView(page, "tasks");
        await page
            .getByRole("button", { name: "إكمال قراءة عشر صفحات", exact: true })
            .click();
        await expect
            .poll(
                async () =>
                    (await readStore(page, "tasks")).find((t) => t.id === "t0")
                        ?.status,
            )
            .toBe("done");
        const data = await readStore(page, "tasks");
        const projects = await readStore(page, "projects");
        await context.setOffline(true);
        await page.reload();
        for (const route of routes) {
            await navigateView(page, route);
            await expect(page.locator("main")).toHaveAttribute(
                "data-route",
                route,
            );
        }
        expect(await readStore(page, "tasks")).toEqual(data);
        expect(await readStore(page, "projects")).toEqual(projects);
        await page.locator(".mobile-fab").click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).not.toBeVisible();
    });
}
