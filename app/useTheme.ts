import { SKY_BLUR_KEY, normalizeSkyBlur } from "./skySettings";
import { useEffect, useLayoutEffect, useState } from "react";
export type ThemeMode = "light" | "dark" | "system";
export type Identity = "green" | "mono";
function stored(key: string) {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}
export function useTheme() {
    const [mode, setMode] = useState<ThemeMode>(() => {
        const value = stored("masar-theme");
        return value === "light" || value === "dark" ? value : "system";
    });
    const [identity, setIdentity] = useState<Identity>(() =>
        stored("masar-identity") === "mono" ? "mono" : "green",
    );
    const [skyBlur, setSkyBlur] = useState(() =>
        normalizeSkyBlur(stored(SKY_BLUR_KEY)),
    );
    useLayoutEffect(() => {
        try {
            localStorage.setItem(SKY_BLUR_KEY, String(skyBlur));
        } catch {
            /* Appearance remains usable when storage is unavailable. */
        }
    }, [skyBlur]);
    const [systemDark, setSystemDark] = useState(
        () => matchMedia("(prefers-color-scheme: dark)").matches,
    );
    const theme = mode === "system" ? (systemDark ? "dark" : "light") : mode;
    useEffect(() => {
        const media = matchMedia("(prefers-color-scheme: dark)");
        const change = () => setSystemDark(media.matches);
        media.addEventListener("change", change);
        return () => media.removeEventListener("change", change);
    }, []);
    useLayoutEffect(() => {
        const root = document.documentElement;
        root.dataset.theme = theme;
        root.dataset.identity = identity;
        const background = getComputedStyle(root)
            .getPropertyValue("--bg")
            .trim();
        root.style.backgroundColor = background;
        root.style.colorScheme = theme;
        document
            .querySelector('meta[name="theme-color"]')
            ?.setAttribute("content", background);
        document
            .querySelector('meta[name="color-scheme"]')
            ?.setAttribute("content", theme);
        try {
            localStorage.setItem("masar-theme", mode);
            localStorage.setItem("masar-identity", identity);
        } catch {
            /* The current appearance still works when storage is unavailable. */
        }
    }, [theme, mode, identity]);
    return {
        theme,
        mode,
        identity,
        setMode,
        setIdentity,
        skyBlur,
        setSkyBlur: (value: number) => setSkyBlur(normalizeSkyBlur(value)),
    };
}
