# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: buttons.spec.ts >> أزرار الإضافة والإلغاء والإغلاق والبحث والتنقل والضغط المتكرر
- Location: tests/browser/buttons.spec.ts:31:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('لم نجد نتيجة')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByText('لم نجد نتيجة') with timeout 5000ms
  - waiting for getByText('لم نجد نتيجة')

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
  - heading "إضافة واحدة" [level=1]
  - paragraph
  - textbox "بحث شامل":
    - /placeholder: ابحث في مشاريعك، مهامك، أفكارك وملاحظاتك…
  - text: بحث محلي
  - button "الرجوع"
  - button "العودة للقائمة"
  - text: مشروع
  - heading "التفاصيل والملاحظات" [level=2]
  - text: نشط
  - button "إتمام المشروع"
  - paragraph: يُتمّ المشروع تلقائيًا عند اكتمال خطواته بنسبة ١٠٠٪. ويمكن إتمامه يدويًا قبل ذلك دون تغيير حالات الخطوات أو نسبة التقدم.
  - region "وتيرة المشروع":
    - heading "وتيرة المشروع" [level=2]
    - button "إعداد الهدف الزمني"
    - paragraph: "الوتيرة المطلوبة لكل يوم عمل: أضف هدفًا زمنيًا"
    - paragraph: اليوم راحة من المشاريع؛ الإنجاز اختياري ويُحفظ بصورة طبيعية.
    - text: الوتيرة الفعلية لكل يوم عمل مرصود
    - strong: لا يوجد رصد كافٍ
    - text: موعد الانتهاء المتوقع
    - strong: لا توجد خطوات متبقية
    - paragraph: التوقع تقديري بعد 7 أيام عمل متاحة للرصد وإنجاز في 3 أيام عمل مختلفة على الأقل، ويشمل أيام السكون. يحدّ التوقع من أثر دفعات الإنجاز الكبيرة باستخدام وسيط أيام النشاط. عدد الخطوات لا يقيس جهدها؛ لا تُغيّر الحسابات هدفك تلقائيًا.
    - paragraph: "يُستبعد السكون في الراحة من الرصد. إنجاز الراحة الاختياري: 0 خطوة في نافذة الرصد؛ يحسّن التقدم ويقلّل المتبقي، ولا يُفترض وتيرة مستدامة لأيام العمل."
    - button "معاينة مستويات التسريع" [disabled]
    - button "إيقاف مؤقت"
    - group: تفاصيل الرصد والإيقاف
  - text: الاسم
  - textbox "تعديل الاسم": إضافة واحدة
  - text: الملاحظات
  - textbox "ملاحظات العنصر":
    - /placeholder: سجّل التفاصيل، الروابط، أو أين توقفت…
  - paragraph: محفوظ تلقائيًا
  - paragraph: لم تُضف خطوات بعد
  - button "أرشفة"
  - button "حذف"
  - heading "رحلة مشروع" [level=2]
  - term: أُنشئت
  - definition: 16‏/10‏/2026، 11:22 م
  - term: آخر تعديل
  - definition: 16‏/10‏/2026، 11:22 م
  - term: بدء العمل
  - definition: —
  - term: الإنجاز الحالي
  - definition: —
  - paragraph: عند إعادة الفتح يُمسح تاريخ الإنجاز الحالي، ويبقى الإنجاز السابق في السجل. المدة زمن منقضٍ وليست ساعات عمل.
  - heading "سجل الأحداث" [level=3]
  - list:
    - listitem:
      - text: إنشاء
      - time: 16‏/10‏/2026، 11:22 م
  - heading "المراحل والخطوات 0" [level=2]
  - button "مرحلة"
  - button "خطوة"
  - heading "قسّم المسار إلى خطوات" [level=3]
  - paragraph: أضف مرحلة أو خطوة. الأرقام تتغير تلقائيًا مع الترتيب.
  - text: خطوة واضحة، ذهن أهدأ. محفوظ محليًا على جهازك
