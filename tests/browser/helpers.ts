import { appUrl } from "./url.ts";
import type { BackupStore } from "../../app/backupTables";
import { expect, type Page, type Locator } from "@playwright/test";
/** Exercise visible navigation after the three-section reorganization.
 * This also supports the original five-tab build for baseline captures. */
export async function navigateView(page: Page, route: string, touch = false) {
    const activate = async (link: ReturnType<Page["locator"]>) =>
        touch ? link.tap() : link.click();
    const primary = page.locator(`.navigation a[href="#${route}"]`);
    if (await primary.count()) await activate(primary);
    else if (route === "tasks") await activate(page.locator(".task-shortcut"));
    else {
        await activate(page.locator('.navigation a[href="#projects"]'));
        await activate(page.locator(`.project-gateway a[href="#${route}"]`));
    }
    await expect(page.locator("main")).toHaveAttribute("data-route", route);
}
export async function openCreate(
    page: Page,
    kind: "project" | "task" | "idea",
    touch = false,
) {
    const add = page.getByRole("button", { name: "إضافة سريعة", exact: true });
    if (touch) await add.tap();
    else await add.click();
    const label = {
        project: "مشروع جديد",
        task: "مهمة جديدة",
        idea: "فكرة جديدة",
    }[kind];
    const option = page
        .getByRole("dialog", { name: "ماذا تريد أن تضيف؟", exact: true })
        .getByRole("button", { name: label, exact: true });
    if (touch) await option.tap();
    else await option.click();
    await expect(page.getByRole("dialog")).toBeVisible();
}
export async function openQuickIdeas(page: Page) {
    await page.goto(appUrl("/#ideas"));
    const details = page.locator(".idea-capture-details");
    if ((await details.getAttribute("open")) === null)
        await details.locator("summary").click();
}
export async function showLegacy(page: Page) {
    await page.goto(appUrl("/#progress"));
    await page.getByRole("tab", { name: "نظرة عامة", exact: true }).click();
    const details = page.locator(".progress-legacy");
    if ((await details.getAttribute("open")) === null)
        await details.locator("summary").click();
}
import type { Snapshot } from "../../app/model";
export function largeFixture(): Snapshot {
    const at = new Date().toISOString();
    const base = (id: string, title: string) => ({
        id,
        title,
        notes: "",
        createdAt: at,
        updatedAt: at,
    });
    const projects = Array.from({ length: 20 }, (_, i) => ({
        ...base("p" + i, "مشروع " + i),
        status: "active" as const,
        archived: false,
    }));
    const steps = projects.flatMap((p, n) =>
        Array.from({ length: 10 }, (_, i) => [
            {
                ...base(`stage${n}-${i}`, "مرحلة " + i),
                projectId: p.id,
                parentId: null,
                kind: "stage" as const,
                status: "doing" as const,
                startedAt: at,
                order: i,
            },
            ...Array.from({ length: 10 }, (_, j) => ({
                ...base(`step${n}-${i}-${j}`, "خطوة " + i + "-" + j),
                projectId: p.id,
                parentId: `stage${n}-${i}`,
                kind: "step" as const,
                status: "doing" as const,
                startedAt: at,
                order: j,
            })),
        ]).flat(),
    );
    const tasks = Array.from({ length: 200 }, (_, i) => ({
        ...base("t" + i, "مهمة " + i),
        status: "todo" as const,
    }));
    const events = Array.from({ length: 10000 }, (_, i) => ({
        id: "event" + i,
        entityId: steps[i % steps.length].id,
        entityKind: "step" as const,
        title: "حدث خطوة",
        action: "started" as const,
        at,
    }));
    return {
        version: 1,
        exportedAt: at,
        projects,
        steps,
        tasks,
        ideas: [],
        events,
    };
}
export async function importData(page: Page, data: Snapshot) {
    await page.goto(appUrl("/#backup"));
    await page.getByLabel("استيراد نسخة", { exact: true }).setInputFiles({
        name: "stress.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(data)),
    });
    await page.getByRole("button", { name: "تأكيد استبدال البيانات" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
}
export async function readStore(page: Page, name: BackupStore) {
    return page.evaluate(async (store) => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open("masar-v1");
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        try {
            return await new Promise((resolve, reject) => {
                const request = database
                    .transaction(store)
                    .objectStore(store)
                    .getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        } finally {
            database.close();
        }
    }, name) as Promise<Array<Record<string, unknown>>>;
}
export function sizedFixture(count: number): Snapshot {
    const at = new Date().toISOString();
    const base = (id: string, title: string) => ({
        id,
        title,
        notes: "",
        createdAt: at,
        updatedAt: at,
    });
    return {
        version: 1,
        exportedAt: at,
        projects: [
            {
                ...base("p", `مشروع ${count} خطوة`),
                status: "active",
                archived: false,
            },
        ],
        steps: [
            {
                ...base("stage", "مرحلة الاختبار"),
                projectId: "p",
                parentId: null,
                kind: "stage",
                order: 0,
                status: "todo",
            },
            ...Array.from({ length: count }, (_, i) => ({
                ...base(`s${i}`, `خطوة ${i}`),
                projectId: "p",
                parentId: "stage",
                kind: "step" as const,
                order: i,
                status: "todo" as const,
            })),
        ],
        tasks: Array.from({ length: 10 }, (_, i) => ({
            ...base(`t${i}`, `مهمة ${i}`),
            status: "todo",
        })),
        ideas: [{ ...base("idea", "فكرة للاختبار"), archived: false }],
        events: [],
    };
}

export async function chooseTaskToday(
    page: Page,
    title: string,
    selected = true,
) {
    await page
        .getByRole("button", { name: `إجراءات المهمة «${title}»`, exact: true })
        .click();
    const dialog = page.getByRole("dialog");
    await dialog
        .getByRole("button", {
            name: selected ? "إضافة إلى مهامي اليوم" : "إزالة من مهامي اليوم",
            exact: true,
        })
        .click();
    await expect(dialog).not.toBeVisible();
}

/** Open the explicit manual alternative; quantity drafts still need Save. */
export async function setHabitQuantity(
    scope: Locator,
    title: string,
    value: string,
) {
    const details = scope.locator(".quantity-manual");
    if ((await details.getAttribute("open")) === null)
        await details.locator("summary").click();
    await scope
        .getByRole("spinbutton", { name: `كمية «${title}»`, exact: true })
        .fill(value);
}
