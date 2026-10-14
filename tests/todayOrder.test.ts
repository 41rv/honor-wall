import { it, expect } from "vitest";
import { orderedToday, sortTodayTasks } from "../app/dailyPlanning";
import type { TaskView } from "../app/taskSchedule";
const date = "2026-10-14T09:00:00Z";
const task = (
    id: string,
    priority?: TaskView["priority"],
    time?: string,
): TaskView => ({
    id,
    title: id,
    notes: "محفوظة",
    createdAt: date,
    updatedAt: date,
    status: "todo",
    priority,
    today: { date: "2026-10-14", timeZone: "Asia/Riyadh" },
    ...(time
        ? {
              schedule: {
                  date: "2026-10-14",
                  time,
                  repeat: "none",
                  leadDays: 0,
                  timeZone: "Asia/Riyadh",
              },
          }
        : {}),
});
it("ترتيب أيزنهاور الخماسي لا يحول غير المصنفة إلى منخفضة", () => {
    const rows = [
        task("none"),
        task("low", "low"),
        task("urgent", "urgent"),
        task("important", "important"),
        task("both", "important-urgent"),
    ];
    const original = JSON.stringify(rows);
    expect(sortTodayTasks(rows).map((t) => t.id)).toEqual([
        "both",
        "important",
        "urgent",
        "low",
        "none",
    ]);
    expect(JSON.stringify(rows)).toBe(original);
    expect(rows[0].priority).toBeUndefined();
});
it("الموعد الأقرب يسبق المتأخر والعامة ضمن الأولوية نفسها", () => {
    expect(
        sortTodayTasks([
            task("general", "important"),
            task("later", "important", "18:00"),
            task("earlier", "important", "15:00"),
        ]).map((t) => t.id),
    ).toEqual(["earlier", "later", "general"]);
});
it("التساوي الكامل ثابت بالإنشاء والمعرف حتى بعد الإتمام أو تحديث الملاحظات", () => {
    const rows = [task("b"), task("a")];
    rows[0].updatedAt = "2026-10-15T09:00:00Z";
    const first = sortTodayTasks(rows).map((t) => t.id);
    rows[1].status = "done";
    expect(sortTodayTasks(rows.reverse()).map((t) => t.id)).toEqual(first);
    expect(first).toEqual(["a", "b"]);
});
it("المختصر والكاملة يستخدمان القائمة الأصلية والترتيب نفسه عبر الفئات بلا نسخ", () => {
    const rows = [
        task("selected", "important"),
        task("due", "low", "14:00"),
        task("late", "important-urgent", "08:00"),
        task("last"),
    ];
    const ordered = orderedToday(
        [...rows, rows[0]],
        new Date(date),
        "Asia/Riyadh",
    );
    expect(ordered.map((r) => r.task.id)).toEqual([
        "late",
        "selected",
        "due",
        "last",
    ]);
    expect(ordered.map((r) => r.category)).toEqual([
        "overdue",
        "selected",
        "due",
        "selected",
    ]);
    expect(ordered.slice(0, 3).map((r) => r.task)).toEqual(
        ordered.map((r) => r.task).slice(0, 3),
    );
});
