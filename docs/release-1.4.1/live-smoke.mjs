import { chromium, expect } from "@playwright/test";
import {
    readStore,
    openCreate,
    chooseTaskToday,
} from "../../tests/browser/helpers.ts";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
const exec = promisify(execFile),
    site = process.env.MASAR_SMOKE_URL || "https://41rv.github.io/honor-wall/",
    build = "/tmp/masar-release-141-production";
const output =
    process.env.MASAR_SMOKE_OUTPUT || new URL("./", import.meta.url).pathname;
const requests = [],
    errors = [],
    checks = [];
const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
});
const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    timezoneId: "Asia/Riyadh",
    serviceWorkers: "block",
});
// Use the environment's trusted curl TLS transport; each response must match
// the tested production artifact. No TLS bypass and no real user profile.
await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (
        url.origin !== new URL(site).origin ||
        !url.pathname.startsWith("/honor-wall/")
    )
        return route.abort();
    try {
        const relative =
            url.pathname.slice("/honor-wall/".length) || "index.html";
        const { stdout } = await exec(
            "curl",
            [
                "--fail",
                "--silent",
                "--show-error",
                "--location",
                "--retry",
                "2",
                "--max-time",
                "30",
                url.href,
            ],
            { encoding: "buffer", maxBuffer: 10 * 1024 * 1024 },
        );
        const sha = (v) => crypto.createHash("sha256").update(v).digest("hex");
        assert.equal(
            sha(stdout),
            sha(fs.readFileSync(path.join(build, relative))),
            relative,
        );
        requests.push({ path: relative, sha256: sha(stdout), matches: true });
        const types = {
            ".html": "text/html; charset=utf-8",
            ".js": "application/javascript",
            ".css": "text/css",
            ".webmanifest": "application/manifest+json",
            ".svg": "image/svg+xml",
            ".png": "image/png",
            ".woff2": "font/woff2",
            ".woff": "font/woff",
        };
        await route.fulfill({
            status: 200,
            body: stdout,
            contentType:
                types[path.extname(relative)] || "application/octet-stream",
        });
    } catch (e) {
        errors.push(e.message);
        await route.abort();
    }
});
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
});
const go = (hash) => page.goto(site + hash),
    names = () => page.locator(".home-today .task-main strong");
