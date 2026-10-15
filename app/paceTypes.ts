export interface ProjectGoal {
    kind: "duration" | "date";
    days?: number;
    anchor: string;
    targetDate: string;
    deadline: "flexible" | "fixed";
    timeZone: string;
}
export interface ProjectPause {
    start: string;
    end?: string;
}
export interface ProjectPlan {
    projectId: string;
    since: string;
    revision: number;
    workOrder: number;
    goal?: ProjectGoal;
    pauses: ProjectPause[];
    approvedPace?: number;
    approvedAt?: string;
}
// Only genuine changes of terminal executable steps are recorded. Parent/stage
// propagation and structural edits are not work. Undo is a new, inverse event.
export interface StepWork {
    id: string;
    projectId: string;
    stepId: string;
    order: number;
    at: string;
    complete: boolean;
}
export interface PaceSettings {
    id: "pace";
    activeLimit: number;
    importDigests?: string[];
}
export type PlanChange =
    | {
          type: "target" | "pace";
          projectId: string;
          targetDate: string;
          daily: number;
      }
    | { type: "pause"; projectId: string };
export interface PaceRecommendation {
    id: string;
    key: string;
    type: "accelerate" | "ease" | "focus";
    projectIds: string[];
    reason: string;
    effect: string;
    createdAt: string;
    status: "new" | "accepted" | "rejected" | "invalid";
    decidedAt?: string;
    changes: PlanChange[];
    basis: string;
    approvedChanges?: PlanChange[];
}
export interface PaceData {
    projectPlans?: ProjectPlan[];
    stepWork?: StepWork[];
    recommendations?: PaceRecommendation[];
    paceSettings?: PaceSettings[];
}
