# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: living-sky-shell.spec.ts >> تباين النص الفعلي في الصفحات والأشرطة عبر أوقات السماء والتمرير
- Location: tests/browser/living-sky-shell.spec.ts:163:5

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  -   1
+ Received  + 107

- Array []
+ Array [
+   Object {
+     "failure": Object {
+       "alpha": 1,
+       "label": "· الفترة الحالية جزئية.",
+       "minimum_ratio": 4.032,
+       "occluded": Array [
+         Array [
+           256,
+           706,
+           304,
+           754,
+         ],
+       ],
+       "passes": false,
+       "rect": Array [
+         41.640625,
+         132.78125,
+         152.53125,
+         145.78125,
+       ],
+       "required": 4.5,
+       "rgb": Array [
+         194,
+         208,
+         201,
+       ],
+       "sampled_points": 35,
+     },
+     "hour": 23,
+     "route": "progress",
+     "rows": undefined,
+     "scroll": 0,
+     "theme": "dark",
+     "width": 320,
+   },
+   Object {
+     "failure": Object {
+       "alpha": 1,
+       "label": "· الفترة الحالية جزئية.",
+       "minimum_ratio": 4.032,
+       "occluded": Array [
+         Array [
+           256,
+           706,
+           304,
+           754,
+         ],
+       ],
+       "passes": false,
+       "rect": Array [
+         41.640625,
+         132.78125,
+         152.53125,
+         145.78125,
+       ],
+       "required": 4.5,
+       "rgb": Array [
+         194,
+         208,
+         201,
+       ],
+       "sampled_points": 35,
+     },
+     "hour": 23,
+     "route": "progress",
+     "rows": undefined,
+     "scroll": 360,
+     "theme": "dark",
+     "width": 320,
+   },
+   Object {
+     "failure": Object {
+       "alpha": 1,
+       "label": "· الفترة الحالية جزئية.",
+       "minimum_ratio": 4.032,
+       "occluded": Array [
+         Array [
+           326,
+           706,
+           374,
+           754,
+         ],
+       ],
+       "passes": false,
+       "rect": Array [
+         111.640625,
+         132.78125,
+         222.53125,
+         145.78125,
+       ],
+       "required": 4.5,
+       "rgb": Array [
+         194,
+         208,
+         201,
+       ],
+       "sampled_points": 35,
+     },
+     "hour": 23,
+     "route": "progress",
+     "rows": undefined,
+     "scroll": 360,
+     "theme": "dark",
+     "width": 390,
+   },
+ ]
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - complementary [ref=e4]:
    - navigation "التنقل الرئيسي" [ref=e5]:
      - link "العادات" [ref=e6] [cursor=pointer]:
        - /url: "#habits"
      - link "الرئيسية" [ref=e11] [cursor=pointer]:
        - /url: "#home"
      - link "المشاريع" [ref=e16] [cursor=pointer]:
        - /url: "#projects"
  - generic [ref=e20]:
    - banner [ref=e21]:
      - generic [ref=e22]: مسار
      - generic [ref=e27]:
        - button "النسخ الاحتياطي" [ref=e28] [cursor=pointer]
        - button "الوضع الفاتح" [ref=e32] [cursor=pointer]
        - button "المظهر والألوان" [ref=e39] [cursor=pointer]
        - link "المهام" [ref=e46] [cursor=pointer]:
          - /url: "#tasks"
          - generic [aria-hidden]: "24"
    - main [ref=e50]:
      - generic [ref=e51]:
        - button "الرجوع" [ref=e52] [cursor=pointer]
        - link "بوابة المشاريع" [ref=e53] [cursor=pointer]:
          - /url: "#projects"
      - generic [ref=e57]:
        - generic [ref=e58]: خطوة صغيرة، أثر مستمر
        - heading "كل خطوة تصنع فرقًا" [level=1] [ref=e59]
        - paragraph [ref=e60]: نظرة واضحة لما أنجزت، وما ينتظر خطوتك التالية.
      - textbox "بحث شامل" [ref=e65]:
        - /placeholder: ابحث في مشاريعك، مهامك، أفكارك وملاحظاتك…
      - region "إحصائيات الفترة" [ref=e66]:
        - tablist "أقسام التقدم" [ref=e67]:
          - tab "نظرة عامة" [selected] [ref=e68] [cursor=pointer]
          - tab "رؤى مسار" [ref=e69] [cursor=pointer]
          - tab "سجل الإنجاز" [ref=e70] [cursor=pointer]
        - generic [ref=e71]:
          - heading "الفترة" [level=2] [ref=e72]
          - group "نطاق الإحصائيات" [ref=e73]:
            - button "أسبوعي" [pressed] [ref=e74] [cursor=pointer]
            - button "شهري" [ref=e75] [cursor=pointer]
            - button "سنوي" [ref=e76] [cursor=pointer]
        - paragraph [ref=e77]: 17‏/10‏/2026 — 21‏/10‏/2026 · الفترة الحالية جزئية.
        - tabpanel "نظرة عامة" [ref=e78]:
          - generic [ref=e79]:
            - generic [ref=e80]:
              - strong [ref=e81]: "0"
              - generic [ref=e82]: المهام المنجزة
            - generic [ref=e83]:
              - strong [ref=e84]: "0"
              - generic [ref=e85]: المهام المستحقة
            - generic [ref=e86]:
              - strong [ref=e87]: —
              - generic [ref=e88]: إنجاز المهام المستحقة
            - generic [ref=e89]:
              - strong [ref=e90]: "1"
              - generic [ref=e91]: أيام شهدت إنجازًا
            - generic [ref=e92]:
              - strong [ref=e93]: "1"
              - generic [ref=e94]: مشاريع حققت تقدمًا
            - generic [ref=e95]:
              - strong [ref=e96]: "0"
              - generic [ref=e97]: مشاريع اكتملت في الفترة
          - paragraph [ref=e98]: العامة تدخل في الإنجازات فقط. نسبة الإنجاز تخص المواعيد التي حلت خلال الفترة؛ المواعيد المستقبلية مستبعدة، والفترات المفتوحة متاحة وليست إخفاقات.
          - paragraph [ref=e99]: لا توجد مواعيد مستحقة لحساب النسبة في هذه الفترة.
          - generic [ref=e100]:
            - paragraph [ref=e101]: أنجزت 0 مهمة في الفترة الحالية، مقابل 0 في الجزء المقابل من الفترة السابقة.
            - paragraph [ref=e102]: "أيام إنجاز المهام: 0 حاليًا، مقابل 0 سابقًا."
          - group [ref=e103]:
            - generic "تفاصيل المواعيد والمشاريع" [ref=e104] [cursor=pointer]
          - group [ref=e105]:
            - generic "تفاصيل المشاريع وآخر ٧ أيام" [ref=e106] [cursor=pointer]
      - region "سجل توصيات مسار" [ref=e107]:
        - generic [ref=e108]:
          - heading "توصيات مسار" [level=2] [ref=e109]
          - button "عرض سجل القرارات" [ref=e110] [cursor=pointer]
        - paragraph [ref=e111]: لا يوجد اقتراح جديد تدعمه البيانات الآن.
      - generic [ref=e112]:
        - text: خطوة واضحة، ذهن أهدأ.
        - generic [ref=e116]: محفوظ محليًا على جهازك
  - button "إضافة سريعة" [ref=e117] [cursor=pointer]
