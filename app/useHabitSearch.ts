import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
export function useHabitSearch(query: string) {
    const term = query.trim().toLocaleLowerCase();
    return useLiveQuery(
        async () => {
            if (!term) return [];
            const has = (title: string) =>
                title.toLocaleLowerCase().includes(term);
            const [habits, paths, reminders] = await Promise.all([
                db.habits
                    .filter((h) => has(h.title))
                    .limit(20)
                    .toArray(),
                db.habitPaths
                    .filter((p) => !p.deletedAt && has(p.title))
                    .limit(20)
                    .toArray(),
                db.reminders
                    .filter((r) => has(r.title))
                    .limit(20)
                    .toArray(),
            ]);
            return [
                ...habits.map((h) => ({
                    id: "habit/" + h.id,
                    title: h.title,
                    type: h.archived ? "عادة مؤرشفة" : "عادة",
                    route: "habit/" + encodeURIComponent(h.id),
                })),
                ...paths.map((p) => ({
                    id: "path/" + p.id,
                    title: p.title,
                    type: "مسار عادات",
                    route: "habit-path/" + encodeURIComponent(p.id),
                })),
                ...reminders.map((r) => ({
                    id: "reminder/" + r.id,
                    title: r.title,
                    type: "تذكير",
                    route: "ideas/reminders",
                })),
            ].slice(0, 20);
        },
        [term],
        [],
    );
}
