import { appUrl } from "./url";
import { navigateView } from "./helpers";
import { test, expect, type Page } from "@playwright/test";
import { importData, sizedFixture, readStore } from "./helpers";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const output = "docs/internal-controls";
const before = process.env.MASAR_INTERNAL_STAGE === "before";
fs.mkdirSync(output, { recursive: true });
test.use({ timezoneId: "Asia/Riyadh", hasTouch: true });
const runtimeErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    runtimeErrors.set(page, errors);
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
    });
});
test.afterEach(async ({ page }) => {
    expect(
        runtimeErrors.get(page),
        "No console or unhandled runtime errors",
    ).toEqual([]);
});

async function settled(page: Page) {
    await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        await Promise.all(
            document.getAnimations().map((a) => a.finished.catch(() => {})),
        );
    });
}
async function setup(page: Page, theme = "light") {
    await page.addInitScript(
        (mode) => localStorage.setItem("masar-theme", mode),
        theme,
    );
    await page.clock.install({ time: new Date("2026-10-21T10:00:00Z") });
    const data = sizedFixture(12);
    data.tasks[0].notes = "ملاحظات المهمة محفوظة دون تغيير";
    await importData(page, data);
    const dismiss = page.getByRole("button", {
        name: "إخفاء الرسالة",
        exact: true,
    });
    if (await dismiss.isVisible()) await dismiss.click();
}

async function aligned(page: Page) {
    await settled(page);
    for (const group of await page.locator(".glass-choices").all()) {
        const selected = group.locator(":scope > button.selected");
        if (!(await selected.count())) continue;
        // ResizeObserver is delivered after rAF; its React commit can start
        // the transition after settled() sampled animations. Poll the actual
        // final geometry rather than asserting in that intermediate frame.
        await expect
            .poll(async () => {
                const a = await selected.boundingBox();
                const b = await group
                    .locator(".glass-choice-indicator")
                    .boundingBox();
                if (!a || !b) return Infinity;
                return Math.max(
                    ...(["x", "y", "width", "height"] as const).map((key) =>
                        Math.abs(a[key] - b[key]),
                    ),
                );
            })
            .toBeLessThan(2);
        await expect(selected).toHaveCSS(
            "background-color",
            "rgba(0, 0, 0, 0)",
        );
    }
}

for (const width of [320, 390])
    for (const theme of ["light", "dark"]) {
        test(`visual inventory ${width} ${theme}`, async ({ page }) => {
            await page.setViewportSize({ width, height: 844 });
            await setup(page, theme);
            const capture = async (name: string) => {
                await settled(page);
                expect(
                    await page.evaluate(
                        () =>
                            document.documentElement.scrollWidth <= innerWidth,
                    ),
                ).toBe(true);
                await page.screenshot({
                    path: `${output}/${before ? "before" : "after"}-${name}-${theme}-${width}.png`,
                });
                if (
                    !before &&
                    [
                        "progress",
                        "history",
                        "project",
                        "task-options",
                        "rest",
                        "menu",
                    ].includes(name)
                ) {
                    const audit = await new AxeBuilder({ page })
                        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
                        .analyze();
                    expect(audit.violations, `${name} accessibility`).toEqual(
                        [],
                    );
                }
            };
            await page.goto(appUrl("/#progress"));
            await capture("progress");
            await page
                .getByRole("tab", { name: "رؤى مسار", exact: true })
                .click();
            await capture("insights");
            await page
                .getByRole("tab", { name: "سجل الإنجاز", exact: true })
                .click();
            await capture("history");
            for (const [route, name] of [
                ["projects", "projects"],
                ["tasks", "filters"],
                ["ideas", "ideas"],
                ["project/p", "project"],
                ["step/s0", "step"],
                ["task/t0", "task"],
                ["idea/idea", "idea"],
            ]) {
                await page.goto(appUrl("/#" + route));
                if (name === "task" || name === "step")
                    await page
                        .locator(".status-controls")
                        .scrollIntoViewIfNeeded();
                await capture(name);
            }
            await page.goto(appUrl("/#task/t0"));
            await page
                .getByRole("button", {
                    name: "تعديل الموعد والأولوية",
                    exact: true,
                })
                .click();
            await page
                .getByLabel("التكرار", { exact: true })
                .selectOption("weekly");
            await capture("task-options");
            await page.keyboard.press("Escape");
            await expect(page.getByRole("dialog")).not.toBeVisible();
            await page.goto(appUrl("/#projects"));
            await page
                .getByRole("button", { name: "المظهر والألوان", exact: true })
                .click();
            await capture("appearance");
            await page.keyboard.press("Escape");
            await expect(page.getByRole("dialog")).not.toBeVisible();
            await page.goto(appUrl("/#backup"));
            await capture("backup");
            await page.locator(".project-rest-settings > summary").click();
            await page.locator(".rest-weekdays").scrollIntoViewIfNeeded();
            await capture("rest");
            await page.goto(appUrl("/#tasks"));
            await page
                .getByRole("button", {
                    name: "إجراءات المهمة «مهمة 0»",
                    exact: true,
                })
                .click();
            await capture("menu");
        });
    }