async function add(title, repeat, priority) {
    await go("#tasks");
    await openCreate(page, "task", true);
    const f = page.getByRole("dialog");
    await f.getByLabel("الاسم", { exact: true }).fill(title);
    if (repeat)
        await f.getByLabel("التكرار", { exact: true }).selectOption(repeat);
    if (priority)
        await f.getByLabel("الأولوية", { exact: true }).selectOption(priority);
    await f.getByRole("button", { name: "إضافة", exact: true }).click();
    await expect(f).not.toBeVisible();
}
try {
    await page.clock.install({ time: new Date("2026-10-21T09:00:00Z") });
    for (const [title, priority] of [
        ["أولى", "important-urgent"],
        ["ثانية", "important"],
        ["ثالثة", "urgent"],
        ["رابعة", "low"],
    ]) {
        await add(title, undefined, priority);
        await chooseTaskToday(page, title);
    }
    await go("#home");
    await expect(names()).toHaveText(["أولى", "ثانية", "ثالثة"]);
    checks.push("menu_add_and_compact_priority_order");
    await page.getByRole("button", { name: "إكمال أولى", exact: true }).click();
    await expect(names()).toHaveText(["ثانية", "ثالثة", "رابعة"]);
    checks.push("completed_does_not_displace_open_compact_tasks");
    await page.getByRole("link", { name: "عرض الكل", exact: true }).click();
    await expect(names()).toHaveText(["ثانية", "ثالثة", "رابعة", "أولى"]);
    await expect(
        page
            .locator("[data-task-id]")
            .filter({
                has: page.getByRole("button", {
                    name: "إعادة فتح أولى",
                    exact: true,
                }),
            })
            .locator("strong"),
    ).toHaveCSS("text-decoration-line", "line-through");
    await page.reload();
    await expect(names()).toHaveText(["ثانية", "ثالثة", "رابعة", "أولى"]);
    checks.push("completed_stays_below_after_reload");
    await page
        .getByRole("button", { name: "إعادة فتح أولى", exact: true })
        .click();
    await expect(names()).toHaveText(["أولى", "ثانية", "ثالثة", "رابعة"]);
    const before = await readStore(page, "tasks");
    await chooseTaskToday(page, "رابعة", false);
    await expect(names()).toHaveText(["أولى", "ثانية", "ثالثة"]);
    const after = await readStore(page, "tasks");
    const old = before.find((t) => t.title === "رابعة");
    const { today: _selection, ...unchanged } = old;
    assert.deepEqual(
        after.find((t) => t.title === "رابعة"),
        unchanged,
    );
    checks.push("undo_and_menu_remove_preserve_task_properties");
    await add("دورة يومية", "daily", "important");
    await go("#today");
    await page
        .getByRole("button", { name: "إكمال دورة يومية", exact: true })
        .click();
    await expect(names().last()).toHaveText("دورة يومية");
    await page
        .getByRole("button", { name: "إعادة فتح دورة يومية", exact: true })
        .click();
    await expect(
        page.getByRole("button", { name: "إكمال دورة يومية", exact: true }),
    ).toHaveAttribute("aria-busy", "false");
    assert.equal((await readStore(page, "taskCycles")).length, 1);
    checks.push("recurring_complete_undo_same_cycle");
    await page.evaluate(() => {
        localStorage.setItem("masar-theme", "dark");
    });
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    assert.equal(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
    );
    await page.screenshot({
        path: path.join(output, "live-today-390-dark.png"),
        fullPage: true,
    });
    await page.setViewportSize({ width: 1366, height: 900 });
    assert.equal(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
    );
    checks.push("rtl_dark_mobile_and_laptop");
    await go("#calendar");
    await expect(page.locator(".calendar-day")).toHaveCount(7);
    await go("#progress");
    await expect(
        page.getByRole("region", { name: "إحصائيات الفترة", exact: true }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "رؤى مسار", exact: true }).click();
    await expect(
        page.getByRole("region", { name: "رؤى مسار", exact: true }),
    ).toBeVisible();
    checks.push("calendar_dashboard_insights_routes");
    await page.clock.setSystemTime(new Date("2026-10-21T21:00:00Z"));
    await go("#today");
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(names()).toHaveText(["دورة يومية"]);
    checks.push("local_midnight_selection_expiry_new_daily_cycle");
    await go("#home");
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const [hour, phase] of [
        [6, "dawn"],
        [9, "morning"],
        [13, "noon"],
        [17, "sunset"],
        [23, "night"],
    ]) {
        await page.clock.setSystemTime(
            new Date(`2026-10-22T${String(hour - 3).padStart(2, "0")}:00:00Z`),
        );
        await page.evaluate(() => window.dispatchEvent(new Event("focus")));
        await expect(page.locator(".living-sky")).toHaveAttribute(
            "data-phase",
            phase,
        );
        await expect(page.locator("html")).toHaveAttribute(
            "data-theme",
            "dark",
        );
    }
    checks.push("living_sky_five_local_time_scenes_theme_independent");
    await page.setViewportSize({ width: 390, height: 844 });
    await page
        .getByRole("button", { name: "المظهر والألوان", exact: true })
        .click();
    const appearance = page.getByRole("dialog", {
        name: "المظهر والألوان",
        exact: true,
    });
    const slider = appearance.getByRole("slider", {
        name: "ضبابية الخلفية",
        exact: true,
    });
    await expect(slider).toHaveValue("12");
    for (const value of [0, 12, 30]) {
        await slider.fill(String(value));
        await expect(page.locator(".sky-scene")).toHaveCSS(
            "filter",
            `blur(${value}px)`,
        );
    }
    await slider.fill("27");
    await appearance.getByRole("button", { name: "تم", exact: true }).click();
    await page.reload();
    await expect(page.locator(".sky-scene")).toHaveCSS("filter", "blur(27px)");
    checks.push("blur_0_12_30_immediate_and_27_persists_reload");
    const card = page.locator(".home-today .sky-glass");
    await expect(card).toHaveCSS("backdrop-filter", "blur(2px)");
    await expect(
        page.locator("#masar-glass-rim feDisplacementMap"),
    ).toHaveAttribute("scale", "5");
    const rim = await card.evaluate((n) => ({
        mask: getComputedStyle(n, "::after").maskComposite,
        pointer: getComputedStyle(n, "::after").pointerEvents,
    }));
    assert.match(rim.mask, /^exclude(?:,\s*exclude)*$/);
    assert.equal(rim.pointer, "none");
    for (const row of await page.locator(".home-today .task-main").all())
        await expect(row).toHaveCSS("filter", "none");
    checks.push("clear_glass_2px_rim_svg_present_masked_and_text_unfiltered");
    await page.screenshot({
        path: path.join(output, "live-living-sky-night-dark-390.png"),
        fullPage: true,
    });
    await page
        .getByRole("button", { name: "المظهر والألوان", exact: true })
        .click();
    await page
        .getByRole("dialog")
        .getByLabel("الوضع", { exact: true })
        .selectOption("light");
    await page.getByRole("dialog").getByRole("slider").fill("12");
    await page
        .getByRole("dialog")
        .getByRole("button", { name: "تم", exact: true })
        .click();
    await page.clock.setSystemTime(new Date("2026-10-22T10:00:00Z"));
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.locator(".living-sky")).toHaveAttribute(
        "data-phase",
        "noon",
    );
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.screenshot({
        path: path.join(output, "live-living-sky-day-light-390.png"),
        fullPage: true,
    });
    await page.evaluate(() => {
        window.__releaseSky = document.querySelector(".living-sky");
    });
    for (const theme of ["light", "dark"]) {
        if (theme === "dark") {
            await page.getByRole("button", { name: "المظهر والألوان", exact: true }).click();
            await page.getByRole("dialog").getByLabel("الوضع", { exact: true }).selectOption("dark");
            await page.getByRole("dialog").getByRole("button", { name: "تم", exact: true }).click();
        }
        for (const width of [390, 320]) {
            await page.setViewportSize({ width, height: 844 });
            for (const hash of ["home", "projects", "tasks", "ideas", "progress"]) {
                await page.locator(`.navigation a[href="#${hash}"]`).click();
                await expect(page.locator(`.navigation a[href="#${hash}"]`)).toHaveAttribute("aria-current", "page");
                await expect(page.locator(".living-sky")).toHaveCount(1);
                assert.equal(await page.evaluate(() => window.__releaseSky === document.querySelector(".living-sky")), true);
                await expect(page.locator(".sky-scene")).toHaveCSS("filter", "blur(12px)");
                assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
                assert.equal(await page.locator(".sidebar").evaluate(n => getComputedStyle(n, "::before").content), "none");
                for (const selector of [".topbar", ".sidebar"]) {
                    const material = await page.locator(selector).evaluate(n => ({ background: getComputedStyle(n).backgroundColor, filter: getComputedStyle(n).backdropFilter }));
                    assert.match(material.background, /^rgba\(/);
                    assert.match(material.filter, /blur\(12px\)/);
                }
                const fab = page.locator(".mobile-fab");
                await expect(fab).toBeVisible();
                const nav = await page.locator(".sidebar").boundingBox();
                const box = await fab.boundingBox();
                assert.equal(box.y + box.height < nav.y, true);
                await page.screenshot({ path: path.join(output, `live-${hash}-${theme}-${width}.png`), fullPage: true });
                await fab.click();
                await expect(page.getByRole("dialog")).toBeVisible();
                await page.keyboard.press("Escape");
                await expect(page.getByRole("dialog")).not.toBeVisible();
                await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                await page.evaluate(() => window.scrollTo(0, 0));
            }
        }
    }
    checks.push("five_routes_same_sky_no_fab_band_translucent_bars_light_dark_320_390");
    assert.deepEqual(errors, []);
    fs.writeFileSync(
        path.join(output, "live-browser-result.json"),
        JSON.stringify(
            {
                release: "1.4.1",
                at: new Date().toISOString(),
                url: site,
                checks,
                checks_passed: checks.length,
                errors,
                requests,
                transport:
                    "Default TLS curl responses checked against production SHA256; isolated Chromium; SW blocked here and tested independently in pwa-check.mjs",
                physical_android_tested: false,
                personal_user_data_accessed: false,
            },
            null,
            2,
        ) + "\n",
    );
    console.log(
        "PASS LIVE",
        checks.length,
        "checks;",
        requests.length,
        "verified requests; no console/runtime errors",
    );
} finally {
    await browser.close();
}
