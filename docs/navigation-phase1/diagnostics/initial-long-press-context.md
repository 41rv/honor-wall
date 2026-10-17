# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ux.spec.ts >> الضغط المطول بالماوس يفتح قائمة واحدة ويمنع التنقل ثم يلغى بالحركة
- Location: tests/browser/ux.spec.ts:495:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('dialog')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('dialog') with timeout 5000ms
  - waiting for getByRole('dialog')

```

```yaml
- complementary:
  - link "مسار مساحة لإنجازك":
    - /url: "#home"
    - strong: مسار مساحة لإنجازك
  - text: مساحتك الشخصية
  - navigation "التنقل الرئيسي":
    - link "العادات":
      - /url: "#habits"
    - link "الرئيسية":
      - /url: "#home"
    - link "المشاريع":
      - /url: "#projects"
  - strong: لك وحدك. على جهازك.
  - paragraph: بلا حسابات، بلا ضجيج.
  - button "النسخ الاحتياطي"
- banner:
  - text: مسار / المشاريع
  - button "النسخ الاحتياطي"
  - button "الوضع الداكن"
  - button "المظهر والألوان"
  - link "المهام":
    - /url: "#tasks"
- main:
  - text: خطوة صغيرة، أثر مستمر
  - heading "مشاريعك" [level=1]
  - paragraph: من الفكرة الكبيرة إلى الخطوة التالية.
  - textbox "بحث شامل":
    - /placeholder: ابحث في مشاريعك، مهامك، أفكارك وملاحظاتك…
  - text: بحث محلي
  - navigation "أدوات التنظيم":
    - link "المهام مهامك ومواعيدك":
      - /url: "#tasks"
      - strong: المهام
      - text: مهامك ومواعيدك
    - link "الأفكار أفكارك المحفوظة":
      - /url: "#ideas"
      - strong: الأفكار
      - text: أفكارك المحفوظة
    - link "التقدم الإحصاءات والرؤى والسجل":
      - /url: "#progress"
      - strong: التقدم
      - text: الإحصاءات والرؤى والسجل
  - button "استيراد مشروع"
  - paragraph: ملف JSON يضيف مشروعًا جديدًا. راجع محتواه قبل الحفظ.
  - group "تصفية المشاريع":
    - button "النشطة 1" [pressed]
    - button "الموقوفة مؤقتًا 0"
    - button "المغلقة 0"
    - button "المؤرشفة 0"
  - group: إعداد المشاريع النشطة
  - article:
    - button "إجراءات المشروع «مشروع 4 خطوة»"
    - button "إتمام المشروع «مشروع 4 خطوة»"
    - text: نشط / 01
    - button "مشروع 4 خطوة"
    - paragraph: مساحة لخطوتك التالية.
    - text: 0 من 4 خطوات مكتملة
    - strong: 0%
    - progressbar "تقدم المشروع"
    - text: خطوتك التالية
    - strong: · المرحلة 1
    - button "خطوة 0"
    - button "إتمام الخطوة «خطوة 0»"
    - text: آخر تعديل 16‏/10‏/2026، 11:38 م
    - button "افتح المشروع"
  - text: خطوة واضحة، ذهن أهدأ. محفوظ محليًا على جهازك
- button "إضافة سريعة"
- status:
  - text: تم استيراد النسخة بالكامل.
  - button "إخفاء الرسالة"
