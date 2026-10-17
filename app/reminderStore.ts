import { db } from "./db";
import { trackBackupWrite } from "./backupWrites";
import { uid } from "./model";
import type { Reminder } from "./habitTypes";
const write = <T>(op: () => Promise<T>) =>
    trackBackupWrite(() => db.transaction("rw", db.reminders, op));
function checkedTime(old: Reminder, at: Date) {
    if (at.toISOString() < old.updatedAt)
        throw new Error("وقت الجهاز يسبق آخر تغيير محفوظ.");
}
export function saveReminder(
    input: { id?: string; title: string; category?: string },
    at = new Date(),
) {
    return write(async () => {
        const title = input.title.trim(),
            category = input.category?.trim();
        if (
            !title ||
            title.length > 300 ||
            (category !== undefined && (!category || category.length > 64))
        )
            throw new Error(
                "عنوان التذكير من حرف إلى300 حرف، والتصنيف حتى64 حرفًا.",
            );
        const old = input.id ? await db.reminders.get(input.id) : undefined;
        if (input.id && !old) throw new Error("التذكير غير موجود.");
        if (old) checkedTime(old, at);
        const row: Reminder = {
            ...(old ?? { id: uid(), createdAt: at.toISOString() }),
            title,
            updatedAt: at.toISOString(),
        };
        if (category) row.category = category;
        else delete row.category;
        await db.reminders.put(row);
        return row.id;
    });
}
export function reviewReminder(id: string, reviewed: boolean, at = new Date()) {
    return write(async () => {
        if (typeof reviewed !== "boolean")
            throw new Error("حالة المراجعة غير صالحة.");
        const old = await db.reminders.get(id);
        if (!old) throw new Error("التذكير غير موجود.");
        if (!!old.reviewedAt === reviewed) return;
        checkedTime(old, at);
        const row = { ...old, updatedAt: at.toISOString() };
        if (reviewed) row.reviewedAt = at.toISOString();
        else delete row.reviewedAt;
        await db.reminders.put(row);
    });
}
export function deleteReminder(id: string) {
    return write(() => db.reminders.delete(id));
}
export const reminderCategories = [
    ["series", "مسلسل"],
    ["anime", "أنمي"],
    ["book", "كتاب"],
    ["site", "موقع"],
    ["general", "عام"],
] as const;
export function orderReminders(rows: Reminder[]) {
    return [...rows].sort(
        (a, b) =>
            Number(!!a.reviewedAt) - Number(!!b.reviewedAt) ||
            b.createdAt.localeCompare(a.createdAt) ||
            a.id.localeCompare(b.id),
    );
}
