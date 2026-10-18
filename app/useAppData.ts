import { useMemo, useState, useEffect, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, reconcileTaskCycles } from "./db";
import { currentCycle, projectTask } from "./taskSchedule";
import { retainTaskViewIdentity, type TaskViewCache } from "./taskViewIdentity";
import { useWallClock } from "./useWallClock";
import type { Snapshot } from "./model";
export function useAppData(
    page: string,
    id?: string,
): Snapshot & { taskHistoryError?: string } {
    const clock = useWallClock();
    const [taskHistoryError, setTaskHistoryError] = useState("");
    const [openError, setOpenError] = useState<Error | null>(null);
    useEffect(() => {
        let active = true;
        void db.open().catch(() => {
            if (active)
                setOpenError(
                    new Error(
                        "تعذر فتح التخزين المحلي. أعد المحاولة دون مسح بيانات الموقع.",
                    ),
                );
        });
        return () => {
            active = false;
        };
    }, []);
    const projects = useLiveQuery(() => db.projects.toArray(), [], []);
    const steps = useLiveQuery(() => db.steps.toArray(), [], []);
    const tasks = useLiveQuery(() => db.tasks.toArray(), [], []);
    const includeRecent = page === "home" || page === "progress";
    const currentCycles = useLiveQuery(
        async () => {
            const at = new Date(Math.max(clock, Date.now()));
            const keys = tasks.flatMap(
                (task) => currentCycle(task, at)?.id ?? [],
            );
            const current = (await db.taskCycles.bulkGet(keys)).filter(
                (c) => !!c,
            );
            return current;
        },
        [tasks, clock],
        [],
    );
    const recentCycles = useLiveQuery(
        async () =>
            includeRecent
                ? await db.taskCycles
                      .where("completedAt")
                      .above(new Date(clock - 7 * 86400000).toISOString())
                      .toArray()
                : [],
        [clock, includeRecent],
        [],
    );
    const cycles = useMemo(
        () => [
            ...new Map(
                [...recentCycles, ...currentCycles].map((c) => [c.id, c]),
            ).values(),
        ],
        [recentCycles, currentCycles],
    );
    useEffect(() => {
        void reconcileTaskCycles(new Date(clock))
            .then(() => setTaskHistoryError(""))
            .catch(() => {
                setTaskHistoryError(
                    "تعذر تحديث سجل دورات المهام. أعد فتح التطبيق للمحاولة مجددًا؛ لم تُحذف البيانات السابقة.",
                );
            });
    }, [
        clock,
        tasks
            .filter((task) => task.schedule && task.schedule.repeat !== "none")
            .map((task) => `${task.id}:${task.scheduleRevision}`)
            .join("|"),
    ]);
    const previousViews = useRef<TaskViewCache | undefined>(undefined);
    const views = useMemo(() => {
        const byId = new Map(currentCycles.map((c) => [c.id, c]));
        const at = new Date(Math.max(clock, Date.now()));
        const next = tasks.map((task) => projectTask(task, byId, at));
        previousViews.current = retainTaskViewIdentity(
            previousViews.current,
            next,
            clock,
        );
        return previousViews.current.rows;
    }, [tasks, currentCycles, clock]);
    const ideas = useLiveQuery(() => db.ideas.toArray(), [], []);
    const eventScope =
        id && ["project", "step", "task", "idea"].includes(page)
            ? id
            : undefined;
    const events = useLiveQuery(
        async () => {
            if (eventScope)
                return db.events
                    .where("entityId")
                    .equals(eventScope)
                    .sortBy("at");
            return [];
        },
        [eventScope],
        [],
    );
    const data = useMemo<Snapshot>(
        () => ({
            version: 2,
            exportedAt: "",
            projects,
            steps,
            tasks: views,
            taskCycles: cycles,
            ideas,
            events,
        }),
        [projects, steps, views, cycles, ideas, events],
    );
    if (openError) throw openError;
    return { ...data, taskHistoryError };
}
