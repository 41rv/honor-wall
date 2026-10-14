import { Temporal } from "@js-temporal/polyfill";
import type { Task } from "./model";
import {
    priorities,
    type TaskCycle,
    type TaskOptions,
    type TaskSchedule,
} from "./taskTypes";
export const localZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
export const localDay = (at = new Date(), zone = localZone()) =>
    Temporal.Instant.fromEpochMilliseconds(at.getTime())
        .toZonedDateTimeISO(zone)
        .toPlainDate();
const instant = (
    date: Temporal.PlainDate,
    schedule: TaskSchedule,
    midnight = false,
) =>
    date.toZonedDateTime({
        timeZone: schedule.timeZone,
        plainTime: midnight ? "00:00" : (schedule.time ?? "00:00"),
    }).epochMilliseconds;
const iso = (ms: number) => new Date(ms).toISOString();
export const recurring = (task: Task) =>
    !!task.schedule && task.schedule.repeat !== "none";
export const cycleId = (taskId: string, revision: number, start: string) =>
    JSON.stringify([taskId, revision, start]);
export function validateTaskOptions(options: TaskOptions): TaskOptions {
    if (
        options.priority !== undefined &&
        !Object.hasOwn(priorities, options.priority)
    )
        throw new Error("تصنيف الأولوية غير صالح.");
    const s = options.schedule;
    if (s === null) throw new Error("الموعد غير صالح.");
    if (!s) return { priority: options.priority };
    try {
        if (
            !/^\d{4}-\d\d-\d\d$/.test(s.date) ||
            Temporal.PlainDate.from(s.date).year < 1900 ||
            Temporal.PlainDate.from(s.date).year > 9999
        )
            throw new Error();
        if (s.time !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time))
            throw new Error();
        if (
            !["none", "daily", "weekly", "monthly"].includes(s.repeat) ||
            ![0, 1, 3, 7].includes(s.leadDays)
        )
            throw new Error();
        Temporal.Now.zonedDateTimeISO(s.timeZone);
        if (typeof s.timeZone !== "string" || !s.timeZone) throw new Error();
        if (
            s.repeat === "weekly" &&
            (!Array.isArray(s.weekdays) ||
                !s.weekdays.length ||
                new Set(s.weekdays).size !== s.weekdays.length ||
                s.weekdays.some((n) => !Number.isInteger(n) || n < 0 || n > 6))
        )
            throw new Error("اختر يومًا أسبوعيًا واحدًا على الأقل.");
        if (
            s.repeat === "monthly" &&
            (!Number.isInteger(s.monthDay) ||
                s.monthDay! < 1 ||
                s.monthDay! > 31)
        )
            throw new Error("اختر يوم الشهر من ١ إلى ٣١.");
    } catch (err) {
        if (err instanceof Error && /[\u0600-\u06ff]/.test(err.message))
            throw err;
        throw new Error("الموعد أو الوقت أو إعدادات التكرار غير صالحة.");
    }
    return {
        priority: options.priority,
        schedule: {
            date: s.date,
            time: s.time,
            repeat: s.repeat,
            timeZone: s.timeZone,
            leadDays: s.leadDays,
            ...(s.repeat === "weekly"
                ? { weekdays: [...s.weekdays!].sort() }
                : {}),
            ...(s.repeat === "monthly" ? { monthDay: s.monthDay } : {}),
        },
    };
}
function monthDate(date: Temporal.PlainDate, day: number) {
    const first = date.with({ day: 1 });
    return first.with({ day: Math.min(day, first.daysInMonth) });
}
function nextSlot(schedule: TaskSchedule, after: number): number {
    let date = localDay(new Date(after), schedule.timeZone);
    if (schedule.repeat === "monthly")
        return instant(
            monthDate(
                date.with({ day: 1 }).add({ months: 1 }),
                schedule.monthDay!,
            ),
            schedule,
        );
    do {
        date = date.add({ days: 1 });
    } while (
        schedule.repeat === "weekly" &&
        !schedule.weekdays!.includes(date.dayOfWeek % 7)
    );
    return instant(date, schedule, schedule.repeat === "daily");
}
export function firstCycleStart(task: Task): number {
    const s = task.schedule!;
    const since = Date.parse(task.scheduleSince ?? task.createdAt);
    let date = Temporal.PlainDate.from(s.date);
    const effective = localDay(new Date(since), s.timeZone);
    if (Temporal.PlainDate.compare(date, effective) < 0) date = effective;
    if (s.repeat === "daily") return Math.max(instant(date, s, true), since);
    if (s.repeat === "monthly") {
        let candidate = monthDate(date, s.monthDay!);
        if (Temporal.PlainDate.compare(candidate, date) < 0)
            candidate = monthDate(
                date.with({ day: 1 }).add({ months: 1 }),
                s.monthDay!,
            );
        return Math.max(instant(candidate, s), since);
    }
    while (!s.weekdays!.includes(date.dayOfWeek % 7))
        date = date.add({ days: 1 });
    return Math.max(instant(date, s), since);
}
export function makeCycle(task: Task, start: number, at: Date): TaskCycle {
    const s = task.schedule!;
    const end = nextSlot(s, start);
    const scheduledAt = instant(localDay(new Date(start), s.timeZone), s);
    return {
        id: cycleId(task.id, task.scheduleRevision ?? 1, iso(start)),
        taskId: task.id,
        revision: task.scheduleRevision ?? 1,
        start: iso(start),
        end: iso(end),
        scheduledAt: iso(scheduledAt),
        timeZone: s.timeZone,
        status: end <= at.getTime() ? "incomplete" : "current",
    };
}
export function currentCycle(
    task: Task,
    at = new Date(),
): TaskCycle | undefined {
    if (!recurring(task)) return;
    const first = firstCycleStart(task);
    if (at.getTime() < first) return;
    const s = task.schedule!;
    let date = localDay(at, s.timeZone);
    let start: number;
    if (s.repeat === "daily") start = instant(date, s, true);
    else if (s.repeat === "monthly") {
        let candidate = monthDate(date, s.monthDay!);
        if (instant(candidate, s) > at.getTime())
            candidate = monthDate(
                date.with({ day: 1 }).subtract({ months: 1 }),
                s.monthDay!,
            );
        start = instant(candidate, s);
    } else {
        while (
            !s.weekdays!.includes(date.dayOfWeek % 7) ||
            instant(date, s) > at.getTime()
        )
            date = date.subtract({ days: 1 });
        start = instant(date, s);
    }
    return makeCycle(task, Math.max(start, first), at);
}
export function cycleBatch(
    task: Task,
    at: Date,
    last: Pick<TaskCycle, "end"> | undefined,
    limit = 256,
): TaskCycle[] {
    let start = last ? Date.parse(last.end) : firstCycleStart(task);
    const rows: TaskCycle[] = [];
    while (start <= at.getTime() && rows.length < limit) {
        const cycle = makeCycle(task, start, at);
        rows.push(cycle);
        start = Date.parse(cycle.end);
    }
    return rows;
}
export interface TaskView extends Task {
    _cycle?: TaskCycle;
    _cycleId?: string;
    _available?: boolean;
    _next?: string;
    _dueState?: "general" | "future" | "near" | "today" | "overdue" | "cycle";
    _dueLabel?: string;
}
export function projectTask(
    task: Task,
    cycles: Map<string, TaskCycle>,
    at: Date,
): TaskView {
    if (recurring(task)) {
        const expected = currentCycle(task, at);
        const cycle = expected
            ? (cycles.get(expected.id) ?? expected)
            : undefined;
        const next = cycle
            ? makeCycle(task, Date.parse(cycle.end), at).scheduledAt
            : makeCycle(task, firstCycleStart(task), at).scheduledAt;
        return {
            ...task,
            status:
                cycle?.status === "completed"
                    ? "done"
                    : cycle?.workStatus === "doing"
                      ? "doing"
                      : "todo",
            completedAt: cycle?.completedAt,
            startedAt: cycle?.startedAt,
            _cycle: cycle,
            _cycleId: cycle?.id,
            _available: !!cycle,
            _next: next,
            _dueState: cycle ? "cycle" : "future",
            _dueLabel: `${repeatLabel(task.schedule!)}${cycle?.status === "completed" ? " · أُنجزت الدورة" : cycle ? " · الدورة الحالية" : " · لم تبدأ الدورة"}`,
        };
    }
    if (!task.schedule)
        return {
            ...task,
            _available: true,
            _dueState: "general",
            _dueLabel: "بدون موعد",
        };
    const s = task.schedule;
    const today = localDay(at, s.timeZone);
    const target = Temporal.PlainDate.from(s.date);
    const days = today.until(target).days;
    const deadline = s.time
        ? instant(target, s)
        : instant(target.add({ days: 1 }), s, true);
    const overdue =
        task.status !== "done" &&
        (s.time ? at.getTime() > deadline : at.getTime() >= deadline);
    const state = overdue
        ? "overdue"
        : days === 0
          ? "today"
          : days > 0 && days <= s.leadDays
            ? "near"
            : "future";
    const relative =
        days === 0
            ? "اليوم"
            : days === 1
              ? "غدًا"
              : days > 1
                ? `بعد ${days} أيام`
                : `منذ ${Math.abs(days)} أيام`;
    const time = s.time
        ? "، " +
          new Intl.DateTimeFormat("ar", {
              timeZone: s.timeZone,
              hour: "numeric",
              minute: "2-digit",
          }).format(new Date(instant(target, s)))
        : "";
    return {
        ...task,
        _available: true,
        _dueState: state,
        _dueLabel: `${relative}${time}${state === "near" ? " · اقترب الموعد" : state === "overdue" ? " · متأخرة" : ""}`,
    };
}
export const weekdays = [
    "الأحد",
    "الاثنين",
    "الثلاثاء",
    "الأربعاء",
    "الخميس",
    "الجمعة",
    "السبت",
];
export function repeatLabel(s: TaskSchedule) {
    const text =
        s.repeat === "daily"
            ? "يوميًا"
            : s.repeat === "weekly"
              ? "كل " + s.weekdays!.map((d) => weekdays[d]).join(" و")
              : `شهريًا، يوم ${s.monthDay}`;
    return text + (s.time ? "، " + s.time : "");
}
export function taskRank(task: TaskView) {
    return { overdue: 0, today: 1, near: 2, cycle: 3, general: 4, future: 5 }[
        task._dueState ?? "general"
    ];
}