```

# Test source

```ts
  278 |                                         if (
  279 |                                             style.visibility !== "visible" ||
  280 |                                             style.display === "none"
  281 |                                         )
  282 |                                             continue;
  283 |                                         const color = style.color
  284 |                                             .match(/[\d.]+/g)!
  285 |                                             .map(Number);
  286 |                                         let alpha = color[3] ?? 1;
  287 |                                         for (
  288 |                                             let ancestor: HTMLElement | null =
  289 |                                                 parent;
  290 |                                             ancestor;
  291 |                                             ancestor = ancestor.parentElement
  292 |                                         )
  293 |                                             alpha *= Number(
  294 |                                                 getComputedStyle(ancestor)
  295 |                                                     .opacity,
  296 |                                             );
  297 |                                         if (alpha < 0.1) continue;
  298 |                                         const size = parseFloat(style.fontSize),
  299 |                                             bold =
  300 |                                                 parseInt(style.fontWeight) >=
  301 |                                                 700;
  302 |                                         rows.push({
  303 |                                             label: text.textContent!.trim(),
  304 |                                             rgb: color.slice(0, 3),
  305 |                                             alpha,
  306 |                                             occluded,
  307 |                                             required:
  308 |                                                 size >= 24 ||
  309 |                                                 (size >= 18.66 && bold)
  310 |                                                     ? 3
  311 |                                                     : 4.5,
  312 |                                             rect: [
  313 |                                                 box.x,
  314 |                                                 box.y,
  315 |                                                 box.right,
  316 |                                                 box.bottom,
  317 |                                             ],
  318 |                                         });
  319 |                                         parent.classList.add(
  320 |                                             "shell-contrast-probe",
  321 |                                         );
  322 |                                     }
  323 |                                 }
  324 |                                 return rows;
  325 |                             });
  326 |                             const style = await page.addStyleTag({
  327 |                                 content:
  328 |                                     ".shell-contrast-probe{color:transparent!important;text-shadow:none!important}",
  329 |                             });
  330 |                             const png = join(temp, "background.png"),
  331 |                                 data = join(temp, "rows.json");
  332 |                             fs.writeFileSync(data, JSON.stringify(rows));
  333 |                             await page.screenshot({ path: png });
  334 |                             const measured = JSON.parse(
  335 |                                 execFileSync(
  336 |                                     "python3",
  337 |                                     [
  338 |                                         `${output}/measure-contrast.py`,
  339 |                                         png,
  340 |                                         data,
  341 |                                     ],
  342 |                                     { encoding: "utf8" },
  343 |                                 ),
  344 |                             );
  345 |                             results.push({
  346 |                                 width,
  347 |                                 theme,
  348 |                                 hour,
  349 |                                 route,
  350 |                                 scroll,
  351 |                                 rows: measured,
  352 |                             });
  353 |                             await style.evaluate((n) =>
  354 |                                 n.parentNode?.removeChild(n),
  355 |                             );
  356 |                             await page.evaluate(() =>
  357 |                                 document
  358 |                                     .querySelectorAll(".shell-contrast-probe")
  359 |                                     .forEach((n) =>
  360 |                                         n.classList.remove(
  361 |                                             "shell-contrast-probe",
  362 |                                         ),
  363 |                                     ),
  364 |                             );
  365 |                         }
  366 |                     }
  367 |                 }
  368 |             }
  369 |         fs.writeFileSync(
  370 |             `${output}/rendered-contrast.json`,
  371 |             JSON.stringify(results, null, 2),
  372 |         );
  373 |         const failures = results.flatMap((c) =>
  374 |             c.rows
  375 |                 .filter((r: { passes: boolean }) => !r.passes)
  376 |                 .map((r: object) => ({ ...c, rows: undefined, failure: r })),
  377 |         );
