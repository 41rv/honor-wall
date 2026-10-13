import { test, expect, type Page } from "@playwright/test";
import { sizedFixture, importData, readStore } from "./helpers";

test("طلب إلغاء الإتمام يبقى بعد تحديث فوري مع تأخر إشعار معاملة التخزين", async ({
    page,
}) => {
    await importData(page, sizedFixture(4));
    await page.goto("/#home");
    await page.evaluate(() => {
        const descriptor = Object.getOwnPropertyDescriptor(
            IDBTransaction.prototype,
            "oncomplete",
        )!;
        Object.defineProperty(IDBTransaction.prototype, "oncomplete", {
            configurable: true,
            get: descriptor.get,
            set(callback) {
                descriptor.set!.call(
                    this,
                    typeof callback === "function"
                        ? function (this: IDBTransaction, event: Event) {
                              setTimeout(
                                  () => callback.call(this, event),
                                  1000,
                              );
                          }
                        : callback,
                );
            },
        });
    });
    await page.locator('[data-completion-key="task/t0"]').click();
    await expect.poll(() => state(page, "tasks", "t0")).toBe("done");
    await page.locator('[data-completion-key="task/t0"]').click();
    await page.reload();
    await expect.poll(() => state(page, "tasks", "t0")).toBe("todo");
    await expect(
        page.locator('[data-completion-key="task/t0"]'),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
        await page.evaluate(() =>
            Object.keys(localStorage).filter((key) =>
                key.startsWith("masar-pending-completion/"),
            ),
        ),
    ).toEqual([]);
});

test("كثرة المشاريع والنصوص الطويلة تعرض خطوة واحدة لكل مشروع وتتيح عرض المزيد دون تكرار الإحصائيات", async ({
    page,
}) => {
    await page.setViewportSize({ width: 360, height: 844 });
    const data = fixture();
    data.tasks[0].title = "اسم مهمة طويل / " + "LongTaskTitle".repeat(15);
    const steps = data.steps;
    data.projects = Array.from({ length: 12 }, (_, i) => ({
        ...data.projects[0],
        id: `p-${i}`,
        title: `مشروع ${i} ` + "LongProjectTitle".repeat(14),
    }));
    data.steps = data.projects.flatMap((project, i) =>
        steps.map((step) => ({
            ...step,
            id: `${step.id}-${i}`,
            projectId: project.id,
            parentId: step.parentId === null ? null : `${step.parentId}-${i}`,
        })),
    );
    await importData(page, data);
    await page.goto("/#home");
    const home = page.getByRole("region", { name: "خطوات مشاريعك الآن" });
    await expect(home.locator(".project-card")).toHaveCount(4);
    await expect(home.locator(".execution-current")).toHaveCount(4);
    await home.getByRole("button", { name: /عرض المزيد من المشاريع/ }).click();
    await expect(home.locator(".project-card")).toHaveCount(8);
    await expect(home.locator(".execution-current")).toHaveCount(8);
    await expect(page.locator(".stat-card")).toHaveCount(0);
    expect(
        (await page
            .locator('[data-task-id="t0"] .task-main strong')
            .boundingBox())!.height,
    ).toBeLessThan(60);
    await expect(
        page
            .getByRole("region", { name: "مهامك الآن" })
            .getByRole("button", { name: /عرض كل المهام/ }),
    ).toBeVisible();
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
        ),
    ).toBe(true);
});

