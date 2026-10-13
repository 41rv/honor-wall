import { describe, it, expect, vi, afterEach } from "vitest";
import {
    createSaveQueue,
    flushAllSaves,
    type EditPatch,
} from "../app/saveQueue";
import { buildHierarchy } from "../app/hierarchy";
import { progress, derivedStatus, numbered, type Step } from "../app/model";
afterEach(() => vi.useRealTimers());
it("معرّف root والشرطة المائلة لا يخلطان أبناء الفرع بجذور المشاريع", () => {
    const at = new Date().toISOString();
    const common = {
        title: "عنصر",
        notes: "",
        createdAt: at,
        updatedAt: at,
        order: 0,
        status: "done" as const,
        completedAt: at,
    };
    const steps: Step[] = [
        {
            ...common,
            id: "root",
            projectId: "p/خاص",
            parentId: null,
            kind: "stage",
        },
        {
            ...common,
            id: "leaf/فرعية",
            projectId: "p/خاص",
            parentId: "root",
            kind: "step",
        },
    ];
    const index = buildHierarchy(steps);
    expect(index.metric("p/خاص")).toMatchObject({
        total: 1,
        done: 1,
        percent: 100,
    });
    expect(index.numbers.get("root")).toBe("1");
    expect(index.numbers.get("leaf/فرعية")).toBe("1.1");
});
describe("الحفظ المتتابع دون تجميد الكتابة", () => {
    it("يجمع الكتابة السريعة في حفظ واحد لآخر نص", async () => {
        vi.useFakeTimers();
        const write = vi.fn(async (_patch: EditPatch) => {});
        const q = createSaveQueue(write);
        for (let i = 0; i < 100; i++) q.schedule({ notes: "آخر نص " + i });
        expect(write).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(250);
        expect(write).toHaveBeenCalledTimes(1);
        expect(write).toHaveBeenLastCalledWith({ notes: "آخر نص 99" });
        await q.dispose();
    });
    it("التنقل والتصدير يفرغان الاسم والملاحظات قبل انتهاء المؤقت", async () => {
        const write = vi.fn(async (_patch: EditPatch) => {});
        const q = createSaveQueue(write);
        q.schedule({ title: "اسم جديد" });
        q.schedule({ notes: "ملاحظات جديدة" });
        await flushAllSaves();
        expect(write).toHaveBeenCalledWith({
            title: "اسم جديد",
            notes: "ملاحظات جديدة",
        });
        await q.dispose();
    });
    it("لا تتوازى الكتابات ولا تطغى كتابة قديمة على نص أحدث", async () => {
        let release!: () => void;
        const writes: EditPatch[] = [];
        let running = 0,
            max = 0;
        const q = createSaveQueue(async (patch) => {
            running++;
            max = Math.max(max, running);
            writes.push(patch);
            if (writes.length === 1)
                await new Promise<void>((resolve) => (release = resolve));
            running--;
        });
        q.schedule({ notes: "قديم" });
        const first = q.flush();
        q.schedule({ notes: "حديث" });
        q.schedule({ notes: "الأحدث" });
        release();
        await first;
        expect(writes).toEqual([{ notes: "قديم" }, { notes: "الأحدث" }]);
        expect(max).toBe(1);
        expect(q.pending()).toBe(false);
        await q.dispose();
    });
    it("فشل الحفظ يحتفظ بالتعديل لإعادة المحاولة", async () => {
        const write = vi
            .fn()
            .mockRejectedValueOnce(new Error("quota"))
            .mockResolvedValue(undefined);
        const q = createSaveQueue(write);
        q.schedule({ notes: "لا تفقدني" });
        await expect(q.flush()).rejects.toThrow("quota");
        expect(q.pending()).toBe(true);
        await q.flush();
        expect(write).toHaveBeenLastCalledWith({ notes: "لا تفقدني" });
        expect(q.pending()).toBe(false);
        await q.dispose();
    });
    it("فشل كتابة قديمة لا يستبدل النص الأحدث المنتظر", async () => {
        let reject!: (e: Error) => void;
        const write = vi
            .fn()
            .mockImplementationOnce(
                () => new Promise((_resolve, rejectFn) => (reject = rejectFn)),
            )
            .mockResolvedValue(undefined);
        const q = createSaveQueue(write);
        q.schedule({ notes: "قديم", title: "العنوان" });
        const failed = q.flush();
        q.schedule({ notes: "الأحدث" });
        reject(new Error("quota"));
        await expect(failed).rejects.toThrow();
        await q.dispose();
        expect(write).toHaveBeenLastCalledWith({
            title: "العنوان",
            notes: "الأحدث",
        });
    });
});
it("فهرس الشجرة يطابق الحسابات والترقيم للحالات المختلطة والعميقة", () => {
    const base = (
        id: string,
        parentId: string | null,
        kind: "stage" | "step",
        order: number,
        status: "todo" | "doing" | "done",
    ): Step => ({
        id,
        parentId,
        projectId: "p",
        kind,
        order,
        status,
        title: id,
        notes: "",
        createdAt: "2026-10-11T00:00:00Z",
        updatedAt: "2026-10-11T00:00:00Z",
    });
    const steps = [
        base("stage", null, "stage", 0, "todo"),
        base("empty", null, "stage", 1, "todo"),
        base("a", "stage", "step", 0, "done"),
        base("parent", "stage", "step", 1, "done"),
        base("b", "parent", "step", 0, "doing"),
        base("c", "parent", "step", 1, "todo"),
    ];
    const index = buildHierarchy(steps);
    for (const s of steps) {
        const metric = index.nodes.get(s.id)!;
        expect(metric).toMatchObject(progress(steps, "p", s.id));
        expect(metric.status).toBe(derivedStatus(s, steps));
        expect(index.numbers.get(s.id)).toBe(numbered(steps, "p").get(s.id));
    }
    expect(index.metric("p")).toMatchObject(progress(steps, "p"));
});
it("فهرس الشجرة يتعامل مع خمسة آلاف مستوى دون تجاوز المكدس", () => {
    const steps = Array.from(
        { length: 5000 },
        (_, i) =>
            ({
                id: String(i),
                parentId: i === 0 ? null : String(i - 1),
                projectId: "p",
                order: 0,
                kind: "step",
                status: i === 4999 ? "done" : "todo",
                title: "عميق",
                notes: "",
                createdAt: "2026-10-11T00:00:00Z",
                updatedAt: "2026-10-11T00:00:00Z",
            }) as Step,
    );
    const index = buildHierarchy(steps);
    expect(index.metric("p")).toMatchObject({
        total: 1,
        done: 1,
        percent: 100,
    });
});
