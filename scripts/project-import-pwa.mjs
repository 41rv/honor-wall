import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import assert from "node:assert/strict";
import { readStore } from "../tests/browser/helpers.ts";
const build = process.argv[2] || "/tmp/masar-release-107";
const base = "/honor-wall/";
const root = fs.mkdtempSync("/tmp/masar-import-pwa-");
fs.mkdirSync(root + base, { recursive: true });
fs.cpSync(build, root + base, { recursive: true });
const server = spawn(
    "python3",
    ["-m", "http.server", "4188", "--bind", "127.0.0.1", "--directory", root],
    { stdio: "ignore" },
);
const url = "http://127.0.0.1:4188" + base;
const profile = root + "/profile";
const options = {
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
    headless: true,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    timezoneId: "Asia/Riyadh",
};
let context;
const errors = [];
function record(page) {
    page.on("pageerror", (err) => errors.push(err.message));
}
try {
    for (let i = 0; i < 40; i++) {
        try {
            if ((await fetch(url)).ok) break;
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    context = await chromium.launchPersistentContext(profile, options);
    let page = await context.newPage();
    record(page);
    await page.goto(url + "#projects");
    await page.evaluate(async () => await navigator.serviceWorker.ready);
    await page.reload();
    await page.getByRole("button", { name: "مشروع جديد", exact: true }).tap();
    await page
        .getByRole("dialog")
        .getByLabel("الاسم", { exact: true })
        .fill("مشروع موجود قبل الاستيراد");
    await page
        .getByRole("dialog")
        .getByRole("textbox")
        .nth(1)
        .fill("ملاحظات موجودة يجب الحفاظ عليها");
    await page
        .getByRole("dialog")
        .getByRole("button", { name: "إضافة", exact: true })
        .tap();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    const before = await readStore(page, "projects");
    await context.setOffline(true);
    await page.goto(url + "#projects");
    await page
        .getByRole("button", { name: "استيراد مشروع", exact: true })
        .tap();
    await expect(
        page.getByRole("dialog", { name: "استيراد مشروع", exact: true }),
    ).toBeVisible();
    const chooserRequest = page.waitForEvent("filechooser");
    await page
        .getByRole("button", { name: "اختيار ملف JSON", exact: true })
        .tap();
    await (
        await chooserRequest
    ).setFiles({
        name: "project.json",
        mimeType: "application/json",
        buffer: fs.readFileSync("examples/project-import.json"),
    });
    await page
        .getByRole("button", { name: "تأكيد استيراد المشروع" })
        .evaluate((button) => {
            for (let i = 0; i < 12; i++) button.click();
        });
    await expect(page.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "0",
    );
    const after = await readStore(page, "projects");
    assert.equal(after.length, before.length + 1);
    assert.deepEqual(
        after.filter((p) => before.some((old) => old.id === p.id)),
        before,
    );
    const added = after.find((p) => !before.some((old) => old.id === p.id));
    const steps = (await readStore(page, "steps")).filter(
        (s) => s.projectId === added.id,
    );
    assert.equal(steps.length, 8);
    const leaf = steps.find((s) => s.title === "مشاهدة مقدمة HTML");
    await page.goto(url + "#step/" + leaf.id);
    await page.getByRole("button", { name: "إتمام الخطوة", exact: true }).tap();
    await expect
        .poll(
            async () =>
                (await readStore(page, "steps")).find((s) => s.id === leaf.id)
                    ?.status,
        )
        .toBe("done");
    await page.goto(url + "#project/" + added.id);
    await expect(page.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "20",
    );
    await context.close();
    context = await chromium.launchPersistentContext(profile, options);
    await context.setOffline(true);
    page = await context.newPage();
    record(page);
    await page.goto(url + "#project/" + added.id);
    await expect(page.getByLabel("تعديل الاسم")).toHaveValue(
        "دورة أساسيات تطوير الويب",
    );
    await expect(page.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "20",
    );
    assert.equal(
        (await readStore(page, "steps")).filter((s) => s.projectId === added.id)
            .length,
        8,
    );
    assert.deepEqual(
        (await readStore(page, "projects")).filter((p) =>
            before.some((old) => old.id === p.id),
        ),
        before,
    );
    assert.deepEqual(errors, []);
    fs.mkdirSync("docs/project-import", { recursive: true });
    fs.writeFileSync(
        process.argv[3] || "docs/project-import/offline-result.json",
        JSON.stringify(
            {
                timestamp: new Date().toISOString(),
                base,
                offline_import: true,
                repeated_confirmation_created_one_project: true,
                existing_project_unchanged: true,
                imported_steps: 8,
                terminal_steps: 5,
                initial_progress: 0,
                progress_after_first_completion: 20,
                browser_restart_offline_preserved_import_and_progress: true,
                errors,
            },
            null,
            2,
        ) + "\n",
    );
    console.log(
        "PASS: production-path import offline, double-confirmation guard, existing data preserved, progress 0→20%, full offline browser restart",
    );
} finally {
    await context?.close();
    server.kill();
}
