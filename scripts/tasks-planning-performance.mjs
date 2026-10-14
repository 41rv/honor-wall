import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { importData } from "../tests/browser/helpers.ts";
const directory =
    process.argv[2] || new URL("../build", import.meta.url).pathname;
const reportPath = process.argv[3] || "docs/planning/routes-performance.json";
const profiling = process.argv[4] === "profile";
const server = spawn(
    "python3",
    [
        "-m",
        "http.server",
        "4192",
        "--bind",
        "127.0.0.1",
        "--directory",
        directory,
    ],
    { stdio: "ignore" },
);
const baseURL = "http://127.0.0.1:4192",
    zone = "Asia/Riyadh",
    now = Date.now(),
    dayKey = (at) =>
        new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(
            new Date(at),
        );
const midnight = Date.parse(dayKey(now) + "T00:00:00+03:00"),
    day = 86400000,
    start = midnight - 90 * day;
const stamp = (at) => new Date(at).toISOString(),
    base = (id, title) => ({
        id,
        title,
        notes: "",
        createdAt: stamp(start),
        updatedAt: stamp(now),
    });
const projects = [],
    steps = [],
    projectProgress = [],
    projectTracking = [],
    tasks = [],
    taskCycles = [];
for (let p = 0; p < 100; p++) {
    const projectId = "p" + p;
    projects.push({
        ...base(projectId, "مشروع " + p),
        status: "active",
        archived: false,
    });
    for (let i = 0; i < 100; i++)
        steps.push({
            ...base(`s${p}-${i}`, "خطوة " + i),
            projectId,
            parentId: null,
            kind: "step",
            order: i,
            status: i < 80 ? "done" : "todo",
            ...(i < 80 ? { completedAt: stamp(start + (i + 1) * day) } : {}),
        });
    for (let i = 1; i <= 80; i++)
        projectProgress.push({
            id: JSON.stringify([projectId, i]),
            projectId,
            order: i,
            at: stamp(start + i * day),
            before: i - 1,
            after: i,
            reason: "completion",
        });
    projectTracking.push({
        projectId,
        since: stamp(start),
        origin: "new",
        initialPercent: 0,
        lastOrder: 80,
        lastProgressAt: stamp(start + 80 * day),
    });
}
for (let i = 0; i < 500; i++) {
    const id = "t" + i,
        task = {
            ...base(id, "مهمة " + i),
            status: i >= 100 && i < 200 ? "done" : "todo",
            priority: "important",
        };
    if (i < 100) {
        const first = midnight - 39 * day;
        Object.assign(task, {
            createdAt: stamp(first),
            scheduleSince: stamp(first),
            scheduleRevision: 1,
            scheduleCursor: stamp(midnight + day),
            schedule: {
                date: dayKey(first),
                timeZone: zone,
                repeat: "daily",
                leadDays: 1,
            },
        });
        for (let n = 0; n < 40; n++) {
            const at = first + n * day;
            taskCycles.push({
                id: JSON.stringify([id, 1, stamp(at)]),
                taskId: id,
                revision: 1,
                start: stamp(at),
                end: stamp(at + day),
                scheduledAt: stamp(at),
                timeZone: zone,
                status:
                    n === 39
                        ? "current"
                        : n % 2 === 0
                          ? "completed"
                          : "incomplete",
                ...(n < 39 && n % 2 === 0
                    ? { completedAt: stamp(at + 3600000) }
                    : {}),
            });
        }
    } else if (task.status === "done")
        task.completedAt = stamp(midnight + 3600000);
    if (i >= 200 && i < 250) task.today = { date: dayKey(now), timeZone: zone };
    tasks.push(task);
}
const fixture = {
    version: 3,
    exportedAt: stamp(now),
    projects,
    steps,
    tasks,
    ideas: [],
    events: [],
    taskCycles,
    projectProgress,
    projectTracking,
};
let browser;
const results = [],
    errors = [];
try {
    for (let i = 0; i < 40; i++) {
        try {
            if ((await fetch(baseURL)).ok) break;
        } catch {}
        await new Promise((r) => setTimeout(r, 100));
    }
    browser = await chromium.launch({
        executablePath: "/usr/bin/chromium",
        args: ["--no-sandbox"],
    });
    const context = await browser.newContext({
            baseURL,
            timezoneId: zone,
            viewport: { width: 1366, height: 900 },
        }),
        page = await context.newPage();
    page.on("pageerror", (err) => errors.push(err.message));
    await importData(page, fixture);
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    if (profiling) {
        await cdp.send("Profiler.enable");
        await cdp.send("Profiler.setSamplingInterval", { interval: 1000 });
    }
    await page.evaluate(() => {
        window.routeProbe = { tasks: [], start: 0 };
        new PerformanceObserver((list) => {
            for (const item of list.getEntries())
                window.routeProbe.tasks.push({
                    start: item.startTime,
                    duration: item.duration,
                });
        }).observe({ type: "longtask" });
    });
    for (const route of ["today", "calendar", "progress", "year"]) {
        if (route !== "year") await page.goto(baseURL + "/#tasks");
        if (profiling) await cdp.send("Profiler.start");
        await page.evaluate((route) => {
            window.routeProbe.start = performance.now();
            if (route === "year") {
                const button = [
                    ...document.querySelectorAll(
                        ".period-dashboard .tabs button",
                    ),
                ].find((el) => el.textContent === "سنوي");
                button.click();
            } else location.hash = route;
        }, route);
        if (route === "today")
            await expect(page.locator(".daily-planning .task-row")).toHaveCount(
                150,
            );
        if (route === "calendar")
            await expect(page.locator(".calendar-entry")).toHaveCount(700);
        if (route === "progress" || route === "year") {
            await expect(page.locator(".period-dashboard")).toBeVisible();
            await expect(
                page.locator('.period-dashboard [role="status"]'),
            ).toHaveCount(0);
            await expect(
                page.locator(".masar-insights svg path"),
            ).toHaveAttribute("d", /^M/);
            if (route === "year")
                await expect(
                    page
                        .locator(".period-metric")
                        .filter({ hasText: "المهام المنجزة" })
                        .locator("strong"),
                ).toHaveText("2100");
        }
        const result = await page.evaluate(async () => {
            await new Promise(requestAnimationFrame);
            const probe = window.routeProbe;
            return {
                settled_ms: performance.now() - probe.start,
                long_tasks: probe.tasks.filter((t) => t.start >= probe.start),
            };
        });
        results.push({ route, ...result });
        if (profiling) {
            const { profile } = await cdp.send("Profiler.stop");
            fs.mkdirSync(path.dirname(reportPath), { recursive: true });
            fs.writeFileSync(
                reportPath.replace(/\.json$/, `-${route}.cpuprofile`),
                JSON.stringify(profile),
            );
        }
    }
    expect(errors).toEqual([]);
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(
        reportPath,
        JSON.stringify(
            {
                timestamp: new Date().toISOString(),
                build: directory,
                cpu_slowdown: 4,
                projects: 100,
                steps: 10000,
                tasks: 500,
                cycles: 4000,
                progress_records: 8000,
                results,
                errors,
            },
            null,
            2,
        ) + "\n",
    );
    console.log(JSON.stringify(results, null, 2));
} finally {
    await browser?.close();
    server.kill();
}
