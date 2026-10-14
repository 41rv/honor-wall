import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { importData } from "../tests/browser/helpers.ts";
const label = process.argv[2] || "after";
const directory = process.argv[3] || "build";
const reportPath = process.argv[4] || `docs/tasks/performance-${label}.json`;
const base = "http://127.0.0.1:4190";
const server = spawn(
    "python3",
    [
        "-m",
        "http.server",
        "4190",
        "--bind",
        "127.0.0.1",
        "--directory",
        directory,
    ],
    { stdio: "ignore" },
);
const results = [];
let browser;
function fixture(count, repeat) {
    const at = new Date().toISOString();
    const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Riyadh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date());
    const end = new Date(today + "T00:00:00+03:00");
    end.setUTCDate(end.getUTCDate() + 1);
    const tasks = Array.from({ length: count }, (_, i) => ({
        id: "t" + i,
        title: "مهمة " + i,
        notes: "",
        createdAt: at,
        updatedAt: at,
        status: i === 0 && !repeat ? "done" : "todo",
        ...(i === 0 && !repeat ? { completedAt: at } : {}),
        ...(repeat
            ? {
                  schedule: {
                      date: today,
                      repeat: "daily",
                      leadDays: 1,
                      timeZone: "Asia/Riyadh",
                  },
                  scheduleRevision: 1,
                  scheduleSince: at,
                  scheduleCursor: end.toISOString(),
              }
            : {}),
    }));
    const taskCycles = repeat
        ? tasks.map((t, i) => ({
              id: JSON.stringify([t.id, 1, at]),
              taskId: t.id,
              revision: 1,
              start: at,
              end: end.toISOString(),
              scheduledAt: new Date(today + "T00:00:00+03:00").toISOString(),
              timeZone: "Asia/Riyadh",
              status: i === 0 ? "completed" : "current",
              ...(i === 0 ? { completedAt: at } : {}),
          }))
        : [];
    return {
        version: label === "before" ? 1 : 2,
        exportedAt: at,
        projects: [],
        steps: [],
        tasks,
        ideas: [],
        events: [],
        ...(label === "after" ? { taskCycles } : {}),
    };
}
try {
    for (let i = 0; i < 40; i++) {
        try {
            if ((await fetch(base)).ok) break;
        } catch {}
        await new Promise((r) => setTimeout(r, 100));
    }
    browser = await chromium.launch({
        executablePath: "/usr/bin/chromium",
        args: ["--no-sandbox"],
    });
    for (const count of [10, 100, 500])
        for (const cpu of [1, 4])
            for (const repeat of label === "after" ? [false, true] : [false]) {
                const context = await browser.newContext({
                    baseURL: base,
                    viewport: { width: 1366, height: 900 },
                    timezoneId: "Asia/Riyadh",
                });
                const page = await context.newPage();
                page.setDefaultTimeout(10000);
                const errors = [];
                page.on("pageerror", (err) => errors.push(err.message));
                try {
                    await importData(page, fixture(count, repeat));
                } catch (err) {
                    console.log(await page.locator("body").innerText());
                    throw err;
                }
                await page.goto("/#tasks");
                await page.evaluate(
                    async () => await navigator.serviceWorker.ready,
                );
                await page.reload();
                await expect(page.locator(".task-row")).toHaveCount(count);
                await expect(
                    page.locator(".completed-list summary .count"),
                ).toHaveText("1");
                await page.evaluate(
                    () =>
                        new Promise((r) =>
                            requestAnimationFrame(() =>
                                requestAnimationFrame(r),
                            ),
                        ),
                );
                const cdp = await context.newCDPSession(page);
                await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
                for (let sample = 0; sample < 5; sample++) {
                    if (!(await page.locator(".heading-add").count())) {
                        await page
                            .getByRole("button", {
                                name: "إضافة سريعة",
                                exact: true,
                            })
                            .click();
                        await expect(
                            page.getByRole("dialog", {
                                name: "ماذا تريد أن تضيف؟",
                                exact: true,
                            }),
                        ).toBeVisible();
                    }
                    await page.evaluate(() => {
                        window.__formProbe = {
                            start: 0,
                            visible: null,
                            longTasks: [],
                        };
                        window.__formObserver = new PerformanceObserver(
                            (list) =>
                                window.__formProbe.longTasks.push(
                                    ...list.getEntries().map((e) => ({
                                        start: e.startTime,
                                        duration: e.duration,
                                    })),
                                ),
                        );
                        window.__formObserver.observe({ type: "longtask" });
                        window.__formClick = () => {
                            const p = window.__formProbe;
                            p.start = performance.now();
                            const frame = () => {
                                const dialog = document.querySelector(
                                    "dialog[open]:has(form)",
                                );
                                if (dialog?.getBoundingClientRect().height)
                                    p.visible = performance.now() - p.start;
                                else requestAnimationFrame(frame);
                            };
                            requestAnimationFrame(frame);
                        };
                        const target =
                            document.querySelector(".heading-add") ??
                            [
                                ...document.querySelectorAll(
                                    ".add-menu button",
                                ),
                            ].find(
                                (b) => b.textContent.trim() === "مهمة جديدة",
                            );
                        target.addEventListener("click", window.__formClick, {
                            once: true,
                        });
                    });
                    await page
                        .getByRole("button", {
                            name: "مهمة جديدة",
                            exact: true,
                        })
                        .click();
                    await expect(page.getByRole("dialog")).toBeVisible();
                    await page.evaluate(
                        () =>
                            new Promise((r) =>
                                requestAnimationFrame(() =>
                                    requestAnimationFrame(r),
                                ),
                            ),
                    );
                    const probe = await page.evaluate(() => {
                        window.__formObserver.disconnect();
                        return window.__formProbe;
                    });
                    results.push({
                        count,
                        cpu_slowdown: cpu,
                        recurring_tasks: repeat,
                        sample,
                        open_form_ms: probe.visible,
                        long_tasks: probe.longTasks.filter(
                            (t) => t.start >= probe.start,
                        ),
                    });
                    await page
                        .getByRole("dialog")
                        .getByRole("button", { name: "إلغاء", exact: true })
                        .click();
                }
                if (errors.length) throw new Error(errors.join("\n"));
                await context.close();
            }
    const median = (a) =>
        [...a].sort((a, b) => a - b)[Math.floor(a.length / 2)];
    const summary = [];
    for (const count of [10, 100, 500])
        for (const cpu of [1, 4])
            for (const repeat of label === "after" ? [false, true] : [false]) {
                const rows = results.filter(
                    (r) =>
                        r.count === count &&
                        r.cpu_slowdown === cpu &&
                        r.recurring_tasks === repeat,
                );
                summary.push({
                    count,
                    cpu_slowdown: cpu,
                    recurring_tasks: repeat,
                    median_open_form_ms: median(
                        rows.map((r) => r.open_form_ms),
                    ),
                    maximum_open_form_ms: Math.max(
                        ...rows.map((r) => r.open_form_ms),
                    ),
                    longest_task_ms: Math.max(
                        0,
                        ...rows.flatMap((r) =>
                            r.long_tasks.map((t) => t.duration),
                        ),
                    ),
                });
            }
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(
        reportPath,
        JSON.stringify(
            {
                timestamp: new Date().toISOString(),
                build: directory,
                samples: results,
                summary,
            },
            null,
            2,
        ) + "\n",
    );
    console.log(JSON.stringify(summary, null, 2));
} finally {
    await browser?.close();
    server.kill();
}
