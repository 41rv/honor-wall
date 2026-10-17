import { appUrl } from "./url";
import { test, expect } from "@playwright/test";
import { sizedFixture, importData } from "./helpers";
import fs from "node:fs";

// Search is another potentially unbounded panel: exercise its actual paint,
// rather than assuming the short visible examples prove long-list behavior.
test("بحث500 نتيجة: التمرير والوصول إلى آخر زر دون تجمد أو حجب", async ({
    page,
}) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => localStorage.setItem("masar-theme", "dark"));
    const data = sizedFixture(4);
    data.tasks = Array.from({ length: 500 }, (_, i) => ({
        ...data.tasks[0],
        id: `search-${i}`,
        title: `نتيجة-متكررة ${i}`,
        notes: "ملاحظة لاختبار وضوح النصوص والخامة أثناء التمرير.",
    }));
    await importData(page, data);
    await page.goto(appUrl("/#tasks"));
    await page.getByLabel("بحث شامل", { exact: true }).fill("نتيجة-متكررة");
    await expect(page.locator(".search-result")).toHaveCount(500);
    await page.locator(".page-heading h1").click();
    await expect(page.locator(".search-results")).toHaveCSS(
        "backdrop-filter",
        "none",
    );
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const frames = page.evaluate(
        () =>
            new Promise<number[]>((resolve) => {
                const values: number[] = [];
                let previous = performance.now();
                const tick = (now: number) => {
                    values.push(now - previous);
                    previous = now;
                    if (values.length >= 150) resolve(values.slice(1));
                    else requestAnimationFrame(tick);
                };
                requestAnimationFrame(tick);
            }),
    );
    await page.mouse.move(160, 440);
    for (let i = 0; i < 12; i++) {
        await page.mouse.wheel(0, i % 2 ? -400 : 400);
        await page.waitForTimeout(120);
    }
    const values = await frames,
        sorted = [...values].sort((a, b) => a - b);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    const last = page.locator(".search-result").last();
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
    expect(
        await last.evaluate((n) => {
            const r = n.getBoundingClientRect();
            return (
                document
                    .elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
                    ?.closest(".search-result") === n
            );
        }),
    ).toBe(true);
    const report = {
        results: 500,
        cpu_throttle: 4,
        frames: values.length,
        median_frame_ms: sorted[Math.floor(sorted.length * 0.5)],
        p95_frame_ms: sorted[Math.floor(sorted.length * 0.95)],
        frames_over_50ms: values.filter((n) => n > 50).length,
        physical_android: false,
    };
    fs.writeFileSync(
        "docs/living-sky-shell/search-performance.json",
        JSON.stringify(report, null, 2),
    );
    expect(report.p95_frame_ms).toBeLessThan(70);
    expect(report.frames_over_50ms).toBeLessThan(15);
    await page.screenshot({
        path: "docs/living-sky-shell/search-500-dark-390.png",
    });
});