```

# Test source

```ts
  404 |                 mode,
  405 |             );
  406 |             await page.goto("/#project/p");
  407 |             await expect(page.getByRole("progressbar")).toHaveAttribute(
  408 |                 "aria-valuenow",
  409 |                 "0",
  410 |             );
  411 |             await page.reload();
  412 |             await expect(page.locator("html")).toHaveAttribute(
  413 |                 "data-identity",
  414 |                 identity,
  415 |             );
  416 |             await expect(page.locator("html")).toHaveAttribute(
  417 |                 "data-theme",
  418 |                 mode,
  419 |             );
  420 |         }
  421 |     await page.getByRole("button", { name: "المظهر والألوان" }).click();
  422 |     await page.getByLabel("الوضع", { exact: true }).selectOption("system");
  423 |     await page
  424 |         .getByRole("dialog")
  425 |         .getByRole("button", { name: "تم", exact: true })
  426 |         .click();
  427 |     await page.emulateMedia({ colorScheme: "light" });
  428 |     await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  429 |     await page.emulateMedia({ colorScheme: "dark" });
  430 |     await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  431 |     await page
  432 |         .getByRole("button", { name: "الوضع الفاتح", exact: true })
  433 |         .click();
  434 |     await expect(page.locator("html")).toHaveAttribute("data-identity", "mono");
  435 |     await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  436 | });
  437 | test("زر الإجراءات ولوحة المفاتيح والقائمة تحترم التأكيد والتراجع والتعديل والتحويل", async ({
  438 |     page,
  439 | }) => {
  440 |     await importData(page, fixture());
  441 |     await page.goto("/#tasks");
  442 |     const trigger = page.getByRole("button", {
  443 |         name: "إجراءات المهمة «مهمة 0»",
  444 |     });
  445 |     await trigger.focus();
  446 |     await trigger.press("Enter");
  447 |     const dialog = page.getByRole("dialog");
  448 |     await expect(
  449 |         dialog.getByRole("button", { name: "تعديل الاسم والملاحظات" }),
  450 |     ).toBeFocused();
  451 |     await page.keyboard.press("Escape");
  452 |     await expect(trigger).toBeFocused();
  453 |     await trigger.click();
  454 |     await dialog
  455 |         .getByRole("button", { name: "تعديل الاسم والملاحظات" })
  456 |         .click();
  457 |     await expect(page).toHaveURL(/#task\/t0/);
  458 |     await expect(page.getByLabel("تعديل الاسم")).toBeFocused();
  459 |     await page.goto("/#tasks");
  460 |     await trigger.click();
  461 |     await dialog.getByRole("button", { name: "حذف", exact: true }).click();
  462 |     await expect(dialog).toContainText("يمكنك التراجع");
  463 |     await dialog.getByRole("button", { name: "إلغاء", exact: true }).click();
  464 |     expect(await state(page, "tasks", "t0")).toBe("todo");
  465 |     await trigger.click();
  466 |     await dialog.getByRole("button", { name: "حذف", exact: true }).click();
  467 |     await dialog.getByRole("button", { name: "تأكيد", exact: true }).click();
  468 |     await page.getByRole("button", { name: "تراجع", exact: true }).click();
  469 |     await expect.poll(() => state(page, "tasks", "t0")).toBe("todo");
  470 |     await page.goto("/#ideas");
  471 |     await page
  472 |         .getByRole("button", { name: "إجراءات الفكرة «فكرة للاختبار»" })
  473 |         .click();
  474 |     await dialog.getByRole("button", { name: "تحويل إلى مهمة" }).click();
  475 |     await dialog.getByRole("button", { name: "تأكيد", exact: true }).click();
  476 |     await expect(page.getByLabel("تعديل الاسم")).toHaveValue("فكرة للاختبار");
  477 |     await page.goto("/#project/p");
  478 |     await page
  479 |         .getByRole("button", {
  480 |             name: "إجراءات الخطوة أو المرحلة «مرحلة الاختبار»",
  481 |         })
  482 |         .click();
  483 |     await dialog.getByRole("button", { name: "إضافة خطوة داخله" }).click();
  484 |     await dialog.getByLabel("الاسم", { exact: true }).fill("من القائمة");
  485 |     await dialog.getByRole("button", { name: "إضافة", exact: true }).click();
  486 |     await expect(
  487 |         page.getByRole("button", { name: "من القائمة خطوة", exact: true }),
  488 |     ).toBeVisible();
  489 |     expect(
  490 |         await page
  491 |             .locator('[data-step-id="stage"] .tree-name')
  492 |             .evaluate((el) => getComputedStyle(el).fontWeight),
  493 |     ).toBe("700");
  494 | });
  495 | test("الضغط المطول بالماوس يفتح قائمة واحدة ويمنع التنقل ثم يلغى بالحركة", async ({
  496 |     page,
  497 | }) => {
  498 |     await importData(page, fixture());
  499 |     await page.goto("/#projects");
  500 |     const title = page.locator('[data-project-id="p"] > .title-link');
  501 |     const box = (await title.boundingBox())!;
  502 |     await page.mouse.move(box.x + 20, box.y + 20);
  503 |     await page.mouse.down();
> 504 |     await expect(page.getByRole("dialog")).toBeVisible();
      |                                            ^ Error: expect(locator).toBeVisible() failed
  505 |     await page.mouse.up();
  506 |     await expect(page).toHaveURL(/#projects$/);
  507 |     await expect(page.getByRole("dialog")).toHaveCount(1);
  508 |     await page.keyboard.press("Escape");
  509 |     await page.mouse.move(box.x + 20, box.y + 20);
  510 |     await page.mouse.down();
  511 |     await page.mouse.move(box.x + 60, box.y + 20);
  512 |     await page.waitForTimeout(650);
  513 |     await page.mouse.up();
  514 |     await expect(page.getByRole("dialog")).toHaveCount(0);
  515 | });
  516 | test.describe("ضغط مطول باللمس وتمرير طبيعي", () => {
  517 |     test.use({
  518 |         viewport: { width: 390, height: 844 },
  519 |         isMobile: true,
  520 |         hasTouch: true,
  521 |     });
  522 |     test("إلغاء القائمة بالحركة والتمرير، وفتحها بعد ثبات الإصبع دون نقرة تسرب", async ({
  523 |         page,
  524 |         context,
  525 |     }) => {
  526 |         await importData(page, fixture());
  527 |         await page.goto("/#tasks");
  528 |         const target = page.locator('[data-task-id="t0"] .task-main');
  529 |         await target.scrollIntoViewIfNeeded();
  530 |         const box = (await target.boundingBox())!;
  531 |         const session = await context.newCDPSession(page);
  532 |         const point = { x: box.x + 40, y: box.y + 20 };
  533 |         await session.send("Input.dispatchTouchEvent", {
  534 |             type: "touchStart",
  535 |             touchPoints: [point],
  536 |         });
  537 |         await session.send("Input.dispatchTouchEvent", {
  538 |             type: "touchMove",
  539 |             touchPoints: [{ x: point.x, y: point.y - 55 }],
  540 |         });
  541 |         await page.waitForTimeout(700);
  542 |         await session.send("Input.dispatchTouchEvent", {
  543 |             type: "touchEnd",
  544 |             touchPoints: [],
  545 |         });
  546 |         await expect(page.getByRole("dialog")).toHaveCount(0);
  547 |         await target.scrollIntoViewIfNeeded();
  548 |         const actual = (await target.boundingBox())!;
  549 |         await session.send("Input.dispatchTouchEvent", {
  550 |             type: "touchStart",
  551 |             touchPoints: [{ x: actual.x + 40, y: actual.y + 20 }],
  552 |         });
  553 |         await expect(page.getByRole("dialog")).toBeVisible();
  554 |         await session.send("Input.dispatchTouchEvent", {
  555 |             type: "touchEnd",
  556 |             touchPoints: [],
  557 |         });
  558 |         await expect(page.getByRole("dialog")).toHaveCount(1);
  559 |         await expect(page).toHaveURL(/#tasks$/);
  560 |         const modal = (await page.getByRole("dialog").boundingBox())!;
  561 |         expect(modal.y + modal.height).toBeLessThanOrEqual(844);
  562 |         await page
  563 |             .getByRole("dialog")
  564 |             .getByRole("button", { name: "إغلاق", exact: true })
  565 |             .tap();
  566 |         await target.tap();
  567 |         await expect(page).toHaveURL(/#task\/t0/);
  568 |     });
  569 | });
  570 | 
```