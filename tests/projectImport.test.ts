import { beforeEach, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { db, create, importProject, snapshot, changeStatus } from "../app/db";
import {
    parseProjectImport,
    validateProjectImport,
    importNodes,
} from "../app/projectImport";
import { numbered, progress } from "../app/model";
const text = readFileSync(
    new URL("../examples/project-import.json", import.meta.url),
    "utf8",
);
const sample = () => JSON.parse(text);
beforeEach(async () => {
    await db.transaction("rw", db.tables, async () => {
        for (const table of db.tables) await table.clear();
    });
});
it("يعتمد المثال المنشور وترتيبه وملاحظاته وخطواته المتداخلة", () => {
    const file = parseProjectImport("\uFEFF" + text);
    const nodes = importNodes(file);
    expect(nodes.map((n) => n.number)).toEqual([
        "1",
        "1.1",
        "1.2",
        "1.2.1",
        "1.2.2",
        "2",
        "2.1",
        "2.2",
    ]);
    expect(nodes[4].notes).toBe("اختبر الروابط في المتصفح.");
});
it.each([
    ["JSON", "{"],
    ["format", JSON.stringify({ version: 1, project: {} })],
    ["version", JSON.stringify({ ...sample(), version: "1" })],
    [
        "project.title",
        JSON.stringify({ ...sample(), project: { title: " ", stages: [] } }),
    ],
    [
        "project.stages",
        JSON.stringify({ ...sample(), project: { title: "س", stages: null } }),
    ],
    [
        "steps",
        JSON.stringify({
            ...sample(),
            project: { title: "س", stages: [{ title: "مرحلة" }] },
        }),
    ],
    [
        "notes",
        JSON.stringify({
            ...sample(),
            project: {
                title: "س",
                stages: [{ title: "م", notes: null, steps: [] }],
            },
        }),
    ],
    [
        "children",
        JSON.stringify({
            ...sample(),
            project: {
                title: "س",
                stages: [{ title: "م", steps: [{ title: "خ", children: {} }] }],
            },
        }),
    ],
    ["id", JSON.stringify({ ...sample(), id: "external" })],
])("يرفض %s برسالة تحدد الخلل", (path, invalid) => {
    expect(() => parseProjectImport(invalid)).toThrow(path);
});
it("يطبق حدود الاسم والنص والحجم والعدد والعمق", () => {
    const value = sample();
    value.project.title = "س".repeat(301);
    expect(() => validateProjectImport(value)).toThrow("٣٠٠");
    value.project.title = "س";
    value.project.description = "a".repeat(100001);
    expect(() => validateProjectImport(value)).toThrow("١٠٠٬٠٠٠");
    expect(() => parseProjectImport(" ".repeat(5 * 1024 * 1024 + 1))).toThrow(
        "ميجابايت",
    );
    const root = { title: "مرحلة", steps: [] as unknown[] };
    const input = {
        format: "masar.project",
        version: 1,
        project: { title: "س", stages: [root] },
    };
    root.steps = Array.from({ length: 4999 }, () => ({ title: "خطوة" }));
    expect(importNodes(validateProjectImport(input))).toHaveLength(5000);
    root.steps.push({ title: "زيادة" });
    expect(() => validateProjectImport(input)).toThrow("٥٠٠٠");
    let chain: Record<string, unknown> = { title: "خ" };
    root.steps = [chain];
    for (let i = 0; i < 18; i++) {
        const child = { title: "خ" };
        chain.children = [child];
        chain = child;
    }
    expect(importNodes(validateProjectImport(input))).toHaveLength(20);
    chain.children = [{ title: "زيادة" }];
    expect(() => validateProjectImport(input)).toThrow("٢٠ مستوى");
});
it("يضيف شجرة جديدة ويحافظ على كل البيانات السابقة ويحسب التقدم والإغلاق", async () => {
    await create("project", "موجود", "ملاحظات قديمة");
    await create("task", "مهمة مستقلة");
    await create("idea", "فكرة");
    const before = await snapshot();
    const id = await importProject(sample());
    const after = await snapshot();
    expect(after.projects.filter((p) => p.id !== id)).toEqual(before.projects);
    expect(after.steps.filter((s) => s.projectId !== id)).toEqual(before.steps);
    expect(after.tasks).toEqual(before.tasks);
    expect(after.ideas).toEqual(before.ideas);
    expect(
        after.events.filter((e) =>
            before.events.some((old) => old.id === e.id),
        ),
    ).toEqual(before.events);
    const nodes = after.steps.filter((s) => s.projectId === id);
    expect([...numbered(nodes, id).values()]).toEqual([
        "1",
        "1.1",
        "1.2",
        "1.2.1",
        "1.2.2",
        "2",
        "2.1",
        "2.2",
    ]);
    expect(nodes.every((s) => s.status === "todo")).toBe(true);
    expect(progress(nodes, id)).toEqual({
        total: 5,
        done: 0,
        remaining: 5,
        percent: 0,
    });
    const leafIds = new Set(nodes.map((n) => n.parentId));
    const leaves = nodes.filter((n) => n.kind === "step" && !leafIds.has(n.id));
    await changeStatus("step", leaves[0].id, "done");
    expect(progress(await db.steps.toArray(), id).percent).toBe(20);
    for (const leaf of leaves.slice(1))
        await changeStatus("step", leaf.id, "done");
    expect(progress(await db.steps.toArray(), id).percent).toBe(100);
    expect((await db.projects.get(id))!.status).toBe("closed");
});
it("يتراجع عن جميع الإدخالات إذا فشل سجل الأحداث ويتيح إعادة المحاولة", async () => {
    await create("project", "موجود");
    const before = await snapshot();
    const fail = () => {
        throw new Error("فشل تجريبي");
    };
    db.events.hook("creating", fail);
    try {
        await expect(importProject(sample())).rejects.toThrow("فشل تجريبي");
    } finally {
        db.events.hook("creating").unsubscribe(fail);
    }
    const after = await snapshot();
    for (const key of [
        "projects",
        "steps",
        "tasks",
        "ideas",
        "events",
    ] as const)
        expect(after[key]).toEqual(before[key]);
    await importProject(sample());
    expect(await db.projects.count()).toBe(2);
});
it("لا يحفظ ملفًا غير صالح ويسمح بملف فارغ واستيراد مستقل مقصود بالاسم نفسه", async () => {
    await expect(importProject({})).rejects.toThrow("format");
    expect(await db.projects.count()).toBe(0);
    const input = {
        format: "masar.project",
        version: 1,
        project: { title: " فارغ ", stages: [] },
    };
    const first = await importProject(input);
    const second = await importProject(input);
    expect(first).not.toBe(second);
    expect(await db.projects.count()).toBe(2);
    expect(progress([], first).percent).toBe(null);
    expect((await db.projects.get(first))!.title).toBe("فارغ");
});
