import { performanceTest } from "./performanceHarness";
import { appUrl } from "./url";
import { test, expect, type Page } from "@playwright/test";
import { importData, sizedFixture, readStore } from "./helpers";
import fs from "node:fs";
import { validateBackup } from "../../app/model";

const root = "docs/living-sky/liquid-glass";
const stage = process.env.MASAR_GLASS_STAGE === "before" ? "before" : "after";
fs.mkdirSync(root, { recursive: true });
test.use({ viewport: { width: 390, height: 844 }, timezoneId: "Asia/Riyadh" });
test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
    });
    await page.exposeFunction("glassErrors", () => errors);
});
test.afterEach(async ({ page }) => {
    expect(
        await page.evaluate(() =>
            (
                window as unknown as { glassErrors: () => Promise<string[]> }
            ).glassErrors(),
        ),
    ).toEqual([]);
});
function fixture() {
    const data = sizedFixture(6);
    data.version = 2;
    data.taskCycles = [];
    const at = "2026-10-01T09:00:00.000Z";
    for (const group of [data.projects, data.steps, data.tasks, data.ideas])
        for (const row of group) {
            row.createdAt = at;
            row.updatedAt = at;
        }
    data.projects[0].title = "بناء عادة القراءة";
    data.steps.find((s) => s.id === "s0")!.status = "done";
    data.steps.find((s) => s.id === "s0")!.completedAt =
        "2026-10-20T09:00:00.000Z";
    data.steps.find((s) => s.id === "s1")!.title = "قراءة الفصل الثاني";
    data.steps.find((s) => s.id === "s1")!.status = "doing";
    data.steps.find((s) => s.id === "s1")!.startedAt =
        "2026-10-20T09:00:00.000Z";
    data.tasks = data.tasks.slice(0, 5).map((t, i) => ({
        ...t,
        title: [
            "مراجعة خطة الأسبوع",
            "ممارسة اللغة الإنجليزية",
            "ترتيب مساحة العمل",
            "قراءة عشر صفحات",
            "تجهيز قائمة القراءة",
        ][i],
        priority: (
            [
                "important-urgent",
                "important",
                "urgent",
                "low",
                undefined,
            ] as const
        )[i],
        today: { date: "2026-10-21", timeZone: "Asia/Riyadh" },
    }));
    data.ideas = [];
    return data;
}
async function setup(page: Page, clock = true) {
    if (clock)
        await page.clock.install({
            time: new Date("2026-10-21T10:00:00.000Z"),
        });
    await page.addInitScript(() => {
        localStorage.setItem("masar-theme", "light");
        localStorage.setItem("masar-sky-blur", "12");
    });
    await importData(page, validateBackup(fixture()));
    await page.goto(appUrl("/#home"));
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator(".living-sky")).toBeAttached();
}
const glass = ".living-home :is(.sky-glass,.home-project,.recommendation-card)";
test("مقارنة ست لقطات جوال بنفس البيانات والوقت والقياسات", async ({
    page,
}) => {
    test.setTimeout(60000);
    await setup(page);
    type Measurement = {
        theme: string;
        name: string;
        boxes: {
            x: number;
            y: number;
            width: number;
            height: number;
            text: string | null;
        }[];
    };
    const measurements: Measurement[] = [];
    for (const theme of ["light", "dark"]) {
        for (const [name, hour] of [
            ["day", 13],
            ["sunset", 17],
            ["night", 23],
        ] as const) {
            await page.clock.setSystemTime(
                new Date(
                    `2026-10-21T${String(hour - 3).padStart(2, "0")}:00:00.000Z`,
                ),
            );
            await page.evaluate((theme) => {
                localStorage.setItem("masar-theme", theme);
                document.documentElement.dataset.theme = theme;
            }, theme);
            // Init script initializes light on reload; theme is applied via current UI.
            await page
                .getByRole("button", { name: "المظهر والألوان", exact: true })
                .click();
            await page.getByLabel("الوضع", { exact: true }).selectOption(theme);
            await page
                .getByRole("dialog")
                .getByRole("button", { name: "تم", exact: true })
                .click();
            await page.evaluate(() => window.dispatchEvent(new Event("focus")));
            await page.waitForTimeout(3300);
            for (let i = 0; i < 3; i++) {
                const dismiss = page.getByRole("button", {
                    name: "إخفاء الرسالة",
                    exact: true,
                });
                if (await dismiss.isVisible()) await dismiss.click();
                await page.waitForTimeout(50);
            }
            await page.locator(".page-heading h1").click();
            await page.mouse.move(0, 0);
            await page.screenshot({
                path: `${root}/${stage}-${name}-${theme}-390.png`,
                fullPage: true,
            });
            await page.locator(".home-today .sky-glass").screenshot({
                path: `${root}/${stage}-${name}-${theme}-card.png`,
            });
            measurements.push({
                theme,
                name,
                boxes: await page.locator(glass).evaluateAll((nodes) =>
                    nodes
                        .filter(
                            (n) =>
                                !!n.getClientRects().length &&
                                !!n.closest(".home-today,.home-execution") &&
                                !n.closest(".home-habits,.home-summaries"),
                        )
                        .map((n) => {
                            const { x, y, width, height } =
                                n.getBoundingClientRect();
                            const count =
                                document.querySelector(".home-today-count");
                            const addedSummaryHeight =
                                count && n.closest(".home-today")
                                    ? count.getBoundingClientRect().height +
                                      parseFloat(
                                          getComputedStyle(count).marginTop,
                                      ) +
                                      parseFloat(
                                          getComputedStyle(count).marginBottom,
                                      )
                                    : 0;
                            return {
                                x,
                                y: y - addedSummaryHeight,
                                width,
                                height,
                                text: n.textContent,
                            };
                        }),
                ),
            });
        }
    }
    fs.writeFileSync(
        `${root}/${stage}-geometry.json`,
        JSON.stringify(measurements, null, 2),
    );
    if (stage === "after") {
        // The daily UX phase deliberately compacts card geometry. Preserve the
        // original glass-only golden as historical evidence; the current layout
        // must instead remain EXACTLY stable across all six sky/theme cases.
        await expect(page.locator(".home-today-count")).toContainText(
            "منجزة من",
        );
        expect(measurements).toHaveLength(6);
        expect(measurements[0].boxes.length).toBeGreaterThanOrEqual(2);
        for (const row of measurements) {
            expect(row.boxes).toEqual(measurements[0].boxes);
            for (const box of row.boxes) {
                expect(box.height).toBeGreaterThan(0);
                expect(box.width).toBeGreaterThan(0);
                expect(box.x).toBeGreaterThanOrEqual(0);
                expect(box.x + box.width).toBeLessThanOrEqual(390);
            }
        }
        await expect(
            page.locator(".home-summaries .home-secondary[open]"),
        ).toHaveCount(0);
        for (const details of await page
            .locator(".home-summaries .home-secondary")
            .all())
            await details.locator(":scope > summary").click();
        for (const name of [
            "ملخص المسارات النشطة",
            "ملخص الأفكار والتذكيرات",
            "ملخص التقدم العام",
        ])
            await expect(
                page.getByRole("region", { name, exact: true }),
            ).toBeVisible();
        await expect(
            page.getByRole("region", { name: "عاداتي اليوم", exact: true }),
        ).toBeVisible();
    }
});

