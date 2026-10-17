import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { addHabitDays } from "./habitCalendar";

/** Only a bounded date range of entries is observed; no history scan on home. */
export function useHabitData(from: string, to: string) {
    const today = new Date().toISOString().slice(0, 10);
    return useLiveQuery(async () => {
        try {
            return await db.transaction(
                "r",
                [db.habits, db.habitPaths, db.habitPlans, db.habitEntries],
                async () => ({
                    habits: await db.habits.toArray(),
                    paths: await db.habitPaths.toArray(),
                    plans: await db.habitPlans.toArray(),
                    entries: [
                        ...new Map(
                            (
                                await Promise.all([
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
                                ])
                            )
                                .flat()
                                .map((e) => [e.id, e]),
                        ).values(),
                    ],
                    error: "",
                }),
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
