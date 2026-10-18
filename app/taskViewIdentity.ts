import type { TaskView } from "./taskSchedule";
export interface TaskViewCache {
    clock: number;
    rows: TaskView[];
}
/** Presentation cache only: every projection is still calculated normally.
 * IndexedDB returns new objects for every row, which would otherwise defeat
 * memoized cards after a single task changes. Never reuse across clock ticks. */
export function retainTaskViewIdentity(
    previous: TaskViewCache | undefined,
    rows: TaskView[],
    clock: number,
): TaskViewCache {
    if (!previous || previous.clock !== clock) return { clock, rows };
    const byId = new Map(previous.rows.map((row) => [row.id, row]));
    const shared = rows.map((row) => {
        const old = byId.get(row.id);
        if (!old) return row;
        const a = old as unknown as Record<string, unknown>,
            b = row as unknown as Record<string, unknown>;
        const keys = Object.keys(a);
        const equal =
            keys.length === Object.keys(b).length &&
            keys.every((key) => {
                if (!Object.hasOwn(b, key)) return false;
                const x = a[key],
                    y = b[key];
                return (
                    Object.is(x, y) ||
                    (x !== null &&
                        y !== null &&
                        typeof x === "object" &&
                        typeof y === "object" &&
                        JSON.stringify(x) === JSON.stringify(y))
                );
            });
        return equal ? old : row;
    });
    return {
        clock,
        rows:
            shared.length === previous.rows.length &&
            shared.every((row, i) => row === previous.rows[i])
                ? previous.rows
                : shared,
    };
}
