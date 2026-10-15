import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, ensurePacePlans } from "./db";
import { refreshRecommendations } from "./projectPaceStore";
import { useWallClock } from "./useWallClock";
import { userError } from "./userError";
import type { Project, Step, Task } from "./model";
export function usePaceData(
    page: string,
    id: string | undefined,
    projects: Project[],
    steps: Step[],
    tasks: Task[],
) {
    const clock = useWallClock();
    const [error, setError] = useState("");
    const enabled = ["home", "today", "project", "progress"].includes(page);
    const plans = useLiveQuery(() => db.projectPlans.toArray(), [], []);
    const settings = useLiveQuery(() => db.paceSettings.get("pace"));
    const work = useLiveQuery(
        () =>
            enabled
                ? (page === "project" && id
                      ? db.stepWork
                            .where("[projectId+at]")
                            .between(
                                [
                                    id,
                                    new Date(
                                        clock - 29 * 86400000,
                                    ).toISOString(),
                                ],
                                [id, "\uffff"],
                            )
                      : db.stepWork
                            .where("at")
                            .above(
                                new Date(clock - 29 * 86400000).toISOString(),
                            )
                  ).toArray()
                : [],
        [enabled, page, id, clock],
        [],
    );
    const recommendations = useLiveQuery(
        async () => {
            if (!enabled) return [];
            const [fresh, history] = await Promise.all([
                db.recommendations.where("status").equals("new").toArray(),
                db.recommendations
                    .orderBy("createdAt")
                    .reverse()
                    .limit(100)
                    .toArray(),
            ]);
            return [
                ...new Map(
                    [...fresh, ...history].map((r) => [r.id, r]),
                ).values(),
            ];
        },
        [enabled],
        [],
    );
    useEffect(() => {
        void ensurePacePlans().catch((e) => setError(userError(e)));
    }, []);
    useEffect(() => {
        if (!enabled) return;
        let alive = true;
        void refreshRecommendations(new Date(Math.max(clock, Date.now())))
            .then(() => {
                if (alive) setError("");
            })
            .catch((e) => {
                if (alive) setError(userError(e));
            });
        return () => {
            alive = false;
        };
    }, [enabled, clock, projects, steps, tasks, plans]);
    return { plans, work, recommendations, settings, error, clock };
}
