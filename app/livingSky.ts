/** Decorative local civil time, not astronomical sunrise/sunset or weather. */
export type SkyPhase = "dawn" | "morning" | "noon" | "sunset" | "night";
type Color = readonly [number, number, number];
type Palette = readonly [Color, Color, Color, Color];
const rgb = (hex: string): Color => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
];
const palette = (...colors: [string, string, string, string]): Palette => [
    rgb(colors[0]),
    rgb(colors[1]),
    rgb(colors[2]),
    rgb(colors[3]),
];
// The final key repeats midnight: interpolation never jumps at a day boundary.
const keys: ReadonlyArray<{ minute: number; colors: Palette; light: number }> =
    [
        {
            minute: 0,
            colors: palette("#101d36", "#293d5a", "#546174", "#a7b6b5"),
            light: 0,
        },
        {
            minute: 270,
            colors: palette("#152440", "#30445f", "#647184", "#a8b6b6"),
            light: 0,
        },
        {
            minute: 300,
            colors: palette("#273653", "#5c627c", "#b998a1", "#dfc5b4"),
            light: 0.12,
        },
        {
            minute: 375,
            colors: palette("#607c9f", "#b1b4c6", "#e4bbb0", "#f0d7bc"),
            light: 0.5,
        },
        {
            minute: 420,
            colors: palette("#7399b6", "#b2cbd7", "#d4dfd9", "#e7e7d8"),
            light: 0.8,
        },
        {
            minute: 660,
            colors: palette("#6f9fbd", "#b5d6e3", "#d7e9e5", "#e9ecdb"),
            light: 1,
        },
        {
            minute: 780,
            colors: palette("#709fbc", "#b5d3e0", "#dfe7dc", "#e9e8d6"),
            light: 1,
        },
        {
            minute: 900,
            colors: palette("#889eb8", "#c6c3cf", "#e4cfb0", "#ebe0c6"),
            light: 0.9,
        },
        {
            minute: 1035,
            colors: palette("#776e94", "#ba9cae", "#e4b595", "#e6c5a0"),
            light: 0.4,
        },
        {
            minute: 1140,
            colors: palette("#243450", "#5b5875", "#9b7d91", "#b4a4a4"),
            light: 0.06,
        },
        {
            minute: 1260,
            colors: palette("#111f39", "#293e5b", "#536177", "#a5b3b2"),
            light: 0,
        },
        {
            minute: 1440,
            colors: palette("#101d36", "#293d5a", "#546174", "#a7b6b5"),
            light: 0,
        },
    ];
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (t: number) => t * t * (3 - 2 * t);
export interface SkyScene {
    minute: number;
    phase: SkyPhase;
    colors: [string, string, string, string];
    light: number;
    stars: number;
    sun: { x: number; y: number; opacity: number };
    moon: { x: number; y: number; opacity: number };
}
export function skyAt(time: Date): SkyScene {
    const minute = Number.isFinite(time.getTime())
        ? time.getHours() * 60 +
          time.getMinutes() +
          time.getSeconds() / 60 +
          time.getMilliseconds() / 60000
        : 0;
    const index = keys.findIndex((key) => key.minute > minute);
    const a = keys[index - 1],
        b = keys[index];
    const t = smooth((minute - a.minute) / (b.minute - a.minute));
    const light = a.light + (b.light - a.light) * t;
    const colors = a.colors.map(
        (color, n) =>
            `rgb(${color.map((channel, c) => (channel + (b.colors[n][c] - channel) * t).toFixed(3)).join(" ")})`,
    ) as SkyScene["colors"];
    const day = clamp((minute - 300) / 840);
    const night = clamp(((minute < 300 ? minute + 1440 : minute) - 1140) / 600);
    const sunOpacity = clamp((minute - 300) / 35) * clamp((1140 - minute) / 45);
    const nightMinute = minute < 300 ? minute + 1440 : minute;
    const moonOpacity =
        clamp((nightMinute - 1140) / 45) * clamp((1740 - nightMinute) / 35);
    return {
        minute,
        colors,
        light,
        phase:
            minute < 300 || minute >= 1140
                ? "night"
                : minute < 420
                  ? "dawn"
                  : minute < 660
                    ? "morning"
                    : minute < 900
                      ? "noon"
                      : "sunset",
        stars: Math.max(0, 1 - light * 3) * 0.55,
        sun: {
            x: 10 + day * 80,
            y: 64 - Math.sin(day * Math.PI) * 51,
            opacity: sunOpacity,
        },
        moon: {
            x: 10 + night * 80,
            y: 62 - Math.sin(night * Math.PI) * 49,
            opacity: moonOpacity,
        },
    };
}
