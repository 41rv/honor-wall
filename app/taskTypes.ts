export type Priority = "important-urgent" | "important" | "urgent" | "low";
export const priorities: Record<Priority, { name: string; color: string }> = {
    "important-urgent": { name: "هام وعاجل", color: "#DC5757" },
    important: { name: "هام وغير عاجل", color: "#3988D7" },
    urgent: { name: "عاجل وغير هام", color: "#E6A33D" },
    low: { name: "غير هام وغير عاجل", color: "#8B929D" },
};
export interface TaskSchedule {
    date: string;
    time?: string;
    repeat: "none" | "daily" | "weekly" | "monthly";
    weekdays?: number[];
    monthDay?: number;
    leadDays: 0 | 1 | 3 | 7;
    timeZone: string;
}
export interface TaskOptions {
    priority?: Priority;
    schedule?: TaskSchedule;
}
export interface TaskCycle {
    id: string;
    taskId: string;
    revision: number;
    start: string;
    end: string;
    scheduledAt: string;
    timeZone: string;
    status: "current" | "completed" | "incomplete";
    completedAt?: string;
    startedAt?: string;
    workStatus?: "todo" | "doing";
    closedReason?: "schedule_changed";
    plannedEnd?: string;
    source?: "legacy";
}
