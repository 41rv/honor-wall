import {
    Children,
    cloneElement,
    isValidElement,
    useLayoutEffect,
    useRef,
    useState,
    type ComponentProps,
    type ReactElement,
} from "react";

/** One decorative indicator; the existing buttons own selection and actions.
 * Measurements run on option/selection/size changes, never on every frame. */
export function GlassChoices({
    children,
    className = "",
    ...props
}: ComponentProps<"div">) {
    const root = useRef<HTMLDivElement>(null);
    const [rect, setRect] = useState<{
        x: number;
        y: number;
        w: number;
        h: number;
    } | null>(null);
    useLayoutEffect(() => {
        const group = root.current!;
        const measure = () => {
            const selected = group.querySelector<HTMLButtonElement>(
                ":scope > button.selected",
            );
            const next = selected
                ? {
                      x: selected.offsetLeft,
                      y: selected.offsetTop,
                      w: selected.offsetWidth,
                      h: selected.offsetHeight,
                  }
                : null;
            setRect((old) =>
                old?.x === next?.x &&
                old?.y === next?.y &&
                old?.w === next?.w &&
                old?.h === next?.h
                    ? old
                    : next,
            );
        };
        measure();
        if (!window.ResizeObserver) return;
        const observer = new ResizeObserver(measure);
        observer.observe(group);
        for (const button of group.querySelectorAll(":scope > button"))
            observer.observe(button);
        return () => observer.disconnect();
    }, [children]);
    return (
        <div
            ref={root}
            role="group"
            {...props}
            className={`glass-choices ${className}`}
        >
            <span
                aria-hidden="true"
                className="glass-choice-indicator"
                hidden={!rect}
                style={
                    rect
                        ? {
                              width: rect.w,
                              height: rect.h,
                              transform: `translate(${rect.x}px, ${rect.y}px)`,
                          }
                        : undefined
                }
            />
            {Children.map(children, (child) => {
                if (!isValidElement(child) || child.type !== "button")
                    return child;
                const button = child as ReactElement<ComponentProps<"button">>;
                if (
                    button.props.role === "tab" ||
                    button.props["aria-pressed"] !== undefined
                )
                    return child;
                return cloneElement(button, {
                    "aria-pressed":
                        button.props.className
                            ?.split(" ")
                            .includes("selected") ?? false,
                });
            })}
        </div>
    );
}
