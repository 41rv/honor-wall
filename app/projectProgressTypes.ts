export type ProgressReason =
    | "completion"
    | "reopen"
    | "step_added"
    | "step_deleted"
    | "structure_changed"
    | "restore";
export interface ProjectTracking {
    projectId: string;
    since: string;
    initialPercent: number | null;
    origin: "new" | "existing";
    lastOrder: number;
    lastProgressAt?: string;
}
export interface ProjectProgress {
    id: string;
    projectId: string;
    order: number;
    at: string;
    before: number | null;
    after: number | null;
    reason: ProgressReason;
}
export const progressReasons: Record<ProgressReason, string> = {
    completion: "إنجاز عمل",
    reopen: "تراجع عن الإنجاز",
    step_added: "إضافة خطوة",
    step_deleted: "حذف خطوة",
    structure_changed: "تعديل بنية المشروع",
    restore: "استعادة خطوة",
};
