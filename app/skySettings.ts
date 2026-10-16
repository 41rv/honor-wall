export const SKY_BLUR_KEY = "masar-sky-blur";
export const DEFAULT_SKY_BLUR = 12;
export function normalizeSkyBlur(value: unknown): number {
    if (
        (typeof value !== "string" && typeof value !== "number") ||
        (typeof value === "string" && !value.trim())
    )
        return DEFAULT_SKY_BLUR;
    const number = Number(value);
    return Number.isFinite(number)
        ? Math.max(0, Math.min(30, Math.round(number)))
        : DEFAULT_SKY_BLUR;
}
