import { test, expect, type Page } from "@playwright/test";
import {
    importData,
    sizedFixture,
    readStore,
    chooseTaskToday,
} from "./helpers";
import type { Snapshot } from "../../app/model";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
const date = "2026-10-21";
const iso = (hour: number, minute = 0, day = date) =>
    new Date(
        Date.parse(day + "T00:00:00.000Z") +
            (hour - 3) * 3600000 +
            minute * 60000,
    ).toISOString();
const scenes = [
    { name: "dawn", hour: 6 },
    { name: "morning", hour: 9 },
    { name: "noon", hour: 13 },
    { name: "sunset", hour: 17 },
    { name: "night", hour: 23 },
] as const;
test.use({ timezoneId: "Asia/Riyadh", viewport: { width: 390, height: 844 } });
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date(iso(9)) });
    const list: string[] = [];
    errors.set(page, list);
    page.on("pageerror", (e) => list.push(e.message));
    page.on("console", (m) => {
        if (m.type() === "error") list.push(m.text());
    });
});
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));
function fixture(): Snapshot {
    const data = sizedFixture(6);
    for (const group of [data.projects, data.steps, data.tasks, data.ideas])
        for (const row of group) {
            row.createdAt = "2026-10-01T09:00:00.000Z";
            row.updatedAt = row.createdAt;
        }
    data.version = 2;
    data.taskCycles = [];
    data.projects[0].title = "بناء عادة القراءة";
    data.projects[0].notes = "قليلٌ كل يوم، وأثرٌ يبقى.";
    data.steps.find((s) => s.id === "s0")!.status = "done";
    data.steps.find((s) => s.id === "s0")!.completedAt =
        "2026-10-20T09:00:00.000Z";
    data.steps.find((s) => s.id === "s1")!.status = "doing";
    data.steps.find((s) => s.id === "s1")!.startedAt =
        "2026-10-20T09:00:00.000Z";
    data.steps.find((s) => s.id === "s1")!.title = "قراءة الفصل الثاني";
    data.projects.push({
        ...data.projects[0],
        id: "q",
        title: "مسار تعلّم التصميم",
        notes: "من الفضول إلى ممارسة واعية.",
    });
    data.steps.push(
        ...Array.from({ length: 4 }, (_, i) => ({
            ...data.steps.find((s) => s.id === "s2")!,
            id: `q${i}`,
            projectId: "q",
            parentId: null,
            order: i,
            title: `تطبيق الدرس ${i + 1}`,
        })),
    );
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
        today: { date, timeZone: "Asia/Riyadh" },
        ...(i === 4
            ? {
                  status: "done" as const,
                  completedAt: date + "T00:30:00.000Z",
              }
            : {}),
    }));
    data.ideas = [];
    return data;
}
async function setup(page: Page) {
    await importData(page, fixture());
    await page.goto("/#home");
    await expect(page.locator(".living-sky")).toBeAttached();
}
async function appearance(page: Page) {
    await page
        .getByRole("button", { name: "المظهر والألوان", exact: true })
        .click();
    return page.getByRole("dialog", { name: "المظهر والألوان", exact: true });
}
async function move(page: Page, hour: number, minute = 0, day = date) {
    await page.clock.setSystemTime(new Date(iso(hour, minute, day)));
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
}
async function persisted(page: Page, theme: string, blur: number) {
    await page.evaluate(
        ({ theme, blur }) => {
            localStorage.setItem("masar-theme", theme);
            localStorage.setItem("masar-sky-blur", String(blur));
        },
        { theme, blur },
    );
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.locator(".sky-scene")).toHaveCSS(
        "filter",
        `blur(${blur}px)`,
    );
}
for (const theme of ["light", "dark"] as const) {
    test(`صور الفترات الخمس والضبابية0و12و30 في الوضع${theme}`, async ({
        page,
    }) => {
        test.setTimeout(90000);
        await setup(page);
        for (const scene of scenes)
            for (const blur of [0, 12, 30]) {
                await move(page, scene.hour);
                await persisted(page, theme, blur);
                await expect(page.locator(".living-sky")).toHaveAttribute(
                    "data-phase",
                    scene.name,
                );
                await expect(page.locator(".living-sky")).toHaveAttribute(
                    "aria-hidden",
                    "true",
                );
                expect(
                    await page.evaluate(
                        () =>
                            document.documentElement.scrollWidth <= innerWidth,
                    ),
                ).toBe(true);
                await page.screenshot({
                    path: `docs/living-sky/${scene.name}-${theme}-blur-${blur}-390.png`,
                    fullPage: true,
                });
            }
    });
}
test("إعداد واحد فقط؛ كل درجات الضبابية فورية ومحفوظة والتحكم بلوحة المفاتيح", async ({
    page,
}) => {
    await setup(page);
    const d = await appearance(page),
        slider = d.getByRole("slider", { name: "ضبابية الخلفية", exact: true });
    await expect(slider).toHaveValue("12");
    await page.screenshot({ path: "docs/living-sky/appearance-390.png" });
    await expect(d.getByRole("slider")).toHaveCount(1);
    for (let i = 0; i <= 30; i++) {
        await slider.fill(String(i));
        await expect(page.locator(".sky-scene")).toHaveCSS(
            "filter",
            `blur(${i}px)`,
        );
        expect(
            await page.evaluate(() => localStorage.getItem("masar-sky-blur")),
        ).toBe(String(i));
    }
    await slider.focus();
    await slider.press("Home");
    await expect(slider).toHaveValue("0");
    await slider.press("End");
    await expect(slider).toHaveValue("30");
    await d.getByRole("button", { name: "تم", exact: true }).click();
    await page.reload();
    await expect(page.locator(".sky-scene")).toHaveCSS("filter", "blur(30px)");
    await expect(page.locator(".task-row").first()).toHaveCSS("filter", "none");
    await expect(page.locator(".home-project").first()).toHaveCSS(
        "filter",
        "none",
    );
});

