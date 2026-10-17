import { MAX_BACKUP_BYTES } from "./backupTables";
import Dexie, { type Table } from "dexie";
import { validateBackup, type Snapshot } from "./model";

interface RecoveryPoint {
    id?: number;
    createdAt: string;
    digest: string;
    data: Snapshot;
}
/** Separate from masar-v1: a full replacement must never erase its own undo copy.
 * No automatic pruning. Quota or verification failure blocks destructive restore. */
export class RecoveryDatabase extends Dexie {
    points!: Table<RecoveryPoint, number>;
    constructor(name = "masar-v1-recovery") {
        super(name, { chromeTransactionDurability: "strict" });
        this.version(1).stores({ points: "++id,createdAt,digest" });
    }
}
export const recoveryDB = new RecoveryDatabase();
export async function sha256(text: string) {
    return [
        ...new Uint8Array(
            await crypto.subtle.digest(
                "SHA-256",
                new TextEncoder().encode(text),
            ),
        ),
    ]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("");
}
function canonical(value: unknown): unknown {
    if (Array.isArray(value)) {
        const rows = value.map(canonical);
        // Backup tables are sets of primary-keyed records; array order is not identity.
        if (
            rows.every(
                (r) =>
                    r &&
                    typeof r === "object" &&
                    ("id" in r || "projectId" in r),
            )
        )
            rows.sort((a, b) => {
                const key = (r: unknown) => {
                    const row = r as Record<string, unknown>;
                    return String(row.id ?? row.projectId);
                };
                return key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0;
            });
        return rows;
    }
    if (value && typeof value === "object")
        return Object.fromEntries(
            Object.entries(value)
                .filter(([, v]) => v !== undefined)
                .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
                .map(([k, v]) => [k, canonical(v)]),
        );
    return value;
}
export const backupDigest = (data: Snapshot) =>
    sha256(JSON.stringify(canonical({ ...data, exportedAt: "" })));
export async function saveRecovery(data: Snapshot) {
    try {
        const verified = validateBackup(data);
        if (
            new TextEncoder().encode(JSON.stringify(verified, null, 2))
                .byteLength > MAX_BACKUP_BYTES
        )
            throw new Error(
                "نسخة الأمان تتجاوز حد الاستيراد20 ميجابايت؛ لا يمكن حذف بيانات قبل ضمان استعادتها.",
            );
        const digest = await backupDigest(verified);
        const id = await recoveryDB.transaction(
            "rw",
            recoveryDB.points,
            async () => {
                const id = await recoveryDB.points.add({
                    createdAt: new Date().toISOString(),
                    digest,
                    data: verified,
                });
                const point = await recoveryDB.points.get(id);
                if (
                    !point ||
                    JSON.stringify(point.data) !== JSON.stringify(verified)
                )
                    throw new Error("لم تكتمل كتابة النسخة");
                return id;
            },
        );
        // The independent IDB transaction has committed before returning.
        return id;
    } catch (error) {
        if (
            error instanceof Error &&
            error.message.startsWith("نسخة الأمان تتجاوز")
        )
            throw error;
        throw new Error(
            "تعذر حفظ نسخة أمان محلية قابلة للاستعادة؛ لم تُحذف بياناتك ولم تُطبّق الاستعادة. تحقق من مساحة التخزين وأعد المحاولة.",
        );
    }
}
export async function latestRecovery(): Promise<Snapshot | undefined> {
    const point = await recoveryDB.points.orderBy(":id").last();
    if (!point) return;
    if ((await backupDigest(point.data)) !== point.digest)
        throw new Error("تعذر التحقق من سلامة نسخة الأمان.");
    return validateBackup(point.data);
}
