import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useSyncExternalStore,
} from "react";
import { createCompletionQueue } from "./completionQueue";

const queue = createCompletionQueue();
export const flushCompletions = () => queue.flush();
let keyboardFocus: { key: string; route: string } | null = null;
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
        const button = document.querySelector<HTMLButtonElement>(
            `[data-completion-key="${CSS.escape(key)}"]`,
        );
        if (!button) return;
        if (document.activeElement === document.body) {
            if (button.getClientRects().length) {
                button.focus();
                keyboardFocus = null;
            }
        } else if (
            document.activeElement !== button ||
            (!state.saving &&
                (state.desired === null || state.desired === checked))
        ) {
            // A completed write can precede the live-query render that moves
            // the row. Keep the focus request until that render arrives.
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
            queue.toggle(key, checked, persist);
        },
    };
}