test("الحدود ومنتصف الليل والوقت المحلي والعودة من الخلفية دون تغيير الثيم", async ({
    page,
}) => {
    await setup(page);
    await persisted(page, "light", 12);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const sky = page.locator(".living-sky");
    for (const [hour, minute, phase] of [
        [4, 59, "night"],
        [5, 0, "dawn"],
        [6, 59, "dawn"],
        [7, 0, "morning"],
        [10, 59, "morning"],
        [11, 0, "noon"],
        [14, 59, "noon"],
        [15, 0, "sunset"],
        [18, 59, "sunset"],
        [19, 0, "night"],
        [23, 59, "night"],
        [0, 0, "night"],
    ] as const) {
        await move(page, hour, minute);
        await expect(sky).toHaveAttribute("data-phase", phase);
        await expect(sky).toHaveAttribute(
            "data-minute",
            String(hour * 60 + minute),
        );
        await expect(page.locator("html")).toHaveAttribute(
            "data-theme",
            "light",
        );
    }
    // A visibility change catches elapsed local time even before the next minute timer.
    await page.clock.setSystemTime(new Date(iso(13, 23)));
    await page.evaluate(() =>
        document.dispatchEvent(new Event("visibilitychange")),
    );
    await expect(sky).toHaveAttribute("data-minute", "803");
    await page.clock.setSystemTime(new Date(iso(17, 31)));
    await page.evaluate(() => window.dispatchEvent(new Event("pageshow")));
    await expect(sky).toHaveAttribute("data-minute", "1051");
});
test("لا يوجد تحديث إطار مستمر، والتحديث بالدقيقة مستقل عن بيانات المهام", async ({
    page,
}) => {
    await setup(page);
    await page.clock.pauseAt(new Date(iso(9, 1)));
    await page.evaluate(() => {
        const sky = document.querySelector(".living-sky")!;
        (window as unknown as { skyChanges: number }).skyChanges = 0;
        new MutationObserver(() => {
            (window as unknown as { skyChanges: number }).skyChanges++;
        }).observe(sky, { subtree: true, attributes: true });
    });
    const before = await readStore(page, "tasks");
    await page.clock.runFor(59000);
    expect(
        await page.evaluate(
            () => (window as unknown as { skyChanges: number }).skyChanges,
        ),
    ).toBe(0);
    await page.clock.runFor(1000);
    await expect(page.locator(".living-sky")).toHaveAttribute(
        "data-minute",
        "542",
    );
    expect(
        await page.evaluate(
            () => (window as unknown as { skyChanges: number }).skyChanges,
        ),
    ).toBeGreaterThan(0);
    expect(await readStore(page, "tasks")).toEqual(before);
    // No work while hidden; on returning, update immediately rather than replaying minutes.
    await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", {
            configurable: true,
            value: "hidden",
        });
        document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.clock.fastForward(3600000);
    await expect(page.locator(".living-sky")).toHaveAttribute(
        "data-minute",
        "542",
    );
    await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", {
            configurable: true,
            value: "visible",
        });
        document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(page.locator(".living-sky")).toHaveAttribute(
        "data-minute",
        "602",
    );
});
test("تقليل الحركة يعرض الوقت الحالي دون انتقالات ويستجيب لتغييره أثناء التشغيل", async ({
    page,
}) => {
    await setup(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const selector of [
        ".sky-atmosphere",
        ".sky-sun",
        ".sky-moon",
        ".sky-stars",
    ])
        await expect(page.locator(selector).first()).toHaveCSS(
            "transition-duration",
            "0s",
        );
    await move(page, 23);
    await expect(page.locator(".sky-moon")).toHaveCSS("opacity", "1");
    await expect(page.locator(".sky-sun")).toHaveCSS("opacity", "0");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(page.locator(".sky-sun")).not.toHaveCSS(
        "transition-duration",
        "0s",
    );
});
test("القيم التالفة والتخزين المحجوب لا يعطلان التطبيق أو بقية إعدادات المظهر", async ({
    page,
}) => {
    await setup(page);
    for (const [value, expected] of [
        ["broken", 12],
        ["-20", 0],
        ["100", 30],
        ["", 12],
    ] as const) {
        await page.evaluate(
            (value) => localStorage.setItem("masar-sky-blur", value),
            value,
        );
        await page.reload();
        await expect(page.locator(".sky-scene")).toHaveCSS(
            "filter",
            `blur(${expected}px)`,
        );
    }
    await page.addInitScript(() => {
        Storage.prototype.getItem = () => {
            throw new DOMException("Blocked", "SecurityError");
        };
        Storage.prototype.setItem = () => {
            throw new DOMException("Blocked", "SecurityError");
        };
    });
    await page.reload();
    await expect(page.locator(".sky-scene")).toHaveCSS("filter", "blur(12px)");
    const d = await appearance(page);
    await d.getByRole("slider").fill("22");
    await expect(page.locator(".sky-scene")).toHaveCSS("filter", "blur(22px)");
});
test("المشهد لا يحجب النقر والإنجاز والتراجع والمشروع والقائمة والنوافذ والتمرير", async ({
    page,
}) => {
    await setup(page);
    await expect(page.locator(".living-sky")).toHaveCSS(
        "pointer-events",
        "none",
    );
    const selected = page.locator('[data-task-id="t0"]');
    await selected
        .getByRole("button", { name: "إكمال مراجعة خطة الأسبوع", exact: true })
        .click();
    await expect(page.locator(".home-today .task-main strong")).toHaveText([
        "ممارسة اللغة الإنجليزية",
        "ترتيب مساحة العمل",
        "قراءة عشر صفحات",
    ]);
    await page.getByRole("link", { name: "عرض الكل", exact: true }).click();
    await page
        .getByRole("button", {
            name: "إعادة فتح مراجعة خطة الأسبوع",
            exact: true,
        })
        .click();
    await expect(
        page.locator(".home-today .task-main strong").first(),
    ).toHaveText("مراجعة خطة الأسبوع");
    await chooseTaskToday(page, "قراءة عشر صفحات", false);
    await expect(page.locator('[data-task-id="t3"]')).toHaveCount(0);
    const before = await readStore(page, "tasks");
    await page
        .getByRole("button", {
            name: "إتمام الخطوة «قراءة الفصل الثاني»",
            exact: true,
        })
        .click();
    await expect
        .poll(
            async () =>
                (await readStore(page, "steps")).find((s) => s.id === "s1")!
                    .status,
        )
        .toBe("done");
    expect(await readStore(page, "tasks")).toEqual(before);
    await page
        .getByRole("button", { name: "إضافة سريعة", exact: true })
        .click();
    await expect(
        page.getByRole("dialog", { name: "ماذا تريد أن تضيف؟", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const rect = await page.locator(".living-sky").boundingBox();
    expect(rect!.y).toBe(0);
    expect(rect!.height).toBe(844);
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
        ),
    ).toBe(true);
    await page.goto("/#tasks");
    await expect(page.locator(".living-sky")).toHaveCount(1);
    await expect(page.locator(".app-shell")).toHaveClass(/living-app/);
    await expect(page.locator(".app-shell")).not.toHaveClass(/living-home/);
});
for (const width of [320, 390, 768, 1366])
    test(`RTL والثيمات الحالية والنوافذ والتمرير بعرض${width}`, async ({
        page,
    }) => {
        await page.setViewportSize({ width, height: 900 });
        await setup(page);
        for (const identity of ["green", "mono"])
            for (const theme of ["light", "dark"]) {
                const d = await appearance(page);
                await d
                    .getByLabel("الهوية", { exact: true })
                    .selectOption(identity);
                await d
                    .getByLabel("الوضع", { exact: true })
                    .selectOption(theme);
                await d
                    .getByRole("button", { name: "تم", exact: true })
                    .click();
                await expect(page.locator("html")).toHaveAttribute(
                    "dir",
                    "rtl",
                );
                await expect(page.locator("html")).toHaveAttribute(
                    "data-identity",
                    identity,
                );
                await expect(page.locator("html")).toHaveAttribute(
                    "data-theme",
                    theme,
                );
                expect(
                    await page.evaluate(
                        () =>
                            document.documentElement.scrollWidth <= innerWidth,
                    ),
                ).toBe(true);
                await page
                    .getByRole("button", {
                        name: "إجراءات المهمة «مراجعة خطة الأسبوع»",
                        exact: true,
                    })
                    .click();
                await expect(
                    page.getByRole("dialog").getByRole("button", {
                        name: "إزالة من مهامي اليوم",
                        exact: true,
                    }),
                ).toBeVisible();
                await page.keyboard.press("Escape");
                if (identity === "green")
                    await page.screenshot({
                        path: `docs/living-sky/responsive-${width}-${theme}.png`,
                        fullPage: true,
                    });
            }
    });
test("فحص إمكانية الوصول للفترات الخمس والثيمين والنموذج", async ({ page }) => {
    test.setTimeout(120000);
    await setup(page);
    const results = [];
    for (const theme of ["light", "dark"])
        for (const scene of scenes) {
            await move(page, scene.hour);
            await persisted(page, theme, 12);
            const result = await new AxeBuilder({ page })
                .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
                .analyze();
            results.push({
                theme,
                scene: scene.name,
                violations: result.violations,
            });
        }
    const d = await appearance(page);
    await expect(d.getByRole("slider")).toHaveAccessibleName("ضبابية الخلفية");
    results.push({
        theme: "dialog",
        scene: "controls",
        violations: (
            await new AxeBuilder({ page })
                .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
                .analyze()
        ).violations,
    });
    fs.writeFileSync(
        "docs/living-sky/accessibility.json",
        JSON.stringify(results, null, 2),
    );
    expect(results.flatMap((r) => r.violations)).toEqual([]);
});
test("حفظ إعداد الضبابية والثيم دون اتصال وبعد إعادة فتح الصفحة", async ({
    page,
    context,
}) => {
    await setup(page);
    const d = await appearance(page);
    await d.getByRole("slider").fill("27");
    await d.getByLabel("الوضع", { exact: true }).selectOption("dark");
    await d.getByRole("button", { name: "تم", exact: true }).click();
    await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect
        .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
        .toBe(true);
    const before = await readStore(page, "tasks");
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator(".sky-scene")).toHaveCSS("filter", "blur(27px)");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await readStore(page, "tasks")).toEqual(before);
    const other = await context.newPage();
    await other.clock.install({ time: new Date(iso(23)) });
    await other.goto("/#home");
    await expect(other.locator(".sky-scene")).toHaveCSS("filter", "blur(27px)");
    await expect(other.locator(".living-sky")).toHaveAttribute(
        "data-phase",
        "night",
    );
    await other.close();
    await context.setOffline(false);
});