test("internal controls retain selection, keyboard semantics and task data", async ({
    page,
}) => {
    test.skip(before, "Before captures only");
    await page.setViewportSize({ width: 320, height: 844 });
    await setup(page);
    await page.goto(appUrl("/#progress"));
    await page.getByRole("button", { name: "شهري", exact: true }).click();
    await page.getByRole("tab", { name: "رؤى مسار", exact: true }).click();
    await expect(
        page.getByRole("button", { name: "شهري", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page
        .getByRole("tab", { name: "رؤى مسار", exact: true })
        .press("ArrowLeft");
    await expect(
        page.getByRole("tab", { name: "سجل الإنجاز", exact: true }),
    ).toBeFocused();
    await page.goto(appUrl("/#task/t0"));
    const original = (await readStore(page, "tasks")).find(
        (t) => t.id === "t0",
    )!;
    await page
        .locator(".status-controls")
        .getByRole("button", { name: "مكتملة", exact: true })
        .click();
    await expect
        .poll(
            async () =>
                (await readStore(page, "tasks")).find((t) => t.id === "t0")
                    ?.status,
        )
        .toBe("done");
    await page
        .locator(".status-controls")
        .getByRole("button", { name: "لم تبدأ", exact: true })
        .click();
    await expect
        .poll(
            async () =>
                (await readStore(page, "tasks")).find((t) => t.id === "t0")
                    ?.status,
        )
        .toBe("todo");
    const current = (await readStore(page, "tasks")).find(
        (t) => t.id === "t0",
    )!;
    for (const key of ["title", "notes", "priority", "schedule"])
        expect(current[key]).toEqual(original[key]);
});

for (const width of [320, 390, 768, 1366])
    test(`shared indicator follows selection, wrapping and RTL scrolling ${width}`, async ({
        page,
    }) => {
        await page.setViewportSize({ width, height: 900 });
        await setup(page);
        for (const route of [
            "progress",
            "projects",
            "tasks",
            "ideas",
            "task/t0",
            "step/s0",
        ]) {
            await page.goto(appUrl("/#" + route));
            await expect(page.locator(".glass-choices").first()).toBeVisible();
            await aligned(page);
        }
        await page.goto(appUrl("/#tasks"));
        await page.getByRole("button", { name: "قادمة", exact: true }).click();
        await aligned(page);
        await expect(
            page.getByRole("button", { name: "قادمة", exact: true }),
        ).toHaveAttribute("aria-pressed", "true");
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
            ),
        ).toBe(true);
        await page.goto(appUrl("/#projects"));
        await page.getByRole("button", { name: /الموقوفة مؤقتًا/ }).click();
        for (const size of [390, 320, 768]) {
            await page.setViewportSize({ width: size, height: 844 });
            await aligned(page);
        }
    });

test("rapid filters keep a single selected option without editing records or leaking observers", async ({
    page,
}) => {
    await page.addInitScript(() => {
        const Native = window.ResizeObserver;
        const active = new Set<ResizeObserver>();
        Object.assign(window, { controlObservers: active });
        window.ResizeObserver = class extends Native {
            observe(target: Element, options?: ResizeObserverOptions) {
                active.add(this);
                super.observe(target, options);
            }
            disconnect() {
                active.delete(this);
                super.disconnect();
            }
        };
    });
    await setup(page);
    await page.goto(appUrl("/#tasks"));
    const original = await readStore(page, "tasks");
    for (let i = 0; i < 8; i++) {
        await navigateView(page, "progress");
        await navigateView(page, "tasks");
        await page.locator(".task-filters").evaluate((group) => {
            const buttons = group.querySelectorAll<HTMLButtonElement>("button");
            for (let j = 0; j < 30; j++) buttons[j % buttons.length].click();
        });
    }
    await settled(page);
    await expect(
        page.locator(".task-filters > button[aria-pressed=true]"),
    ).toHaveCount(1);
    await aligned(page);
    expect(await readStore(page, "tasks")).toEqual(original);
    expect(
        await page.evaluate(
            () =>
                (window as unknown as { controlObservers: Set<unknown> })
                    .controlObservers.size,
        ),
    ).toBe(1);
    await page.goto(appUrl("/#ideas"));
    await settled(page);
    expect(
        await page.evaluate(
            () =>
                (window as unknown as { controlObservers: Set<unknown> })
                    .controlObservers.size,
        ),
    ).toBe(2); // Ideas archive controls + the approved Ideas/Reminders tabs.
    await expect(page.locator(".glass-choices")).toHaveCount(2);
    await page.getByRole("button", { name: "تذكيرات", exact: true }).click();
    await settled(page);
    expect(
        await page.evaluate(
            () =>
                (window as unknown as { controlObservers: Set<unknown> })
                    .controlObservers.size,
        ),
    ).toBe(1);
    await page.getByRole("button", { name: "الأفكار", exact: true }).click();
    await settled(page);
    expect(
        await page.evaluate(
            () =>
                (window as unknown as { controlObservers: Set<unknown> })
                    .controlObservers.size,
        ),
    ).toBe(2);
    await page.goto(appUrl("/#tasks"));
    await settled(page);
    expect(
        await page.evaluate(
            () =>
                (window as unknown as { controlObservers: Set<unknown> })
                    .controlObservers.size,
        ),
    ).toBe(1);
});

test("reduced motion and forced colors retain readable selection", async ({
    page,
}) => {
    await setup(page, "dark");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(appUrl("/#progress"));
    await page.getByRole("button", { name: "سنوي", exact: true }).click();
    await aligned(page);
    await expect(page.locator(".glass-choice-indicator").first()).toHaveCSS(
        "transition-duration",
        "0s",
    );
    await page.emulateMedia({ forcedColors: "active" });
    await expect(page.locator(".glass-choice-indicator").first()).toHaveCSS(
        "border-top-width",
        "2px",
    );
    await page.getByRole("tab", { name: "رؤى مسار", exact: true }).press("End");
    await expect(
        page.getByRole("tab", { name: "سجل الإنجاز", exact: true }),
    ).toBeFocused();
});

test("painted contrast of internal controls in five skies and both themes", async ({
    page,
}) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 390, height: 844 });
    await setup(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const tmp = fs.mkdtempSync(
        path.join(os.tmpdir(), "masar-internal-contrast-"),
    );
    const results = [];
    const controls =
        ".glass-choices button, .glass-choices button span, .btn.secondary, .field select, .history-filters select, .weekdays label";
    for (const theme of ["light", "dark"]) {
        await page.evaluate(
            (mode) => localStorage.setItem("masar-theme", mode),
            theme,
        );
        await page.reload();
        for (const hour of [6, 9, 13, 17, 23]) {
            await page.clock.setSystemTime(
                new Date(
                    `2026-10-21T${String(hour - 3).padStart(2, "0")}:00:00Z`,
                ),
            );
            await page.evaluate(() => window.dispatchEvent(new Event("focus")));
            for (const route of ["progress", "task/t0"]) {
                await page.goto(appUrl("/#" + route));
                if (route === "task/t0") {
                    await page
                        .getByRole("button", {
                            name: "تعديل الموعد والأولوية",
                            exact: true,
                        })
                        .click();
                    await page
                        .getByLabel("التكرار", { exact: true })
                        .selectOption("weekly");
                }
                await settled(page);
                const rows = await page.evaluate((selector) => {
                    const walker = document.createTreeWalker(
                        document.body,
                        NodeFilter.SHOW_TEXT,
                    );
                    const rows = [];
                    while (walker.nextNode()) {
                        const node = walker.currentNode,
                            parent = node.parentElement;
                        if (
                            !parent ||
                            !node.textContent?.trim() ||
                            !parent.closest(selector) ||
                            parent.closest("button:disabled, [hidden]")
                        )
                            continue;
                        const dialog = document.querySelector("dialog[open]");
                        if (dialog && !dialog.contains(parent)) continue;
                        const range = document.createRange();
                        range.selectNodeContents(node);
                        const box = range.getBoundingClientRect();
                        if (
                            box.width < 1 ||
                            box.height < 1 ||
                            box.top < 0 ||
                            box.bottom > innerHeight - 80 ||
                            box.left < 0 ||
                            box.right > innerWidth
                        )
                            continue;
                        const ink = getComputedStyle(parent)
                            .color.match(/[\d.]+/g)!
                            .map(Number);
                        rows.push({
                            label: node.textContent.trim(),
                            rect: [box.x, box.y, box.right, box.bottom],
                            rgb: ink.slice(0, 3),
                            alpha: ink[3] ?? 1,
                            required: 4.5,
                        });
                    }
                    // Native selects paint their selected value rather than a text node.
                    for (const select of document.querySelectorAll<HTMLSelectElement>(
                        "dialog[open] select",
                    )) {
                        const box = select.getBoundingClientRect();
                        if (box.bottom > innerHeight - 80 || box.top < 0)
                            continue;
                        const ink = getComputedStyle(select)
                            .color.match(/[\d.]+/g)!
                            .map(Number);
                        rows.push({
                            label: select.selectedOptions[0].text,
                            rect: [
                                box.x + 30,
                                box.y + 12,
                                box.right - 12,
                                box.bottom - 12,
                            ],
                            rgb: ink.slice(0, 3),
                            alpha: ink[3] ?? 1,
                            required: 4.5,
                        });
                    }
                    return rows;
                }, controls);
                expect(rows.length).toBeGreaterThan(0);
                fs.writeFileSync(
                    path.join(tmp, "rows.json"),
                    JSON.stringify(rows),
                );
                const style = await page.addStyleTag({
                    content: `${controls} {color:transparent!important;text-shadow:none!important}`,
                });
                await page.screenshot({
                    path: path.join(tmp, "background.png"),
                });
                await style.evaluate((n) => n.parentNode?.removeChild(n));
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
                if (route === "task/t0") {
                    await page.keyboard.press("Escape");
                    await expect(page.getByRole("dialog")).not.toBeVisible();
                }
            }
        }
    }
    fs.writeFileSync(
        `${output}/contrast.json`,
        JSON.stringify(results, null, 2) + "\n",
    );
    expect(results.flatMap((r) => r.rows).filter((r) => !r.passes)).toEqual([]);
});