performanceTest(
    "قياس تمرير البطاقات واستجابة الزر على نفس Chromium عند خفض CPU أربع مرات",
    async ({ page }) => {
        test.setTimeout(60000);
        await setup(page, false);
        const cdp = await page.context().newCDPSession(page);
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
        await cdp.send("Performance.enable");
        const before = await cdp.send("Performance.getMetrics");
        const frames = page.evaluate(
            () =>
                new Promise<number[]>((resolve) => {
                    const deltas: number[] = [];
                    let previous = performance.now();
                    const tick = (now: number) => {
                        deltas.push(now - previous);
                        previous = now;
                        if (deltas.length >= 150) resolve(deltas.slice(1));
                        else requestAnimationFrame(tick);
                    };
                    requestAnimationFrame(tick);
                }),
        );
        await page.mouse.move(180, 450);
        for (let i = 0; i < 12; i++) {
            await page.mouse.wheel(0, i % 2 ? -280 : 280);
            await page.waitForTimeout(120);
        }
        const intervals = await frames;
        const after = await cdp.send("Performance.getMetrics");
        await page.evaluate(() => window.scrollTo(0, 0));
        const responses = [];
        const inputToPaint = [];
        for (let i = 0; i < 5; i++) {
            await page
                .getByRole("button", { name: "إضافة سريعة", exact: true })
                .evaluate((button) => {
                    const measured = window as unknown as {
                        glassInputPaint: Promise<number>;
                    };
                    measured.glassInputPaint = new Promise((resolve) =>
                        button.addEventListener(
                            "click",
                            (event) => {
                                const start = event.timeStamp;
                                const painted = () => {
                                    const dialog =
                                        document.querySelector<HTMLDialogElement>(
                                            "dialog[open]",
                                        );
                                    if (
                                        dialog &&
                                        parseFloat(
                                            getComputedStyle(dialog).opacity,
                                        ) > 0
                                    )
                                        requestAnimationFrame(() =>
                                            resolve(performance.now() - start),
                                        );
                                    else requestAnimationFrame(painted);
                                };
                                requestAnimationFrame(painted);
                            },
                            { capture: true, once: true },
                        ),
                    );
                });
            const start = Date.now();
            await page
                .getByRole("button", { name: "إضافة سريعة", exact: true })
                .click();
            await expect(
                page.getByRole("dialog", {
                    name: "ماذا تريد أن تضيف؟",
                    exact: true,
                }),
            ).toBeVisible();
            responses.push(Date.now() - start);
            inputToPaint.push(
                await page.evaluate(
                    () =>
                        (
                            window as unknown as {
                                glassInputPaint: Promise<number>;
                            }
                        ).glassInputPaint,
                ),
            );
            await page.keyboard.press("Escape");
            // Measure an opening from the closed state, not the previous dialog's
            // 180ms exit animation plus Playwright's wait for native inertness.
            await expect(
                page.getByRole("dialog", {
                    name: "ماذا تريد أن تضيف؟",
                    exact: true,
                }),
            ).toHaveCount(0);
        }
        const sorted = [...intervals].sort((a, b) => a - b);
        const metrics = (list: { name: string; value: number }[]) =>
            Object.fromEntries(list.map((m) => [m.name, m.value]));
        const a = metrics(before.metrics),
            b = metrics(after.metrics);
        const report = {
            cpu_throttle: 4,
            frames: intervals.length,
            median_frame_ms: sorted[Math.floor(sorted.length * 0.5)],
            p95_frame_ms: sorted[Math.floor(sorted.length * 0.95)],
            frames_over_50ms: intervals.filter((x) => x > 50).length,
            main_thread_task_seconds: b.TaskDuration - a.TaskDuration,
            layout_seconds: b.LayoutDuration - a.LayoutDuration,
            recalc_style_seconds: b.RecalcStyleDuration - a.RecalcStyleDuration,
            dialog_response_ms: responses,
            browser_input_to_paint_ms: inputToPaint,
            fresh_browser_process: true,
            hardware_android: false,
        };
        fs.writeFileSync(
            `${root}/${stage}-performance.json`,
            JSON.stringify(report, null, 2),
        );
        expect(Math.max(...responses)).toBeLessThan(500);
        expect(Math.max(...inputToPaint)).toBeLessThan(500);
        expect(report.p95_frame_ms).toBeLessThan(70);
        expect(report.frames_over_50ms).toBeLessThan(15);
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    },
);

