import { useMemo, useState, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import type { Snapshot } from "./model";
export function useAppData(page: string, id?: string): Snapshot {
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
    const ideas = useLiveQuery(() => db.ideas.toArray(), [], []);
    const events = useLiveQuery(
        async () => {
            if (id && ["project", "step", "task", "idea"].includes(page))
                return db.events.where("entityId").equals(id).sortBy("at");
            if (page === "home") {
                const all = await db.steps.toArray();
                const parents = new Set(all.map((s) => s.parentId));
                const eligible = new Set(
                    all
                        .filter(
                            (s) =>
                                s.kind === "step" &&
                                s.status !== "done" &&
                                !parents.has(s.id),
                        )
                        .map((s) => s.id),
                );
                if (!eligible.size) return [];
                const last = await db.events
                    .orderBy("at")
                    .reverse()
                    .filter(
                        (e) =>
                            e.action === "started" &&
                            e.entityKind === "step" &&
                            eligible.has(e.entityId),
                    )
                    .first();
                return last ? [last] : [];
            }
            return [];
        },
        [page, id],
        [],
    );
    const data = useMemo<Snapshot>(
        () => ({
            version: 1,
            exportedAt: "",
            projects,
            steps,
            tasks,
            ideas,
            events,
        }),
        [projects, steps, tasks, ideas, events],
    );
    if (openError) throw openError;
    return data;
}
