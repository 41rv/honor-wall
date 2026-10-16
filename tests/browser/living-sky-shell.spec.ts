import { test, expect, type Page } from "@playwright/test";
import { importData, sizedFixture, readStore, openCreate } from "./helpers";
import { validateBackup } from "../../app/model";
import fs from "node:fs";
import AxeBuilder from "@axe-core/playwright";

const output = "docs/living-sky-shell";
const before = process.env.MASAR_SHELL_STAGE === "before";
fs.mkdirSync(output, { recursive: true });
const routes = ["home", "projects", "tasks", "ideas", "progress"] as const;
test.use({ timezoneId: "Asia/Riyadh", viewport: { width: 390, height: 844 } });
function fixture(count = 24) {
    const data = sizedFixture(count);
    data.version = 2;
    data.taskCycles = [];
    const at = "2026-10-01T09:00:00.000Z";
    for (const group of [data.projects, data.steps, data.tasks, data.ideas])
        for (const row of group) {
            row.createdAt = at;
            row.updatedAt = at;
        }
    data.projects[0].title = "بناء عادة القراءة";
    data.steps[1].status = "done";
    data.steps[1].completedAt = "2026-10-20T09:00:00.000Z";
    data.projects.push(
        ...Array.from({ length: 3 }, (_, i) => ({
            ...data.projects[0],
            id: `project-${i}`,
            title: [
                "تعلّم التصميم",
                "مساحة العمل الهادئة",
                "خطتي للتعلّم المستمر",
            ][i],
        })),
    );
    data.tasks = Array.from({ length: count }, (_, i) => ({
        ...data.tasks[0],
        id: `task-${i}`,
        title:
            [
                "مراجعة خطة الأسبوع",
                "ممارسة اللغة الإنجليزية",
                "ترتيب مساحة العمل",
                "قراءة عشر صفحات",
            ][i % 4] + (i > 3 ? ` ${i}` : ""),
        priority: (
            [
                "important-urgent",
                "important",
                "urgent",
                "low",
                undefined,
            ] as const
        )[i % 5],
        ...(i < 5
            ? { today: { date: "2026-10-21", timeZone: "Asia/Riyadh" } }
            : {}),
    }));
    data.ideas = Array.from({ length: 12 }, (_, i) => ({
        ...data.ideas[0],
        id: `idea-${i}`,
        title: [
            "وقتٌ هادئ للقراءة",
            "مساحة للأفكار الجديدة",
            "تجربة صغيرة كل أسبوع",
        ][i % 3],
        notes: "فكرة تنمو بخطوة صغيرة، وملاحظة نعود إليها عندما يحين الوقت.",
        category: i % 2 ? "شخصي" : "تعلّم",
    }));
    return validateBackup(data);
}
async function setup(page: Page, theme = "light", count = 24, clock = true) {
    if (clock)
        await page.clock.install({
            time: new Date("2026-10-21T10:00:00.000Z"),
        });
    await page.addInitScript((theme) => {
        if (!localStorage.getItem("masar-theme"))
            localStorage.setItem("masar-theme", theme);
        if (!localStorage.getItem("masar-sky-blur"))
            localStorage.setItem("masar-sky-blur", "12");
    }, theme);
    await importData(page, fixture(count));
    await page.goto("/#home");
    await page.evaluate(() => document.fonts.ready);
    const close = page.getByRole("button", {
        name: "إخفاء الرسالة",
        exact: true,
    });
    if (await close.isVisible()) await close.click();
}
test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
    });
    await page.exposeFunction("shellErrors", () => errors);
});
test.afterEach(async ({ page }) => {
    expect(
        await page.evaluate(() =>
            (
                window as unknown as { shellErrors: () => Promise<string[]> }
            ).shellErrors(),
        ),
    ).toEqual([]);
});
for (const width of [320, 390])
    for (const theme of ["light", "dark"])
        test(`صور الصفحات الخمس والتفاعل ${width} ${theme}`, async ({
            page,
        }) => {
            test.setTimeout(90000);
            await page.setViewportSize({ width, height: 844 });
            await setup(page, theme);
            for (const route of routes) {
                await page.locator(`.navigation a[href="#${route}"]`).click();
                await expect(page.locator(".page-heading h1")).toBeVisible();
                await page.mouse.move(0, 0);
                await page.screenshot({
                    path: `${output}/${before ? "before" : "after"}-${route}-${theme}-${width}.png`,
                    fullPage: true,
                });
                if (before) continue;
                await expect(page.locator(".living-sky")).toHaveCount(1);
                await expect(
                    page.locator('.navigation a[aria-current="page"]'),
                ).toHaveAttribute("href", `#${route}`);
                expect(
                    await page.evaluate(
                        () =>
                            document.documentElement.scrollWidth <= innerWidth,
                    ),
                ).toBe(true);
                await page
                    .getByRole("button", { name: "إضافة سريعة", exact: true })
                    .click();
                await expect(
                    page.getByRole("dialog", {
                        name: "ماذا تريد أن تضيف؟",
                        exact: true,
                    }),
                ).toBeVisible();
                await page.keyboard.press("Escape");
                await expect(page.getByRole("dialog")).not.toBeVisible();
                await page.evaluate(() =>
                    window.scrollTo(0, document.body.scrollHeight),
                );
                await expect(page.locator(".living-sky")).toBeInViewport();
                const fab = await page.locator(".mobile-fab").boundingBox(),
                    nav = await page.locator(".sidebar").boundingBox();
                expect(fab!.y + fab!.height).toBeLessThan(nav!.y);
                await page.evaluate(() => window.scrollTo(0, 0));
            }
        });

