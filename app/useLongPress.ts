import {
    useCallback,
    useEffect,
    useRef,
    type PointerEvent,
    type MouseEvent,
} from "react";

export function useLongPress(open: (rect: DOMRect) => void) {
    const callback = useRef(open);
    callback.current = open;
    const gesture = useRef<{
        x: number;
        y: number;
        pointer: number;
        rect: DOMRect;
    } | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const suppressClick = useRef(false);
    const cancel = useCallback(() => {
        clearTimeout(timer.current);
        timer.current = undefined;
        gesture.current = null;
        window.removeEventListener("scroll", cancel, true);
    }, []);
    useEffect(() => cancel, [cancel]);
    return {
        onPointerDown(event: PointerEvent<HTMLElement>) {
            suppressClick.current = false;
            if (event.button !== 0 || !event.isPrimary) return;
            const interactive = (event.target as HTMLElement).closest(
                "button, a, input, textarea, summary",
            );
            if (
                interactive &&
                !interactive.matches(".title-link, .tree-title, .task-main")
            )
                return;
            cancel();
            suppressClick.current = false;
            gesture.current = {
                x: event.clientX,
                y: event.clientY,
                pointer: event.pointerId,
                rect: event.currentTarget.getBoundingClientRect(),
            };
            window.addEventListener("scroll", cancel, true);
            timer.current = setTimeout(() => {
                const current = gesture.current;
                cancel();
                if (current) {
                    suppressClick.current = true;
                    callback.current(current.rect);
                }
            }, 550);
        },
        onPointerMove(event: PointerEvent<HTMLElement>) {
            const current = gesture.current;
            if (
                current &&
                (current.pointer !== event.pointerId ||
                    Math.hypot(
                        event.clientX - current.x,
                        event.clientY - current.y,
                    ) > 10)
            )
                cancel();
        },
        onPointerUp: cancel,
        onPointerCancel: cancel,
        onPointerLeave: cancel,
        onClickCapture(event: MouseEvent<HTMLElement>) {
            if (suppressClick.current && event.detail !== 0) {
                event.preventDefault();
                event.stopPropagation();
                suppressClick.current = false;
            }
            if (event.detail === 0) suppressClick.current = false;
        },
        onContextMenu(event: MouseEvent<HTMLElement>) {
            if ((event.target as HTMLElement).closest("input, textarea"))
                return;
            event.preventDefault();
            cancel();
            if (!suppressClick.current)
                callback.current(event.currentTarget.getBoundingClientRect());
        },
    };
}
