import { appUrl } from "./url";
import { test, expect } from "@playwright/test";
import { sizedFixture, importData, readStore } from "./helpers";

for (const mobile of [false, true]) {
    test.describe(
        mobile ? "تبديل سريع باللمس" : "تبديل سريع على الكمبيوتر",
        () => {
            test.use(
                mobile
                    ? {
                          viewport: { width: 390, height: 844 },
                          isMobile: true,
                          hasTouch: true,
                      }
                    : { viewport: { width: 1366, height: 900 } },
            );
            test("عشرة تبديلات للمهمة والخطوة تحفظ آخر طلب وتطابق الأعداد والنسب بعد إعادة الفتح", async ({
                page,
            }) => {
                const errors: string[] = [];
                page.on("pageerror", (error) => errors.push(error.message));
                await importData(page, sizedFixture(10));
                await page.goto(appUrl("/#tasks"));
                const task = page.getByRole("button", {
                    name: "إكمال مهمة 0",
                    exact: true,
                });
                await task.evaluate((button: HTMLButtonElement) => {
                    for (let i = 0; i < 10; i++) button.click();
                });
                await expect
                    .poll(
                        async () =>
                            (await readStore(page, "tasks")).find(
                                (t) => t.id === "t0",
                            )?.status,
                    )
                    .toBe("todo");
                await expect(task).toHaveAttribute("aria-pressed", "false");
                // Real mouse/touch interaction in addition to the burst inside one event turn.
                for (let i = 0; i < 11; i++) {
                    const check = page
                        .locator(".task-check")
                        .filter({ has: page.locator("svg") });
                    const control = page.getByRole("button", {
                        name: /^(إكمال|إعادة فتح) مهمة 0$/,
                    });
                    if (mobile) await control.tap();
                    else await control.click();
                    void check;
                }
                await expect
                    .poll(
                        async () =>
                            (await readStore(page, "tasks")).find(
                                (t) => t.id === "t0",
                            )?.status,
                    )
                    .toBe("done");
                await page.goto(appUrl("/#project/p"));
                const leaf = page.getByRole("button", {
                    name: "إتمام الخطوة «خطوة 0»",
                    exact: true,
                });
                await leaf.evaluate((button: HTMLButtonElement) => {
                    for (let i = 0; i < 10; i++) button.click();
                });
                await expect
                    .poll(
                        async () =>
                            (await readStore(page, "steps")).find(
                                (t) => t.id === "s0",
                            )?.status,
                    )
                    .toBe("todo");
                await expect(page.getByRole("progressbar")).toHaveAttribute(
                    "aria-valuenow",
                    "0",
                );
                await leaf.click();
                await expect
                    .poll(
                        async () =>
                            (await readStore(page, "steps")).find(
                                (t) => t.id === "s0",
                            )?.status,
                    )
                    .toBe("done");
                await expect(page.getByRole("progressbar")).toHaveAttribute(
                    "aria-valuenow",
                    "10",
                );
                await page
                    .getByRole("button", {
                        name: "إعادة فتح الخطوة «خطوة 0»",
                        exact: true,
                    })
                    .click();
                await expect
                    .poll(
                        async () =>
                            (await readStore(page, "steps")).find(
                                (t) => t.id === "s0",
                            )?.status,
                    )
                    .toBe("todo");
                await expect(page.getByRole("progressbar")).toHaveAttribute(
                    "aria-valuenow",
                    "0",
                );
                await page.goto(appUrl("/#tasks"));
                await page
                    .getByRole("button", {
                        name: "إعادة فتح مهمة 0",
                        exact: true,
                    })
                    .evaluate((button: HTMLButtonElement) => {
                        for (let i = 0; i < 11; i++) button.click();
                        location.hash = "#progress";
                    });
                await expect
                    .poll(
                        async () =>
                            (await readStore(page, "tasks")).find(
                                (t) => t.id === "t0",
                            )?.status,
                    )
                    .toBe("todo");
                await expect(
                    page
                        .locator(".stat-card")
                        .filter({ hasText: "مهام مستقلة متبقية" })
                        .locator("strong"),
                ).toHaveText("10");
                await expect(
                    page
                        .locator(".stat-card")
                        .filter({ hasText: "منجز آخر ٧ أيام" })
                        .locator("strong"),
                ).toHaveText("0");
                await page.reload();
                await expect(
                    page
                        .locator(".stat-card")
                        .filter({ hasText: "منجز آخر ٧ أيام" })
                        .locator("strong"),
                ).toHaveText("0");
                const second = await page.context().newPage();
                await second.goto(appUrl("/#project/p"));
                await expect(second.getByRole("progressbar")).toHaveAttribute(
                    "aria-valuenow",
                    "0",
                );
                const logs = (await readStore(page, "events")).filter(
                    (e) =>
                        e.entityId === "t0" &&
                        ["completed", "reopened"].includes(String(e.action)),
                );
                expect(
                    logs.filter((e) => e.action === "completed").length,
                ).toBe(logs.filter((e) => e.action === "reopened").length);
                expect(
                    logs.filter((e) => e.action === "completed").length,
                ).toBeGreaterThan(0);
                for (let i = 1; i < logs.length; i++) {
                    // Timestamps can coincide; order is checked separately in the controller tests.
                    expect(logs[i].id).not.toBe(logs[i - 1].id);
                }
                expect(
                    (await readStore(page, "tasks")).filter(
                        (t) => t.status === "done",
                    ),
                ).toHaveLength(0);
                expect(errors).toEqual([]);
            });
        },
    );
}
test("تبديل عدة مهام أثناء تغيير الصفحة يحفظ النتيجة لكل عنصر", async ({
    page,
}) => {
    await importData(page, sizedFixture(100));
    await page.goto(appUrl("/#tasks"));
    await page.evaluate(() => {
        for (const title of ["مهمة 0", "مهمة 1", "مهمة 2"]) {
            const button = document.querySelector(
                `[aria-label="إكمال ${title}"]`,
            ) as HTMLButtonElement;
            for (let i = 0; i < (title === "مهمة 1" ? 10 : 11); i++)
                button.click();
        }
        location.hash = "#progress";
    });
    await expect
        .poll(async () =>
            (await readStore(page, "tasks"))
                .filter((t) => t.status === "done")
                .map((t) => t.id)
                .sort(),
        )
        .toEqual(["t0", "t2"]);
    await expect(
        page
            .locator(".stat-card")
            .filter({ hasText: "منجز آخر ٧ أيام" })
            .locator("strong"),
    ).toHaveText("2");
    await page.reload();
    await expect(
        page
            .locator(".stat-card")
            .filter({ hasText: "مهام مستقلة متبقية" })
            .locator("strong"),
    ).toHaveText("8");
});
