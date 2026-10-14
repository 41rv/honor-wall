export interface CompletionState {
    desired: boolean | null;
    saving: boolean;
}
const idle: CompletionState = { desired: null, saving: false };
type Persist = (complete: boolean) => Promise<void>;
interface Entry {
    state: CompletionState;
    version: number;
    running: boolean;
    persist: Persist;
    mode: "completion" | "doing";
    work?: Promise<void>;
}
// Shared by entity ID, so moving a task to/from the completed section or
// navigating away does not lose the newest intent while a write is in flight.
export function createCompletionQueue(
    options: {
        intent?: (
            key: string,
            desired: boolean,
            at?: string,
            mode?: "completion" | "doing",
        ) => void;
        settled?: (key: string, desired: boolean) => void;
    } = {},
) {
    const entries = new Map<string, Entry>();
    const listeners = new Map<string, Set<() => void>>();
    const notify = (key: string) => listeners.get(key)?.forEach((fn) => fn());
    async function drain(key: string, entry: Entry) {
        entry.running = true;
        while (true) {
            const version = entry.version;
            const desired = entry.state.desired!;
            const mode = entry.mode;
            try {
                await entry.persist(desired);
            } catch {
                // The caller reports the failure. A newer request still gets
                // its own attempt; otherwise restore the persisted UI state.
                if (version === entry.version) {
                    options.settled?.(key, desired);
                    entry.running = false;
                    entry.state = idle;
                    notify(key);
                    break;
                }
                continue;
            }
            if (
                version !== entry.version &&
                (desired !== entry.state.desired || mode !== entry.mode)
            )
                continue;
            entry.running = false;
            options.settled?.(key, desired);
            entry.state = { desired, saving: false };
            notify(key);
            break;
        }
        if (!listeners.get(key)?.size) entries.delete(key);
    }
    function request(
        key: string,
        desired: boolean,
        persist: Persist,
        at?: string,
        mode: "completion" | "doing" = "completion",
    ) {
        const entry = entries.get(key) ?? {
            state: idle,
            version: 0,
            running: false,
            persist,
            mode,
        };
        options.intent?.(key, desired, at, mode);
        entry.persist = persist;
        entry.mode = mode;
        entry.version++;
        entry.state = { desired, saving: true };
        entries.set(key, entry);
        notify(key);
        if (!entry.running) entry.work = drain(key, entry);
    }
    return {
        flush: () =>
            Promise.all([...entries.values()].map((entry) => entry.work)).then(
                () => {},
            ),
        state: (key: string) => entries.get(key)?.state ?? idle,
        subscribe(key: string, listener: () => void) {
            const group = listeners.get(key) ?? new Set();
            group.add(listener);
            listeners.set(key, group);
            return () => {
                group.delete(listener);
                if (!group.size) {
                    listeners.delete(key);
                    if (!entries.get(key)?.running) entries.delete(key);
                }
            };
        },
        acknowledge(key: string, checked: boolean) {
            const entry = entries.get(key);
            if (
                entry &&
                !entry.running &&
                (entry.state.desired === null ||
                    entry.state.desired === checked)
            ) {
                entries.delete(key);
                notify(key);
            }
        },
        request,
        toggle(key: string, checked: boolean, persist: Persist, at?: string) {
            request(
                key,
                !(entries.get(key)?.state.desired ?? checked),
                persist,
                at,
            );
        },
    };
}