function fixture() {
    const data = sizedFixture(4);
    data.steps.push({
        ...data.steps[0],
        id: "stage-two",
        title: "مرحلة ثانية",
        order: 1,
    });
    for (const step of data.steps.filter(
        (s) => s.id === "s2" || s.id === "s3",
    )) {
        step.parentId = "stage-two";
        step.order -= 2;
    }
    return data;
}
async function state(page: Page, store: "steps" | "tasks", id: string) {
    return (await readStore(page, store)).find((item) => item.id === id)
        ?.status;
}
for (const mobile of [false, true]) {
    test.describe(
        mobile ? "تجربة التنفيذ باللمس" : "تجربة التنفيذ بالماوس",
        () => {
            test.use({
                viewport: { width: mobile ? 390 : 1366, height: 900 },
                isMobile: mobile,
                hasTouch: mobile,
            });
            test("إتمام البطاقة والرئيسية ثم إلغاء الإتمام والتبديل السريع يطابق التخزين والتقدم", async ({
                page,
            }) => {
                await importData(page, fixture());
                await page.goto("/#projects");
                const card = page.locator('[data-project-id="p"]');
                await expect(
                    card.locator(".execution-current"),
                ).toHaveAttribute("data-execution-id", "s0");
                await expect(card.locator(".execution-stage")).toHaveText(
                    "مرحلة الاختبار",
                );
                const toggle = card.locator('[data-completion-key="step/s0"]');
                if (mobile) await toggle.tap();
                else await toggle.click();
                await expect(
                    card.locator(".execution-current"),
                ).toHaveAttribute("data-execution-id", "s1");
                await expect(card.getByRole("progressbar")).toHaveAttribute(
                    "aria-valuenow",
                    "25",
                );
                await expect(card.locator(".execution-recent")).toHaveAttribute(
                    "data-completed-id",
                    "s0",
                );
                await page.goto("/#home");
                const home = page.getByRole("region", {
                    name: "خطوات مشاريعك الآن",
                });
                await expect(home.locator(".execution-current")).toHaveCount(1);
                await home.locator('[data-completion-key="step/s0"]').click();
                await expect
                    .poll(() => state(page, "steps", "s0"))
                    .toBe("todo");
                await expect(
                    home.locator(".execution-current"),
                ).toHaveAttribute("data-execution-id", "s0");
                await home
                    .locator('[data-completion-key="step/s0"]')
                    .evaluate((button: HTMLButtonElement) => {
                        for (let i = 0; i < 10; i++) button.click();
                    });
                await expect
                    .poll(() => state(page, "steps", "s0"))
                    .toBe("todo");
                for (let i = 0; i < 11; i++) {
                    const button = home.locator(
                        '[data-completion-key="step/s0"]',
                    );
                    if (mobile) await button.tap();
                    else await button.click();
                }
                await expect
                    .poll(() => state(page, "steps", "s0"))
                    .toBe("done");
                await expect(home.getByRole("progressbar")).toHaveAttribute(
                    "aria-valuenow",
                    "25",
                );
                await page.reload();
                await expect(
                    home.locator(".execution-current"),
                ).toHaveAttribute("data-execution-id", "s1");
                await home.locator('[data-completion-key="step/s0"]').click();
                await page.goto("/#project/p");
                await expect(page.getByRole("progressbar")).toHaveAttribute(
                    "aria-valuenow",
                    "0",
                );
                await page
                    .locator(
                        '[data-step-id="s0"] [data-completion-key="step/s0"]',
                    )
                    .click();
                await page.goto("/#home");
                await expect(home.getByRole("progressbar")).toHaveAttribute(
                    "aria-valuenow",
                    "25",
                );
                await home.locator('[data-completion-key="step/s1"]').click();
                await expect(
                    home.locator(".execution-current"),
                ).toHaveAttribute("data-execution-id", "s2");
                await expect(home.locator(".execution-stage")).toHaveText(
                    "مرحلة ثانية",
                );
                await expect(home.getByRole("progressbar")).toHaveAttribute(
                    "aria-valuenow",
                    "50",
                );
                const tasks = page.getByRole("region", { name: "مهامك الآن" });
                await tasks
                    .locator('[data-completion-key="task/t0"]')
                    .evaluate((button: HTMLButtonElement) => {
                        for (let i = 0; i < 11; i++) button.click();
                    });
                await expect
                    .poll(() => state(page, "tasks", "t0"))
                    .toBe("done");
                await expect(tasks.locator(".home-recent")).toHaveAttribute(
                    "open",
                    "",
                );
                await tasks.locator('[data-completion-key="task/t0"]').click();
                await expect
                    .poll(() => state(page, "tasks", "t0"))
                    .toBe("todo");
                await page.reload();
                await expect(
                    tasks.locator('[data-completion-key="task/t0"]'),
                ).toHaveAttribute("aria-pressed", "false");
            });
            test("الاستكمال يبقى بعد إعادة الفتح ويتعامل مع الحذف والأرشفة والإكمال", async ({
                page,
            }) => {
                const data = fixture();
                data.steps.find((s) => s.id === "s2")!.status = "doing";
                data.steps.find((s) => s.id === "s2")!.startedAt =
                    data.exportedAt;
                await importData(page, data);
                await page.goto("/#step/s3");
                await expect(page.getByLabel("تعديل الاسم")).toHaveValue(
                    "خطوة 3",
                );
                await page
                    .getByLabel("ملاحظات العنصر")
                    .fill("مكان العودة المحفوظ");
                await page.goto("/#home");
                const resume = page.getByRole("region", {
                    name: "اختصار الاستكمال",
                });
                await expect(resume).toContainText("خطوة 3");
                await expect(resume).toContainText("مرحلة ثانية");
                await page.reload();
                await resume
                    .getByRole("button", { name: "أكمل من حيث توقفت" })
                    .click();
                await expect(page).toHaveURL(/#step\/s3/);
                await expect(page.getByLabel("ملاحظات العنصر")).toHaveValue(
                    "مكان العودة المحفوظ",
                );
                await page
                    .getByRole("button", { name: "حذف", exact: true })
                    .click();
                await page
                    .getByRole("button", { name: "تأكيد", exact: true })
                    .click();
                await page.goto("/#home");
                await expect(resume).toContainText("خطوة 2");
                await page
                    .getByRole("button", {
                        name: "إجراءات المشروع «مشروع 4 خطوة»",
                    })
                    .click();
                await page
                    .getByRole("dialog")
                    .getByRole("button", { name: "أرشفة", exact: true })
                    .click();
                await expect(resume).toContainText(
                    "لا توجد خطوة تنتظر التنفيذ",
                );
                await expect(resume.getByRole("button")).toHaveCount(0);
                await page.goto("/#projects");
                await page.getByRole("button", { name: /المؤرشفة/ }).click();
                await page
                    .getByRole("button", {
                        name: "إجراءات المشروع «مشروع 4 خطوة»",
                    })
                    .click();
                await page
                    .getByRole("dialog")
                    .getByRole("button", { name: "إلغاء الأرشفة" })
                    .click();
                await page.goto("/#home");
                await expect(resume).toContainText("خطوة 2");
                await page
                    .getByRole("region", { name: "خطوات مشاريعك الآن" })
                    .locator('[data-completion-key="step/s2"]')
                    .click();
                await expect(resume).toContainText("خطوة 0");
            });
        },
    );
}
test("إكمال آخر خطوة يبقي الوصول إليها وإلغاء إتمامها بعد إعادة التحميل والمشروع الفارغ واضح", async ({
    page,
}) => {
    const data = sizedFixture(1);
    await importData(page, data);
    await page.goto("/#home");
    const task = page.locator('[data-completion-key="task/t0"]');
    await task.focus();
    await task.press("Enter");
    await expect.poll(() => state(page, "tasks", "t0")).toBe("done");
    await expect(
        page.locator('.home-recent [data-completion-key="task/t0"]'),
    ).toBeFocused();
    await page.keyboard.press("Space");
    await expect.poll(() => state(page, "tasks", "t0")).toBe("todo");
    await expect(task).toBeFocused();
    const leaf = page.locator('[data-completion-key="step/s0"]');
    await leaf.focus();
    await leaf.press("Enter");
    await expect
        .poll(async () => (await readStore(page, "projects"))[0].status)
        .toBe("closed");
    await expect(
        page.locator('.home-recent [data-completion-key="step/s0"]'),
    ).toBeFocused();
    await page.reload();
    await expect(
        page.getByText("آخر خطوة أُنجزت في مشروع مكتمل", { exact: true }),
    ).toBeVisible();
    for (let i = 0; i < 11; i++)
        await page.locator('[data-completion-key="step/s0"]').click();
    await page.reload();
    await expect(
        page.locator('[data-completion-key="step/s0"]'),
    ).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => state(page, "steps", "s0")).toBe("todo");
    await page.goto("/#project/p");
    await expect(page.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "0",
    );
    await page
        .getByRole("button", { name: "إعادة فتح المشروع", exact: true })
        .click();
    await page.goto("/#home");
    await expect(page.locator(".execution-current")).toHaveAttribute(
        "data-execution-id",
        "s0",
    );
    const empty = sizedFixture(0);
    await importData(page, empty);
    await page.goto("/#home");
    await expect(
        page.getByRole("region", { name: "خطوات مشاريعك الآن" }),
    ).toContainText("لم تُضف خطوات بعد");
    await expect(page.locator(".execution-current")).toHaveCount(0);
});
test("الهوية مستقلة عن الوضع وتبقى الثيمات الأربعة واتباع النظام بعد إعادة الفتح", async ({
    page,
}) => {
    await importData(page, fixture());
    for (const identity of ["green", "mono"])
        for (const mode of ["light", "dark"]) {
            await page.getByRole("button", { name: "المظهر والألوان" }).click();
            await page
                .getByLabel("الهوية", { exact: true })
                .selectOption(identity);
            await page.getByLabel("الوضع", { exact: true }).selectOption(mode);
            await page
                .getByRole("dialog")
                .getByRole("button", { name: "تم", exact: true })
                .click();
            await expect(page.locator("html")).toHaveAttribute(
                "data-identity",
                identity,
            );
            await expect(page.locator("html")).toHaveAttribute(
                "data-theme",
                mode,
            );
            await page.goto("/#project/p");
            await expect(page.getByRole("progressbar")).toHaveAttribute(
                "aria-valuenow",
                "0",
            );
            await page.reload();
            await expect(page.locator("html")).toHaveAttribute(
                "data-identity",
                identity,
            );
            await expect(page.locator("html")).toHaveAttribute(
                "data-theme",
                mode,
            );
        }
    await page.getByRole("button", { name: "المظهر والألوان" }).click();
    await page.getByLabel("الوضع", { exact: true }).selectOption("system");
    await page
        .getByRole("dialog")
        .getByRole("button", { name: "تم", exact: true })
        .click();
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page
        .getByRole("button", { name: "الوضع الفاتح", exact: true })
        .click();
    await expect(page.locator("html")).toHaveAttribute("data-identity", "mono");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
test("زر الإجراءات ولوحة المفاتيح والقائمة تحترم التأكيد والتراجع والتعديل والتحويل", async ({
    page,
}) => {
    await importData(page, fixture());
    await page.goto("/#tasks");
    const trigger = page.getByRole("button", {
        name: "إجراءات المهمة «مهمة 0»",
    });
    await trigger.focus();
    await trigger.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(
        dialog.getByRole("button", { name: "تعديل الاسم والملاحظات" }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await trigger.click();
    await dialog
        .getByRole("button", { name: "تعديل الاسم والملاحظات" })
        .click();
    await expect(page).toHaveURL(/#task\/t0/);
    await expect(page.getByLabel("تعديل الاسم")).toBeFocused();
    await page.goto("/#tasks");
    await trigger.click();
    await dialog.getByRole("button", { name: "حذف", exact: true }).click();
    await expect(dialog).toContainText("يمكنك التراجع");
    await dialog.getByRole("button", { name: "إلغاء", exact: true }).click();
    expect(await state(page, "tasks", "t0")).toBe("todo");
    await trigger.click();
    await dialog.getByRole("button", { name: "حذف", exact: true }).click();
    await dialog.getByRole("button", { name: "تأكيد", exact: true }).click();
    await page.getByRole("button", { name: "تراجع", exact: true }).click();
    await expect.poll(() => state(page, "tasks", "t0")).toBe("todo");
    await page.goto("/#ideas");
    await page
        .getByRole("button", { name: "إجراءات الفكرة «فكرة للاختبار»" })
        .click();
    await dialog.getByRole("button", { name: "تحويل إلى مهمة" }).click();
    await dialog.getByRole("button", { name: "تأكيد", exact: true }).click();
    await expect(page.getByLabel("تعديل الاسم")).toHaveValue("فكرة للاختبار");
    await page.goto("/#project/p");
    await page
        .getByRole("button", {
            name: "إجراءات الخطوة أو المرحلة «مرحلة الاختبار»",
        })
        .click();
    await dialog.getByRole("button", { name: "إضافة خطوة داخله" }).click();
    await dialog.getByLabel("الاسم", { exact: true }).fill("من القائمة");
    await dialog.getByRole("button", { name: "إضافة", exact: true }).click();
    await expect(
        page.getByRole("button", { name: "من القائمة خطوة", exact: true }),
    ).toBeVisible();
    expect(
        await page
            .locator('[data-step-id="stage"] .tree-name')
            .evaluate((el) => getComputedStyle(el).fontWeight),
    ).toBe("700");
});
test("الضغط المطول بالماوس يفتح قائمة واحدة ويمنع التنقل ثم يلغى بالحركة", async ({
    page,
}) => {
    await importData(page, fixture());
    await page.goto("/#projects");
    const title = page.locator('[data-project-id="p"] > .title-link');
    const box = (await title.boundingBox())!;
    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.down();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.mouse.up();
    await expect(page).toHaveURL(/#projects$/);
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + 60, box.y + 20);
    await page.waitForTimeout(650);
    await page.mouse.up();
    await expect(page.getByRole("dialog")).toHaveCount(0);
});
test.describe("ضغط مطول باللمس وتمرير طبيعي", () => {
    test.use({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
    });
    test("إلغاء القائمة بالحركة والتمرير، وفتحها بعد ثبات الإصبع دون نقرة تسرب", async ({
        page,
        context,
    }) => {
        await importData(page, fixture());
        await page.goto("/#tasks");
        const target = page.locator('[data-task-id="t0"] .task-main');
        await target.scrollIntoViewIfNeeded();
        const box = (await target.boundingBox())!;
        const session = await context.newCDPSession(page);
        const point = { x: box.x + 40, y: box.y + 20 };
        await session.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [point],
        });
        await session.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x: point.x, y: point.y - 55 }],
        });
        await page.waitForTimeout(700);
        await session.send("Input.dispatchTouchEvent", {
            type: "touchEnd",
            touchPoints: [],
        });
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await target.scrollIntoViewIfNeeded();
        const actual = (await target.boundingBox())!;
        await session.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [{ x: actual.x + 40, y: actual.y + 20 }],
        });
        await expect(page.getByRole("dialog")).toBeVisible();
        await session.send("Input.dispatchTouchEvent", {
            type: "touchEnd",
            touchPoints: [],
        });
        await expect(page.getByRole("dialog")).toHaveCount(1);
        await expect(page).toHaveURL(/#tasks$/);
        const modal = (await page.getByRole("dialog").boundingBox())!;
        expect(modal.y + modal.height).toBeLessThanOrEqual(844);
        await page
            .getByRole("dialog")
            .getByRole("button", { name: "إغلاق", exact: true })
            .tap();
        await target.tap();
        await expect(page).toHaveURL(/#task\/t0/);
    });
});