test("الخامة لا تغير التفاعل ولا تضيف مرشحات إلى النصوص والأزرار", async ({
    page,
}) => {
    await setup(page);
    const tasks = await readStore(page, "tasks");
    for (const selector of [
        ".home-today .task-main",
        ".home-today .task-check",
        ".home-project .title-link",
    ])
        for (const node of await page.locator(selector).all())
            await expect(node).toHaveCSS("filter", "none");
    await page
        .getByRole("button", { name: "إكمال مراجعة خطة الأسبوع", exact: true })
        .click();
    await page
        .getByRole("link", { name: /عرض الكل/ })
        .first()
        .click();
    if (stage === "after")
        expect(
            await page
                .locator(".today-ordered")
                .evaluate(
                    (n) => getComputedStyle(n, "::before").backdropFilter,
                ),
        ).toBe("none");
    await page
        .getByRole("button", {
            name: "إعادة فتح مراجعة خطة الأسبوع",
            exact: true,
        })
        .click();
    expect(
        (await readStore(page, "tasks")).map((t) => [t.id, t.status]),
    ).toEqual(tasks.map((t) => [t.id, t.status]));
    await page
        .getByRole("button", {
            name: "إجراءات المهمة «مراجعة خطة الأسبوع»",
            exact: true,
        })
        .click();
    await expect(
        page
            .getByRole("dialog")
            .getByRole("button", { name: "إزالة من مهامي اليوم", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    for (const width of [320, 390, 768, 1366]) {
        await page.setViewportSize({ width, height: 844 });
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
            ),
        ).toBe(true);
        await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    }
});

if (stage === "after") {
    test("الانكسار يغير بكسلات الإطار فقط، ووسط النص يبقى مطابقًا", async ({
        page,
    }) => {
        await setup(page);
        await page.emulateMedia({ reducedMotion: "reduce" });
        // A diagnostic grid makes a 2.5px bend measurable. It is temporary test
        // content, never part of Living Sky or any product screenshot.
        await page.addStyleTag({
            content: `
            .home-today { background: repeating-linear-gradient(90deg,#496978 0 1px,#e0eaeb 1px 9px); }
            .home-today .sky-glass { background:transparent!important; backdrop-filter:none!important; -webkit-backdrop-filter:none!important; }
        `,
        });
        const card = page.locator(".home-today .sky-glass");
        await expect(
            page.locator("#masar-glass-rim feDisplacementMap"),
        ).toHaveAttribute("scale", "5");
        expect(
            await card.evaluate(
                (n) => getComputedStyle(n, "::before").backdropFilter,
            ),
        ).toContain("masar-glass-rim");
        await card.screenshot({ path: `${root}/diagnostic-rim-on.png` });
        // Keep the identical compositing/filter path; only disable the bend.
        // Removing the whole filter would change text antialiasing by 1–2 RGB
        // levels, which is unrelated to displacement of content.
        await page
            .locator("#masar-glass-rim feDisplacementMap")
            .evaluate((n) => n.setAttribute("scale", "0"));
        await card.screenshot({ path: `${root}/diagnostic-rim-off.png` });
        const { execFileSync } = await import("node:child_process");
        const result = JSON.parse(
            execFileSync(
                "python3",
                [
                    "-c",
                    `
from PIL import Image,ImageChops
import json,sys
a=Image.open(sys.argv[1]).convert('RGB');b=Image.open(sys.argv[2]).convert('RGB')
d=ImageChops.difference(a,b);w,h=a.size
edge=center=0;maximum=0
for y in range(h):
 for x in range(w):
  delta=max(d.getpixel((x,y)))
  if delta>0:
   if x<8 or y<8 or x>=w-8 or y>=h-8:edge+=1
   elif 20<x<w-20 and 20<y<h-20:center+=1
  maximum=max(maximum,delta)
print(json.dumps({'edge_changed_pixels':edge,'center_changed_pixels':center,'maximum_channel_difference':maximum,'width':w,'height':h}))
        `,
                    `${root}/diagnostic-rim-on.png`,
                    `${root}/diagnostic-rim-off.png`,
                ],
                { encoding: "utf8" },
            ),
        );
        fs.writeFileSync(
            `${root}/rim-pixel-proof.json`,
            JSON.stringify(result, null, 2),
        );
        expect(result.edge_changed_pixels).toBeGreaterThan(100);
        expect(result.center_changed_pixels).toBe(0);
    });

    test("البديل البسيط والألوان القسرية وتقليل الحركة لا يعطلان البطاقات", async ({
        page,
    }) => {
        await setup(page);
        const card = page.locator(".home-today .sky-glass");
        for (const theme of ["light", "dark"]) {
            await page.evaluate(
                (theme) => (document.documentElement.dataset.theme = theme),
                theme,
            );
            await page.emulateMedia({ reducedMotion: "reduce" });
            expect(
                await card.evaluate(
                    (n) => getComputedStyle(n, "::after").animationName,
                ),
            ).toBe("none");
            expect(
                await card.evaluate(
                    (n) => getComputedStyle(n, "::before").pointerEvents,
                ),
            ).toBe("none");
            await expect(card).toHaveCSS("border-radius", "18px");
        }
        // Exact baseline CSS fallback, for engines which cannot render SVG
        // URL backdrop filters. No JavaScript feature/UA loop is required.
        await page.addStyleTag({
            content: `${glass}::before { backdrop-filter:blur(0.5px) saturate(1.12);-webkit-backdrop-filter:blur(0.5px) saturate(1.12); }`,
        });
        expect(
            await card.evaluate(
                (n) => getComputedStyle(n, "::before").backdropFilter,
            ),
        ).not.toContain("url(");
        await page.screenshot({
            path: `${root}/fallback-css-dark-390.png`,
            fullPage: true,
        });
        await page.emulateMedia({ forcedColors: "active" });
        await expect(page.locator(".living-sky")).toHaveCSS("display", "none");
        expect(
            await card.evaluate((n) => getComputedStyle(n, "::before").content),
        ).toBe("none");
        expect(
            await card.evaluate((n) => getComputedStyle(n, "::after").content),
        ).toBe("none");
        await page
            .getByRole("button", {
                name: "إكمال مراجعة خطة الأسبوع",
                exact: true,
            })
            .click();
        await expect(page.locator(".home-today .task-row")).toHaveCount(3);
    });
}
