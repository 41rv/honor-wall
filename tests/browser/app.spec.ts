import { test, expect, type Page } from "@playwright/test";
import type { Snapshot } from "../../app/model";
const at = "2026-10-11T10:00:00.000Z";
function fixture(): Snapshot {
    const base = (id: string, title: string) => ({
        id,
        title,
        notes: "",
        createdAt: at,
        updatedAt: at,
    });
    const projects = [
        {
            ...base("p", "دليل الهوية البصرية"),
            notes: "مشروع تجريبي للتحقق",
            status: "active" as const,
            archived: false,
        },
    ];
    const steps = [0, 1].flatMap((n) => [
        {
            ...base("stage" + n, n === 0 ? "إعداد المسودة" : "تصميم الدليل"),
            projectId: "p",
            parentId: null,
            kind: "stage" as const,
            status: "todo" as const,
            order: n,
        },
        ...Array.from({ length: 5 }, (_, i) => ({
            ...base(`s${n}-${i}`, `فصل ${n}-${i}`),
            projectId: "p",
            parentId: "stage" + n,
            kind: "step" as const,
            status: "todo" as const,
            order: i,
        })),
    ]);
    return {
        version: 1,
        exportedAt: at,
        projects,
        steps,
        tasks: [],
        ideas: [],
        events: [
            {
                id: "e",
                entityId: "p",
                entityKind: "project",
                title: projects[0].title,
                action: "created",
                at,
            },
        ],
    };
}
async function loadBackup(page: Page, data: Snapshot) {
    await page.goto("/#backup");
    await page.getByLabel("استيراد نسخة", { exact: true }).setInputFiles({
        name: "backup.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(data)),
    });
    await expect(page.getByRole("dialog")).toBeVisible();
    await page
        .getByRole("button", { name: "تأكيد استبدال البيانات", exact: true })
        .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
}
async function add(page: Page, button: string, title: string, notes = "") {
    await page.getByRole("button", { name: button, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("الاسم", { exact: true }).fill(title);
    if (notes) await dialog.getByRole("textbox").nth(1).fill(notes);
    await dialog.getByRole("button", { name: "إضافة", exact: true }).click();
    await expect(dialog).not.toBeVisible();
}
const runtimeErrors = new WeakMap<Page, string[]>();
test.afterEach(async ({ page }) => {
    expect(runtimeErrors.get(page) ?? []).toEqual([]);
});
test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    runtimeErrors.set(page, errors);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await expect(
        page.getByRole("heading", { name: "مساحة هادئة. لإنجاز أكبر." }),
    ).toBeVisible();
});
test("واجهة المشروع: الإنشاء، الترتيب، الملاحظات، النسب والإغلاق", async ({
    page,
}) => {
    await loadBackup(page, fixture());
    await page.goto("/#project/p");
    await expect(page.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "0",
    );
    await page
        .getByRole("button", { name: "خفض فصل 0-0", exact: true })
        .click();
    const row = page.locator(".tree-row").filter({
        has: page.getByRole("button", {
            name: "فصل 0-0 خطوة",
            exact: true,
        }),
    });
    await expect(row.locator(".tree-number")).toHaveText("1.2");
    for (const id of ["s0-0", "s0-1", "s0-2"]) {
        await page.goto("/#step/" + id);
        await page.getByRole("button", { name: "مكتملة", exact: true }).click();
    }
    await page.goto("/#project/p");
    await expect(page.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "30",
    );
    await page.goto("/#step/s0-0");
    await page.getByLabel("ملاحظات العنصر").fill("تفصيل مهم محفوظ للعودة");
    await page.getByRole("button", { name: "العودة للمشروع" }).click();
    await page.getByLabel("بحث شامل").fill("تفصيل مهم");
    await page.locator(".search-result").click();
    await expect(page.getByLabel("ملاحظات العنصر")).toHaveValue(
        "تفصيل مهم محفوظ للعودة",
    );
    await page.reload();
    await expect(page.getByLabel("ملاحظات العنصر")).toHaveValue(
        "تفصيل مهم محفوظ للعودة",
    );
    for (const id of ["s0-3", "s0-4", "s1-0", "s1-1", "s1-2", "s1-3", "s1-4"]) {
        await page.goto("/#step/" + id);
        await page.getByRole("button", { name: "مكتملة", exact: true }).click();
    }
    await page.goto("/#project/p");
    await expect(page.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "100",
    );
    await expect(
        page.getByRole("button", { name: "إعادة فتح المشروع", exact: true }),
    ).toBeVisible();
    await page.goto("/#progress");
    await expect(
        page
            .locator(".stat-card")
            .filter({ hasText: "المشاريع المغلقة" })
            .locator("strong"),
    ).toHaveText("1");
    await expect(
        page
            .locator(".stat-card")
            .filter({ hasText: "المشاريع النشطة" })
            .locator("strong"),
    ).toHaveText("0");
    await page.goto("/#project/p");
    await page
        .getByRole("button", { name: "إعادة فتح المشروع", exact: true })
        .click();
    await page.goto("/#progress");
    await expect(
        page
            .locator(".stat-card")
            .filter({ hasText: "المشاريع النشطة" })
            .locator("strong"),
    ).toHaveText("1");
});
test("المهام والأفكار: إنشاء وبدء وإنجاز وإعادة فتح وتحويل وتراجع", async ({
    page,
}) => {
    await page.goto("/#tasks");
    await add(page, "مهمة جديدة", "مراجعة التصميم", "راجع النسخة النهائية");
    await page
        .getByRole("button", { name: /مراجعة التصميم راجع النسخة/ })
        .click();
    await page.getByRole("button", { name: "جارٍ العمل", exact: true }).click();
    await expect(
        page
            .locator("dt")
            .filter({ hasText: "بدء العمل" })
            .locator("..")
            .locator("dd"),
    ).not.toHaveText("—");
    await page.getByRole("button", { name: "مكتملة", exact: true }).click();
    await expect(page.getByText("أقل من يوم منقضٍ")).toBeVisible();
    await page.getByRole("button", { name: "جارٍ العمل", exact: true }).click();
    await expect(
        page
            .locator("dt")
            .filter({ hasText: "الإنجاز الحالي" })
            .locator("..")
            .locator("dd"),
    ).toHaveText("—");
    await page.getByRole("button", { name: "مكتملة", exact: true }).click();
    await expect(
        page.locator(".timeline li").filter({ hasText: "إنجاز" }),
    ).toHaveCount(2);
    await page.goto("/#progress");
    await expect(
        page
            .locator(".stat-card")
            .filter({ hasText: "منجز آخر" })
            .locator("strong"),
    ).toHaveText("1");
    await page.goto("/#tasks");
    await page.locator(".completed-list summary").click();
    await expect(page.locator(".completed-list")).toContainText("أُنجزت");
    await page.getByRole("button", { name: "تفاصيل مراجعة التصميم" }).click();
    await page.getByRole("button", { name: "حذف", exact: true }).click();
    await page
        .getByRole("dialog")
        .getByRole("button", { name: "تأكيد", exact: true })
        .click();
    await expect(page).toHaveURL(/#tasks/);
    await page.getByRole("button", { name: "تراجع", exact: true }).click();
    await expect(page.locator(".completed-list")).toContainText(
        "مراجعة التصميم",
    );
    await page.goto("/#ideas");
    await add(page, "فكرة جديدة", "فكرة للتجربة", "الوصف يبقى");
    await page
        .getByRole("button", { name: "فكرة للتجربة", exact: true })
        .click();
    await page
        .getByRole("button", { name: "تحويل إلى مشروع", exact: true })
        .click();
    await page
        .getByRole("dialog")
        .getByRole("button", { name: "تأكيد", exact: true })
        .click();
    await expect(page).toHaveURL(/#project/);
    await expect(page.getByLabel("ملاحظات العنصر")).toHaveValue("الوصف يبقى");
    await page.goto("/#ideas");
    await add(page, "فكرة جديدة", "فكرة مهمة", "تفاصيل المهمة");
    await page.getByRole("button", { name: "فكرة مهمة", exact: true }).click();
    await page
        .getByRole("button", { name: "تحويل إلى مهمة", exact: true })
        .click();
    await page
        .getByRole("dialog")
        .getByRole("button", { name: "تأكيد", exact: true })
        .click();
    await expect(page).toHaveURL(/#task/);
    await expect(page.getByLabel("ملاحظات العنصر")).toHaveValue(
        "تفاصيل المهمة",
    );
});
test("إنشاء مشروع ومرحلة وخطوة فرعية وتعديل وأرشفة", async ({ page }) => {
    await page.goto("/#projects");
    await add(page, "مشروع جديد", "مشروعي الجديد", "وصف المشروع");
    await page
        .getByRole("button", { name: "مشروعي الجديد", exact: true })
        .click();
    await add(page, "مرحلة", "التجهيز");
    await page
        .getByRole("button", { name: "التجهيز مرحلة", exact: true })
        .click();
    await add(page, "خطوة", "الأولى");
    await page
        .getByRole("button", { name: "الأولى خطوة", exact: true })
        .click();
    await add(page, "خطوة", "تفصيل");
    await page.getByLabel("تعديل الاسم").fill("خطوة مُعدّلة");
    await page.getByLabel("ملاحظات العنصر").click();
    await expect(
        page.getByRole("heading", { level: 1, name: "خطوة مُعدّلة" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "العودة للمشروع" }).click();
    await page.getByRole("button", { name: "أرشفة", exact: true }).click();
    await page.goto("/#projects");
    await page.getByRole("button", { name: /المؤرشفة/ }).click();
    await expect(
        page.getByRole("button", { name: "مشروعي الجديد", exact: true }),
    ).toBeVisible();
});
test("تصدير واستيراد كامل، رفض نسخة مكسورة دون فقد البيانات", async ({
    page,
}) => {
    const f = fixture();
    f.steps[1].notes = "تفاصيل التصدير";
    await loadBackup(page, f);
    await page.goto("/#backup");
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "تصدير JSON" }).click();
    const download = await downloadPromise;
    const path = await download.path();
    expect(path).toBeTruthy();
    const bad = fixture();
    bad.steps[0].parentId = "missing";
    await page.getByLabel("استيراد نسخة", { exact: true }).setInputFiles({
        name: "bad.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(bad)),
    });
    await expect(page.getByRole("status")).toContainText("النسخة غير صالحة");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.getByLabel("استيراد نسخة", { exact: true }).setInputFiles(path!);
    await page.getByRole("button", { name: "تأكيد استبدال البيانات" }).click();
    await page.goto("/#project/p");
    await expect(page.locator(".tree-row")).toHaveCount(12);
    await page.goto("/#step/s0-0");
    await expect(page.getByLabel("ملاحظات العنصر")).toHaveValue(
        "تفاصيل التصدير",
    );
});
test("شاشة 320 بكسل، الوضعان وغياب التمرير الأفقي", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await loadBackup(page, fixture());
    for (const route of [
        "home",
        "projects",
        "tasks",
        "ideas",
        "progress",
        "project/p",
        "step/s0-0",
        "backup",
    ]) {
        await page.goto("/#" + route);
        await expect(page.locator("h1")).toBeVisible();
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
            ),
            route,
        ).toBe(true);
    }
    await page.getByRole("button", { name: "الوضع الداكن" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.goto("/#progress");
    await page.screenshot({
        path: "/tmp/masar-mobile-dark.png",
        fullPage: true,
    });
    await page.getByRole("button", { name: "الوضع الفاتح" }).click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/#home");
    await page.screenshot({ path: "/tmp/masar-desktop.png", fullPage: true });
});
test("PWA: الأصول والبيانات متاحة دون إنترنت بعد إعادة التشغيل", async ({
    page,
    context,
}) => {
    await loadBackup(page, fixture());
    await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect
        .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
        .toBe(true);
    const manifest = await page.request.get("/manifest.webmanifest");
    expect(manifest.ok()).toBe(true);
    for (const size of [192, 512])
        expect((await page.request.get(`/icon-${size}.png`)).ok()).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(
        page.getByRole("heading", { name: "بياناتك في أمان" }),
    ).toBeVisible();
    await page.goto("/#project/p");
    await expect(
        page.getByRole("heading", { name: "دليل الهوية البصرية", level: 1 }),
    ).toBeVisible();
    await expect(page.locator(".tree-row")).toHaveCount(12);
    await page
        .getByRole("button", { name: "فصل 0-0 خطوة", exact: true })
        .click();
    await page.getByLabel("ملاحظات العنصر").fill("محفوظ دون إنترنت");
    await expect(page.getByText("محفوظ تلقائيًا")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("ملاحظات العنصر")).toHaveValue(
        "محفوظ دون إنترنت",
    );
    await context.setOffline(false);
});
test("مشروع طويل: استكمال آخر خطوة، حفظ موضع العودة، والتفرع العميق", async ({
    page,
}) => {
    const f = fixture();
    for (let i = 5; i < 65; i++)
        f.steps.push({
            ...f.steps[1],
            id: "long" + i,
            title: "خطوة طويلة " + i,
            order: i,
        });
    f.steps[1].status = "doing";
    f.steps[1].startedAt = at;
    f.events.push({
        id: "start",
        entityId: f.steps[1].id,
        entityKind: "step",
        title: f.steps[1].title,
        action: "started",
        at,
    });
    await loadBackup(page, f);
    await page.goto("/#home");
    await page.getByRole("button", { name: "استكمل من حيث توقفت" }).click();
    await expect(page).toHaveURL(/#step\/s0-0/);
    await page.goto("/#project/p");
    await page
        .getByRole("button", { name: "خطوة طويلة 64 خطوة", exact: true })
        .scrollIntoViewIfNeeded();
    const scroll = await page.evaluate(() => scrollY);
    await page
        .getByRole("button", { name: "خطوة طويلة 64 خطوة", exact: true })
        .click();
    await page.goBack();
    await expect
        .poll(() => page.evaluate(() => scrollY))
        .toBeGreaterThan(scroll - 80);
    const deep = fixture();
    let parent = "s0-0";
    for (let i = 0; i < 18; i++) {
        deep.steps.push({
            ...deep.steps[1],
            id: "nested" + i,
            parentId: parent,
            order: 0,
            title: "تفصيل طويل داخل خطوة متفرعة " + i,
        });
        parent = "nested" + i;
    }
    await loadBackup(page, deep);
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto("/#project/p");
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
        ),
    ).toBe(true);
    await expect(
        page.getByRole("button", {
            name: "تفصيل طويل داخل خطوة متفرعة 17 خطوة",
            exact: true,
        }),
    ).toBeVisible();
});
test("فشل حفظ الملاحظات يستعيد المسودة بعد إعادة التحميل ويمكن إعادة حفظها", async ({
    page,
}) => {
    await loadBackup(page, fixture());
    await page.goto("/#step/s0-0");
    await page.evaluate(() => {
        const original = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (value, key) {
            if (value.notes === "مسودة لم تُفقد")
                throw new DOMException("لا توجد مساحة", "QuotaExceededError");
            return original.call(this, value, key);
        };
    });
    await page.getByLabel("ملاحظات العنصر").fill("مسودة لم تُفقد");
    await expect(
        page.getByRole("button", { name: "حفظ المسودة مجددًا" }),
    ).toBeVisible();
    page.on("dialog", (d) => void d.accept());
    await page.reload();
    await expect(page.getByLabel("ملاحظات العنصر")).toHaveValue(
        "مسودة لم تُفقد",
    );
    await page.getByRole("button", { name: "حفظ المسودة مجددًا" }).click();
    await expect(page.getByText("محفوظ تلقائيًا")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("ملاحظات العنصر")).toHaveValue(
        "مسودة لم تُفقد",
    );
});
