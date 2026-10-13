import { it, expect, vi } from "vitest";
import { createCompletionQueue } from "../app/completionQueue";

function deferred() {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return { promise, resolve, reject };
}
it("التصدير والاستيراد ينتظران الطلب الأخير، بما فيه الطلب الذي يصل أثناء كتابة سابقة", async () => {
    const queue = createCompletionQueue();
    const first = deferred(),
        second = deferred();
    const persist = vi
        .fn()
        .mockImplementationOnce(() => first.promise)
        .mockImplementationOnce(() => second.promise);
    queue.toggle("task/a", false, persist);
    let finished = false;
    const flushed = queue.flush().then(() => {
        finished = true;
    });
    queue.toggle("task/a", false, persist);
    first.resolve();
    await vi.waitFor(() => expect(persist).toHaveBeenCalledTimes(2));
    expect(finished).toBe(false);
    second.resolve();
    await flushed;
    expect(finished).toBe(true);
    expect(persist.mock.calls.map((args) => args[0])).toEqual([true, false]);
});
it("عشرة تبديلات تحفظ آخر طلب، دون توازي أو إسقاط الطلب أثناء الحفظ", async () => {
    const queue = createCompletionQueue();
    const blocked = deferred();
    const writes: boolean[] = [];
    let running = 0,
        maximum = 0;
    const unsubscribe = queue.subscribe("task/a", () => {});
    const persist = async (complete: boolean) => {
        running++;
        maximum = Math.max(maximum, running);
        writes.push(complete);
        if (writes.length === 1) await blocked.promise;
        running--;
    };
    for (let i = 0; i < 10; i++) queue.toggle("task/a", false, persist);
    expect(queue.state("task/a")).toEqual({ desired: false, saving: true });
    blocked.resolve();
    await vi.waitFor(() => expect(queue.state("task/a").saving).toBe(false));
    expect(writes).toEqual([true, false]);
    expect(maximum).toBe(1);
    queue.acknowledge("task/a", false);
    expect(queue.state("task/a").desired).toBeNull();
    unsubscribe();
});
it("الطلب الأخير المطابق للكتابة الجارية لا يكرر الإنجاز", async () => {
    const queue = createCompletionQueue();
    const blocked = deferred();
    const persist = vi.fn(() => blocked.promise);
    const unsubscribe = queue.subscribe("step/a", () => {});
    for (let i = 0; i < 11; i++) queue.toggle("step/a", false, persist);
    blocked.resolve();
    await vi.waitFor(() => expect(queue.state("step/a").saving).toBe(false));
    expect(persist).toHaveBeenCalledTimes(1);
    expect(queue.state("step/a").desired).toBe(true);
    unsubscribe();
});
it("تغيير مكان العنصر أو الصفحة لا يلغي الطلب الجاري أو الأخير", async () => {
    const queue = createCompletionQueue();
    const blocked = deferred();
    const persist = vi
        .fn()
        .mockImplementationOnce(() => blocked.promise)
        .mockResolvedValue(undefined);
    const unsubscribe = queue.subscribe("task/a", () => {});
    queue.toggle("task/a", false, persist);
    unsubscribe();
    const remount = queue.subscribe("task/a", () => {});
    queue.toggle("task/a", false, persist);
    blocked.resolve();
    await vi.waitFor(() => expect(queue.state("task/a").saving).toBe(false));
    expect(persist.mock.calls.map((args) => args[0])).toEqual([true, false]);
    remount();
});
it("فشل الحفظ يعيد الحالة ولا يمنع محاولة لاحقة", async () => {
    const queue = createCompletionQueue();
    const persist = vi
        .fn()
        .mockRejectedValueOnce(new Error("quota"))
        .mockResolvedValue(undefined);
    const unsubscribe = queue.subscribe("task/a", () => {});
    queue.toggle("task/a", false, persist);
    await vi.waitFor(() =>
        expect(queue.state("task/a")).toEqual({ desired: null, saving: false }),
    );
    queue.toggle("task/a", false, persist);
    await vi.waitFor(() =>
        expect(queue.state("task/a")).toEqual({ desired: true, saving: false }),
    );
    unsubscribe();
});
it("فشل كتابة قديمة لا يسقط طلبًا أحدث", async () => {
    const queue = createCompletionQueue();
    const blocked = deferred();
    const persist = vi
        .fn()
        .mockImplementationOnce(() => blocked.promise)
        .mockResolvedValue(undefined);
    const unsubscribe = queue.subscribe("step/a", () => {});
    queue.toggle("step/a", false, persist);
    queue.toggle("step/a", false, persist);
    blocked.reject(new Error("quota"));
    await vi.waitFor(() =>
        expect(queue.state("step/a")).toEqual({
            desired: false,
            saving: false,
        }),
    );
    expect(persist.mock.calls.map((args) => args[0])).toEqual([true, false]);
    unsubscribe();
});
it("العناصر المختلفة لها طوابير مستقلة ولا تُمسح النتيجة بتحديث قديم", async () => {
    const queue = createCompletionQueue();
    const first = deferred(),
        second = deferred();
    const stopA = queue.subscribe("task/a", () => {});
    const stopB = queue.subscribe("task/b", () => {});
    queue.toggle("task/a", false, () => first.promise);
    queue.toggle("task/b", false, () => second.promise);
    second.resolve();
    await vi.waitFor(() => expect(queue.state("task/b").saving).toBe(false));
    expect(queue.state("task/a").saving).toBe(true);
    queue.acknowledge("task/b", false);
    expect(queue.state("task/b").desired).toBe(true);
    first.resolve();
    await vi.waitFor(() => expect(queue.state("task/a").saving).toBe(false));
    stopA();
    stopB();
});
