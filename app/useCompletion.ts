import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useSyncExternalStore,
} from "react";
import { createCompletionQueue } from "./completionQueue";
import {
    rememberCompletion,
    settleCompletion,
    startCompletionRecovery,
} from "./completionRecovery";

const queue = createCompletionQueue({
    intent: rememberCompletion,
    settled: settleCompletion,
});
export const flushCompletions = async () => {
    await startCompletionRecovery().catch(() => {});
    await queue.flush();
};
let keyboardFocus: { key: string; route: string } | null = null;
export function trackCompletionFocus(target: EventTarget | null) {
    if (
        keyboardFocus &&
        (target as HTMLElement | null)?.dataset?.completionKey !==
            keyboardFocus.key
    )
        keyboardFocus = null;
}
export function useCompletion(
    key: string,
    checked: boolean,
    persist: (complete: boolean) => Promise<void>,
) {
    const subscribe = useCallback(
        (listener: () => void) => queue.subscribe(key, listener),
        [key],
    );
    const getSnapshot = useCallback(() => queue.state(key), [key]);
    const state = useSyncExternalStore(subscribe, getSnapshot);
    useLayoutEffect(() => {
        if (keyboardFocus?.key !== key) return;
        if (keyboardFocus.route !== location.hash) {
            keyboardFocus = null;
            return;
        }
        if (!document.hasFocus()) {
            keyboardFocus = null;
            return;
        }
        const button = document.querySelector<HTMLButtonElement>(
            `[data-completion-key="${CSS.escape(key)}"]`,
        );
        if (!button) return;
        if (document.activeElement === document.body) {
            if (button.getClientRects().length) {
                button.focus();
            }
        } else if (document.activeElement !== button) {
            // Keep the request through successive table renders and row moves.
            // A real focus change or navigation ends it, without timed delays.
            keyboardFocus = null;
        }
    }, [key, checked, state]);
    useEffect(() => queue.acknowledge(key, checked), [key, checked, state]);
    return {
        checked: state.desired ?? checked,
        saving: state.saving,
        toggle: (event?: { detail: number }) => {
            if (
                event?.detail === 0 &&
                (document.activeElement as HTMLElement)?.dataset
                    .completionKey === key
            )
                keyboardFocus = { key, route: location.hash };
            queue.toggle(key, checked, async (value) => {
                await startCompletionRecovery().catch(() => {});
                await persist(value);
            });
        },
    };
}
