import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { addHabitDays } from "./habitCalendar";
import { assessedHabitEntries } from "./habitAssessments";

/** One bounded entry window; canonical assessments use primary-key lookups. */
export function useHabitData(from: string, to: string) {
    const today = new Date().toISOString().slice(0, 10);
    return useLiveQuery(async () => {
        try {
            return await db.transaction(
                "r",
                [
                    db.habits,
                    db.habitPaths,
                    db.habitPlans,
                    db.habitEntries,
                    db.habitAssessments,
                ],
                async () => {
                    const [habits, paths, plans, ranges] = await Promise.all([
                        db.habits.toArray(),
                        db.habitPaths.toArray(),
                        db.habitPlans.toArray(),
                        Promise.all([
                            db.habitEntries
                                .where("localDate")
                                .between(
                                    addHabitDays(from, -2),
                                    addHabitDays(to, 2),
                                    true,
                                    true,
                                )
                                .toArray(),
                            ...(today < from || today > to
                                ? [
                                      db.habitEntries
                                          .where("localDate")
                                          .between(
                                              addHabitDays(today, -2),
                                              addHabitDays(today, 2),
                                              true,
                                              true,
                                          )
                                          .toArray(),
                                  ]
                                : []),
                        ]),
                    ]);
                    const entries = [
                        ...new Map(
                            ranges.flat().map((e) => [e.id, e]),
                        ).values(),
                    ];
                    return {
                        habits,
                        paths,
                        plans,
                        entries: await assessedHabitEntries(db, entries),
                        error: "",
                    };
                },
            );
        } catch {
            return {
                habits: [],
                paths: [],
                plans: [],
                entries: [],
                error: "تعذر قراءة العادات من التخزين المحلي. أعد المحاولة دون مسح بيانات الموقع.",
            };
        }
    }, [from, to, today]);
}
