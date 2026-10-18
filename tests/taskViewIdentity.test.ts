import { it, expect } from "vitest";
import { retainTaskViewIdentity } from "../app/taskViewIdentity";
import { projectTask, currentCycle, type TaskView } from "../app/taskSchedule";
import type { Task } from "../app/model";
const at = new Date("2026-10-21T10:00:00Z");
const task: Task = {
    id: "t",
    title: "مهمة",
    notes: "نص",
    status: "todo",
    createdAt: at.toISOString(),
    updatedAt: at.toISOString(),
};
const views = () => [
    projectTask(task, new Map(), at),
    projectTask({ ...task, id: "other" }, new Map(), at),
];
it("unchanged IndexedDB clones retain task card identity without mutating either input", () => {
    const rows = views(),
        clones = structuredClone(rows),
        before = JSON.stringify(clones);
    const result = retainTaskViewIdentity({ clock: 1, rows }, clones, 1);
    expect(result.rows).toBe(rows);
    expect(JSON.stringify(clones)).toBe(before);
});
it("editing one task keeps every changed value and avoids rerendering unrelated cards", () => {
    const rows = views(),
        next = structuredClone(rows);
    next[0] = {
        ...next[0],
        title: "تعديل",
        notes: "ملاحظة جديدة",
        priority: "important-urgent",
        status: "done",
        completedAt: at.toISOString(),
    };
    const result = retainTaskViewIdentity({ clock: 1, rows }, next, 1);
    expect(result.rows[0]).toBe(next[0]);
    expect(result.rows[0]).toEqual(next[0]);
    expect(result.rows[1]).toBe(rows[1]);
});
it("clock/focus tick always refreshes time-sensitive cards even if projection fields compare equal", () => {
    const rows = views(),
        next = structuredClone(rows);
    expect(retainTaskViewIdentity({ clock: 1, rows }, next, 2).rows).toBe(next);
});
it("repeating cycle completion, undo and next-day boundaries never reuse stale displayed status or cycle", () => {
    const scheduled: Task = {
        ...task,
        schedule: {
            date: "2026-10-21",
            timeZone: "Asia/Riyadh",
            repeat: "daily",
            leadDays: 1,
        },
        scheduleRevision: 1,
    };
    const cycle = currentCycle(scheduled, at)!,
        old = projectTask(scheduled, new Map([[cycle.id, cycle]]), at);
    const done = projectTask(
        scheduled,
        new Map([
            [
                cycle.id,
                {
                    ...cycle,
                    status: "completed",
                    completedAt: at.toISOString(),
                },
            ],
        ]),
        at,
    );
    const completed = retainTaskViewIdentity(
        { clock: 1, rows: [old] },
        [done],
        1,
    );
    expect(completed.rows[0].status).toBe("done");
    const undone = retainTaskViewIdentity(completed, [old], 1);
    expect(undone.rows[0].status).toBe("todo");
    const next = projectTask(
        scheduled,
        new Map(),
        new Date("2026-10-22T10:00:00Z"),
    );
    expect(retainTaskViewIdentity(undone, [next], 2).rows[0]._cycleId).not.toBe(
        old._cycleId,
    );
});
it("nested schedule changes and due labels remain visible without changing scheduling rules", () => {
    const rows = views();
    const next: TaskView = {
        ...rows[0],
        schedule: {
            date: "2026-10-22",
            timeZone: "Asia/Riyadh",
            repeat: "none",
            time: "08:00",
            leadDays: 3,
        },
        _dueState: "near",
        _dueLabel: "غدًا",
    };
    expect(
        retainTaskViewIdentity({ clock: 1, rows }, [next, rows[1]], 1).rows[0],
    ).toBe(next);
});
it("deletion and sorting preserve order and never retain removed tasks", () => {
    const rows = views();
    const reordered = retainTaskViewIdentity(
        { clock: 1, rows },
        structuredClone([...rows].reverse()),
        1,
    );
    expect(reordered.rows.map((r) => r.id)).toEqual(["other", "t"]);
    expect(reordered.rows[0]).toBe(rows[1]);
    expect(
        retainTaskViewIdentity(reordered, [rows[1]], 1).rows.map((r) => r.id),
    ).toEqual(["other"]);
    expect(retainTaskViewIdentity(reordered, [], 1).rows).toEqual([]);
});