- button "إضافة سريعة"
```

# Test source

```ts
  1   | import { navigateView } from "./helpers";
  2   | import { showLegacy } from "./helpers";
  3   | import { openCreate } from "./helpers";
  4   | import { test, expect, type Page } from "@playwright/test";
  5   | import { importData, largeFixture } from "./helpers";
  6   | import { readFile } from "node:fs/promises";
  7   | async function add(page: Page, button: string, title: string, notes = "") {
  8   |     const kind = {
  9   |         "مشروع جديد": "project",
  10  |         "مهمة جديدة": "task",
  11  |         "فكرة جديدة": "idea",
  12  |     }[button] as "project" | "task" | "idea" | undefined;
  13  |     if (kind) await openCreate(page, kind);
  14  |     else await page.getByRole("button", { name: button, exact: true }).click();
  15  |     const dialog = page.getByRole("dialog");
  16  |     await dialog.getByLabel("الاسم", { exact: true }).fill(title);
  17  |     if (notes) await dialog.getByRole("textbox").nth(1).fill(notes);
  18  |     await dialog.getByRole("button", { name: "إضافة", exact: true }).click();
  19  |     await expect(dialog).not.toBeVisible();
  20  | }
  21  | const errors = new WeakMap<Page, string[]>();
  22  | test.beforeEach(async ({ page }) => {
  23  |     const list: string[] = [];
  24  |     errors.set(page, list);
  25  |     page.on("pageerror", (e) => list.push(e.message));
  26  |     await page.goto("/");
  27  | });
  28  | test.afterEach(async ({ page }) => {
  29  |     expect(errors.get(page)).toEqual([]);
  30  | });
  31  | test("أزرار الإضافة والإلغاء والإغلاق والبحث والتنقل والضغط المتكرر", async ({
  32  |     page,
  33  | }) => {
  34  |     await page
  35  |         .getByRole("button", { name: "إضافة سريعة", exact: true })
  36  |         .first()
  37  |         .click();
  38  |     await page
  39  |         .getByRole("dialog")
  40  |         .getByRole("button", { name: /مشروع/ })
  41  |         .click();
  42  |     await page
  43  |         .getByRole("dialog")
  44  |         .getByRole("button", { name: "إلغاء", exact: true })
  45  |         .click();
  46  |     await expect(page.getByRole("dialog")).not.toBeVisible();
  47  |     await openCreate(page, "project");
  48  |     await page.getByRole("button", { name: "إغلاق", exact: true }).click();
  49  |     await openCreate(page, "project");
  50  |     await page.keyboard.press("Escape");
  51  |     await expect(page.getByRole("dialog")).not.toBeVisible();
  52  |     await openCreate(page, "project");
  53  |     await page.mouse.click(5, 5);
  54  |     await expect(page.getByRole("dialog")).not.toBeVisible();
  55  |     await openCreate(page, "project");
  56  |     await page
  57  |         .getByRole("dialog")
  58  |         .getByLabel("الاسم", { exact: true })
  59  |         .fill("   ");
  60  |     await page
  61  |         .getByRole("dialog")
  62  |         .getByRole("button", { name: "إضافة", exact: true })
  63  |         .click();
  64  |     await expect(page.getByRole("alert")).toContainText("أدخل اسمًا");
  65  |     await page
  66  |         .getByRole("dialog")
  67  |         .getByLabel("الاسم", { exact: true })
  68  |         .fill("إضافة واحدة");
  69  |     await page
  70  |         .getByRole("dialog")
  71  |         .locator("form")
  72  |         .evaluate((form) => {
  73  |             form.dispatchEvent(
  74  |                 new Event("submit", { bubbles: true, cancelable: true }),
  75  |             );
  76  |             form.dispatchEvent(
  77  |                 new Event("submit", { bubbles: true, cancelable: true }),
  78  |             );
  79  |         });
  80  |     await expect(page.getByRole("dialog")).not.toBeVisible();
  81  |     await expect(
  82  |         page.getByRole("button", { name: "إضافة واحدة", exact: true }),
  83  |     ).toHaveCount(1);
  84  |     await page.getByLabel("بحث شامل").fill("إضافة واحدة");
  85  |     await page.locator(".search-result").click();
  86  |     await expect(page).toHaveURL(/#project/);
  87  |     await page.getByLabel("بحث شامل").fill("لن أجده");
> 88  |     await expect(page.getByText("لم نجد نتيجة")).toBeVisible();
      |                                                  ^ Error: expect(locator).toBeVisible() failed
  89  |     await page.getByRole("button", { name: "مسح البحث" }).click();
  90  |     await expect(page.getByLabel("ملاحظات العنصر")).toBeVisible();
  91  |     for (const name of [
  92  |         "الرئيسية",
  93  |         "المشاريع",
  94  |         "المهام",
  95  |         "الأفكار",
  96  |         "التقدم",
  97  |     ]) {
  98  |         await page
  99  |             .locator(".navigation")
  100 |             .getByRole("link", { name, exact: true })
  101 |             .click();
  102 |         await expect(page.locator("h1")).toBeVisible();
  103 |     }
  104 |     await page.locator(".brand").click();
  105 |     await expect(page).toHaveURL(/#home/);
  106 |     await page.getByRole("button", { name: "إخفاء الرسالة" }).click();
  107 |     // The project-rest notice is also a status; only the dismissed toast should disappear.
  108 |     await expect(page.locator('.toast[role="status"]')).not.toBeVisible();
  109 | });
  110 | test("كل أزرار المراحل والخطوات: إضافة وتفاصيل وترتيب وطي وحالات وحذف وتراجع", async ({
  111 |     page,
  112 | }) => {
  113 |     await page.goto("/#projects");
  114 |     await add(page, "مشروع جديد", "جولة الأزرار");
  115 |     await page
  116 |         .getByRole("button", { name: "جولة الأزرار", exact: true })
  117 |         .click();
  118 |     await add(page, "مرحلة", "المرحلة الأولى");
  119 |     await add(page, "مرحلة", "المرحلة الثانية");
  120 |     await page
  121 |         .getByRole("button", { name: "إضافة داخل المرحلة الأولى" })
  122 |         .click();
  123 |     await page
  124 |         .getByRole("dialog")
  125 |         .getByLabel("الاسم", { exact: true })
  126 |         .fill("الخطوة الأولى");
  127 |     await page
  128 |         .getByRole("dialog")
  129 |         .getByRole("button", { name: "إضافة", exact: true })
  130 |         .click();
  131 |     await expect(page.getByRole("dialog")).not.toBeVisible();
  132 |     await page.getByRole("button", { name: "طي المرحلة الأولى" }).click();
  133 |     await expect(
  134 |         page.getByRole("button", { name: "الخطوة الأولى خطوة", exact: true }),
  135 |     ).not.toBeVisible();
  136 |     await page.getByRole("button", { name: "توسيع المرحلة الأولى" }).click();
  137 |     await page.getByRole("button", { name: "خفض المرحلة الأولى" }).click();
  138 |     await expect(
  139 |         page
  140 |             .locator(".tree-row")
  141 |             .filter({
  142 |                 has: page.getByRole("button", {
  143 |                     name: "المرحلة الأولى مرحلة",
  144 |                     exact: true,
  145 |                 }),
  146 |             })
  147 |             .locator(".tree-number"),
  148 |     ).toHaveText("2");
  149 |     await page.getByRole("button", { name: "رفع المرحلة الأولى" }).click();
  150 |     await expect(
  151 |         page.getByRole("button", { name: "رفع المرحلة الأولى" }),
  152 |     ).toBeDisabled();
  153 |     await page
  154 |         .getByRole("button", { name: "الخطوة الأولى خطوة", exact: true })
  155 |         .click();
  156 |     await expect(page.getByLabel("تعديل الاسم")).toHaveValue("الخطوة الأولى");
  157 |     await add(page, "خطوة", "الخطوة الفرعية");
  158 |     await page
  159 |         .getByRole("button", { name: "الخطوة الفرعية خطوة", exact: true })
  160 |         .click();
  161 |     await expect(page.getByLabel("تعديل الاسم")).toHaveValue("الخطوة الفرعية");
  162 |     await page
  163 |         .getByLabel("ملاحظات العنصر")
  164 |         .fill("ملاحظة باقية بعد الحذف والتراجع");
  165 |     for (const name of ["جارٍ العمل", "مكتملة", "لم تبدأ"])
  166 |         await page.getByRole("button", { name, exact: true }).click();
  167 |     await page.getByRole("button", { name: "حذف", exact: true }).click();
  168 |     await page
  169 |         .getByRole("dialog")
  170 |         .getByRole("button", { name: "إلغاء", exact: true })
  171 |         .click();
  172 |     await expect(page.getByLabel("ملاحظات العنصر")).toHaveValue(
  173 |         "ملاحظة باقية بعد الحذف والتراجع",
  174 |     );
  175 |     await page.getByRole("button", { name: "حذف", exact: true }).click();
  176 |     await page
  177 |         .getByRole("dialog")
  178 |         .getByRole("button", { name: "تأكيد", exact: true })
  179 |         .click();
  180 |     await page.getByRole("button", { name: "تراجع", exact: true }).click();
  181 |     await page
  182 |         .getByRole("button", { name: "المرحلة الأولى مرحلة", exact: true })
  183 |         .click();
  184 |     await page
  185 |         .getByRole("button", { name: "الخطوة الأولى خطوة متفرعة", exact: true })
  186 |         .click();
  187 |     await page
  188 |         .getByRole("button", { name: "الخطوة الفرعية خطوة", exact: true })
```