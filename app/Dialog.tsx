import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
export function Dialog({
    title,
    children,
    onClose,
    className,
    position,
    suppressInitialClick = false,
}: {
    title: string;
    children: ReactNode;
    onClose: () => void;
    className?: string;
    position?: { top: number; left: number };
    suppressInitialClick?: boolean;
}) {
    const ref = useRef<HTMLDialogElement>(null);
    const ignoreReleaseClick = useRef(suppressInitialClick);
    useEffect(() => {
        const dialog = ref.current!;
        const opener = document.activeElement as HTMLElement | null;
        dialog.showModal();
        dialog.querySelector<HTMLElement>("[data-dialog-autofocus]")?.focus();
        return () => {
            dialog.close();
            if (opener?.isConnected) opener.focus({ preventScroll: true });
        };
    }, []);
    return (
        <dialog
            ref={ref}
            onPointerDownCapture={() => {
                ignoreReleaseClick.current = false;
            }}
            onClickCapture={(event) => {
                if (ignoreReleaseClick.current && event.detail > 0) {
                    event.preventDefault();
                    event.stopPropagation();
                }
                ignoreReleaseClick.current = false;
            }}
            className={className}
            style={
                position
                    ? { top: position.top, left: position.left }
                    : undefined
            }
            onCancel={(e) => {
                e.preventDefault();
                onClose();
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
            aria-label={title}
            onKeyDown={(e) => {
                if (e.key !== "Tab") return;
                const fields = [
                    ...e.currentTarget.querySelectorAll<HTMLElement>(
                        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
                    ),
                ].filter((field) => field.getClientRects().length > 0);
                const first = fields[0],
                    last = fields.at(-1);
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last?.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first?.focus();
                }
            }}
        >
            <div className="dialog-head">
                <h2>{title}</h2>
                <button
                    className="icon-btn"
                    aria-label="إغلاق"
                    onClick={onClose}
                >
                    <X size={20} />
                </button>
            </div>
            {children}
        </dialog>
    );
}
