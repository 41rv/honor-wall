import { memo } from "react";
import { useCompletion } from "./useCompletion";
import { Check, RotateCcw } from "lucide-react";
export const CompletionButton = memo(function CompletionButton({
    checked,
    entityKey,
    label,
    onToggle,
    text = false,
}: {
    checked: boolean;
    entityKey: string;
    label: string;
    onToggle: (complete: boolean) => Promise<void>;
    text?: boolean;
}) {
    const completion = useCompletion(entityKey, checked, onToggle);
    const value = completion.checked;
    return (
        <button
            type="button"
            data-completion-key={entityKey}
            className={
                text
                    ? "btn " + (value ? "secondary" : "primary")
                    : "task-check " + (value ? "checked" : "")
            }
            aria-label={`${value ? "إعادة فتح" : "إتمام"} ${label}`}
            title={`${value ? "إعادة فتح" : "إتمام"} ${label}`}
            aria-pressed={value}
            aria-busy={completion.saving}
            onClick={completion.toggle}
        >
            {text ? (
                value ? (
                    <RotateCcw size={16} />
                ) : (
                    <Check size={17} />
                )
            ) : value ? (
                <Check size={18} />
            ) : null}
            {text && `${value ? "إعادة فتح" : "إتمام"} ${label}`}
        </button>
    );
});
