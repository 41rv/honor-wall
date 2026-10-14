import { useEffect, useState } from "react";
export function useWallClock() {
    const [at, setAt] = useState(Date.now);
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;
        const tick = () => {
            clearTimeout(timer);
            const now = Date.now();
            setAt(now);
            timer = setTimeout(tick, 60000 - (now % 60000));
        };
        const returned = () => {
            if (document.visibilityState === "visible") tick();
        };
        tick();
        window.addEventListener("focus", returned);
        document.addEventListener("visibilitychange", returned);
        return () => {
            clearTimeout(timer);
            window.removeEventListener("focus", returned);
            document.removeEventListener("visibilitychange", returned);
        };
    }, []);
    return at;
}
