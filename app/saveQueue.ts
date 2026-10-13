export type EditPatch = { title?: string; notes?: string };
const queues = new Set<SaveQueue>();
export interface SaveQueue {
    schedule: (patch: EditPatch) => void;
    flush: () => Promise<void>;
    dispose: () => Promise<void>;
    pending: () => boolean;
}
export function createSaveQueue(
    persist: (patch: EditPatch) => Promise<void>,
    delay = 250,
): SaveQueue {
    let patch: EditPatch | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let work: Promise<void> | undefined;
    function flush(): Promise<void> {
        clearTimeout(timer);
        timer = undefined;
        if (work) return work;
        if (!patch) return Promise.resolve();
        work = (async () => {
            while (patch) {
                const current = patch;
                patch = undefined;
                try {
                    await persist(current);
                } catch (error) {
                    patch = { ...current, ...(patch as EditPatch | undefined) };
                    throw error;
                }
            }
        })().finally(() => {
            work = undefined;
        });
        return work;
    }
    const queue: SaveQueue = {
        schedule(next) {
            queues.add(queue);
            patch = { ...patch, ...next };
            clearTimeout(timer);
            timer = setTimeout(() => {
                void flush().catch(() => {
                    /* The editor reports failures and keeps its recovery draft. */
                });
            }, delay);
        },
        flush,
        pending: () => !!patch || !!work,
        async dispose() {
            try {
                await flush();
            } finally {
                queues.delete(queue);
            }
        },
    };
    return queue;
}
export async function flushAllSaves() {
    await Promise.all([...queues].map((queue) => queue.flush()));
}
