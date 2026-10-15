import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { importData } from "../tests/browser/helpers.ts";
import { freezeDate } from "./qa-clock.mjs";
const directory = process.argv[2],
    out = process.argv[3];
const server = spawn(
    "python3",
    [
        "-m",
        "http.server",
        "4194",
        "--bind",
        "127.0.0.1",
        "--directory",
        directory,
    ],
    { stdio: "ignore" },
);
const base = "http://127.0.0.1:4194",
    since = "2026-10-01T00:00:00.000Z",
    instant = "2026-10-28T12:00:00.000Z";
let browser;
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
    const page = await browser.newPage({
            baseURL: base,
            viewport: { width: 390, height: 844 },
            isMobile: true,
            hasTouch: true,
            timezoneId: "UTC",
        }),
        errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await freezeDate(page, instant);
    await page.addInitScript(() => {
        window.__paceProbe = { reads: 0, writes: 0, longTasks: [] };
        const original = IDBDatabase.prototype.transaction;
        IDBDatabase.prototype.transaction = function (...args) {
            window.__paceProbe[args[1] === "readwrite" ? "writes" : "reads"]++;
            return original.apply(this, args);
        };
        new PerformanceObserver((list) =>
            window.__paceProbe.longTasks.push(
                ...list
                    .getEntries()
                    .map((e) => ({ start: e.startTime, duration: e.duration })),
            ),
        ).observe({ type: "longtask", buffered: true });
    });
    const common = {
            notes: "ملاحظات معيار الأداء",
            createdAt: since,
            updatedAt: instant,
        },
        count = 4000,
        workCount = count / 2;
    const work = Array.from({ length: workCount }, (_, n) => ({
        id: JSON.stringify(["p", n + 1]),
        projectId: "p",
        stepId: `s${n}`,
        order: n + 1,
        complete: true,
        at: `2026-10-${String(Math.floor(n / Math.ceil(workCount / 27)) + 1).padStart(2, "0")}T09:00:00.000Z`,
    }));
    const fixture = {
        version: 4,
        exportedAt: instant,
        projects: [
            {
                ...common,
                id: "p",
                title: "مشروع كثيف السجل",
                status: "active",
                archived: false,
            },
        ],
        steps: [
            {
                ...common,
                id: "stage",
                title: "محطة",
                kind: "stage",
                projectId: "p",
                parentId: null,
                order: 0,
                status: "doing",
                startedAt: since,
            },
            ...Array.from({ length: count }, (_, n) => ({
                ...common,
                id: `s${n}`,
                title: `خطوة ${n + 1}`,
                kind: "step",
                projectId: "p",
                parentId: "stage",
                order: n,
                status: n < workCount ? "done" : "todo",
                completedAt: work[n]?.at,
            })),
        ],
        tasks: [],
        ideas: [],
        events: [],
        taskCycles: [],
        projectProgress: [],
        projectTracking: [
            {
                projectId: "p",
                since: instant,
                initialPercent: 50,
                origin: "existing",
                lastOrder: 0,
            },
        ],
        projectPlans: [
            {
                projectId: "p",
                since,
                revision: 1,
                workOrder: workCount,
                pauses: [],
                goal: {
                    kind: "duration",
                    days: 60,
                    anchor: "2026-10-01",
                    targetDate: "2026-11-29",
                    deadline: "flexible",
                    timeZone: "UTC",
                },
            },
        ],
        stepWork: work,
        recommendations: [],
        paceSettings: [{ id: "pace", activeLimit: 3 }],
    };
    process.stderr.write("fixture import\n");
    await importData(page, fixture);
    await page.goto("/#project/p");
    await expect(page.getByLabel("وتيرة المشروع")).toContainText("2026-11-29");
    process.stderr.write("fixture ready\n");
    if (process.argv[5] === "without-has")
        await page.evaluate(() => {
            const prune = (rules) => {
                for (let i = rules.cssRules.length - 1; i >= 0; i--) {
                    const rule = rules.cssRules[i];
                    if (rule.selectorText?.includes(":has"))
                        rules.deleteRule(i);
                    else if (rule.cssRules) prune(rule);
                }
            };
            for (const sheet of document.styleSheets) prune(sheet);
        });
    if (process.argv[5] === "without-cv")
        await page.addStyleTag({
            content: ".hierarchy {content-visibility: visible !important;}",
        });
    if (process.argv[5] === "nonmodal")
        await page.evaluate(() => {
            HTMLDialogElement.prototype.showModal =
                HTMLDialogElement.prototype.show;
        });
    if (process.argv[5] === "autofocus")
        await page.evaluate(() => {
            const show = HTMLDialogElement.prototype.showModal;
            HTMLDialogElement.prototype.showModal = function () {
                this.setAttribute("autofocus", "");
                this.tabIndex = -1;
                show.call(this);
            };
        });
    const session = await page.context().newCDPSession(page),
        results = [];
    await session.send("Performance.enable");
    const profile = process.argv[4] === "profile";
    for (const cpu of profile ? [4] : [1, 4]) {
        await session.send("Emulation.setCPUThrottlingRate", { rate: cpu });
        for (const label of ["إعداد الهدف الزمني", "معاينة مستويات التسريع"]) {
            await page
                .locator(".project-pace")
                .getByRole("button", { name: label, exact: true })
                .scrollIntoViewIfNeeded();
            await page.waitForTimeout(200); // stabilize the imported fixture, before timing
            process.stderr.write(`measure ${cpu} ${label}\n`);
            for (let repeat = 0; repeat < (profile ? 1 : 5); repeat++) {
                const metricsBefore = (
                    await session.send("Performance.getMetrics")
                ).metrics;
                if (profile) {
                    await session.send("Profiler.enable");
                    await session.send("Profiler.start");
                }
                const sample = await page.evaluate(async (label) => {
                    const probe = window.__paceProbe,
                        reads = probe.reads,
                        writes = probe.writes;
                    const button = [
                        ...document.querySelectorAll("button"),
                    ].find((b) => b.textContent.trim() === label);
                    const start = performance.now();
                    button.click();
                    await new Promise((resolve, reject) => {
                        const deadline = setTimeout(
                            () =>
                                reject(
                                    new Error(
                                        `Dialog did not open: ${label}; disabled=${button.disabled}`,
                                    ),
                                ),
                            5000,
                        );
                        const paint = () => {
                            if (document.querySelector("dialog[open]"))
                                requestAnimationFrame(() => {
                                    clearTimeout(deadline);
                                    resolve();
                                });
                            else requestAnimationFrame(paint);
                        };
                        requestAnimationFrame(paint);
                    });
                    const end = performance.now();
                    return {
                        elapsed_ms: end - start,
                        reads: probe.reads - reads,
                        writes: probe.writes - writes,
                        long_tasks: probe.longTasks.filter(
                            (e) => e.start >= start && e.start < end,
                        ),
                    };
                }, label);
                const metricsAfter = (
                    await session.send("Performance.getMetrics")
                ).metrics;
                const metrics = Object.fromEntries(
                    metricsAfter
                        .filter((m) =>
                            [
                                "TaskDuration",
                                "ScriptDuration",
                                "LayoutDuration",
                                "RecalcStyleDuration",
                                "LayoutCount",
                                "RecalcStyleCount",
                                "Nodes",
                            ].includes(m.name),
                        )
                        .map((m) => [
                            m.name,
                            m.value -
                                (metricsBefore.find((b) => b.name === m.name)
                                    ?.value ?? 0),
                        ]),
                );
                if (profile) {
                    const { profile: cpuProfile } =
                        await session.send("Profiler.stop");
                    fs.writeFileSync(
                        out.replace(/\.json$/, `-${label}.cpuprofile`),
                        JSON.stringify(cpuProfile),
                    );
                }
                process.stderr.write(
                    JSON.stringify({ cpu, label, repeat, ...sample, metrics }) +
                        "\n",
                );
                results.push({ cpu, label, repeat, ...sample, metrics });
                await expect(page.locator("dialog[open]")).toBeVisible();
                await page
                    .locator("dialog[open]")
                    .getByRole("button", { name: "إغلاق", exact: true })
                    .click();
                await expect(page.locator("dialog[open]")).toHaveCount(0);
            }
        }
    }
    assert.deepEqual(errors, []);
    assert(results.every((r) => r.reads === 0 && r.writes === 0));
    const summary = (profile ? [4] : [1, 4]).flatMap((cpu) =>
        ["إعداد الهدف الزمني", "معاينة مستويات التسريع"].map((label) => {
            const rows = results.filter(
                    (r) => r.cpu === cpu && r.label === label,
                ),
                values = rows.map((r) => r.elapsed_ms).sort((a, b) => a - b);
            return {
                cpu,
                label,
                median_ms: values[Math.floor(values.length / 2)],
                max_ms: values.at(-1),
                long_tasks: rows.reduce(
                    (sum, r) => sum + r.long_tasks.length,
                    0,
                ),
            };
        }),
    );
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(
        out,
        JSON.stringify(
            {
                directory,
                steps: count,
                work_records: workCount,
                native_performance_clock: true,
                summary,
                results,
                errors,
            },
            null,
            2,
        ) + "\n",
    );
    console.log(JSON.stringify(summary));
} finally {
    await browser?.close();
    server.kill();
}
