import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { sizedFixture, importData } from "../tests/browser/helpers.ts";

const label = process.argv[2] || "after";
const directory =
    process.argv[3] || new URL("../build", import.meta.url).pathname;
let identity = "green";
const baseURL = "http://127.0.0.1:4185";
const server = spawn(
    "python3",
    [
        "-m",
        "http.server",
        "4185",
        "--bind",
        "127.0.0.1",
        "--directory",
        directory,
    ],
    { stdio: "ignore" },
);
const output = `docs/ux/screenshots/${label}`;
fs.mkdirSync(output, { recursive: true });
const checks = [],
    accessibility = [],
    errors = [],
    screenshots = [];
let browser;
try {
    for (let i = 0; i < 40; i++) {
        try {
            if ((await fetch(baseURL)).ok) break;
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    browser = await chromium.launch({
        executablePath: "/usr/bin/chromium",
        args: ["--no-sandbox"],
    });
    const context = await browser.newContext({
        baseURL,
        timezoneId: "Asia/Riyadh",
        viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
    });
    const data = sizedFixture(10);
    const at = data.exportedAt;
    data.projects[0].title = "دليل الهوية العربية / Brand Guide";
    data.projects[0].notes =
        "تفاصيل المشروع محفوظة هنا. واجهة هادئة وخطوات واضحة.";
    data.steps[0].status = "doing";
    data.steps[0].startedAt = at;
    data.steps[0].title = "إعداد المسودة";
    data.steps[1].title = ("خطوة طويلة / " + "LongTitle".repeat(28)).slice(
        0,
        280,
    );
    for (const step of data.steps.slice(1, 4)) {
        step.status = "done";
        step.completedAt = at;
    }
    data.tasks[0].title = ("مهمة طويلة / " + "Design".repeat(44)).slice(0, 280);
    data.tasks[0].notes = "نص عربي وروابط https://example.com ومسودة محفوظة.";
    data.tasks[1].status = "done";
    data.tasks[1].completedAt = at;
    data.ideas[0].notes =
        "فكرة تستحق العودة إليها. English notes / العربية. ".repeat(10);
    await importData(page, data);
    const routes = [
        ["home", "home"],
        ["projects", "projects"],
        ["project", "project/p"],
        ["stage", "step/stage"],
        ["step", "step/s0"],
        ["tasks", "tasks"],
        ["task", "task/t0"],
        ["ideas", "ideas"],
        ["idea", "idea/idea"],
        ["progress", "progress"],
        ["backup", "backup"],
        ["search", "search"],
    ];
    const headings = {
        home: "مساحة هادئة. لإنجاز أكبر.",
        projects: "مشاريعك",
        project: data.projects[0].title,
        stage: data.steps[0].title,
        step: data.steps[1].title,
        tasks: "مهامك",
        task: data.tasks[0].title,
        ideas: "مساحة الأفكار",
        idea: data.ideas[0].title,
        progress: "كل خطوة تصنع فرقًا",
        backup: "بياناتك في أمان",
    };
    async function inspect(name, width, theme) {
        const result = await page.evaluate(() => {
            const visible = (element) => {
                const r = element.getBoundingClientRect();
                return (
                    r.width > 0 &&
                    r.height > 0 &&
                    getComputedStyle(element).visibility !== "hidden"
                );
            };
            const smallTargets = [
                ...document.querySelectorAll(
                    "button, summary, .navigation a, select",
                ),
            ]
                .filter((element) => visible(element) && !element.disabled)
                .map((element) => ({
                    label:
                        element.getAttribute("aria-label") ||
                        element.textContent.trim().slice(0, 60),
                    width: element.getBoundingClientRect().width,
                    height: element.getBoundingClientRect().height,
                }))
                .filter(
                    (element) => element.width < 43.5 || element.height < 43.5,
                );
            const viewport = window.innerWidth;
            const horizontalOverflow =
                document.documentElement.scrollWidth > viewport + 1;
            const outOfBounds = [
                ...document.querySelectorAll(
                    "h1, .surface, .project-card, .idea-card, dialog[open]",
                ),
            ]
                .filter(
                    (element) =>
                        visible(element) &&
                        (element.getBoundingClientRect().right > viewport + 1 ||
                            element.getBoundingClientRect().left < -1),
                )
                .map((element) => element.className || element.tagName);
            return {
                horizontalOverflow,
                documentWidth: document.documentElement.scrollWidth,
                direction: getComputedStyle(document.documentElement).direction,
                outOfBounds,
                smallTargets,
            };
        });
        checks.push({ screen: name, width, identity, theme, ...result });
        if (
            width === 390 ||
            (width === 1366 &&
                [
                    "home",
                    "project",
                    "progress",
                    "context",
                    "appearance",
                ].includes(name))
        ) {
            const path = `${output}/${name}-${identity}-${theme}-${width}.png`;
            await page.screenshot({
                path,
                fullPage: [
                    "home",
                    "projects",
                    "progress",
                    "backup",
                    "empty-tasks",
                ].includes(name),
            });
            screenshots.push(path);
        }
        if (width === 390 && !name.startsWith("empty")) {
            const result = await new AxeBuilder({ page })
                .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
                .analyze();
            accessibility.push({
                screen: name,
                width,
                theme,
                identity,
                violations: result.violations.map((v) => ({
                    id: v.id,
                    impact: v.impact,
                    help: v.help,
                    nodes: v.nodes.map((n) => ({
                        target: n.target,
                        summary: n.failureSummary,
                    })),
                })),
            });
        }
    }
    for (const width of [360, 390, 430, 768, 1366]) {
        await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
        for (const [value, theme] of [
            ["green", "light"],
            ["green", "dark"],
            ["mono", "light"],
            ["mono", "dark"],
        ]) {
            identity = value;
            await page.evaluate(
                ({ theme, identity }) => {
                    localStorage.setItem("masar-theme", theme);
                    localStorage.setItem("masar-identity", identity);
                },
                { theme, identity },
            );
            await page.reload();
            for (const [name, route] of routes) {
                if (name === "search") {
                    await page.goto("/#home");
                    await page.getByLabel("بحث شامل").fill("English notes");
                    await page.locator(".search-result").waitFor();
                } else {
                    await page.goto("/#" + route);
                    await expect(
                        page.getByRole("heading", { level: 1 }),
                    ).toHaveText(headings[name]);
                }
                if (name === "tasks")
                    await page.locator(".completed-list summary").click();
                await page.evaluate(async () => await document.fonts.ready);
                await inspect(name, width, theme);
            }
            await page.goto("/#tasks");
            if (width === 390) {
                await page.goto("/#project/p");
                await page.locator(".hierarchy").scrollIntoViewIfNeeded();
                const path = `${output}/hierarchy-${identity}-${theme}-390.png`;
                await page.screenshot({ path });
                screenshots.push(path);
                await page.goto("/#tasks");
            }
            await page
                .getByRole("button", { name: "مهمة جديدة", exact: true })
                .click();
            await page
                .getByRole("dialog")
                .getByLabel("الاسم", { exact: true })
                .fill("مهمة في النافذة");
            await inspect("dialog", width, theme);
            await page
                .getByRole("dialog")
                .getByRole("button", { name: "إلغاء", exact: true })
                .click();
            await page.getByRole("button", { name: "المظهر والألوان" }).click();
            await page
                .getByRole("dialog")
                .getByLabel("الهوية", { exact: true })
                .waitFor();
            await inspect("appearance", width, theme);
            await page
                .getByRole("dialog")
                .getByRole("button", { name: "تم", exact: true })
                .click();
            await page.goto("/#projects");
            await page.locator('[data-project-id="p"] .item-actions').click();
            await page.getByRole("dialog").waitFor();
            await inspect("context", width, theme);
            await page
                .getByRole("dialog")
                .getByRole("button", { name: "إغلاق", exact: true })
                .click();
        }
        console.log("Reviewed viewport:", width);
    }
    const emptyContext = await browser.newContext({
        baseURL,
        timezoneId: "Asia/Riyadh",
        viewport: { width: 390, height: 844 },
    });
    const emptyPage = await emptyContext.newPage();
    emptyPage.on("pageerror", (error) => errors.push(error.message));
    emptyPage.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
    });
    for (const [value, theme] of [
        ["green", "light"],
        ["green", "dark"],
        ["mono", "light"],
        ["mono", "dark"],
    ]) {
        identity = value;
        await emptyPage.goto("/");
        await emptyPage.evaluate(
            ({ theme, identity }) => {
                localStorage.setItem("masar-theme", theme);
                localStorage.setItem("masar-identity", identity);
            },
            { theme, identity },
        );
        await emptyPage.reload();
        for (const route of [
            "home",
            "projects",
            "tasks",
            "ideas",
            "progress",
        ]) {
            await emptyPage.goto("/#" + route);
            await emptyPage.getByRole("heading", { level: 1 }).waitFor();
            await emptyPage.evaluate(async () => await document.fonts.ready);
            const path = `${output}/empty-${route}-${identity}-${theme}-390.png`;
            await emptyPage.screenshot({ path, fullPage: true });
            screenshots.push(path);
            checks.push({
                screen: "empty-" + route,
                width: 390,
                theme,
                horizontalOverflow: await emptyPage.evaluate(
                    () => document.documentElement.scrollWidth > innerWidth + 1,
                ),
            });
        }
    }
    const result = {
        timestamp: new Date().toISOString(),
        label,
        checks,
        accessibility,
        screenshots,
        errors,
    };
    fs.writeFileSync(
        `docs/ux/visual-${label}.json`,
        JSON.stringify(result, null, 2) + "\n",
    );
    console.log(
        JSON.stringify({
            screens: checks.length,
            screenshots: screenshots.length,
            overflow: checks
                .filter((c) => c.horizontalOverflow)
                .map((c) => [c.screen, c.width, c.theme]),
            axeViolationGroups: accessibility.reduce(
                (sum, a) => sum + a.violations.length,
                0,
            ),
            smallTargets: checks.filter((c) => c.smallTargets?.length).length,
            errors,
        }),
    );
    expect(errors).toEqual([]);
    if (label === "after") {
        expect(
            checks.filter((c) => c.horizontalOverflow || c.outOfBounds?.length),
        ).toEqual([]);
        expect(accessibility.filter((a) => a.violations.length)).toEqual([]);
        expect(checks.filter((c) => c.smallTargets?.length)).toEqual([]);
    }
} finally {
    await browser?.close();
    server.kill();
}
