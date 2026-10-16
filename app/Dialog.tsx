import { createPortal } from "react-dom";
import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";
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
    canClose,
}: {
    title: string;
    children: ReactNode;
    onClose: () => void;
    className?: string;
    position?: { top: number; left: number };
    suppressInitialClick?: boolean;
    canClose?: () => boolean;
}) {
    const ref = useRef<HTMLDialogElement>(null);
    const closeRef = useRef(onClose);
    closeRef.current = onClose;
    const canCloseRef = useRef(canClose);
    canCloseRef.current = canClose;
    const exit = useRef<(() => void) | null>(null);
    const requestClose = useCallback(() => {
        const dialog = ref.current;
        if (!dialog || exit.current || canCloseRef.current?.() === false)
            return;
        const preference = matchMedia("(prefers-reduced-motion: reduce)");
        if (preference.matches || !dialog.animate) {
            closeRef.current();
            return;
        }
        const menu = dialog.matches(".context-sheet, .add-menu");
        const computed = getComputedStyle(dialog);
        const from = {
            opacity: computed.opacity,
            transform: computed.transform,
        };
        dialog.dataset.motion = "closing";
        dialog.style.animation = "none";
        const animation = dialog.animate(
            [
                from,
                {
                    opacity: 0,
                    transform: menu
                        ? "scale(.97)"
                        : "translateY(6px) scale(.985)",
                },
            ],
            {
                duration: 180,
                easing: "cubic-bezier(.4,0,1,1)",
                fill: "forwards",
            },
        );
        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            preference.removeEventListener("change", finish);
            // A save may have started during the exit. Keep the original
            // close guard authoritative and leave a usable, visible dialog.
            if (canCloseRef.current?.() === false) {
                animation.cancel();
                dialog.dataset.motion = "idle";
                exit.current = null;
                return;
            }
            closeRef.current();
        };
        animation.addEventListener("finish", finish, { once: true });
        preference.addEventListener("change", finish, { once: true });
        exit.current = () => {
            finished = true;
            preference.removeEventListener("change", finish);
            animation.cancel();
        };
    }, []);
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
                requestClose();
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
            watcher.addEventListener("close", requestClose);
        } else {
            dialog.showModal();
            dialog
                .querySelector<HTMLElement>("[data-dialog-autofocus]")
                ?.focus();
        }
        return () => {
            exit.current?.();
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
                requestClose();
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget) requestClose();
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
                    onClick={requestClose}
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
                      if (event.target === event.currentTarget) requestClose();
                  }}
              >
                  {content}
              </div>,
              document.body,
          )
        : content;
}
