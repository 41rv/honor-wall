# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: project-import.spec.ts >> المعاينة والأخطاء ولوحة المفاتيح في الثيمات الأربعة بعرض 390
- Location: tests/browser/project-import.spec.ts:179:5

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  -  1
+ Received  + 58

- Array []
+ Array [
+   Object {
+     "description": "Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds",
+     "help": "Elements must meet minimum color contrast ratio thresholds",
+     "helpUrl": "https://dequeuniversity.com/rules/axe/4.13/color-contrast?application=playwright",
+     "id": "color-contrast",
+     "impact": "serious",
+     "nodes": Array [
+       Object {
+         "all": Array [],
+         "any": Array [
+           Object {
+             "data": Object {
+               "bgColor": "#464959",
+               "contrastRatio": 4.16,
+               "expectedContrastRatio": "4.5:1",
+               "fgColor": "#b1b0be",
+               "fontSize": "10.5pt (14px)",
+               "fontWeight": "bold",
+               "messageKey": null,
+             },
+             "id": "color-contrast",
+             "impact": "serious",
+             "message": "Element has insufficient color contrast of 4.16 (foreground color: #b1b0be, background color: #464959, font size: 10.5pt (14px), font weight: bold). Expected contrast ratio of 4.5:1",
+             "relatedNodes": Array [
+               Object {
+                 "html": "<button class=\"btn secondary\">إلغاء</button>",
+                 "target": Array [
+                   ".dialog-buttons > .secondary.btn",
+                 ],
+               },
+             ],
+           },
+         ],
+         "failureSummary": "Fix any of the following:
+   Element has insufficient color contrast of 4.16 (foreground color: #b1b0be, background color: #464959, font size: 10.5pt (14px), font weight: bold). Expected contrast ratio of 4.5:1",
+         "html": "<button class=\"btn secondary\">إلغاء</button>",
+         "impact": "serious",
+         "none": Array [],
+         "target": Array [
+           ".dialog-buttons > .secondary.btn",
+         ],
+       },
+     ],
+     "tags": Array [
+       "cat.color",
+       "wcag2aa",
+       "wcag143",
+       "TTv5",
+       "TT13.c",
+       "EN-301-549",
+       "EN-9.1.4.3",
+       "ACT",
+       "RGAAv4",
+       "RGAA-3.2.1",
+     ],
+   },
+ ]
```

# Page snapshot

```yaml
- generic [ref=f2e3]:
  - complementary [ref=f2e4]:
    - navigation "التنقل الرئيسي" [ref=f2e5]:
      - link "الرئيسية" [ref=f2e6] [cursor=pointer]:
        - /url: "#home"
      - link "المشاريع" [ref=f2e11] [cursor=pointer]:
        - /url: "#projects"
      - link "المهام" [ref=f2e15] [cursor=pointer]:
        - /url: "#tasks"
      - link "الأفكار" [ref=f2e20] [cursor=pointer]:
        - /url: "#ideas"
      - link "التقدم" [ref=f2e24] [cursor=pointer]:
        - /url: "#progress"
  - generic [ref=f2e28]:
    - banner [ref=f2e29]:
      - generic [ref=f2e30]: مسار
      - generic [ref=f2e35]:
        - button "النسخ الاحتياطي" [ref=f2e36] [cursor=pointer]
        - button "الوضع الفاتح" [ref=f2e40] [cursor=pointer]
        - button "المظهر والألوان" [ref=f2e47] [cursor=pointer]
        - generic "مساحتك الشخصية" [ref=f2e54]: م
    - main [ref=f2e55]:
      - generic [ref=f2e57]:
        - generic [ref=f2e58]: خطوة صغيرة، أثر مستمر
        - heading "مشاريعك" [level=1] [ref=f2e59]
        - paragraph [ref=f2e60]: من الفكرة الكبيرة إلى الخطوة التالية.
      - textbox "بحث شامل" [ref=f2e65]:
        - /placeholder: ابحث في مشاريعك، مهامك، أفكارك وملاحظاتك…
      - generic [ref=f2e66]:
        - button "استيراد مشروع" [ref=f2e67] [cursor=pointer]
        - paragraph [ref=f2e71]: ملف JSON يضيف مشروعًا جديدًا. راجع محتواه قبل الحفظ.
        - dialog "معاينة استيراد المشروع" [ref=f2e72]:
          - generic [ref=f2e73]:
            - heading "معاينة استيراد المشروع" [level=2] [ref=f2e74]
            - button "إغلاق" [active] [ref=f2e75] [cursor=pointer]
          - heading "دورة أساسيات تطوير الويب" [level=3] [ref=f2e79]
          - paragraph [ref=f2e80]: إنهاء الدورة وتطبيق المهارات في موقع شخصي.
          - paragraph [ref=f2e81]: 2 مراحل · 6 خطوات إجمالًا · 5 خطوات نهائية لحساب التقدم
          - paragraph [ref=f2e82]: سيُنشأ مشروع جديد، وتبقى مشاريعك الحالية محفوظة. تبدأ جميع الخطوات دون إتمام.
          - list "ترتيب مراحل وخطوات المشروع" [ref=f2e83]:
            - listitem [ref=f2e84]:
              - text: 1 أساسيات HTML
              - paragraph [ref=f2e85]: أكمل هذا الجزء قبل الانتقال إلى التنسيق.
            - listitem [ref=f2e86]:
              - text: 1.1 مشاهدة مقدمة HTML
              - paragraph [ref=f2e87]: دوّن أهم الوسوم.
            - listitem [ref=f2e88]: 1.2 تطبيق صفحة تعريفية
            - listitem [ref=f2e89]: 1.2.1 إضافة العناوين والفقرات
            - listitem [ref=f2e90]:
              - text: 1.2.2 إضافة الروابط والصور
              - paragraph [ref=f2e91]: اختبر الروابط في المتصفح.
            - listitem [ref=f2e92]: 2 أساسيات CSS
            - listitem [ref=f2e93]: 2.1 مشاهدة درس التنسيق
            - listitem [ref=f2e94]: 2.2 تنسيق الصفحة على الجوال واللابتوب
          - generic [ref=f2e95]:
            - button "إلغاء" [ref=f2e96] [cursor=pointer]
            - button "تأكيد استيراد المشروع" [ref=f2e97] [cursor=pointer]
      - group "تصفية المشاريع" [ref=f2e98]:
        - button "النشطة 0" [pressed] [ref=f2e99] [cursor=pointer]:
          - text: النشطة
          - generic [ref=f2e100]: "0"
        - button "الموقوفة مؤقتًا 0" [ref=f2e101] [cursor=pointer]:
          - text: الموقوفة مؤقتًا
          - generic [ref=f2e102]: "0"
        - button "المغلقة 0" [ref=f2e103] [cursor=pointer]:
          - text: المغلقة
          - generic [ref=f2e104]: "0"
        - button "المؤرشفة 0" [ref=f2e105] [cursor=pointer]:
          - text: المؤرشفة
          - generic [ref=f2e106]: "0"
      - group [ref=f2e107]:
        - generic "إعداد المشاريع النشطة" [ref=f2e108] [cursor=pointer]
      - generic [ref=f2e110]:
        - heading "مساحة لمشروعك القادم" [level=3] [ref=f2e114]
        - paragraph [ref=f2e115]: رتّب أفكارك الكبيرة في خطوات يمكن إنجازها.
      - generic [ref=f2e116]:
        - text: خطوة واضحة، ذهن أهدأ.
        - generic [ref=f2e120]: محفوظ محليًا على جهازك
```

# Test source

```ts
  100 |         "aria-valuenow",
  101 |         "100",
  102 |     );
  103 |     expect(await readStore(page, "projects")).toHaveLength(2);
  104 | });
  105 | test("ملفات خاطئة بأخطاء واضحة وإعادة اختيار الملف نفسه دون حفظ", async ({
  106 |     page,
  107 | }) => {
  108 |     await page.goto("/#projects");
  109 |     for (const [text, error] of [
  110 |         ["{", "تعذر قراءة JSON"],
  111 |         [
  112 |             JSON.stringify({
  113 |                 format: "masar.project",
  114 |                 version: 2,
  115 |                 project: {},
  116 |             }),
  117 |             "version",
  118 |         ],
  119 |         [
  120 |             JSON.stringify({
  121 |                 format: "masar.project",
  122 |                 version: 1,
  123 |                 project: { title: " ", stages: [] },
  124 |             }),
  125 |             "project.title",
  126 |         ],
  127 |         [
  128 |             JSON.stringify({
  129 |                 format: "masar.project",
  130 |                 version: 1,
  131 |                 project: {
  132 |                     title: "س",
  133 |                     stages: [
  134 |                         { title: "م", steps: [{ title: "خ", status: "done" }] },
  135 |                     ],
  136 |                 },
  137 |             }),
  138 |             "status",
  139 |         ],
  140 |     ]) {
  141 |         await upload(page, Buffer.from(text));
  142 |         await expect(page.getByRole("alert")).toContainText(error);
  143 |         expect(await readStore(page, "projects")).toHaveLength(0);
  144 |         await expect(page.getByRole("dialog")).not.toBeVisible();
  145 |     }
  146 |     await upload(page, Buffer.alloc(5 * 1024 * 1024 + 1, 32));
  147 |     await expect(page.getByRole("alert")).toContainText("ميجابايت");
  148 |     await upload(page);
  149 |     await expect(page.getByRole("dialog")).toBeVisible();
  150 |     await page.keyboard.press("Escape");
  151 |     expect(await readStore(page, "projects")).toHaveLength(0);
  152 | });
  153 | test("فشل التخزين لا يترك مشروعًا ناقصًا ويتيح تأكيد المعاينة مجددًا", async ({
  154 |     page,
  155 | }) => {
  156 |     await page.goto("/#projects");
  157 |     await upload(page);
  158 |     await page.evaluate(() => {
  159 |         const original = IDBObjectStore.prototype.add;
  160 |         IDBObjectStore.prototype.add = function (...args) {
  161 |             if (this.name === "events") {
  162 |                 IDBObjectStore.prototype.add = original;
  163 |                 throw new DOMException("full", "QuotaExceededError");
  164 |             }
  165 |             return original.apply(this, args as Parameters<typeof original>);
  166 |         };
  167 |     });
  168 |     await page.getByRole("button", { name: "تأكيد استيراد المشروع" }).click();
  169 |     await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
  170 |         "مساحة التخزين ممتلئة",
  171 |     );
  172 |     expect(await readStore(page, "projects")).toHaveLength(0);
  173 |     expect(await readStore(page, "steps")).toHaveLength(0);
  174 |     await page.getByRole("button", { name: "تأكيد استيراد المشروع" }).click();
  175 |     await expect(page).toHaveURL(/#project\//);
  176 |     expect(await readStore(page, "projects")).toHaveLength(1);
  177 | });
  178 | for (const width of [390, 1366]) {
  179 |     test(`المعاينة والأخطاء ولوحة المفاتيح في الثيمات الأربعة بعرض ${width}`, async ({
  180 |         page,
  181 |     }) => {
  182 |         await page.setViewportSize({ width, height: 850 });
  183 |         await page.goto("/#projects");
  184 |         for (const identity of ["green", "mono"])
  185 |             for (const mode of ["light", "dark"]) {
  186 |                 await page.evaluate(
  187 |                     ({ identity, mode }) => {
  188 |                         localStorage.setItem("masar-identity", identity);
  189 |                         localStorage.setItem("masar-theme", mode);
  190 |                     },
  191 |                     { identity, mode },
  192 |                 );
  193 |                 await page.reload();
  194 |                 await upload(page);
  195 |                 const dialog = page.getByRole("dialog");
  196 |                 await expect(dialog).toBeVisible();
  197 |                 expect(
  198 |                     (await new AxeBuilder({ page }).include("dialog").analyze())
  199 |                         .violations,
> 200 |                 ).toEqual([]);
      |                   ^ Error: expect(received).toEqual(expected) // deep equality
  201 |                 if (identity === "green" && mode === "light")
  202 |                     await page.screenshot({
  203 |                         path: `docs/tasks/import-preview-${width}.png`,
  204 |                     });
  205 |                 expect(
  206 |                     await dialog.evaluate(
  207 |                         (el) => el.scrollWidth <= el.clientWidth,
  208 |                     ),
  209 |                 ).toBe(true);
  210 |                 expect(
  211 |                     await page.evaluate(
  212 |                         () =>
  213 |                             document.documentElement.scrollWidth <= innerWidth,
  214 |                     ),
  215 |                 ).toBe(true);
  216 |                 await page.keyboard.press("Tab");
  217 |                 expect(
  218 |                     await dialog.evaluate((el) =>
  219 |                         el.contains(document.activeElement),
  220 |                     ),
  221 |                 ).toBe(true);
  222 |                 await dialog
  223 |                     .getByRole("button", { name: "إلغاء", exact: true })
  224 |                     .click();
  225 |             }
  226 |         expect(await readStore(page, "projects")).toHaveLength(0);
  227 |     });
  228 | }
  229 | test("معاينة محدودة لمشروع كبير تستورد كل العناصر وترقيم التداخل حتى الحد المعتمد", async ({
  230 |     page,
  231 | }) => {
  232 |     await page.goto("/#projects");
  233 |     let deep: Record<string, unknown> = { title: "المستوى 2" };
  234 |     const top = deep;
  235 |     for (let i = 3; i <= 20; i++) {
  236 |         const child = { title: "المستوى " + i };
  237 |         deep.children = [child];
  238 |         deep = child;
  239 |     }
  240 |     const file = {
  241 |         format: "masar.project",
  242 |         version: 1,
  243 |         project: {
  244 |             title: "اختبار مشروع كبير",
  245 |             stages: [
  246 |                 { title: "مرحلة التداخل", steps: [top] },
  247 |                 {
  248 |                     title: "مرحلة واسعة",
  249 |                     steps: Array.from({ length: 110 }, (_, i) => ({
  250 |                         title: "عمل " + i,
  251 |                     })),
  252 |                 },
  253 |             ],
  254 |         },
  255 |     };
  256 |     await upload(page, Buffer.from(JSON.stringify(file)));
  257 |     await expect(page.getByRole("dialog")).toContainText(
  258 |         "سيُحفظ جميع العناصر وعددها 131",
  259 |     );
  260 |     await expect(
  261 |         page.getByLabel("ترتيب مراحل وخطوات المشروع").locator("li"),
  262 |     ).toHaveCount(100);
  263 |     await page.getByRole("button", { name: "تأكيد استيراد المشروع" }).click();
  264 |     await expect(page).toHaveURL(/#project\//);
  265 |     const id = decodeURIComponent(
  266 |         new URL(page.url()).hash.slice("#project/".length),
  267 |     );
  268 |     expect(
  269 |         (await readStore(page, "steps")).filter((s) => s.projectId === id),
  270 |     ).toHaveLength(131);
  271 |     await expect(
  272 |         page.locator(".tree-title").filter({ hasText: "المستوى 20" }),
  273 |     ).toBeVisible();
  274 |     await expect(page.getByRole("progressbar")).toHaveAttribute(
  275 |         "aria-valuenow",
  276 |         "0",
  277 |     );
  278 |     await page.reload();
  279 |     await expect(
  280 |         page.locator(".tree-title").filter({ hasText: "عمل 109" }),
  281 |     ).toBeVisible();
  282 | });
  283 |
```
