import { expect, type Page } from "@playwright/test";
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
    await page.goto("/#backup");
    await page.getByLabel("استيراد نسخة", { exact: true }).setInputFiles({
        name: "stress.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(data)),
    });
    await page.getByRole("button", { name: "تأكيد استبدال البيانات" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
}
export async function readStore(
    page: Page,
    name: "projects" | "steps" | "tasks" | "ideas" | "events" | "taskCycles",
) {
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
