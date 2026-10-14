import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import {
    sizedFixture,
    importData,
    readStore,
} from "../tests/browser/helpers.ts";

const label = process.argv[2] || "after";
const directory =
    process.argv[3] || new URL("../build", import.meta.url).pathname;
const base = "http://127.0.0.1:4187";
const server = spawn(
    "python3",
    [
        "-m",
        "http.server",
        "4187",
        "--bind",
        "127.0.0.1",
        "--directory",
        directory,
    ],
    { stdio: "ignore" },
);
let browser;
const samples = [];
const errors = [];
try {
    for (let i = 0; i < 40; i++) {
        try {
            if ((await fetch(base)).ok) break;
        } catch {
            // Retry while the local test server starts.
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    browser = await chromium.launch({
        executablePath: "/usr/bin/chromium",
        args: ["--no-sandbox"],
    });
    const context = await browser.newContext({
        baseURL: base,
        viewport: { width: 1366, height: 900 },
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
    });
    async function measure(name, count, repetition, options) {
        const result = await page.evaluate(async (opts) => {
            const originalPut = IDBObjectStore.prototype.put;
            const originalAdd = IDBObjectStore.prototype.add;
            const started = performance.now();
            let visual = null,
                saved = opts.store ? null : undefined;
            let painting = false;
            const results = await new Promise((resolve, reject) => {
                const finish = () => {
                    if (visual !== null && saved !== null) {
                        clearTimeout(timer);
                        observer.disconnect();
                        resolve({ visual_ms: visual, save_ms: saved ?? null });
                    }
                };
                const ready = () => {
                    if (opts.ready === "pressed")
                        return (
                            document
                                .querySelector(opts.readySelector)
                                ?.getAttribute("aria-pressed") ===
                            String(opts.pressed)
                        );
                    if (opts.ready === "project")
                        return (
                            document.querySelector("h1")?.textContent ===
                                opts.title &&
                            document.querySelectorAll(".tree-row").length ===
                                opts.rows
                        );
                    if (opts.ready === "detail")
                        return (
                            document.querySelector("h1")?.textContent ===
                                opts.title &&
                            document.querySelector(".timeline")
                        );
                    if (opts.ready === "added")
                        return (
                            !document.querySelector("dialog") &&
                            [
                                ...document.querySelectorAll(
                                    ".task-main strong",
                                ),
                            ].some((el) => el.textContent === opts.title)
                        );
                    if (opts.ready === "search")
                        return (
                            document.querySelector(".search-result strong")
                                ?.textContent === opts.title
                        );
                    if (opts.ready === "dashboard")
                        return (
                            document.querySelector("h1")?.textContent ===
                                "كل خطوة تصنع فرقًا" &&
                            [...document.querySelectorAll(".stat-card")].some(
                                (el) =>
                                    el.textContent.includes(
                                        "منجز آخر ٧ أيام",
                                    ) &&
                                    el.querySelector("strong")?.textContent ===
                                        "1",
                            )
                        );
                    return false;
                };
                const observer = new MutationObserver(() => {
                    if (!painting && ready()) {
                        painting = true;
                        requestAnimationFrame(() => {
                            visual = performance.now() - started;
                            finish();
                        });
                    }
                });
                observer.observe(document.body, {
                    subtree: true,
                    attributes: true,
                    childList: true,
                    characterData: true,
                });
                const wrap = (original) =>
                    function (value, ...args) {
                        if (
                            this.name === opts.store &&
                            (opts.id
                                ? value.id === opts.id
                                : value.title === opts.title) &&
                            (!opts.status || value.status === opts.status)
                        ) {
                            this.transaction.addEventListener(
                                "complete",
                                () => {
                                    if (saved === null)
                                        saved = performance.now() - started;
                                    finish();
                                },
                                { once: true },
                            );
                        }
                        return original.call(this, value, ...args);
                    };
                IDBObjectStore.prototype.put = wrap(originalPut);
                IDBObjectStore.prototype.add = wrap(originalAdd);
                const timer = setTimeout(() => {
                    observer.disconnect();
                    reject(
                        new Error(
                            "Measurement timed out: " + JSON.stringify(opts),
                        ),
                    );
                }, 10000);
                if (opts.action === "navigate") location.hash = opts.hash;
                if (opts.action === "click")
                    document.querySelector(opts.selector).click();
                if (opts.action === "submit")
                    document.querySelector("dialog form").requestSubmit();
                if (opts.action === "search") {
                    const input = document.querySelector(
                        '[aria-label="بحث شامل"]',
                    );
                    Object.getOwnPropertyDescriptor(
                        HTMLInputElement.prototype,
                        "value",
                    ).set.call(input, opts.query);
                    input.dispatchEvent(new Event("input", { bubbles: true }));
                }
                if (opts.action === "step-dashboard") {
                    document.querySelector(opts.selector).click();
                    location.hash = "#progress";
                }
            }).finally(() => {
                IDBObjectStore.prototype.put = originalPut;
                IDBObjectStore.prototype.add = originalAdd;
            });
            return results;
        }, options);
        samples.push({ steps: count, operation: name, repetition, ...result });
    }
    for (const count of [10, 100, 500]) {
        for (let repetition = 1; repetition <= 3; repetition++) {
            await importData(page, sizedFixture(count));
            await page.goto("/#tasks");
            await page
                .getByRole("button", { name: "إكمال مهمة 0", exact: true })
                .waitFor();
            await measure("task_complete", count, repetition, {
                action: "click",
                selector: '[aria-label="إكمال مهمة 0"]',
                ready: "pressed",
                readySelector: '[aria-label="إعادة فتح مهمة 0"]',
                pressed: true,
                store: "tasks",
                id: "t0",
                status: "done",
            });
            await expect
                .poll(
                    async () =>
                        (await readStore(page, "tasks")).find(
                            (t) => t.id === "t0",
                        ).status,
                )
                .toBe("done");
            await measure("task_reopen", count, repetition, {
                action: "click",
                selector: '[aria-label="إعادة فتح مهمة 0"]',
                ready: "pressed",
                readySelector: '[aria-label="إكمال مهمة 0"]',
                pressed: false,
                store: "tasks",
                id: "t0",
                status: "todo",
            });
            await expect
                .poll(
                    async () =>
                        (await readStore(page, "tasks")).find(
                            (t) => t.id === "t0",
                        ).status,
                )
                .toBe("todo");
            await measure("project_open", count, repetition, {
                action: "navigate",
                hash: "#project/p",
                ready: "project",
                title: `مشروع ${count} خطوة`,
                rows: count + 1,
            });
            await measure("step_open", count, repetition, {
                action: "navigate",
                hash: "#step/s0",
                ready: "detail",
                title: "خطوة 0",
            });
            await page.goto("/#tasks");
            await page
                .getByRole("button", { name: "مهمة جديدة", exact: true })
                .click();
            const title = `إضافة قياس ${count} ${repetition}`;
            await page
                .getByRole("dialog")
                .getByLabel("الاسم", { exact: true })
                .fill(title);
            await measure("task_add", count, repetition, {
                action: "submit",
                ready: "added",
                title,
                store: "tasks",
            });
            await measure("search", count, repetition, {
                action: "search",
                ready: "search",
                title: `خطوة ${count - 1}`,
                query: `خطوة ${count - 1}`,
            });
            await page.goto("/#project/p");
            await page
                .getByRole("button", {
                    name: "إتمام الخطوة «خطوة 0»",
                    exact: true,
                })
                .waitFor();
            await measure("step_and_dashboard", count, repetition, {
                action: "step-dashboard",
                selector: '[aria-label="إتمام الخطوة «خطوة 0»"]',
                ready: "dashboard",
                store: "steps",
                id: "s0",
                status: "done",
            });
            await expect
                .poll(
                    async () =>
                        (await readStore(page, "steps")).find(
                            (t) => t.id === "s0",
                        ).status,
                )
                .toBe("done");
            if (label === "after") {
                await page.goto("/#home");
                await page
                    .locator(
                        '.execution-recent [data-completion-key="step/s0"]',
                    )
                    .waitFor();
                await measure("home_step_reopen", count, repetition, {
                    action: "click",
                    selector:
                        '.execution-recent [data-completion-key="step/s0"]',
                    ready: "pressed",
                    readySelector: '[data-completion-key="step/s0"]',
                    pressed: false,
                    store: "steps",
                    id: "s0",
                    status: "todo",
                });
                await expect(
                    page.locator(".execution-current"),
                ).toHaveAttribute("data-execution-id", "s0");
                await measure("home_step_complete", count, repetition, {
                    action: "click",
                    selector:
                        '.execution-current [data-completion-key="step/s0"]',
                    ready: "pressed",
                    readySelector: '[data-completion-key="step/s0"]',
                    pressed: true,
                    store: "steps",
                    id: "s0",
                    status: "done",
                });
                await expect(
                    page.locator(".execution-current"),
                ).toHaveAttribute("data-execution-id", "s1");
                await measure("home_task_complete", count, repetition, {
                    action: "click",
                    selector: '[aria-label="إكمال مهمة 0"]',
                    ready: "pressed",
                    readySelector: '[aria-label="إعادة فتح مهمة 0"]',
                    pressed: true,
                    store: "tasks",
                    id: "t0",
                    status: "done",
                });
                await expect(
                    page.locator('[aria-label="مهامك الآن"] .home-recent'),
                ).toHaveAttribute("open", "");
                await measure("home_task_reopen", count, repetition, {
                    action: "click",
                    selector: '[aria-label="إعادة فتح مهمة 0"]',
                    ready: "pressed",
                    readySelector: '[aria-label="إكمال مهمة 0"]',
                    pressed: false,
                    store: "tasks",
                    id: "t0",
                    status: "todo",
                });
                await expect
                    .poll(
                        async () =>
                            (await readStore(page, "tasks")).find(
                                (task) => task.id === "t0",
                            ).status,
                    )
                    .toBe("todo");
            }
        }
        console.log("Measured project:", count, "steps");
    }
    expect(errors).toEqual([]);
    const summary = [];
    for (const count of [10, 100, 500])
        for (const operation of new Set(samples.map((s) => s.operation))) {
            const group = samples.filter(
                (s) => s.steps === count && s.operation === operation,
            );
            const median = (key) => {
                const values = group
                    .map((s) => s[key])
                    .filter((value) => value !== null)
                    .sort((a, b) => a - b);
                return values.length
                    ? Math.round(values[Math.floor(values.length / 2)] * 10) /
                          10
                    : null;
            };
            summary.push({
                steps: count,
                operation,
                visual_ms_median: median("visual_ms"),
                save_ms_median: median("save_ms"),
            });
        }
    fs.mkdirSync("docs/ux", { recursive: true });
    const output = {
        label,
        timestamp: new Date().toISOString(),
        browser: await browser.version(),
        viewport: "1366x900",
        cpu_throttle: 1,
        samples_per_operation: 3,
        measurement:
            "In-page performance.now from dispatched DOM action to observed DOM state at requestAnimationFrame; save to IndexedDB transaction complete. No Playwright auto-wait overhead.",
        errors,
        samples,
        summary,
    };
    fs.writeFileSync(
        `docs/ux/performance-${label}.json`,
        JSON.stringify(output, null, 2) + "\n",
    );
    console.log(JSON.stringify(summary));
} finally {
    await browser?.close();
    server.kill();
}
