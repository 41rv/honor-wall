import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
interface PlatformCloseWatcher extends EventTarget {
    destroy(): void;
}
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
    const closeRef = useRef(onClose);
    closeRef.current = onClose;
    // showModal() propagates native inertness through every rendered node.
    // On large documents Chromium spends seconds restyling that background.
    // Keep the native path for ordinary documents and older platforms; a
    // CloseWatcher-backed modal layer avoids that propagation on large ones.
    const NativeCloseWatcher = (
        window as Window & { CloseWatcher?: new () => PlatformCloseWatcher }
    ).CloseWatcher;
    const [layered] = useState(
        () =>
            !!NativeCloseWatcher &&
            document.getElementsByTagName("*").length > 3000,
    );
    const ignoreReleaseClick = useRef(suppressInitialClick);
    useEffect(() => {
        const dialog = ref.current!;
        const opener = document.activeElement as HTMLElement | null;
        const root = document.getElementById("root");
        const oldHidden = root?.getAttribute("aria-hidden"),
            oldOverflow = document.body.style.overflow;
        let watcher: PlatformCloseWatcher | undefined;
        const focusInside = () =>
            (
                dialog.querySelector<HTMLElement>("[data-dialog-autofocus]") ??
                dialog.querySelector<HTMLElement>(
                    "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])",
                ) ??
                dialog
            ).focus({ preventScroll: true });
        const keepFocus = (event: FocusEvent) => {
            if (event.target instanceof Node && !dialog.contains(event.target))
                focusInside();
        };
        const escape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                closeRef.current();
            }
        };
        if (layered) {
            dialog.show();
            focusInside();
            root?.setAttribute("aria-hidden", "true");
            document.body.style.overflow = "hidden";
            document.addEventListener("focusin", keepFocus);
            document.addEventListener("keydown", escape, true);
            watcher = new NativeCloseWatcher!();
            watcher.addEventListener("close", () => closeRef.current());
        } else {
            dialog.showModal();
            dialog
                .querySelector<HTMLElement>("[data-dialog-autofocus]")
                ?.focus();
        }
        return () => {
            watcher?.destroy();
            document.removeEventListener("focusin", keepFocus);
            document.removeEventListener("keydown", escape, true);
            dialog.close();
            if (layered) {
                if (root) {
                    if (oldHidden === null || oldHidden === undefined)
                        root.removeAttribute("aria-hidden");
                    else root.setAttribute("aria-hidden", oldHidden);
                }
                document.body.style.overflow = oldOverflow;
            }
            if (opener?.isConnected) opener.focus({ preventScroll: true });
        };
    }, []);
    const content = (
        <dialog
            aria-modal="true"
            tabIndex={-1}
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
    return layered
        ? createPortal(
              <div
                  className="dialog-overlay"
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
                  onClick={(event) => {
                      if (event.target === event.currentTarget) onClose();
                  }}
              >
                  {content}
              </div>,
              document.body,
          )
        : content;
}
