import { expect, it } from "vitest";
import { skyAt } from "../app/livingSky";
import { normalizeSkyBlur } from "../app/skySettings";
const at = (hour: number, minute = 0) => new Date(2026, 9, 21, hour, minute);
const channels = (s: string) => s.match(/[\d.]+/g)!.map(Number);
it.each([
    [5, "dawn"],
    [6, "dawn"],
    [7, "morning"],
    [9, "morning"],
    [11, "noon"],
    [13, "noon"],
    [15, "sunset"],
    [18, "sunset"],
    [19, "night"],
    [0, "night"],
    [4, "night"],
] as const)("الساعة%s تعكس فترة%s", (hour, phase) =>
    expect(skyAt(at(hour)).phase).toBe(phase),
);
it.each([4.5, 5, 6.25, 7, 11, 13, 15, 17.25, 19, 21, 24])(
    "اتصال المشهد عند%s بما فيه منتصف الليل",
    (hour) => {
        const center = at(0).getTime() + hour * 3600000,
            a = skyAt(new Date(center - 1)),
            b = skyAt(new Date(center + 1));
        a.colors.forEach((c, i) =>
            channels(c).forEach((v, n) =>
                expect(Math.abs(v - channels(b.colors[i])[n])).toBeLessThan(
                    0.01,
                ),
            ),
        );
        expect(Math.abs(a.light - b.light)).toBeLessThan(0.001);
        expect(Math.abs(a.stars - b.stars)).toBeLessThan(0.001);
        for (const orb of ["sun", "moon"] as const) {
            expect(Math.abs(a[orb].opacity - b[orb].opacity)).toBeLessThan(
                0.001,
            );
            if (a[orb].opacity > 0.001 || b[orb].opacity > 0.001) {
                expect(Math.abs(a[orb].x - b[orb].x)).toBeLessThan(0.001);
                expect(Math.abs(a[orb].y - b[orb].y)).toBeLessThan(0.001);
            }
        }
    },
);
it("شمس بمنحنى صاعد ثم هابط وقمر يتصل عبر منتصف الليل", () => {
    const a = skyAt(at(7)),
        b = skyAt(at(12)),
        c = skyAt(at(18));
    expect(a.sun.y).toBeGreaterThan(b.sun.y);
    expect(c.sun.y).toBeGreaterThan(b.sun.y);
    expect(a.sun.x).toBeLessThan(b.sun.x);
    expect(c.sun.x).toBeGreaterThan(b.sun.x);
    expect(skyAt(at(23, 59)).moon.x).toBeLessThan(skyAt(at(0, 1)).moon.x);
    expect(skyAt(at(0)).moon.y).toBeLessThan(skyAt(at(20)).moon.y);
    expect(skyAt(at(0)).sun.opacity).toBe(0);
    expect(skyAt(at(12)).moon.opacity).toBe(0);
});
it("جميع دقائق اليوم حتمية وبحدود صالحة", () => {
    for (let m = 0; m < 1440; m++) {
        const scene = skyAt(at(0, m));
        expect(skyAt(at(0, m))).toEqual(scene);
        expect(scene.light).toBeGreaterThanOrEqual(0);
        expect(scene.light).toBeLessThanOrEqual(1);
        for (const orb of [scene.sun, scene.moon]) {
            expect(orb.x).toBeGreaterThanOrEqual(10);
            expect(orb.x).toBeLessThanOrEqual(90);
            expect(orb.y).toBeGreaterThanOrEqual(0);
            expect(orb.y).toBeLessThanOrEqual(100);
            expect(orb.opacity).toBeGreaterThanOrEqual(0);
            expect(orb.opacity).toBeLessThanOrEqual(1);
        }
        for (const color of scene.colors)
            for (const n of channels(color)) {
                expect(n).toBeGreaterThanOrEqual(0);
                expect(n).toBeLessThanOrEqual(255);
            }
    }
});
it("حساب محلي مستقل عن الفصل والتاريخ مع حماية التاريخ التالف", () => {
    expect(skyAt(at(6, 25)).minute).toBe(385);
    expect(skyAt(new Date(2027, 0, 1, 6, 25))).toEqual(skyAt(at(6, 25)));
    expect(skyAt(new Date(NaN))).toEqual(skyAt(at(0)));
});
it.each(Array.from({ length: 31 }, (_, i) => i))(
    "الضبابية%s محفوظة كما هي",
    (value) => {
        expect(normalizeSkyBlur(value)).toBe(value);
        expect(normalizeSkyBlur(String(value))).toBe(value);
    },
);
it.each([
    null,
    undefined,
    "",
    " ",
    "broken",
    "Infinity",
    NaN,
    Infinity,
    false,
    {},
    [],
])("التالف%s يعود للافتراضي12", (value) =>
    expect(normalizeSkyBlur(value)).toBe(12),
);
it("تقريب وتقيد الضبابية إلى0–30", () => {
    expect(normalizeSkyBlur(-4)).toBe(0);
    expect(normalizeSkyBlur(35)).toBe(30);
    expect(normalizeSkyBlur(2.7)).toBe(3);
    expect(normalizeSkyBlur("30.9")).toBe(30);
});
