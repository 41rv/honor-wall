const formats = new Map<string, Intl.DateTimeFormat>();
const dates = new Map<string, string>();
// Date labels need a local calendar date, not a complete Temporal object.
// Reuse the formatter; explicit parts keep the stored YYYY-MM-DD format stable.
export function dateKey(at: Date | string | number, zone: string) {
    const value = at instanceof Date ? at : new Date(at),
        key = `${zone}:${value.getTime()}`;
    const cached = dates.get(key);
    if (cached !== undefined) return cached;
    let format = formats.get(zone);
    if (!format) {
        format = new Intl.DateTimeFormat("en-CA", {
            timeZone: zone,
            calendar: "gregory",
            numberingSystem: "latn",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        });
        formats.set(zone, format);
    }
    let year = "",
        month = "",
        day = "";
    for (const part of format.formatToParts(value)) {
        if (part.type === "year") year = part.value;
        else if (part.type === "month") month = part.value;
        else if (part.type === "day") day = part.value;
    }
    const result = `${year.padStart(4, "0")}-${month}-${day}`;
    // Bounded cache also shares dates from a bulk branch completion.
    if (dates.size >= 4096) {
        const oldest = dates.keys().next().value;
        if (oldest !== undefined) dates.delete(oldest);
    }
    dates.set(key, result);
    return result;
}
