import { useLayoutEffect, useRef } from "react";

const tabs = ["home", "projects", "tasks", "ideas", "progress"];

/** Tab order is reliable in both link navigation and history traversal.
 * Unknown/detail routes and initial loads keep their existing behavior. */
export function routeOffset(from: string, to: string, rtl = true): number {
    const a = tabs.indexOf(from),
        b = tabs.indexOf(to);
    if (a < 0 || b < 0 || a === b) return 0;
    return Math.sign(b - a) * (rtl ? -10 : 10);
}

export function useRouteMotion(route: string) {
    const ref = useRef<HTMLElement>(null);
    const previous = useRef(route);
    useLayoutEffect(() => {
        const from = previous.current;
        previous.current = route;
        const main = ref.current;
        if (!main) return;
        const offset = routeOffset(
            from,
            route,
            document.documentElement.dir !== "ltr",
        );
        const preference = matchMedia("(prefers-reduced-motion: reduce)");
        if (!offset || preference.matches || !main.animate) return;
        // Only the newly committed content moves. No old DOM, delayed route,
        // snapshot overlay, layout animation or permanent will-change layer.
        let animation: Animation | undefined;
        // Run after useRoute's existing scroll restoration, without forcing
        // synchronous style/layout work inside React's commit phase.
        const frame = requestAnimationFrame(() => {
            if (preference.matches || document.visibilityState === "hidden")
                return;
            animation = main.animate(
                [
                    { opacity: 0.92, transform: `translateX(${offset}px)` },
                    { opacity: 1, transform: "translateX(0)" },
                ],
                { duration: 240, easing: "cubic-bezier(.2,.7,.2,1)" },
            );
            main.dataset.routeMotion = offset < 0 ? "from-left" : "from-right";
            animation.finished.then(
                () => {
                    delete main.dataset.routeMotion;
                },
                () => {},
            );
        });
        const cancel = () => {
            cancelAnimationFrame(frame);
            animation?.cancel();
            delete main.dataset.routeMotion;
        };
        preference.addEventListener("change", cancel);
        // A new route cancels the previous animation immediately.
        return () => {
            preference.removeEventListener("change", cancel);
            cancel();
        };
    }, [route]);
    return ref;
}