if (!before) {
    test("تباين النص الفعلي في الصفحات والأشرطة عبر أوقات السماء والتمرير", async ({
        page,
    }) => {
        test.setTimeout(240000);
        await setup(page);
        await page.emulateMedia({ reducedMotion: "reduce" });
        const { execFileSync } = await import("node:child_process");
        const { tmpdir } = await import("node:os");
        const { join } = await import("node:path");
        const temp = fs.mkdtempSync(join(tmpdir(), "masar-shell-contrast-"));
        const results = [];
        for (const width of [320, 390])
            for (const theme of ["light", "dark"]) {
                await page.setViewportSize({ width, height: 844 });
                await page
                    .getByRole("button", {
                        name: "المظهر والألوان",
                        exact: true,
                    })
                    .click();
                await page
                    .getByRole("dialog")
                    .getByLabel("الوضع", { exact: true })
                    .selectOption(theme);
                await page
                    .getByRole("dialog")
                    .getByRole("button", { name: "تم", exact: true })
                    .click();
                for (const hour of [6, 9, 13, 17, 23]) {
                    await page.clock.setSystemTime(
                        new Date(
                            `2026-10-21T${String(hour - 3).padStart(2, "0")}:00:00Z`,
                        ),
                    );
                    await page.evaluate(() =>
                        window.dispatchEvent(new Event("focus")),
                    );
                    for (const route of routes) {
                        await page
                            .locator(`.navigation a[href="#${route}"]`)
                            .click();
                        for (const scroll of [0, 360]) {
                            await page.evaluate(
                                (y) => window.scrollTo(0, y),
                                scroll,
                            );
                            await page.evaluate(
                                () =>
                                    new Promise((resolve) =>
                                        requestAnimationFrame(() =>
                                            requestAnimationFrame(resolve),
                                        ),
                                    ),
                            );
                            const rows = await page.evaluate(() => {
                                const seen = new Set<Node>(),
                                    rows = [];
                                const navTop = document
                                    .querySelector(".sidebar")!
                                    .getBoundingClientRect().top;
                                const occluded = [
                                    ...document.querySelectorAll<HTMLElement>(
                                        ".mobile-fab,.toast",
                                    ),
                                ]
                                    .map((n) => n.getBoundingClientRect())
                                    .filter((r) => r.width && r.height)
                                    .map((r) => [r.x, r.y, r.right, r.bottom]);
                                const nodes =
                                    document.querySelectorAll<HTMLElement>(
                                        ".topbar,.navigation,main h1,main h2,main p,main strong,main .muted,main .project-name,main .task-due,main .idea-card,main .period-metric",
                                    );
                                for (const node of nodes) {
                                    const walker = document.createTreeWalker(
                                        node,
                                        NodeFilter.SHOW_TEXT,
                                    );
                                    while (walker.nextNode()) {
                                        const text = walker.currentNode,
                                            parent = text.parentElement;
                                        if (
                                            !parent ||
                                            seen.has(text) ||
                                            !text.textContent?.trim() ||
                                            parent.closest(
                                                'svg,select,textarea,dialog,[hidden],[aria-hidden="true"],button:disabled',
                                            )
                                        )
                                            continue;
                                        const closed = parent.closest(
                                            "details:not([open])",
                                        );
                                        if (
                                            closed &&
                                            !closed
                                                .querySelector("summary")
                                                ?.contains(parent)
                                        )
                                            continue;
                                        seen.add(text);
                                        const range = document.createRange();
                                        range.selectNodeContents(text);
                                        const box =
                                            range.getBoundingClientRect();
                                        const inChrome = !!parent.closest(
                                            ".topbar,.navigation",
                                        );
                                        if (
                                            !box.width ||
                                            box.top < 1 ||
                                            box.bottom > innerHeight - 1 ||
                                            (!inChrome &&
                                                (box.top < 64 ||
                                                    box.bottom > navTop - 8))
                                        )
                                            continue;
                                        const style = getComputedStyle(parent);
                                        if (
                                            style.visibility !== "visible" ||
                                            style.display === "none"
                                        )
                                            continue;
                                        const color = style.color
                                            .match(/[\d.]+/g)!
                                            .map(Number);
                                        let alpha = color[3] ?? 1;
                                        for (
                                            let ancestor: HTMLElement | null =
                                                parent;
                                            ancestor;
                                            ancestor = ancestor.parentElement
                                        )
                                            alpha *= Number(
                                                getComputedStyle(ancestor)
                                                    .opacity,
                                            );
                                        if (alpha < 0.1) continue;
                                        const size = parseFloat(style.fontSize),
                                            bold =
                                                parseInt(style.fontWeight) >=
                                                700;
                                        rows.push({
                                            label: text.textContent!.trim(),
                                            rgb: color.slice(0, 3),
                                            alpha,
                                            occluded,
                                            required:
                                                size >= 24 ||
                                                (size >= 18.66 && bold)
                                                    ? 3
                                                    : 4.5,
                                            rect: [
                                                box.x,
                                                box.y,
                                                box.right,
                                                box.bottom,
                                            ],
                                        });
                                        parent.classList.add(
                                            "shell-contrast-probe",
                                        );
                                    }
                                }
                                return rows;
                            });
                            const style = await page.addStyleTag({
                                content:
                                    ".shell-contrast-probe{color:transparent!important;text-shadow:none!important}",
                            });
                            const png = join(temp, "background.png"),
                                data = join(temp, "rows.json");
                            fs.writeFileSync(data, JSON.stringify(rows));
                            await page.screenshot({ path: png });
                            const measured = JSON.parse(
                                execFileSync(
                                    "python3",
                                    [
                                        `${output}/measure-contrast.py`,
                                        png,
                                        data,
                                    ],
                                    { encoding: "utf8" },
                                ),
                            );
                            results.push({
                                width,
                                theme,
                                hour,
                                route,
                                scroll,
                                rows: measured,
                            });
                            await style.evaluate((n) =>
                                n.parentNode?.removeChild(n),
                            );
                            await page.evaluate(() =>
                                document
                                    .querySelectorAll(".shell-contrast-probe")
                                    .forEach((n) =>
                                        n.classList.remove(
                                            "shell-contrast-probe",
                                        ),
                                    ),
                            );
                        }
                    }
                }
            }
        fs.writeFileSync(
            `${output}/rendered-contrast.json`,
            JSON.stringify(results, null, 2),
        );
        const failures = results.flatMap((c) =>
            c.rows
                .filter((r: { passes: boolean }) => !r.passes)
                .map((r: object) => ({ ...c, rows: undefined, failure: r })),
        );
        expect(failures).toEqual([]);
    });

    test("قائمة500 مهمة: تمرير فعلي دون مرشحات ضخمة وباستجابة سريعة", async ({
        page,
    }) => {
        test.setTimeout(60000);
        await setup(page, "dark", 500, false);
        await page.locator('.navigation a[href="#tasks"]').click();
        await expect(page.locator(".task-list")).toHaveCSS(
            "backdrop-filter",
            "none",
        );
        expect(
            await page
                .locator(".task-list")
                .evaluate(
                    (n) => getComputedStyle(n, "::before").backdropFilter,
                ),
        ).toBe("none");
        const cdp = await page.context().newCDPSession(page);
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
        const frames = page.evaluate(
            () =>
                new Promise<number[]>((resolve) => {
                    let previous = performance.now();
                    const samples: number[] = [];
                    const tick = (now: number) => {
                        samples.push(now - previous);
                        previous = now;
                        if (samples.length >= 150) resolve(samples.slice(1));
                        else requestAnimationFrame(tick);
                    };
                    requestAnimationFrame(tick);
                }),
        );
        await page.mouse.move(170, 420);
        for (let i = 0; i < 12; i++) {
            await page.mouse.wheel(0, i % 2 ? -400 : 400);
            await page.waitForTimeout(120);
        }
        const samples = await frames,
            sorted = [...samples].sort((a, b) => a - b);
        await page.evaluate(() => {
            const state = window as unknown as { shellDialogResponse?: number };
            let start: number | undefined;
            document.querySelector(".mobile-fab")!.addEventListener(
                "pointerdown",
                () => {
                    start = performance.now();
                },
                { once: true },
            );
            const observer = new MutationObserver(() => {
                if (
                    start === undefined ||
                    !document.querySelector("dialog.add-menu[open]")
                )
                    return;
                observer.disconnect();
                requestAnimationFrame(() =>
                    requestAnimationFrame(() => {
                        state.shellDialogResponse = performance.now() - start!;
                    }),
                );
            });
            observer.observe(document.body, {
                subtree: true,
                childList: true,
                attributes: true,
                attributeFilter: ["open"],
            });
        });
        const start = Date.now();
        await page.locator(".mobile-fab").click();
        await expect(
            page.getByRole("dialog", {
                name: "ماذا تريد أن تضيف؟",
                exact: true,
            }),
        ).toBeVisible();
        const driver = Date.now() - start;
        await page.waitForFunction(
            () =>
                (window as unknown as { shellDialogResponse?: number })
                    .shellDialogResponse !== undefined,
        );
        const open = await page.evaluate(
            () =>
                (window as unknown as { shellDialogResponse: number })
                    .shellDialogResponse,
        );
        await page.keyboard.press("Escape");
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
        await page
            .locator('[data-task-id="task-499"]')
            .scrollIntoViewIfNeeded();
        await page.locator('[data-task-id="task-499"] .task-check').click();
        await expect
            .poll(
                async () =>
                    (await readStore(page, "tasks")).find(
                        (t) => t.id === "task-499",
                    )?.status,
            )
            .toBe("done");
        const report = {
            tasks: 500,
            cpu_throttle: 4,
            frames: samples.length,
            median_frame_ms: sorted[Math.floor(sorted.length * 0.5)],
            p95_frame_ms: sorted[Math.floor(sorted.length * 0.95)],
            frames_over_50ms: samples.filter((n) => n > 50).length,
            dialog_open_ms: open,
            automation_lookup_and_click_ms: driver,
            physical_android: false,
        };
        fs.writeFileSync(
            `${output}/performance.json`,
            JSON.stringify(report, null, 2),
        );
        expect(report.p95_frame_ms).toBeLessThan(70);
        expect(report.frames_over_50ms).toBeLessThan(15);
        expect(open).toBeLessThan(500);
        await page.screenshot({ path: `${output}/tasks-500-dark-390.png` });
    });
    test("المشهد نفسه يبقى مركبًا عبر ثلاثين انتقالًا دون تغيير الزمن أو الضبابية", async ({
        page,
    }) => {
        await setup(page);
        await page.evaluate(() => {
            const sky = document.querySelector(".living-sky")!;
            (window as unknown as { originalSky: Element }).originalSky = sky;
            (window as unknown as { removedSkies: number }).removedSkies = 0;
            new MutationObserver((records) => {
                for (const record of records)
                    for (const node of record.removedNodes)
                        if (node === sky)
                            (window as unknown as { removedSkies: number })
                                .removedSkies++;
            }).observe(document.querySelector(".app-shell")!, {
                childList: true,
            });
        });
        const scene = await page
            .locator(".living-sky")
            .getAttribute("data-minute");
        for (let i = 0; i < 30; i++) {
            await page
                .locator(`.navigation a[href="#${routes[i % 5]}"]`)
                .click();
            expect(
                await page.evaluate(
                    () =>
                        document.querySelector(".living-sky") ===
                        (window as unknown as { originalSky: Element })
                            .originalSky,
                ),
            ).toBe(true);
            await expect(page.locator(".living-sky")).toHaveAttribute(
                "data-minute",
                scene!,
            );
            await expect(page.locator(".sky-scene")).toHaveCSS(
                "filter",
                "blur(12px)",
            );
        }
        expect(
            await page.evaluate(
                () =>
                    (window as unknown as { removedSkies: number })
                        .removedSkies,
            ),
        ).toBe(0);
    });

    test("زر عائم دون شريط أو اعتراض اللمس مع Safe Area24 وبدونها", async ({
        page,
        context,
    }) => {
        await setup(page, "dark");
        const cdp = await context.newCDPSession(page);
        for (const bottom of [0, 24]) {
            await cdp.send("Emulation.setSafeAreaInsetsOverride", {
                insets: { bottom },
            });
            for (const route of routes) {
                await page.locator(`.navigation a[href="#${route}"]`).click();
                expect(
                    await page
                        .locator(".sidebar")
                        .evaluate(
                            (n) => getComputedStyle(n, "::before").content,
                        ),
                ).toBe("none");
                const nav = await page.locator(".sidebar").boundingBox();
                expect(
                    await page.evaluate(
                        (y) =>
                            !document
                                .elementFromPoint(25, y)
                                ?.closest(".sidebar"),
                        nav!.y - 35,
                    ),
                ).toBe(true);
                await expect(page.locator(".sidebar")).toHaveCSS(
                    "padding-bottom",
                    `${bottom}px`,
                );
                const fab = await page.locator(".mobile-fab").boundingBox();
                expect(fab!.y + fab!.height).toBeLessThan(nav!.y);
                await page
                    .getByRole("button", { name: "إضافة سريعة", exact: true })
                    .click();
                await expect(page.getByRole("dialog")).toBeVisible();
                await page.keyboard.press("Escape");
            }
        }
    });

    test("إعداد واحد يؤثر على الصفحات كلها ويحفظ بعد إعادة الفتح دون اتصال", async ({
        page,
        context,
    }) => {
        await setup(page);
        await page
            .getByRole("button", { name: "المظهر والألوان", exact: true })
            .click();
        await expect(page.getByRole("slider")).toHaveCount(1);
        await page.getByRole("slider").fill("27");
        await page
            .getByRole("dialog")
            .getByRole("button", { name: "تم", exact: true })
            .click();
        const tasks = await readStore(page, "tasks"),
            projects = await readStore(page, "projects");
        await page.evaluate(async () => navigator.serviceWorker.ready);
        await page.reload();
        await expect
            .poll(() =>
                page.evaluate(() => !!navigator.serviceWorker.controller),
            )
            .toBe(true);
        await context.setOffline(true);
        await page.reload();
        for (const route of routes) {
            await page.locator(`.navigation a[href="#${route}"]`).click();
            await expect(page.locator(".sky-scene")).toHaveCSS(
                "filter",
                "blur(27px)",
            );
        }
        expect(await readStore(page, "tasks")).toEqual(tasks);
        expect(await readStore(page, "projects")).toEqual(projects);
        await context.setOffline(false);
    });

    test("التفاعل الفعلي لا يتغير: المهمة والفكرة والمشروع والنوافذ القصيرة", async ({
        page,
    }) => {
        await setup(page);
        await page.locator('.navigation a[href="#tasks"]').click();
        await page
            .getByRole("button", {
                name: "إكمال مراجعة خطة الأسبوع",
                exact: true,
            })
            .click();
        await expect
            .poll(
                async () =>
                    (await readStore(page, "tasks")).find(
                        (t) => t.id === "task-0",
                    )?.status,
            )
            .toBe("done");
        await page
            .getByRole("button", {
                name: "إعادة فتح مراجعة خطة الأسبوع",
                exact: true,
            })
            .click();
        await expect
            .poll(
                async () =>
                    (await readStore(page, "tasks")).find(
                        (t) => t.id === "task-0",
                    )?.status,
            )
            .toBe("todo");
        await page
            .getByRole("button", {
                name: "إجراءات المهمة «مراجعة خطة الأسبوع»",
                exact: true,
            })
            .click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.keyboard.press("Escape");
        await page.locator('.navigation a[href="#ideas"]').click();
        await openCreate(page, "idea");
        await page
            .getByRole("dialog")
            .getByLabel("الاسم", { exact: true })
            .fill("فكرة لاختبار الخامة");
        await page
            .getByRole("dialog")
            .getByRole("button", { name: "إضافة", exact: true })
            .click();
        await expect
            .poll(async () =>
                (await readStore(page, "ideas")).some(
                    (i) => i.title === "فكرة لاختبار الخامة",
                ),
            )
            .toBe(true);
        await page.locator('.navigation a[href="#projects"]').click();
        await page
            .locator(".project-card .title-link")
            .filter({ hasText: "بناء عادة القراءة" })
            .click();
        await expect(page).toHaveURL(/#project\/p/);
        await page.setViewportSize({ width: 320, height: 360 });
        await openCreate(page, "task");
        await expect(page.locator(".mobile-fab")).not.toBeVisible();
        const submit = page
            .getByRole("dialog")
            .getByRole("button", { name: "إضافة", exact: true });
        await submit.scrollIntoViewIfNeeded();
        await expect(submit).toBeInViewport();
        await page.keyboard.press("Escape");
    });

    test("إمكانية الوصول للصفحات الخمس في الثيمين والمقاسين", async ({
        page,
    }) => {
        test.setTimeout(180000);
        await setup(page);
        const result = [];
        for (const width of [320, 390])
            for (const theme of ["light", "dark"]) {
                await page.setViewportSize({ width, height: 844 });
                await page
                    .getByRole("button", {
                        name: "المظهر والألوان",
                        exact: true,
                    })
                    .click();
                await page
                    .getByRole("dialog")
                    .getByLabel("الوضع", { exact: true })
                    .selectOption(theme);
                await page
                    .getByRole("dialog")
                    .getByRole("button", { name: "تم", exact: true })
                    .click();
                for (const route of routes) {
                    await page
                        .locator(`.navigation a[href="#${route}"]`)
                        .click();
                    const axe = await new AxeBuilder({ page })
                        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
                        .analyze();
                    result.push({
                        width,
                        theme,
                        route,
                        violations: axe.violations,
                    });
                }
            }
        fs.writeFileSync(
            `${output}/accessibility.json`,
            JSON.stringify(result, null, 2),
        );
        expect(result.flatMap((r) => r.violations)).toEqual([]);
    });
}
