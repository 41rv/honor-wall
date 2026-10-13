import { MoreHorizontal } from "lucide-react";
import type { Base, EntityKind } from "./model";
export type OpenActions = (
    kind: EntityKind,
    item: Base,
    rect?: DOMRect,
    fromHold?: boolean,
) => void;
const names = {
    project: "المشروع",
    step: "الخطوة أو المرحلة",
    task: "المهمة",
    idea: "الفكرة",
};
export function ActionButton({
    kind,
    item,
    open,
}: {
    kind: EntityKind;
    item: Base;
    open: OpenActions;
}) {
    return (
        <button
            type="button"
            className="icon-btn item-actions"
            aria-label={`إجراءات ${names[kind]} «${item.title}»`}
            aria-haspopup="dialog"
            onClick={(event) =>
                open(kind, item, event.currentTarget.getBoundingClientRect())
            }
        >
            <MoreHorizontal size={20} />
        </button>
    );
}