> 378 |         expect(failures).toEqual([]);
      |                          ^ Error: expect(received).toEqual(expected) // deep equality
  379 |     });
  380 | 
  381 |     test("قائمة500 مهمة: تمرير فعلي دون مرشحات ضخمة وباستجابة سريعة", async ({
  382 |         page,
  383 |     }) => {
  384 |         test.setTimeout(60000);
  385 |         await setup(page, "dark", 500, false);
  386 |         await navigateView(page, "tasks");
  387 |         await expect(page.locator(".task-list")).toHaveCSS(
  388 |             "backdrop-filter",
  389 |             "none",
  390 |         );
  391 |         expect(
  392 |             await page
  393 |                 .locator(".task-list")
  394 |                 .evaluate(
  395 |                     (n) => getComputedStyle(n, "::before").backdropFilter,
  396 |                 ),
  397 |         ).toBe("none");
  398 |         const cdp = await page.context().newCDPSession(page);
  399 |         await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  400 |         const frames = page.evaluate(
  401 |             () =>
  402 |                 new Promise<number[]>((resolve) => {
  403 |                     let previous = performance.now();
  404 |                     const samples: number[] = [];
  405 |                     const tick = (now: number) => {
  406 |                         samples.push(now - previous);
  407 |                         previous = now;
  408 |                         if (samples.length >= 150) resolve(samples.slice(1));
  409 |                         else requestAnimationFrame(tick);
  410 |                     };
  411 |                     requestAnimationFrame(tick);
  412 |                 }),
  413 |         );
  414 |         await page.mouse.move(170, 420);
  415 |         for (let i = 0; i < 12; i++) {
  416 |             await page.mouse.wheel(0, i % 2 ? -400 : 400);
  417 |             await page.waitForTimeout(120);
  418 |         }
  419 |         const samples = await frames,
  420 |             sorted = [...samples].sort((a, b) => a - b);
  421 |         await page.evaluate(() => {
  422 |             const state = window as unknown as { shellDialogResponse?: number };
  423 |             let start: number | undefined;
  424 |             document.querySelector(".mobile-fab")!.addEventListener(
  425 |                 "pointerdown",
  426 |                 () => {
  427 |                     start = performance.now();
  428 |                 },
  429 |                 { once: true },
  430 |             );
  431 |             const observer = new MutationObserver(() => {
  432 |                 if (
  433 |                     start === undefined ||
  434 |                     !document.querySelector("dialog.add-menu[open]")
  435 |                 )
  436 |                     return;
  437 |                 observer.disconnect();
  438 |                 requestAnimationFrame(() =>
  439 |                     requestAnimationFrame(() => {
  440 |                         state.shellDialogResponse = performance.now() - start!;
  441 |                     }),
  442 |                 );
  443 |             });
  444 |             observer.observe(document.body, {
  445 |                 subtree: true,
  446 |                 childList: true,
  447 |                 attributes: true,
  448 |                 attributeFilter: ["open"],
  449 |             });
  450 |         });
  451 |         const start = Date.now();
  452 |         await page.locator(".mobile-fab").click();
  453 |         await expect(
  454 |             page.getByRole("dialog", {
  455 |                 name: "ماذا تريد أن تضيف؟",
  456 |                 exact: true,
  457 |             }),
  458 |         ).toBeVisible();
  459 |         const driver = Date.now() - start;
  460 |         await page.waitForFunction(
  461 |             () =>
  462 |                 (window as unknown as { shellDialogResponse?: number })
  463 |                     .shellDialogResponse !== undefined,
  464 |         );
  465 |         const open = await page.evaluate(
  466 |             () =>
  467 |                 (window as unknown as { shellDialogResponse: number })
  468 |                     .shellDialogResponse,
  469 |         );
  470 |         await page.keyboard.press("Escape");
  471 |         await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  472 |         await page
  473 |             .locator('[data-task-id="task-499"]')
  474 |             .scrollIntoViewIfNeeded();
  475 |         await page.locator('[data-task-id="task-499"] .task-check').click();
  476 |         await expect
  477 |             .poll(
  478 |                 async () =>
```