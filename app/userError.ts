export function userError(
    error: unknown,
    fallback = "تعذر الحفظ. أعد المحاولة.",
): string {
    const message = error instanceof Error ? error.message : "";
    const arabic = message
        .split("\n")
        .find((line) => /[\u0600-\u06ff]/.test(line));
    if (arabic) return arabic.replace(/^[A-Za-z]+Error:\s*/, "").trim();
    if (error instanceof Error && error.name === "QuotaExceededError")
        return "تعذر الحفظ لأن مساحة التخزين ممتلئة. وفّر مساحة على الجهاز وأعد المحاولة.";
    if (error instanceof Error && error.name === "SecurityError")
        return "التخزين المحلي غير متاح في هذا المتصفح. أعد المحاولة دون مسح بيانات التطبيق.";
    return fallback;
}
