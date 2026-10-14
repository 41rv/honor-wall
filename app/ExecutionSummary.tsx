import { CompletionButton } from "./CompletionButton";
import type { Execution } from "./execution";
export function ExecutionSummary({
    execution,
    open,
    complete,
    stageLabel,
    omitCurrentId,
}: {
    execution: Execution;
    open: (id: string) => void;
    complete: (id: string, value: boolean) => Promise<void>;
    stageLabel?: string;
    omitCurrentId?: string;
}) {
    const { current, stage, lastCompleted, total } = execution;
    return (
        <div className="execution-summary">
            {current && current.id !== omitCurrentId ? (
                <div
                    className="execution-current"
                    data-execution-id={current.id}
                >
                    <div className="execution-copy">
                        <span className="small muted">
                            {current.status === "doing"
                                ? "تعمل عليها الآن"
                                : "خطوتك التالية"}
                        </span>
                        <strong className="execution-stage">
                            {stageLabel ?? stage?.title ?? "خطوات المشروع"}
                        </strong>
                        <button
                            className="title-link execution-title"
                            onClick={() => open(current.id)}
                        >
                            {current.title}
                        </button>
                    </div>
                    <CompletionButton
                        key={current.id}
                        entityKey={`step/${current.id}`}
                        checked={false}
                        label={`الخطوة «${current.title}»`}
                        onToggle={(value) => complete(current.id, value)}
                    />
                </div>
            ) : (
                <p className="execution-empty">
                    {current?.id === omitCurrentId
                        ? "تابع من اختصار الاستكمال أعلاه"
                        : total
                          ? "جميع الخطوات مكتملة ✓"
                          : "لم تُضف خطوات بعد"}
                </p>
            )}
            {lastCompleted && (
                <div
                    className="execution-recent"
                    data-completed-id={lastCompleted.id}
                >
                    <div>
                        <span className="small muted">
                            {lastCompleted.status === "done"
                                ? "آخر إنجاز"
                                : "الخطوة مفتوحة مجددًا"}
                        </span>
                        <button
                            className="title-link"
                            onClick={() => open(lastCompleted.id)}
                        >
                            {lastCompleted.title}
                        </button>
                    </div>
                    <CompletionButton
                        key={lastCompleted.id}
                        entityKey={`step/${lastCompleted.id}`}
                        checked={lastCompleted.status === "done"}
                        label={`الخطوة «${lastCompleted.title}»`}
                        onToggle={(value) => complete(lastCompleted.id, value)}
                    />
                </div>
            )}
        </div>
    );
}
