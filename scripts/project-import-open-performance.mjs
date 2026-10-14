import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import assert from "node:assert/strict";
import { largeFixture, importData } from "../tests/browser/helpers.ts";
import { freezeDate } from "./qa-clock.mjs";
const label = process.argv[2] || "before";
const directory = process.argv[3] || "/tmp/masar-import-open-baseline";
const base = "http://127.0.0.1:4189";
const profile = process.argv[4] || "mobile";
const server = spawn(
    "python3",
    [
        "-m",
        "http.server",
        "4189",
        "--bind",
        "127.0.0.1",
        "--directory",
        directory,
    ],
    { stdio: "ignore" },
);
const out = process.argv[5] || "docs/project-import-open";
fs.mkdirSync(out, { recursive: true });
let browser;
const results = [];
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
    for (const dataset of ["empty", "large"])
        for (const cpu of [1, 4]) {
            const context = await browser.newContext({
                baseURL: base,
                viewport:
                    profile === "mobile"
                        ? { width: 390, height: 844 }
                        : { width: 1366, height: 900 },
                isMobile: profile === "mobile",
                hasTouch: profile === "mobile",
            });
            await context.addInitScript((mode) => {
                window.__importProbe = {
                    commits: [],
                    appRenders: [],
                    dialogFrame: null,
                    fileReads: [],
                    transactions: [],
                    reads: [],
                    writes: [],
                    clicks: [],
                    longTasks: [],
                    mutations: 0,
                    paintAfterClick: null,
                    resources: [],
                };
                const probe = window.__importProbe;
                window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
                    supportsFiber: true,
                    renderers: new Map(),
                    inject(renderer) {
                        const id = this.renderers.size + 1;
                        this.renderers.set(id, renderer);
                        return id;
                    },
                    onCommitFiberRoot(_renderer, root) {
                        probe.commits.push(performance.now());
                        let fiber = root.current.child;
                        for (
                            let depth = 0;
                            fiber && depth < 8;
                            depth++, fiber = fiber.child
                        ) {
                            if (fiber.tag === 0) {
                                if (fiber.flags & 1)
                                    probe.appRenders.push(performance.now());
                                break;
                            }
                        }
                    },
                    onCommitFiberUnmount() {},
                };
                const originalText = File.prototype.text;
                File.prototype.text = function (...args) {
                    probe.fileReads.push(performance.now());
                    return originalText.apply(this, args);
                };
                const originalTransaction = IDBDatabase.prototype.transaction;
                IDBDatabase.prototype.transaction = function (...args) {
                    probe.transactions.push(performance.now());
                    return originalTransaction.apply(this, args);
                };
                for (const prototype of [
                    IDBObjectStore.prototype,
                    IDBIndex.prototype,
                ])
                    for (const method of [
                        "get",
                        "getAll",
                        "getAllKeys",
                        "openCursor",
                        "openKeyCursor",
                        "count",
                        "add",
                        "put",
                        "delete",
                        "clear",
                    ]) {
                        const original = prototype[method];
                        if (typeof original !== "function") continue;
                        prototype[method] = function (...args) {
                            probe[
                                ["add", "put", "delete", "clear"].includes(
                                    method,
                                )
                                    ? "writes"
                                    : "reads"
                            ].push({
                                at: performance.now(),
                                store: this.objectStore?.name ?? this.name,
                                method,
                            });
                            return original.apply(this, args);
                        };
                    }
                new PerformanceObserver((list) => {
                    probe.longTasks.push(
                        ...list.getEntries().map((e) => ({
                            at: e.startTime,
                            duration: e.duration,
                        })),
                    );
                }).observe({ type: "longtask", buffered: true });
                addEventListener(
                    "click",
                    (event) => {
                        if (!event.target.closest?.(".project-import")) return;
                        probe.clicks.push({
                            at: performance.now(),
                            target: event.target.tagName,
                        });
                        if (probe.clicks.length === 1) {
                            let frames = 0;
                            const frame = () => {
                                probe.paintAfterClick ??= performance.now();
                                const dialog =
                                    document.querySelector("dialog[open]");
                                if (dialog?.getBoundingClientRect().height > 0)
                                    probe.dialogFrame = performance.now();
                                else if (mode !== "before" && ++frames < 4)
                                    requestAnimationFrame(frame);
                            };
                            requestAnimationFrame(frame);
                        }
                    },
                    true,
                );
                addEventListener("DOMContentLoaded", () =>
                    new MutationObserver((list) => {
                        probe.mutations += list.length;
                    }).observe(document.body, {
                        subtree: true,
                        childList: true,
                        characterData: true,
                        attributes: true,
                    }),
                );
                window.__resetImportProbe = () => {
                    for (const key of [
                        "commits",
                        "appRenders",
                        "fileReads",
                        "transactions",
                        "reads",
                        "writes",
                        "clicks",
                        "longTasks",
                    ])
                        probe[key].length = 0;
                    probe.mutations = 0;
                    probe.paintAfterClick = null;
                    probe.dialogFrame = null;
                    probe.resourceStart =
                        performance.getEntriesByType("resource").length;
                    probe.started = performance.now();
                };
            }, label);
            const page = await context.newPage();
            // Keep the periodic minute refresh outside the opening measurement.
            await freezeDate(page, "2026-10-14T09:00:00Z");
            const cdp = await context.newCDPSession(page);
            let fileChooserEvents = 0;
            cdp.on("Page.fileChooserOpened", () => fileChooserEvents++);
            if (dataset === "large") await importData(page, largeFixture());
            await page.goto("/#projects");
            assert.match(
                await page.evaluate(() => performance.now.toString()),
                /\[native code\]/,
            );
            await page.evaluate(
                async () => await navigator.serviceWorker.ready,
            );
            await page.reload();
            await expect(page.locator(".execution-current")).toHaveCount(
                dataset === "large" ? 20 : 0,
            );
            await expect(page.locator(".project-import")).toBeVisible();
            await expect(page.locator(".project-card")).toHaveCount(
                dataset === "large" ? 20 : 0,
            );
            await page.evaluate(
                () =>
                    new Promise((resolve) =>
                        requestAnimationFrame(() =>
                            requestAnimationFrame(resolve),
                        ),
                    ),
            );
            await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
            await cdp.send("Page.enable");
            await cdp.send("DOM.enable");
            await cdp.send("Page.setInterceptFileChooserDialog", {
                enabled: true,
            });
            for (let repetition = 0; repetition < 5; repetition++) {
                const chooserCountBefore = fileChooserEvents;
                await page.evaluate(() => window.__resetImportProbe());
                if (repetition === 0)
                    await cdp.send("Tracing.start", {
                        categories:
                            "devtools.timeline,v8.execute,blink.user_timing,disabled-by-default-devtools.timeline",
                        transferMode: "ReturnAsStream",
                    });
                const chooserTime =
                    label === "before"
                        ? new Promise((resolve, reject) => {
                              const timer = setTimeout(
                                  () =>
                                      reject(
                                          new Error(
                                              "File chooser event timeout",
                                          ),
                                      ),
                                  5000,
                              );
                              cdp.once(
                                  "Page.fileChooserOpened",
                                  async (event) => {
                                      clearTimeout(timer);
                                      resolve({
                                          event,
                                          at: await page.evaluate(() =>
                                              performance.now(),
                                          ),
                                      });
                                  },
                              );
                          })
                        : null;
                const opener =
                    label === "before"
                        ? page.locator(".project-import > label")
                        : page.getByRole("button", {
                              name: "استيراد مشروع",
                              exact: true,
                          });
                await opener[profile === "mobile" ? "tap" : "click"]();
                let boundary;
                if (label === "before") {
                    const chooser = await chooserTime;
                    boundary = chooser.at;
                    // CDP intercepts the native dialog; an empty selection is its cancel path.
                    await cdp.send("DOM.setFileInputFiles", {
                        backendNodeId: chooser.event.backendNodeId,
                        files: [],
                    });
                } else {
                    await expect(
                        page.getByRole("dialog", {
                            name: "استيراد مشروع",
                            exact: true,
                        }),
                    ).toBeVisible();
                    boundary = await page.evaluate(() => performance.now());
                }
                await page.evaluate(
                    () =>
                        new Promise((resolve) =>
                            requestAnimationFrame(() =>
                                requestAnimationFrame(resolve),
                            ),
                        ),
                );
                const probe = await page.evaluate(() => ({
                    ...window.__importProbe,
                    rendererCount:
                        window.__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers.size,
                    resourcesAfterClick: performance
                        .getEntriesByType("resource")
                        .slice(window.__importProbe.resourceStart)
                        .map((r) => ({
                            name: r.name,
                            initiatorType: r.initiatorType,
                        })),
                }));
                const start = probe.clicks[0].at;
                const tasks = probe.longTasks.filter(
                    (task) => task.at >= start,
                );
                results.push({
                    dataset,
                    cpu_slowdown: cpu,
                    repetition,
                    native_chooser_requests:
                        fileChooserEvents - chooserCountBefore,
                    boundary:
                        label === "before"
                            ? "native_file_chooser_requested"
                            : "application_import_dialog_visible",
                    click_to_boundary_ms: boundary - start,
                    click_to_next_frame_ms: probe.paintAfterClick - start,
                    click_to_dialog_frame_ms:
                        probe.dialogFrame === null
                            ? null
                            : probe.dialogFrame - start,
                    app_renders: probe.appRenders.filter((at) => at >= start)
                        .length,
                    file_reads: probe.fileReads.filter((at) => at >= start)
                        .length,
                    database_transactions: probe.transactions.filter(
                        (at) => at >= start,
                    ).length,
                    react_commits: probe.commits.filter((at) => at >= start)
                        .length,
                    instrumented_react_renderers: probe.rendererCount,
                    indexeddb_reads: probe.reads.filter(
                        (row) => row.at >= start,
                    ),
                    indexeddb_writes: probe.writes.filter(
                        (row) => row.at >= start,
                    ),
                    new_resources: probe.resourcesAfterClick,
                    long_tasks: tasks,
                    longest_task_ms: Math.max(
                        0,
                        ...tasks.map((t) => t.duration),
                    ),
                    dom_mutations: probe.mutations,
                });
                if (repetition === 0) {
                    const complete = new Promise((resolve) =>
                        cdp.once("Tracing.tracingComplete", resolve),
                    );
                    await cdp.send("Tracing.end");
                    const { stream } = await complete;
                    let trace = "";
                    while (true) {
                        const chunk = await cdp.send("IO.read", {
                            handle: stream,
                        });
                        trace += chunk.data;
                        if (chunk.eof) break;
                    }
                    await cdp.send("IO.close", { handle: stream });
                    fs.writeFileSync(
                        `${out}/${label}-${profile}-${dataset}-cpu${cpu}.trace.json`,
                        trace,
                    );
                }
                if (label !== "before")
                    await page
                        .getByRole("dialog", {
                            name: "استيراد مشروع",
                            exact: true,
                        })
                        .getByRole("button", { name: "إلغاء", exact: true })
                        .click();
            }
            await context.close();
        }
    const median = (values) =>
        [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    const summary = [];
    for (const dataset of ["empty", "large"])
        for (const cpu of [1, 4]) {
            const rows = results.filter(
                (r) => r.dataset === dataset && r.cpu_slowdown === cpu,
            );
            summary.push({
                dataset,
                cpu_slowdown: cpu,
                median_click_to_boundary_ms: median(
                    rows.map((r) => r.click_to_boundary_ms),
                ),
                median_click_to_next_frame_ms: median(
                    rows.map((r) => r.click_to_next_frame_ms),
                ),
                median_click_to_dialog_frame_ms:
                    label === "before"
                        ? null
                        : median(rows.map((r) => r.click_to_dialog_frame_ms)),
                app_renders: rows.reduce((n, r) => n + r.app_renders, 0),
                file_reads: rows.reduce((n, r) => n + r.file_reads, 0),
                database_transactions: rows.reduce(
                    (n, r) => n + r.database_transactions,
                    0,
                ),
                max_click_to_boundary_ms: Math.max(
                    ...rows.map((r) => r.click_to_boundary_ms),
                ),
                max_long_task_ms: Math.max(
                    ...rows.map((r) => r.longest_task_ms),
                ),
                native_chooser_requests: rows.reduce(
                    (n, r) => n + r.native_chooser_requests,
                    0,
                ),
                database_operations: rows.reduce(
                    (n, r) =>
                        n +
                        r.indexeddb_reads.length +
                        r.indexeddb_writes.length,
                    0,
                ),
                resource_requests: rows.reduce(
                    (n, r) => n + r.new_resources.length,
                    0,
                ),
                react_commits_per_click: rows.map((r) => r.react_commits),
            });
        }
    assert.equal(
        results.every((r) => r.instrumented_react_renderers > 0),
        true,
    );
    fs.writeFileSync(
        `${out}/${label}-${profile}.json`,
        JSON.stringify(
            {
                timestamp: new Date().toISOString(),
                source_build: directory,
                profile,
                viewport:
                    profile === "mobile"
                        ? { width: 390, height: 844 }
                        : { width: 1366, height: 900 },
                samples: results,
                summary,
                limitations: [
                    "Headless Chromium intercepts native file selection. Native OS picker display and the user-reported five-second delay cannot be measured on the user's device here.",
                    "Boundary timing includes the CDP/Playwright round trip; next-frame timing uses the in-page clock.",
                ],
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
