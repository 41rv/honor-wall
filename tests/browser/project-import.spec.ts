import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { importData, sizedFixture, readStore } from "./helpers";
const sample = readFileSync(
    new URL("../../examples/project-import.json", import.meta.url),
);
async function upload(page: import("@playwright/test").Page, buffer = sample) {
    await page.getByLabel("استيراد مشروع", { exact: true }).setInputFiles({
        name: "project.json",
        mimeType: "application/json",
        buffer,
    });
}
test("معاينة وإلغاء ثم حفظ مرة واحدة بالضغط المتكرر مع الحفاظ على البيانات والتقدم", async ({
    page,
}) => {
    await importData(page, sizedFixture(2));
    const before = Object.fromEntries(
        await Promise.all(
            (["projects", "steps", "tasks", "ideas", "events"] as const).map(
                async (key) => [key, await readStore(page, key)],
            ),
        ),
    );
    await page.goto("/#projects");
    await upload(page);
    const dialog = page.getByRole("dialog", { name: "معاينة استيراد المشروع" });
    await expect(dialog).toContainText("5 خطوات نهائية");
    await expect(dialog.getByLabel("ترتيب مراحل وخطوات المشروع")).toContainText(
        "1.2.2",
    );
    await expect(dialog).toContainText("اختبر الروابط في المتصفح.");
    expect(await readStore(page, "projects")).toEqual(before.projects);
    await dialog.getByRole("button", { name: "إلغاء", exact: true }).click();
    expect(await readStore(page, "projects")).toEqual(before.projects);
    await upload(page);
    await page
        .getByRole("button", { name: "تأكيد استيراد المشروع" })
        .evaluate((button) => {
            for (let i = 0; i < 12; i++) (button as HTMLButtonElement).click();
        });
    await expect(page).toHaveURL(/#project\//);
    await expect(page.getByLabel("تعديل الاسم")).toHaveValue(
        "دورة أساسيات تطوير الويب",
    );
    await expect(page.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "0",
    );
    const projects = await readStore(page, "projects");
    expect(projects).toHaveLength(2);
    const added = projects.find((p) => p.id !== "p")!;
    expect(added.notes).toBe("إنهاء الدورة وتطبيق المهارات في موقع شخصي.");
    expect(projects.filter((p) => p.id === "p")).toEqual(before.projects);
    expect(
        (await readStore(page, "steps")).filter((s) => s.projectId === "p"),
    ).toEqual(before.steps);
    expect(await readStore(page, "tasks")).toEqual(before.tasks);
    expect(await readStore(page, "ideas")).toEqual(before.ideas);
    const events = await readStore(page, "events");
    expect(
        events.filter((e) =>
            (before.events as { id: string }[]).some((old) => old.id === e.id),
        ),
    ).toEqual(before.events);
    const steps = (await readStore(page, "steps")).filter(
        (s) => s.projectId === added.id,
    );
    expect(steps).toHaveLength(8);
    const leaves = steps.filter(
        (s) =>
            s.kind === "step" &&
            !steps.some((child) => child.parentId === s.id),
    );
    for (let i = 0; i < leaves.length; i++) {
        await page.goto("/#step/" + leaves[i].id);
        await page
            .getByRole("button", { name: "إتمام الخطوة", exact: true })
            .click();
        await expect
            .poll(
                async () =>
                    (await readStore(page, "steps")).find(
                        (s) => s.id === leaves[i].id,
                    )?.status,
            )
            .toBe("done");
        await page.goto("/#project/" + added.id);
        await expect(page.getByRole("progressbar")).toHaveAttribute(
            "aria-valuenow",
            String((i + 1) * 20),
        );
    }
    await expect(
        page.getByRole("button", { name: "إعادة فتح المشروع", exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "100",
    );
    expect(await readStore(page, "projects")).toHaveLength(2);
});
test("ملفات خاطئة بأخطاء واضحة وإعادة اختيار الملف نفسه دون حفظ", async ({
    page,
}) => {
    await page.goto("/#projects");
    for (const [text, error] of [
        ["{", "تعذر قراءة JSON"],
        [
            JSON.stringify({
                format: "masar.project",
                version: 2,
                project: {},
            }),
            "version",
        ],
        [
            JSON.stringify({
                format: "masar.project",
                version: 1,
                project: { title: " ", stages: [] },
            }),
            "project.title",
        ],
        [
            JSON.stringify({
                format: "masar.project",
                version: 1,
                project: {
                    title: "س",
                    stages: [
                        { title: "م", steps: [{ title: "خ", status: "done" }] },
                    ],
                },
            }),
            "status",
        ],
    ]) {
        await upload(page, Buffer.from(text));
        await expect(page.getByRole("alert")).toContainText(error);
        expect(await readStore(page, "projects")).toHaveLength(0);
        await expect(page.getByRole("dialog")).not.toBeVisible();
    }
    await upload(page, Buffer.alloc(5 * 1024 * 1024 + 1, 32));
    await expect(page.getByRole("alert")).toContainText("ميجابايت");
    await upload(page);
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    expect(await readStore(page, "projects")).toHaveLength(0);
});
test("فشل التخزين لا يترك مشروعًا ناقصًا ويتيح تأكيد المعاينة مجددًا", async ({
    page,
}) => {
    await page.goto("/#projects");
    await upload(page);
    await page.evaluate(() => {
        const original = IDBObjectStore.prototype.add;
        IDBObjectStore.prototype.add = function (...args) {
            if (this.name === "events") {
                IDBObjectStore.prototype.add = original;
                throw new DOMException("full", "QuotaExceededError");
            }
            return original.apply(this, args as Parameters<typeof original>);
        };
    });
    await page.getByRole("button", { name: "تأكيد استيراد المشروع" }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
        "مساحة التخزين ممتلئة",
    );
    expect(await readStore(page, "projects")).toHaveLength(0);
    expect(await readStore(page, "steps")).toHaveLength(0);
    await page.getByRole("button", { name: "تأكيد استيراد المشروع" }).click();
    await expect(page).toHaveURL(/#project\//);
    expect(await readStore(page, "projects")).toHaveLength(1);
});
for (const width of [390, 1366]) {
    test(`المعاينة والأخطاء ولوحة المفاتيح في الثيمات الأربعة بعرض ${width}`, async ({
        page,
    }) => {
        await page.setViewportSize({ width, height: 850 });
        await page.goto("/#projects");
        for (const identity of ["green", "mono"])
            for (const mode of ["light", "dark"]) {
                await page.evaluate(
                    ({ identity, mode }) => {
                        localStorage.setItem("masar-identity", identity);
                        localStorage.setItem("masar-theme", mode);
                    },
                    { identity, mode },
                );
                await page.reload();
                await upload(page);
                const dialog = page.getByRole("dialog");
                await expect(dialog).toBeVisible();
                expect(
                    (await new AxeBuilder({ page }).include("dialog").analyze())
                        .violations,
                ).toEqual([]);
                if (identity === "green" && mode === "light")
                    await page.screenshot({
                        path: `docs/project-import/preview-${width}.png`,
                    });
                expect(
                    await dialog.evaluate(
                        (el) => el.scrollWidth <= el.clientWidth,
                    ),
                ).toBe(true);
                expect(
                    await page.evaluate(
                        () =>
                            document.documentElement.scrollWidth <= innerWidth,
                    ),
                ).toBe(true);
                await page.keyboard.press("Tab");
                expect(
                    await dialog.evaluate((el) =>
                        el.contains(document.activeElement),
                    ),
                ).toBe(true);
                await dialog
                    .getByRole("button", { name: "إلغاء", exact: true })
                    .click();
            }
        expect(await readStore(page, "projects")).toHaveLength(0);
    });
}
test("معاينة محدودة لمشروع كبير تستورد كل العناصر وترقيم التداخل حتى الحد المعتمد", async ({
    page,
}) => {
    await page.goto("/#projects");
    let deep: Record<string, unknown> = { title: "المستوى 2" };
    const top = deep;
    for (let i = 3; i <= 20; i++) {
        const child = { title: "المستوى " + i };
        deep.children = [child];
        deep = child;
    }
    const file = {
        format: "masar.project",
        version: 1,
        project: {
            title: "اختبار مشروع كبير",
            stages: [
                { title: "مرحلة التداخل", steps: [top] },
                {
                    title: "مرحلة واسعة",
                    steps: Array.from({ length: 110 }, (_, i) => ({
                        title: "عمل " + i,
                    })),
                },
            ],
        },
    };
    await upload(page, Buffer.from(JSON.stringify(file)));
    await expect(page.getByRole("dialog")).toContainText(
        "سيُحفظ جميع العناصر وعددها 131",
    );
    await expect(
        page.getByLabel("ترتيب مراحل وخطوات المشروع").locator("li"),
    ).toHaveCount(100);
    await page.getByRole("button", { name: "تأكيد استيراد المشروع" }).click();
    await expect(page).toHaveURL(/#project\//);
    const id = decodeURIComponent(
        new URL(page.url()).hash.slice("#project/".length),
    );
    expect(
        (await readStore(page, "steps")).filter((s) => s.projectId === id),
    ).toHaveLength(131);
    await expect(
        page.locator(".tree-title").filter({ hasText: "المستوى 20" }),
    ).toBeVisible();
    await expect(page.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "0",
    );
    await page.reload();
    await expect(
        page.locator(".tree-title").filter({ hasText: "عمل 109" }),
    ).toBeVisible();
});
