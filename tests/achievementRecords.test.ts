import { it, expect } from "vitest";
import { achievementRecords } from "../app/achievementRecords";
import type { Snapshot } from "../app/model";
import type { TaskCycle } from "../app/taskTypes";
const at = "2026-10-14T09:00:00Z",
    now = new Date(at),
    base = { title: "عنصر", notes: "", createdAt: at, updatedAt: at };
function data(): Snapshot {
    return {
        version: 2,
        exportedAt: at,
        ideas: [],
        events: [],
        projects: [
            {
                ...base,
                id: "p",
                status: "closed",
                archived: false,
                completedAt: at,
            },
        ],
        steps: [
            {
                ...base,
                id: "branch",
                kind: "step",
                projectId: "p",
                parentId: null,
                status: "done",
                completedAt: at,
                order: 0,
            },
            {
                ...base,
                id: "leaf",
                kind: "step",
                projectId: "p",
                parentId: "branch",
                status: "done",
                completedAt: at,
                order: 0,
            },
        ],
        tasks: [
            { ...base, id: "t", status: "done", completedAt: at },
            {
                ...base,
                id: "r",
                status: "done",
                completedAt: at,
                schedule: {
                    date: "2026-10-14",
                    repeat: "daily",
                    timeZone: "Asia/Riyadh",
                    leadDays: 0,
                },
            },
        ],
    };
}
const cycle: TaskCycle = {
    id: "cycle",
    taskId: "r",
    revision: 1,
    status: "completed",
    scheduledAt: at,
    start: at,
    end: "2026-10-15T09:00:00Z",
    timeZone: "Asia/Riyadh",
    completedAt: at,
};
it("المهام والدورات والأوراق والمشاريع مرة واحدة دون تكرار المهمة المتكررة أو الفروع", () => {
    const rows = achievementRecords(data(), [cycle, cycle], undefined, now);
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.kind).sort()).toEqual([
        "cycle",
        "project",
        "step",
        "task",
    ]);
    expect(rows.find((r) => r.kind === "step")!.id).toBe("leaf");
});
it("التراجع يزيل الإنجاز الحالي دون إنشاء سجل تاريخي مختلق", () => {
    const d = data();
    d.tasks[0].status = "todo";
    d.tasks[0].completedAt = undefined;
    d.steps[1].status = "todo";
    d.projects[0].status = "active";
    d.projects[0].completedAt = undefined;
    expect(
        achievementRecords(
            d,
            [{ ...cycle, status: "current", completedAt: undefined }],
            undefined,
            now,
        ),
    ).toEqual([]);
});
it("الإنجازات الأقدم تبقى قابلة للعرض ولا تدخل فترة أخرى أو المستقبل", () => {
    const d = data();
    d.tasks[0].completedAt = "2026-09-01T09:00:00Z";
    const range = {
        start: Date.parse("2026-10-01T00:00:00Z"),
        end: now.getTime() + 1,
        cutoff: now.getTime(),
    };
    expect(achievementRecords(d, [cycle], range, now)).toHaveLength(3);
    expect(achievementRecords(d, [cycle], undefined, now)).toHaveLength(4);
    d.tasks[0].completedAt = "2026-10-15T09:00:00Z";
    expect(achievementRecords(d, [cycle], undefined, now)).toHaveLength(3);
});
it("الدورات المختلفة للمهمة نفسها تظل سجلات مستقلة ومعرفاتها ثابتة", () => {
    const rows = achievementRecords(
        data(),
        [cycle, { ...cycle, id: "older", completedAt: "2026-10-13T09:00:00Z" }],
        undefined,
        now,
    );
    expect(rows.filter((r) => r.kind === "cycle")).toHaveLength(2);
    expect(new Set(rows.map((r) => r.recordId)).size).toBe(5);
});
it("السجل دون بيانات لا ينشئ أحداثًا ولا يعدل المصدر", () => {
    const d = data(),
        before = JSON.stringify(d);
    achievementRecords(d, [cycle], undefined, now);
    expect(JSON.stringify(d)).toBe(before);
    expect(
        achievementRecords(
            { ...d, tasks: [], steps: [], projects: [] },
            [],
            undefined,
            now,
        ),
    ).toEqual([]);
});