test("قياس تباين النص فوق خلفية السماء الفعلية وليس التخمين من التدرج", async ({
    page,
}) => {
    test.setTimeout(180000);
    await setup(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const { execFileSync } = await import("node:child_process");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const directory = fs.mkdtempSync(join(tmpdir(), "masar-sky-contrast-"));
    const results = [];
    const times = Array.from({ length: 48 }, (_, i) => ({
        hour: Math.floor(i / 2),
        minute: (i % 2) * 30,
        name: `${Math.floor(i / 2)}:${i % 2 ? "30" : "00"}`,
    }));
    for (const empty of [false, true]) {
        if (empty) {
            await importData(page, {
                version: 2,
                exportedAt: new Date().toISOString(),
                projects: [],
                steps: [],
                tasks: [],
                ideas: [],
                events: [],
                taskCycles: [],
            });
            await page.goto("/#home");
        }
        for (const theme of ["light", "dark"]) {
            for (const scene of times) {
                await move(page, scene.hour, scene.minute);
                await persisted(page, theme, 12);
                await page.evaluate(
                    () =>
                        new Promise((resolve) =>
                            requestAnimationFrame(() =>
                                requestAnimationFrame(resolve),
                            ),
                        ),
                );
                const rows = await page.evaluate(() => {
                    const nodes = document.querySelectorAll<HTMLElement>(
                        ".compact-empty,.page-heading .eyebrow,.home-today>.section-heading h2,.home-today>.section-heading .text-btn,.home-today>.section-heading .count,.home-today .task-main strong,.home-today .task-due,.home-execution>.section-heading h2,.home-execution>.section-heading .text-btn,.resume-shortcut .small",
                    );
                    const seen = new Set<Node>();
                    const rows = [];
                    for (const node of nodes) {
                        node.classList.add("sky-contrast-probe");
                        const walker = document.createTreeWalker(
                            node,
                            NodeFilter.SHOW_TEXT,
                        );
                        while (walker.nextNode()) {
                            const text = walker.currentNode;
                            if (seen.has(text) || !text.textContent?.trim())
                                continue;
                            seen.add(text);
                            const range = document.createRange();
                            range.selectNodeContents(text);
                            const box = range.getBoundingClientRect();
                            if (
                                box.top < 64 ||
                                box.bottom > innerHeight - 154 ||
                                !box.width
                            )
                                continue;
                            const style = getComputedStyle(text.parentElement!);
                            const size = parseFloat(style.fontSize),
                                bold = parseInt(style.fontWeight) >= 700;
                            const rgb = style.color
                                .match(/[\d.]+/g)!
                                .slice(0, 3)
                                .map(Number);
                            rows.push({
                                label: text.textContent.trim().slice(0, 70),
                                rgb,
                                required:
                                    size >= 24 || (size >= 18.66 && bold)
                                        ? 3
                                        : 4.5,
                                rect: [
                                    box.left,
                                    box.top,
                                    box.right,
                                    box.bottom,
                                ],
                            });
                        }
                    }
                    return rows;
                });
                if (empty && scene.hour === 6 && scene.minute === 0)
                    await page.screenshot({
                        path: `docs/living-sky/empty-${theme}-390.png`,
                        fullPage: true,
                    });
                const hide = await page.addStyleTag({
                    content:
                        ".sky-contrast-probe,.sky-contrast-probe *{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important}",
                });
                const png = join(directory, "background.png"),
                    data = join(directory, "nodes.json");
                await page.screenshot({ path: png });
                fs.writeFileSync(data, JSON.stringify(rows));
                const measured = JSON.parse(
                    execFileSync(
                        "python3",
                        ["docs/living-sky/measure-contrast.py", png, data],
                        { encoding: "utf8" },
                    ),
                );
                results.push({
                    empty,
                    theme,
                    phase: scene.name,
                    rows: measured,
                });
                await hide.evaluate((node) =>
                    node.parentNode?.removeChild(node),
                );
                await page.evaluate(() =>
                    document
                        .querySelectorAll(".sky-contrast-probe")
                        .forEach((node) =>
                            node.classList.remove("sky-contrast-probe"),
                        ),
                );
            }
        }
    }
    fs.writeFileSync(
        "docs/living-sky/rendered-contrast.json",
        JSON.stringify(results, null, 2),
    );
    const failures = results.flatMap((result) =>
        result.rows
            .filter((row: { passes: boolean }) => !row.passes)
            .map((row: object) => ({
                empty: result.empty,
                theme: result.theme,
                phase: result.phase,
                ...row,
            })),
    );
    expect(failures).toEqual([]);
});
test("الخامة الاحتياطية تبقى مقروءة دون مرشح الخلفية — محاكاة قاعدة CSS البديلة", async ({
    page,
}) => {
    await setup(page);
    // Apply the exact fallback block even though this Chromium supports the feature.
    const fallback = await page.evaluate(() => {
        for (const sheet of document.styleSheets)
            for (const rule of sheet.cssRules) {
                if (
                    rule instanceof CSSSupportsRule &&
                    rule.conditionText.startsWith("not") &&
                    rule.cssText.includes("sky-glass")
                )
                    return [...rule.cssRules]
                        .map((rule) => rule.cssText)
                        .join("\n");
            }
        return "";
    });
    expect(fallback).toContain("var(--surface)");
    await page.addStyleTag({
        content:
            fallback +
            ".living-home :is(.sky-glass,.home-project,.recommendation-card){backdrop-filter:none;-webkit-backdrop-filter:none}",
    });
    const color = await page.evaluate(() =>
        getComputedStyle(document.documentElement)
            .getPropertyValue("--surface")
            .trim(),
    );
    expect(color).toBe("#fff");
    await expect(page.locator(".home-today .sky-glass")).toHaveCSS(
        "background-color",
        "rgb(255, 255, 255)",
    );
    await page
        .getByRole("button", { name: "إكمال مراجعة خطة الأسبوع", exact: true })
        .click();
    await expect(page.locator(".home-today .task-row")).toHaveCount(3);
});
test("فحص أداء التحكم بالضبابية وعدم تسرب مستمعي المشهد أو كتابة بيانات المهام", async ({
    page,
}) => {
    test.setTimeout(60000);
    await page.addInitScript(() => {
        const add = EventTarget.prototype.addEventListener,
            remove = EventTarget.prototype.removeEventListener;
        const listeners = new Map<string, Set<unknown>>();
        (
            window as unknown as { skyListenerCounts: () => object }
        ).skyListenerCounts = () =>
            Object.fromEntries(
                [...listeners].map(([key, set]) => [key, set.size]),
            );
        EventTarget.prototype.addEventListener = function (
            type,
            listener,
            options,
        ) {
            if (this === window || this === document) {
                const key = (this === window ? "window/" : "document/") + type;
                const set = listeners.get(key) ?? new Set();
                set.add(listener);
                listeners.set(key, set);
            }
            return add.call(this, type, listener, options);
        };
        EventTarget.prototype.removeEventListener = function (
            type,
            listener,
            options,
        ) {
            if (this === window || this === document)
                listeners
                    .get((this === window ? "window/" : "document/") + type)
                    ?.delete(listener);
            return remove.call(this, type, listener, options);
        };
    });
    await setup(page);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const d = await appearance(page),
        slider = d.getByRole("slider");
    const tasks = await readStore(page, "tasks"),
        steps = await readStore(page, "steps");
    const samples = [];
    for (const value of [0, 12, 30, 0, 12, 30, 0, 12, 30]) {
        const start = Date.now();
        await slider.fill(String(value));
        await expect(page.locator(".sky-scene")).toHaveCSS(
            "filter",
            `blur(${value}px)`,
        );
        await page.evaluate(
            () =>
                new Promise((resolve) =>
                    requestAnimationFrame(() => requestAnimationFrame(resolve)),
                ),
        );
        samples.push(Date.now() - start);
    }
    await d.getByRole("button", { name: "تم", exact: true }).click();
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    expect(await readStore(page, "tasks")).toEqual(tasks);
    expect(await readStore(page, "steps")).toEqual(steps);
    const initial = await page.evaluate(() =>
        (
            window as unknown as { skyListenerCounts: () => object }
        ).skyListenerCounts(),
    );
    for (let i = 0; i < 10; i++) {
        await page.locator('.navigation a[href="#tasks"]').click();
        await expect(page.locator(".living-sky")).toHaveCount(1);
        await page.locator('.navigation a[href="#home"]').click();
        await expect(page.locator(".living-sky")).toBeAttached();
        // Sky is persistent now, so its attachment no longer signals that
        // the Home route has committed and installed its passive effects.
        await expect(page.locator(".home-today")).toBeVisible();
    }
    await expect
        .poll(() =>
            page.evaluate(() =>
                (
                    window as unknown as { skyListenerCounts: () => object }
                ).skyListenerCounts(),
            ),
        )
        .toEqual(initial);
    const final = await page.evaluate(() =>
        (
            window as unknown as { skyListenerCounts: () => object }
        ).skyListenerCounts(),
    );
    fs.writeFileSync(
        "docs/living-sky/performance.json",
        JSON.stringify(
            {
                cpu_throttle: 4,
                blur_input_through_two_frames_ms: samples,
                maximum_ms: Math.max(...samples),
                listener_counts_before: initial,
                listener_counts_after: final,
                route_roundtrips: 10,
                task_and_step_data_unchanged: true,
            },
            null,
            2,
        ),
    );
    expect(final).toEqual(initial);
    expect(Math.max(...samples)).toBeLessThan(1000);
});
