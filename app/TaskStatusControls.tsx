import { GlassChoices } from "./GlassChoices";
import type { TaskView } from "./taskSchedule";
import { useCompletion } from "./useCompletion";
import { statusNames, type Status } from "./model";
export function TaskStatusControls({
    task,
    onComplete,
}: {
    task: TaskView;
    onComplete: (task: TaskView, status: Status, at?: string) => Promise<void>;
}) {
    const completion = useCompletion(
        task._cycleId ? `taskCycle/${task._cycleId}` : `task/${task.id}`,
        task.status === "done",
        (checked, at, mode) =>
            onComplete(
                task,
                mode === "doing" ? "doing" : checked ? "done" : "todo",
                at,
            ),
    );
    return (
        <GlassChoices className="tabs" aria-label="حالة المهمة">
            {(["todo", "doing", "done"] as Status[]).map((status) => (
                <button
                    key={status}
                    disabled={task._available === false}
                    className={
                        (completion.checked
                            ? "done"
                            : task.status === "done"
                              ? "todo"
                              : task.status) === status
                            ? "selected"
                            : ""
                    }
                    onClick={() => completion.setStatus(status)}
                    aria-busy={completion.saving}
                >
                    {statusNames[status]}
                </button>
            ))}
        </GlassChoices>
    );
}
