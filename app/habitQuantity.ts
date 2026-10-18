/** Presentation only: slider drafts are never persisted until confirmation. */
export function habitQuantityRange(
    unit: string,
    target: number,
    amount = target,
) {
    const name = unit.trim().toLowerCase();
    const base = /^(ال)?(خطوة|خطوات)$|^steps?$/.test(name)
        ? 100
        : /^(ال)?(ثانية|ثواني|ثوان|ثوانٍ)$|^seconds?$|^sec$/.test(name)
          ? 5
          : 1;
    const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
    const targetStep =
        target > 0 ? gcd(base * 1000, Math.round(target * 1000)) : base * 1000;
    const step = gcd(targetStep, Math.round(Math.max(0, amount) * 1000)) / 1000;
    const max = Math.min(
        1e9,
        Math.ceil(Math.max(target * 2, amount, step * 10) / step) * step,
    );
    return { step, min: 0, max: Math.round(max * 1000) / 1000 };
}
export const quantityChange = (value: number, delta: number) =>
    Math.min(1e9, Math.max(0, Math.round((value + delta) * 1000) / 1000));
