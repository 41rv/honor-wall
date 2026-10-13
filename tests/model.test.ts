import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import {
    db,
    create,
    changeStatus,
    snapshot,
    update,
    reorder,
    projectState,
    setBranchCompletion,
    setProjectCompletion,
    completeFinishedProjects,
    convertIdea,
    remove,
    undo,
    importBackup,
} from "../app/db";
import {
    progress,
    numbered,
    elapsed,
    achievements,
    validateBackup,
    search,
    derivedStatus,
    type Step,
} from "../app/model";
beforeEach(async () => {
    await db.transaction("rw", db.tables, async () => {
        for (const table of db.tables) await table.clear();
    });
});
it("يرفض رابط الأب الفارغ قبل استبدال أي بيانات", async () => {
    const { p, ids } = await fixture();
    const original = await snapshot();
    const invalid = structuredClone(original);
    invalid.steps.find((step) => step.id === ids[0])!.parentId = "";
    await expect(importBackup(invalid)).rejects.toThrow("النسخة غير صالحة");
    expect((await snapshot()).projects[0].id).toBe(p);
    expect((await snapshot()).steps).toEqual(original.steps);
});
it("يتحقق من نسخة بخمسة آلاف مستوى دون تكرار سلاسل الآباء أو تجاوز المكدس", () => {
    const at = new Date().toISOString();
    const common = { title: "عميق", notes: "", createdAt: at, updatedAt: at };
    const input = {
        version: 1,
        exportedAt: at,
        projects: [{ ...common, id: "p", status: "active", archived: false }],
        steps: Array.from({ length: 5000 }, (_, i) => ({
            ...common,
            id: `node${i}`,
            projectId: "p",
            parentId: i ? `node${i - 1}` : null,
            kind: "step",
            order: 0,
            status: "todo",
        })).reverse(),
        tasks: [],
        ideas: [],
        events: [],
    };
    expect(validateBackup(input).steps).toHaveLength(5000);
});
it("التراجع المكرر لا يكتب فوق تعديل لاحق للعنصر المستعاد", async () => {
    const id = await create("task", "مهمة", "الأصل");
    const deleted = await remove("task", id);
    await undo(deleted!);
    await update("task", id, { notes: "تعديل بعد الاستعادة" });
    await undo(deleted!);
    expect((await db.tasks.get(id))?.notes).toBe("تعديل بعد الاستعادة");
    expect(
        (await db.events.toArray()).filter(
            (e) => e.entityId === id && e.action === "reopened",
        ),
    ).toHaveLength(1);
});
it("يرفض تواريخ التقويم المستحيلة ولا يعتبر ٣٠ فبراير طابعًا صالحًا", async () => {
    await create("task", "مهمة");
    const data = await snapshot();
    for (const exportedAt of [
        "2026-02-30T00:00:00Z",
        "2026-04-31T01:00:00.000Z",
        "2026-10-11T24:00:00Z",
    ])
        expect(() => validateBackup({ ...data, exportedAt })).toThrow(
            "النسخة غير صالحة",
        );
});
async function fixture() {
    const p = await create("project", "الهوية");
    const stages = [];
    const ids = [];
    for (let n = 0; n < 2; n++) {
        const stage = await create("step", "مرحلة " + n, "", p, null, true);
        stages.push(stage);
        for (let i = 0; i < 5; i++)
            ids.push(await create("step", `خطوة ${n}-${i}`, "", p, stage));
    }
    return { p, ids, stages };
}
describe("منطق المشاريع والإنجاز", () => {
    it("مرحلتان وعشر خطوات؛ ثلاث مكتملة = 30%، الكل = 100% مع إتمام تلقائي", async () => {
        const { p, ids, stages } = await fixture();
        for (const id of ids.slice(0, 3))
            await changeStatus("step", id, "done");
        let s = await snapshot();
        expect(progress(s.steps, p)).toEqual({
            total: 10,
            done: 3,
            remaining: 7,
            percent: 30,
        });
        expect(s.projects[0].status).toBe("active");
        for (const id of ids.slice(3)) await changeStatus("step", id, "done");
        s = await snapshot();
        expect(progress(s.steps, p).percent).toBe(100);
        expect(s.projects[0].status).toBe("closed");
        expect(s.projects[0].completedAt).toBeTruthy();
        expect(
            s.events.filter((e) => e.entityId === p && e.action === "closed"),
        ).toHaveLength(1);
        expect(
            derivedStatus(
                s.steps.find((x) => x.id === stages[0])!,
                s.steps,
            ),
        ).toBe("done");
    });
    it("الترقيم محسوب ويتغير مع الترتيب دون تغيير الاسم", async () => {
        const { p, ids } = await fixture();
        const before = await db.steps.get(ids[0]);
        await reorder(ids[0], 1);
        const steps = await db.steps.toArray();
        expect(numbered(steps, p).get(ids[0])).toBe("1.2");
        expect((await db.steps.get(ids[0]))?.title).toBe(before?.title);
    });
    it("الفروع ليست مهام إضافية والمراحل الفارغة لا تُحتسب", async () => {
        const p = await create("project", "تجربة");
        expect(progress([], p).percent).toBeNull();
        await create("step", "مرحلة فارغة", "", p, null, true);
        const parent = await create("step", "خطوة", "", p);
        await changeStatus("step", parent, "done");
        await create("step", "فرعية", "", p, parent);
        const d = await snapshot();
        expect(progress(d.steps, p)).toMatchObject({ total: 1, done: 0 });
        expect(
            d.steps.find((s) => s.id === parent)?.completedAt,
        ).toBeUndefined();
    });
    it("إغلاق مشروع وإعادة فتحه مستقلان عن نسبة الخطوات", async () => {
        const p = await create("project", "أ");
        await projectState(p, "close");
        expect((await db.projects.get(p))?.status).toBe("closed");
        await projectState(p, "close");
        expect((await db.projects.get(p))?.status).toBe("active");
        expect((await db.projects.get(p))?.completedAt).toBeUndefined();
        expect(
            (await db.events.toArray()).filter((e) => e.action === "reopened"),
        ).toHaveLength(1);
    });
    it("إنشاء وبدء وإكمال وإعادة فتح يحتفظ بالأحداث ولا يضاعف العد", async () => {
        const id = await create("task", "إرسال ملف");
        await changeStatus("task", id, "doing");
        expect((await db.tasks.get(id))?.startedAt).toBeTruthy();
        await changeStatus("task", id, "done");
        await changeStatus("task", id, "doing");
        expect((await db.tasks.get(id))?.completedAt).toBeUndefined();
        expect(achievements(await snapshot())).toHaveLength(0);
        await changeStatus("task", id, "done");
        expect(
            (await db.events.toArray()).filter(
                (e) => e.entityId === id && e.action === "completed",
            ),
        ).toHaveLength(2);
        expect(achievements(await snapshot())).toHaveLength(1);
    });
    it("آخر 7 أيام نافذة متحركة وليست أسبوع التقويم", async () => {
        const id = await create("task", "أ");
        await changeStatus("task", id, "done");
        const t = (await db.tasks.get(id))!;
        const d = await snapshot();
        const at = new Date(t.completedAt!);
        expect(
            achievements(d, new Date(at.getTime() + 7 * 86400000)),
        ).toHaveLength(1);
        expect(
            achievements(d, new Date(at.getTime() + 7 * 86400000 + 1)),
        ).toHaveLength(0);
    });
    it("المدة بين 11 و13 يومان منقضيان", () => {
        expect(elapsed("2026-10-11T00:00:00Z", "2026-10-13T00:00:00Z")).toBe(
            "يومان منقضيان",
        );
        expect(elapsed("2026-10-11T23:00:00Z", "2026-10-12T01:00:00Z")).toBe(
            "أقل من يوم منقضٍ",
        );
    });
    it("تحويل فكرة يحفظ العنوان والملاحظات ويؤرشف الأصل", async () => {
        for (const kind of ["task", "project"] as const) {
            const id = await create("idea", "اقتراح", "تفاصيل مفيدة");
            const dest = await convertIdea(id, kind);
            const t = await (kind === "task" ? db.tasks : db.projects).get(
                dest,
            );
            expect(t).toMatchObject({ title: "اقتراح", notes: "تفاصيل مفيدة" });
            expect((await db.ideas.get(id))?.archived).toBe(true);
        }
    });
    it("الملاحظات والبحث والعلاقات تبقى في التصدير والاستيراد", async () => {
        const { p, ids } = await fixture();
        await update("step", ids[0], { notes: "ملاحظة فريدة" });
        await changeStatus("step", ids[0], "done");
        const data = await snapshot();
        expect(search(data, "فريدة")[0]).toMatchObject({
            kind: "step",
            id: ids[0],
            projectId: p,
        });
        await importBackup(JSON.parse(JSON.stringify(data)));
        const restored = await snapshot();
        expect(restored.steps).toEqual(data.steps);
        expect(restored.events).toEqual(data.events);
        expect(restored.projects).toEqual(data.projects);
        db.close();
        await db.open();
        expect((await db.steps.get(ids[0]))?.notes).toBe("ملاحظة فريدة");
    });
    it("الحذف والتراجع يستعيدان الفرع كاملًا", async () => {
        const { p, stages } = await fixture();
        const old = await snapshot();
        const d = await remove("step", stages[0]);
        expect(progress((await snapshot()).steps, p).total).toBe(5);
        await undo(d!);
        expect(progress((await snapshot()).steps, p).total).toBe(10);
        expect((await snapshot()).steps.length).toBe(old.steps.length);
    });
    it("يرفض العلاقات المكسورة والدورات والحقول غير الصالحة قبل الاستبدال", async () => {
        await fixture();
        const original = await snapshot();
        for (const mutate of [
            (d: typeof original) => {
                d.steps[0].projectId = "missing";
            },
            (d: typeof original) => {
                d.steps[0].parentId = d.steps[0].id;
            },
            (d: typeof original) => {
                d.steps[0].order = -1;
            },
            (d: typeof original) => {
                d.events[0].at = "yesterday";
            },
            (d: typeof original) => {
                d.steps[0].status = "done";
            },
            (d: typeof original) => {
                d.tasks.push({ ...d.steps[0], id: d.projects[0].id });
            },
        ]) {
            const bad = structuredClone(original);
            mutate(bad);
            expect(() => validateBackup(bad)).toThrow();
            await expect(importBackup(bad)).rejects.toThrow();
            expect((await snapshot()).steps).toEqual(original.steps);
        }
    });
    it("فشل الكتابة أثناء الاستيراد يتراجع عن جميع التغييرات", async () => {
        await fixture();
        const original = await snapshot();
        const hook = () => {
            throw new Error("storage failure");
        };
        db.events.hook("creating", hook);
        await expect(importBackup(original)).rejects.toThrow("storage failure");
        db.events.hook("creating").unsubscribe(hook);
        expect((await snapshot()).projects).toEqual(original.projects);
        expect((await snapshot()).steps).toEqual(original.steps);
    });
});
it("التقريب لا يعرض 100% قبل اكتمال جميع الخطوات", () => {
    const steps = Array.from(
        { length: 201 },
        (_, i) =>
            ({
                id: String(i),
                projectId: "p",
                parentId: null,
                kind: "step",
                order: i,
                status: i === 0 ? "todo" : "done",
                title: "خطوة",
                notes: "",
                createdAt: "2026-10-11T00:00:00Z",
                updatedAt: "2026-10-11T00:00:00Z",
            }) as Step,
    );
    expect(progress(steps, "p").percent).toBe(99);
});
it("إتمام المرحلة يكمل أوراقها مرة واحدة ويحدّث الآباء دون إغلاق المشروع", async () => {
    const { p, ids, stages } = await fixture();
    await setBranchCompletion(stages[0], true);
    let data = await snapshot();
    expect(progress(data.steps, p)).toMatchObject({
        total: 10,
        done: 5,
        percent: 50,
    });
    expect(data.projects[0].status).toBe("active");
    expect(data.steps.find((s) => s.id === stages[0])?.status).toBe("done");
    const completed = data.events.filter(
        (e) => e.action === "completed",
    ).length;
    await setBranchCompletion(stages[0], true);
    expect(
        (await snapshot()).events.filter((e) => e.action === "completed"),
    ).toHaveLength(completed);
    await setBranchCompletion(stages[0], false);
    data = await snapshot();
    for (const id of ids.slice(0, 5))
        expect(data.steps.find((s) => s.id === id)).toMatchObject({
            status: "todo",
            completedAt: undefined,
        });
    await setBranchCompletion(stages[0], true);
    data = await snapshot();
    expect(achievements(data)).toHaveLength(5);
    expect(
        data.events.filter(
            (e) => e.action === "completed" && ids.includes(e.entityId),
        ),
    ).toHaveLength(10);
    validateBackup(JSON.parse(JSON.stringify(data)));
});
it("إتمام خطوة متفرعة يحدّث المرحلة وتواريخها ويحفظ الملاحظات", async () => {
    const { p, stages, ids } = await fixture();
    await create("step", "فرعية أ", "نص محفوظ", p, ids[0]);
    await create("step", "فرعية ب", "", p, ids[0]);
    await setBranchCompletion(ids[0], true);
    const data = await snapshot();
    expect(progress(data.steps, p)).toMatchObject({ total: 11, done: 2 });
    expect(data.steps.find((s) => s.id === stages[0])).toMatchObject({
        status: "doing",
    });
    expect(data.steps.find((s) => s.id === stages[0])?.startedAt).toBeTruthy();
    expect(data.steps.find((s) => s.title === "فرعية أ")?.notes).toBe(
        "نص محفوظ",
    );
    validateBackup(JSON.parse(JSON.stringify(data)));
});
it("المراحل الفارغة قابلة للإتمام دون اختراع نسبة أو مهام منجزة", async () => {
    const p = await create("project", "فارغ");
    const root = await create("step", "مرحلة فارغة", "", p, null, true);
    await create("step", "مرحلة داخلية", "", p, root, true);
    await setBranchCompletion(root, true);
    const data = await snapshot();
    expect(data.steps.every((s) => s.status === "done")).toBe(true);
    expect(progress(data.steps, p).percent).toBeNull();
    expect(data.projects[0].status).toBe("active");
    expect(
        derivedStatus(
            data.steps.find((s) => s.id === root)!,
            data.steps,
        ),
    ).toBe("done");
    expect(achievements(data)).toHaveLength(0);
    await setBranchCompletion(root, false);
    expect((await snapshot()).steps.every((s) => s.status === "todo")).toBe(
        true,
    );
});
it("الإتمام اليدوي للمشروع مستقل عن حالة الخطوات ولا يتكرر بالإرسال المزدوج", async () => {
    const { p } = await fixture();
    await Promise.all([
        setProjectCompletion(p, true),
        setProjectCompletion(p, true),
    ]);
    let d = await snapshot();
    expect(d.projects[0].status).toBe("closed");
    expect(progress(d.steps, p).percent).toBe(0);
    expect(d.events.filter((e) => e.action === "closed")).toHaveLength(1);
    await setProjectCompletion(p, false);
    d = await snapshot();
    expect(d.projects[0].status).toBe("active");
    expect(d.projects[0].completedAt).toBeUndefined();
});
it("فشل الإتمام الجماعي يتراجع عن جميع الخطوات والسجل", async () => {
    const { stages } = await fixture();
    const old = await snapshot();
    const hook = () => {
        throw new Error("فشل التخزين");
    };
    db.events.hook("creating", hook);
    await expect(setBranchCompletion(stages[0], true)).rejects.toThrow(
        "فشل التخزين",
    );
    db.events.hook("creating").unsubscribe(hook);
    expect((await snapshot()).steps).toEqual(old.steps);
    expect((await snapshot()).events).toEqual(old.events);
});
it("إتمام آخر مرحلة يُتمّ المشروع تلقائيًا مرة واحدة ويحفظ الملاحظات", async () => {
    const { p, stages } = await fixture();
    await update("project", p, { notes: "تفاصيل محفوظة" });
    await setBranchCompletion(stages[0], true);
    expect((await db.projects.get(p))?.status).toBe("active");
    await Promise.all([
        setBranchCompletion(stages[1], true),
        setBranchCompletion(stages[1], true),
    ]);
    const d = await snapshot();
    expect(progress(d.steps, p).percent).toBe(100);
    expect(d.projects[0]).toMatchObject({
        status: "closed",
        notes: "تفاصيل محفوظة",
    });
    expect(d.projects[0].completedAt).toBeTruthy();
    expect(
        d.events.filter((e) => e.entityId === p && e.action === "closed"),
    ).toHaveLength(1);
});
it("حذف آخر خطوة غير مكتملة يُتمّ المشروع فقط إذا بقيت خطوات مكتملة", async () => {
    const p = await create("project", "مشروع");
    const a = await create("step", "منجزة", "", p);
    const b = await create("step", "متبقية", "", p);
    await changeStatus("step", a, "done");
    await remove("step", b);
    expect((await db.projects.get(p))?.status).toBe("closed");
    const empty = await create("project", "فارغ");
    const last = await create("step", "أخيرة", "", empty);
    await remove("step", last);
    expect((await db.projects.get(empty))?.status).toBe("active");
});
it("المشاريع القديمة والنسخ المستوردة المكتملة تُتمّ تلقائيًا دون مضاعفة السجل", async () => {
    const { p, ids } = await fixture();
    for (const id of ids)
        await db.steps.update(id, {
            status: "done",
            completedAt: new Date().toISOString(),
        });
    const old = await snapshot();
    await completeFinishedProjects();
    await completeFinishedProjects();
    expect((await db.projects.get(p))?.status).toBe("closed");
    expect(
        (await snapshot()).events.filter(
            (e) => e.entityId === p && e.action === "closed",
        ),
    ).toHaveLength(1);
    await importBackup(old);
    const restored = await snapshot();
    expect(restored.projects[0].status).toBe("closed");
    expect(restored.steps).toEqual(old.steps);
    expect(
        restored.events.filter(
            (e) => e.entityId === p && e.action === "closed",
        ),
    ).toHaveLength(1);
});
it("فشل تسجيل الإتمام التلقائي يتراجع عن آخر خطوة والمشروع والسجل معًا", async () => {
    const { p, stages } = await fixture();
    await setBranchCompletion(stages[0], true);
    const old = await snapshot();
    const hook = (_key: unknown, e: { entityId: string; action: string }) => {
        if (e.entityId === p && e.action === "closed")
            throw new Error("فشل إتمام المشروع");
    };
    db.events.hook("creating", hook);
    await expect(setBranchCompletion(stages[1], true)).rejects.toThrow(
        "فشل إتمام المشروع",
    );
    db.events.hook("creating").unsubscribe(hook);
    const after = await snapshot();
    expect(after.projects).toEqual(old.projects);
    expect(after.steps).toEqual(old.steps);
    expect(after.events).toEqual(old.events);
});
