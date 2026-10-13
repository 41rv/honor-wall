import { test, expect, type Page } from "@playwright/test";
import { importData, largeFixture } from "./helpers";
import { readFile } from "node:fs/promises";
async function add(page: Page, button: string, title: string, notes = "") {
    await page.getByRole("button", { name: button, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("الاسم", { exact: true }).fill(title);
    if (notes) await dialog.getByRole("textbox").nth(1).fill(notes);
    await dialog.getByRole("button", { name: "إضافة", exact: true }).click();
    await expect(dialog).not.toBeVisible();
}
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
    const list: string[] = [];
    errors.set(page, list);
    page.on("pageerror", (e) => list.push(e.message));
    await page.goto("/");
});
test.afterEach(async ({ page }) => {
    expect(errors.get(page)).toEqual([]);
});
test("أزرار الإضافة والإلغاء والإغلاق والبحث والتنقل والضغط المتكرر", async ({
    page,
}) => {
    await page
        .getByRole("button", { name: "إضافة سريعة", exact: true })
        .first()
        .click();
    await page
        .getByRole("dialog")
        .getByRole("button", { name: /مشروع/ })
        .click();
    await page
        .getByRole("dialog")
        .getByRole("button", { name: "إلغاء", exact: true })
        .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.getByRole("button", { name: "ابدأ مشروعك الأول" }).click();
    await page.getByRole("button", { name: "إغلاق", exact: true }).click();
    await page.getByRole("button", { name: "ابدأ مشروعك الأول" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.getByRole("button", { name: "ابدأ مشروعك الأول" }).click();
    await page.mouse.click(5, 5);
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.getByRole("button", { name: "ابدأ مشروعك الأول" }).click();
    await page
        .getByRole("dialog")
        .getByLabel("الاسم", { exact: true })
        .fill("   ");
    await page
        .getByRole("dialog")
        .getByRole("button", { name: "إضافة", exact: true })
        .click();
    await expect(page.getByRole("alert")).toContainText("أدخل اسمًا");
    await page
        .getByRole("dialog")
        .getByLabel("الاسم", { exact: true })
        .fill("إضافة واحدة");
    await page
        .getByRole("dialog")
        .locator("form")
        .evaluate((form) => {
            form.dispatchEvent(
                new Event("submit", { bubbles: true, cancelable: true }),
            );
            form.dispatchEvent(
                new Event("submit", { bubbles: true, cancelable: true }),
            );
        });
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(
        page.getByRole("button", { name: "إضافة واحدة", exact: true }),
    ).toHaveCount(1);
    await page.getByLabel("بحث شامل").fill("إضافة واحدة");
    await page.locator(".search-result").click();
    await expect(page).toHaveURL(/#project/);
    await page.getByLabel("بحث شامل").fill("لن أجده");
    await expect(page.getByText("لم نجد نتيجة")).toBeVisible();
    await page.getByRole("button", { name: "مسح البحث" }).click();
    await expect(page.getByLabel("ملاحظات العنصر")).toBeVisible();
    for (const name of [
        "الرئيسية",
        "المشاريع",
        "المهام",
        "الأفكار",
        "التقدم",
    ]) {
        await page
            .locator(".navigation")
            .getByRole("link", { name, exact: true })
            .click();
        await expect(page.locator("h1")).toBeVisible();
    }
    await page.locator(".brand").click();
    await expect(page).toHaveURL(/#home/);
    await page.getByRole("button", { name: "إخفاء الرسالة" }).click();
    await expect(page.getByRole("status")).not.toBeVisible();
});
test("كل أزرار المراحل والخطوات: إضافة وتفاصيل وترتيب وطي وحالات وحذف وتراجع", async ({
    page,
}) => {
    await page.goto("/#projects");
    await add(page, "مشروع جديد", "جولة الأزرار");
    await page
        .getByRole("button", { name: "جولة الأزرار", exact: true })
        .click();
    await add(page, "مرحلة", "المرحلة الأولى");
    await add(page, "مرحلة", "المرحلة الثانية");
    await page
        .getByRole("button", { name: "إضافة داخل المرحلة الأولى" })
        .click();
    await page
        .getByRole("dialog")
        .getByLabel("الاسم", { exact: true })
        .fill("الخطوة الأولى");
    await page
        .getByRole("dialog")
        .getByRole("button", { name: "إضافة", exact: true })
        .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.getByRole("button", { name: "طي المرحلة الأولى" }).click();
    await expect(
        page.getByRole("button", { name: "الخطوة الأولى خطوة", exact: true }),
    ).not.toBeVisible();
    await page.getByRole("button", { name: "توسيع المرحلة الأولى" }).click();
    await page.getByRole("button", { name: "خفض المرحلة الأولى" }).click();
    await expect(
        page
            .locator(".tree-row")
            .filter({
                has: page.getByRole("button", {
                    name: "المرحلة الأولى مرحلة",
                    exact: true,
                }),
            })
            .locator(".tree-number"),
    ).toHaveText("2");
    await page.getByRole("button", { name: "رفع المرحلة الأولى" }).click();
    await expect(
        page.getByRole("button", { name: "رفع المرحلة الأولى" }),
    ).toBeDisabled();
    await page
        .getByRole("button", { name: "الخطوة الأولى خطوة", exact: true })
        .click();
    await expect(page.getByLabel("تعديل الاسم")).toHaveValue("الخطوة الأولى");
    await add(page, "خطوة", "الخطوة الفرعية");
    await page
        .getByRole("button", { name: "الخطوة الفرعية خطوة", exact: true })
        .click();
    await expect(page.getByLabel("تعديل الاسم")).toHaveValue("الخطوة الفرعية");
    await page
        .getByLabel("ملاحظات العنصر")
        .fill("ملاحظة باقية بعد الحذف والتراجع");
    for (const name of ["جارٍ العمل", "مكتملة", "لم تبدأ"])
        await page.getByRole("button", { name, exact: true }).click();
    await page.getByRole("button", { name: "حذف", exact: true }).click();
    await page
        .getByRole("dialog")
        .getByRole("button", { name: "إلغاء", exact: true })
        .click();
    await expect(page.getByLabel("ملاحظات العنصر")).toHaveValue(
        "ملاحظة باقية بعد الحذف والتراجع",
    );
    await page.getByRole("button", { name: "حذف", exact: true }).click();
    await page
        .getByRole("dialog")
        .getByRole("button", { name: "تأكيد", exact: true })
        .click();
    await page.getByRole("button", { name: "تراجع", exact: true }).click();
    await page
        .getByRole("button", { name: "المرحلة الأولى مرحلة", exact: true })
        .click();
    await page
        .getByRole("button", { name: "الخطوة الأولى خطوة متفرعة", exact: true })
        .click();
    await page
        .getByRole("button", { name: "الخطوة الفرعية خطوة", exact: true })
        .click();
    await expect(page.getByLabel("ملاحظات العنصر")).toHaveValue(
        "ملاحظة باقية بعد الحذف والتراجع",
    );
    await page.getByRole("button", { name: "العودة للمشروع" }).click();
    // The earlier completion closed this project automatically; reopening a
    // step alone preserves the project's explicit completion state.
    await page.getByRole("button", { name: "إعادة فتح المشروع" }).click();
    await page.getByRole("button", { name: "إتمام المشروع" }).click();
    await page.getByRole("button", { name: "إعادة فتح المشروع" }).click();
    await page.getByRole("button", { name: "أرشفة", exact: true }).click();
    await page.getByRole("button", { name: "إلغاء الأرشفة" }).click();
    await page.getByRole("button", { name: "حذف", exact: true }).click();
    await page
        .getByRole("dialog")
        .getByRole("button", { name: "تأكيد", exact: true })
        .click();
    await page.getByRole("button", { name: "تراجع", exact: true }).click();
    await page
        .getByRole("button", { name: "افتح المشروع", exact: true })
        .click();
    await expect(
        page.getByRole("button", { name: "المرحلة الأولى مرحلة", exact: true }),
    ).toBeVisible();
});
test.describe("محاكاة هاتف ولمس", () => {
    test.use({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
    });
    test("الصح باللمس وإعادة الفتح وتفاصيل المهمة وحالاتها والإلغاء والتراجع", async ({
        page,
    }) => {
        await page
            .getByRole("button", { name: "إضافة سريعة", exact: true })
            .last()
            .tap();
        await page
            .getByRole("dialog")
            .getByRole("button", { name: /مهمة/ })
            .tap();
        await page
            .getByRole("dialog")
            .getByLabel("الاسم", { exact: true })
            .fill("لمسة واحدة");
        await page
            .getByRole("dialog")
            .getByRole("button", { name: "إضافة", exact: true })
            .tap();
        await expect(page.getByRole("dialog")).not.toBeVisible();
        const mark = page.getByRole("button", { name: "إكمال لمسة واحدة" });
        const box = (await mark.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
        await mark.tap();
        await expect(page.getByRole("status")).toContainText("أُنجزت");
        await expect(page.locator(".completed-list")).toHaveAttribute(
            "open",
            "",
        );
        await expect(
            page.getByRole("button", { name: "إعادة فتح لمسة واحدة" }),
        ).toHaveAttribute("aria-pressed", "true");
        await page.locator(".completed-list summary").tap();
        await expect(
            page.getByRole("button", { name: "إعادة فتح لمسة واحدة" }),
        ).not.toBeVisible();
        await page.locator(".completed-list summary").tap();
        await page.getByRole("button", { name: "إعادة فتح لمسة واحدة" }).tap();
        await expect(
            page.getByRole("button", { name: "إكمال لمسة واحدة" }),
        ).toHaveAttribute("aria-pressed", "false");
        await page.getByRole("button", { name: "تفاصيل لمسة واحدة" }).tap();
        await page.getByLabel("تعديل الاسم").fill("عنوان معدل");
        await page.getByLabel("ملاحظات العنصر").fill("ملاحظات المهمة المعدلة");
        await page
            .getByRole("button", { name: "جارٍ العمل", exact: true })
            .tap();
        await page.getByRole("button", { name: "مكتملة", exact: true }).tap();
        await page.getByRole("button", { name: "لم تبدأ", exact: true }).tap();
        await page.getByRole("button", { name: "حذف", exact: true }).tap();
        await page
            .getByRole("dialog")
            .getByRole("button", { name: "تأكيد", exact: true })
            .tap();
        await page.getByRole("button", { name: "تراجع", exact: true }).tap();
        await page
            .getByRole("button", { name: /عنوان معدل ملاحظات المهمة المعدلة/ })
            .tap();
        await expect(page.getByLabel("ملاحظات العنصر")).toHaveValue(
            "ملاحظات المهمة المعدلة",
        );
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
            ),
        ).toBe(true);
    });
    test("الأفكار: إضافة سريعة وتعديل وبحث وأرشفة واستعادة وتحويل وإلغاء التحويل", async ({
        page,
    }) => {
        await page.locator(".mobile-fab").tap();
        await page
            .getByRole("dialog")
            .getByRole("button", { name: /^فكرة / })
            .tap();
        await page
            .getByRole("dialog")
            .getByLabel("الاسم", { exact: true })
            .fill("فكرة الهاتف");
        await page
            .getByRole("dialog")
            .getByRole("button", { name: "إضافة", exact: true })
            .tap();
        await expect(page.getByRole("dialog")).not.toBeVisible();
        await page
            .getByRole("button", { name: "فكرة الهاتف", exact: true })
            .tap();
        await page.getByLabel("تعديل الاسم").fill("فكرة معدلة");
        await page.getByLabel("ملاحظات العنصر").fill("وصف الفكرة على الهاتف");
        await page.getByRole("button", { name: "أرشفة", exact: true }).tap();
        await page.getByRole("button", { name: "إلغاء الأرشفة" }).tap();
        await page.getByRole("button", { name: "تحويل إلى مشروع" }).tap();
        await page
            .getByRole("dialog")
            .getByRole("button", { name: "إلغاء", exact: true })
            .tap();
        await expect(page).toHaveURL(/#idea/);
        await page.getByRole("button", { name: "تحويل إلى مهمة" }).tap();
        await page
            .getByRole("dialog")
            .getByRole("button", { name: "تأكيد", exact: true })
            .tap();
        await expect(page).toHaveURL(/#task/);
        await expect(page.getByLabel("ملاحظات العنصر")).toHaveValue(
            "وصف الفكرة على الهاتف",
        );
        await page
            .locator(".navigation")
            .getByRole("link", { name: "الأفكار", exact: true })
            .tap();
        await page.getByRole("button", { name: "الأرشيف", exact: true }).tap();
        await expect(
            page.getByRole("button", { name: "فكرة معدلة", exact: true }),
        ).toBeVisible();
        await page.getByLabel("بحث شامل").fill("وصف الفكرة");
        await expect(page.locator(".search-result")).toHaveCount(2);
        await page.getByRole("button", { name: "مسح البحث" }).tap();
        await page.getByRole("button", { name: "الأفكار المفتوحة" }).tap();
        await expect(page.getByText("امنح أفكارك مكانًا")).toBeVisible();
    });
});
test("تصدير الملاحظات فور الكتابة والتحقق وإلغاء الاستيراد والتثبيت المتاح", async ({
    page,
}) => {
    await page.goto("/#projects");
    await add(page, "مشروع جديد", "بياناتي");
    await page.getByRole("button", { name: "بياناتي", exact: true }).click();
    await page.getByLabel("ملاحظات العنصر").fill("آخر نص قبل التنقل السريع");
    await page
        .locator(".topbar")
        .getByRole("button", { name: "النسخ الاحتياطي", exact: true })
        .click();
    const promise = page.waitForEvent("download");
    await page.getByRole("button", { name: "تصدير JSON" }).click();
    const download = await promise;
    const filename = (await download.path())!;
    const snapshot = JSON.parse(await readFile(filename, "utf8"));
    expect(snapshot.projects[0].notes).toBe("آخر نص قبل التنقل السريع");
    await page
        .getByLabel("استيراد نسخة", { exact: true })
        .setInputFiles(filename);
    await page
        .getByRole("dialog")
        .getByRole("button", { name: "إلغاء", exact: true })
        .click();
    await page.getByLabel("استيراد نسخة", { exact: true }).setInputFiles({
        name: "broken.json",
        mimeType: "application/json",
        buffer: Buffer.from("{broken"),
    });
    await expect(page.getByRole("status")).toContainText(
        "الملف ليس ملف JSON صالحًا",
    );
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.evaluate(() => {
        const event = new Event("beforeinstallprompt");
        Object.defineProperty(event, "prompt", {
            value: async () => {
                (
                    window as typeof window & { installCalled: number }
                ).installCalled = 1;
            },
        });
        window.dispatchEvent(event);
    });
    await page
        .getByRole("button", { name: "تثبيت التطبيق", exact: true })
        .click();
    expect(
        await page.evaluate(
            () =>
                (window as typeof window & { installCalled: number })
                    .installCalled,
        ),
    ).toBe(1);
    await expect(
        page.getByRole("button", { name: "تثبيت التطبيق", exact: true }),
    ).not.toBeVisible();
});
test("فشل إتمام المهمة يعيد علامتها لحالتها السابقة ولا يسجل إنجازًا زائفًا", async ({
    page,
}) => {
    await page.goto("/#tasks");
    await add(page, "مهمة جديدة", "فشل الإتمام");
    await page.evaluate(() => {
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (value, key) {
            if (this.name === "tasks" && value.status === "done")
                throw new DOMException("تعذر الحفظ", "QuotaExceededError");
            return put.call(this, value, key);
        };
    });
    await page.getByRole("button", { name: "إكمال فشل الإتمام" }).click();
    await expect(page.getByRole("status")).toContainText("تعذر الحفظ");
    await expect(
        page.getByRole("button", { name: "إكمال فشل الإتمام" }),
    ).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator(".completed-list")).toContainText(
        "المهام المنجزة 0",
    );
    await page.reload();
    await page.getByRole("button", { name: "إكمال فشل الإتمام" }).click();
    await expect(
        page.getByRole("button", { name: "إعادة فتح فشل الإتمام" }),
    ).toHaveAttribute("aria-pressed", "true");
});
test("الكتابة السريعة تدمج الحفظ وتبقى الملاحظات بعد رجوع فوري", async ({
    page,
}) => {
    await page.goto("/#projects");
    await add(page, "مشروع جديد", "كتابة سريعة");
    await page
        .getByRole("button", { name: "كتابة سريعة", exact: true })
        .click();
    await page.evaluate(() => {
        (window as typeof window & { noteWrites: number }).noteWrites = 0;
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (value, key) {
            if (this.name === "projects" && value.notes)
                (window as typeof window & { noteWrites: number }).noteWrites++;
            return put.call(this, value, key);
        };
    });
    await page
        .getByLabel("ملاحظات العنصر")
        .pressSequentially("هذه ملاحظات أطول للتحقق من سرعة كتابة النصوص");
    await page.getByRole("button", { name: "العودة للقائمة" }).click();
    await page
        .getByRole("button", { name: "كتابة سريعة", exact: true })
        .click();
    await expect(page.getByLabel("ملاحظات العنصر")).toHaveValue(
        "هذه ملاحظات أطول للتحقق من سرعة كتابة النصوص",
    );
    expect(
        await page.evaluate(
            () => (window as typeof window & { noteWrites: number }).noteWrites,
        ),
    ).toBeLessThan(8);
    await page.reload();
    await expect(page.getByLabel("ملاحظات العنصر")).toHaveValue(
        "هذه ملاحظات أطول للتحقق من سرعة كتابة النصوص",
    );
});
test("روابط الرئيسية والإنجازات تفتح المشروع والمهمة والخطوة في مكانها", async ({
    page,
}) => {
    const data = largeFixture();
    data.projects = data.projects.slice(0, 1);
    data.steps = data.steps.filter((s) => s.projectId === "p0").slice(0, 11);
    data.tasks = data.tasks.slice(0, 1);
    data.events = [];
    await importData(page, data);
    await page.goto("/#step/step0-0-0");
    await page.getByRole("button", { name: "لم تبدأ", exact: true }).click();
    await page.getByRole("button", { name: "جارٍ العمل", exact: true }).click();
    await page.goto("/#home");
    await page.getByRole("button", { name: "أكمل من حيث توقفت" }).click();
    await expect(page).toHaveURL(/#step\/step0-0-0/);
    await page.getByRole("button", { name: "مكتملة", exact: true }).click();
    await page.goto("/#home");
    await page
        .getByRole("button", { name: "كل المشاريع", exact: true })
        .click();
    await expect(page).toHaveURL(/#projects/);
    await page.goto("/#home");
    await page.getByRole("button", { name: "إلى المهام", exact: true }).click();
    await page
        .getByRole("button", { name: "إكمال مهمة 0", exact: true })
        .click();
    await page.goto("/#progress");
    await page
        .locator(".achievement-row")
        .filter({ hasText: "مهمة 0" })
        .click();
    await expect(page).toHaveURL(/#task\/t0/);
    await page.goto("/#progress");
    await page
        .locator(".achievement-row")
        .filter({ hasText: "خطوة 0-0" })
        .click();
    await expect(page).toHaveURL(/#step\/step0-0-0/);
    await page.goto("/#progress");
    await page
        .locator(".dashboard-project")
        .getByRole("button", { name: "مشروع 0", exact: true })
        .click();
    await expect(page).toHaveURL(/#project\/p0/);
    await page.goto("/#home");
    await page
        .locator(".last-edited")
        .getByRole("button", { name: "مشروع 0", exact: true })
        .click();
    await expect(page).toHaveURL(/#project\/p0/);
    await page.locator(".backup-link").click();
    await expect(page).toHaveURL(/#backup/);
});
test("رسالة فشل فتح التخزين وزر إعادة المحاولة يستعيدان التطبيق دون حذف البيانات", async ({
    page,
}) => {
    await page.addInitScript(() => {
        if (!sessionStorage.getItem("storage-recovered")) {
            IDBFactory.prototype.open = () => {
                throw new DOMException(
                    "محاكاة تخزين غير متاح",
                    "SecurityError",
                );
            };
            IDBObjectStore.prototype.getAll = () => {
                throw new DOMException(
                    "محاكاة تخزين غير متاح",
                    "SecurityError",
                );
            };
            document.addEventListener(
                "click",
                (e) => {
                    if (
                        (e.target as HTMLElement)
                            .closest("button")
                            ?.textContent?.includes("إعادة المحاولة")
                    )
                        sessionStorage.setItem("storage-recovered", "1");
                },
                true,
            );
        }
    });
    await page.reload();
    await expect(
        page.getByRole("heading", { name: "تعذر فتح مساحتك" }),
    ).toBeVisible();
    await page
        .getByRole("button", { name: "إعادة المحاولة", exact: true })
        .click();
    await expect(
        page.getByRole("heading", { name: "مساحة هادئة. لإنجاز أكبر." }),
    ).toBeVisible();
});
