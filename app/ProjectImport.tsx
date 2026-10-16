import { CapacityOptions } from "./ProjectCapacity";
import { ActiveProjectLimitError } from "./db";
import { useEffect, useMemo, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Dialog } from "./Dialog";
import { importProject } from "./db";
import {
    parseProjectImport,
    importNodes,
    PROJECT_IMPORT_MAX_BYTES,
    type ProjectImportFile,
} from "./projectImport";
import { userError } from "./userError";

export function ProjectImport({
    onImported,
}: {
    onImported: (id: string) => void;
}) {
    const [file, setFile] = useState<ProjectImportFile | null>(null);
    const [capacity, setCapacity] = useState<ActiveProjectLimitError | null>(
        null,
    );
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [open, setOpen] = useState(false);
    const input = useRef<HTMLInputElement>(null);
    const chooserActive = useRef(false);
    const lock = useRef(false);
    const { nodes, leaves } = useMemo(() => {
        const nodes = file ? importNodes(file) : [];
        const parents = new Set(nodes.map((node) => node.parent));
        return {
            nodes,
            leaves: nodes.filter(
                (node, i) => node.kind === "step" && !parents.has(i),
            ).length,
        };
    }, [file]);
    useEffect(() => {
        const fileInput = input.current!;
        const cancelled = () => {
            chooserActive.current = false;
        };
        // Older pickers may signal return through focus/visibility rather than cancel.
        const returned = () => {
            if (document.visibilityState === "visible")
                chooserActive.current = false;
        };
        window.addEventListener("focus", returned);
        document.addEventListener("visibilitychange", returned);
        fileInput.addEventListener("cancel", cancelled);
        return () => {
            window.removeEventListener("focus", returned);
            document.removeEventListener("visibilitychange", returned);
            fileInput.removeEventListener("cancel", cancelled);
        };
    }, []);
    const close = () => {
        if (!lock.current) {
            setCapacity(null);
            setOpen(false);
            setFile(null);
            setError("");
            chooserActive.current = false;
        }
    };
    return (
        <div className="project-import">
            <button
                className="btn secondary"
                disabled={busy}
                onClick={() => {
                    if (open || lock.current) return;
                    setError("");
                    setOpen(true);
                }}
            >
                <Upload size={18} /> استيراد مشروع
            </button>
            <input
                ref={input}
                hidden
                aria-label="استيراد مشروع"
                type="file"
                accept=".json,application/json"
                disabled={busy}
                onChange={async (e) => {
                    const upload = e.currentTarget.files?.[0];
                    e.currentTarget.value = "";
                    chooserActive.current = false;
                    if (!upload || lock.current) return;
                    lock.current = true;
                    setBusy(true);
                    setError("");
                    try {
                        if (upload.size > PROJECT_IMPORT_MAX_BYTES)
                            throw new Error("ملف المشروع أكبر من ٥ ميجابايت.");
                        setFile(parseProjectImport(await upload.text()));
                        setOpen(true);
                    } catch (err) {
                        setError(
                            userError(
                                err,
                                "تعذر قراءة الملف. أعد اختيار ملف JSON.",
                            ),
                        );
                    } finally {
                        lock.current = false;
                        setBusy(false);
                    }
                }}
            />
            <p className="muted">
                ملف JSON يضيف مشروعًا جديدًا. راجع محتواه قبل الحفظ.
            </p>
            {!open && error && (
                <p role="alert" className="warning">
                    {error}
                </p>
            )}
            {open && (
                <Dialog
                    key={file ? "preview" : "choose"}
                    canClose={() => !lock.current}
                    title={file ? "معاينة استيراد المشروع" : "استيراد مشروع"}
                    onClose={close}
                >
                    {!file ? (
                        <>
                            <p className="dialog-text">
                                اختر ملف JSON من جهازك لإضافة مشروع جديد بمراحله
                                وخطواته. ستراجع المعاينة قبل تأكيد الحفظ.
                            </p>
                            <p className="muted">
                                الحد الأقصى ٥ ميجابايت. تبقى مشاريعك الحالية
                                محفوظة.
                            </p>
                            {error && (
                                <p role="alert" className="warning">
                                    {error}
                                </p>
                            )}
                            {capacity && (
                                <CapacityOptions
                                    error={capacity}
                                    onResolved={() => {
                                        setCapacity(null);
                                        setError(
                                            "تم تحديث الاختيار؛ أعد تأكيد الاستيراد.",
                                        );
                                    }}
                                    onCancel={close}
                                />
                            )}
                            <div className="dialog-buttons" aria-busy={busy}>
                                <button
                                    className="btn secondary"
                                    disabled={busy}
                                    onClick={close}
                                >
                                    إلغاء
                                </button>
                                <button
                                    className="btn primary"
                                    data-dialog-autofocus
                                    disabled={busy}
                                    onClick={() => {
                                        if (
                                            chooserActive.current ||
                                            lock.current
                                        )
                                            return;
                                        chooserActive.current = true;
                                        try {
                                            input.current?.click();
                                        } catch (err) {
                                            chooserActive.current = false;
                                            setError(
                                                userError(
                                                    err,
                                                    "تعذر فتح منتقي الملفات. أعد المحاولة.",
                                                ),
                                            );
                                        }
                                    }}
                                >
                                    <Upload size={18} />
                                    اختيار ملف JSON
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <h3 className="import-title">
                                {file.project.title}
                            </h3>
                            {file.project.description && (
                                <p className="import-description">
                                    {file.project.description}
                                </p>
                            )}
                            <p>
                                {file.project.stages.length} مراحل ·{" "}
                                {nodes.length - file.project.stages.length}{" "}
                                خطوات إجمالًا · {leaves} خطوات نهائية لحساب
                                التقدم
                            </p>
                            <p>
                                سيُنشأ مشروع جديد، وتبقى مشاريعك الحالية محفوظة.
                                تبدأ جميع الخطوات دون إتمام.
                            </p>
                            <ol
                                className="import-preview"
                                aria-label="ترتيب مراحل وخطوات المشروع"
                            >
                                {nodes.slice(0, 100).map((node) => (
                                    <li
                                        key={node.number}
                                        className={
                                            node.kind === "stage"
                                                ? "import-stage"
                                                : ""
                                        }
                                    >
                                        <span dir="ltr">{node.number}</span>{" "}
                                        <span>{node.title}</span>
                                        {node.notes && <p>{node.notes}</p>}
                                    </li>
                                ))}
                            </ol>
                            {nodes.length > 100 && (
                                <p>
                                    تعرض المعاينة أول ١٠٠ عنصر؛ سيُحفظ جميع
                                    العناصر وعددها {nodes.length}.
                                </p>
                            )}
                            {error && (
                                <p role="alert" className="warning">
                                    {error}
                                </p>
                            )}
                            {capacity && (
                                <CapacityOptions
                                    error={capacity}
                                    onResolved={() => {
                                        setCapacity(null);
                                        setError(
                                            "تم تحديث الاختيار؛ أعد تأكيد الاستيراد.",
                                        );
                                    }}
                                    onCancel={close}
                                />
                            )}
                            <div className="dialog-buttons" aria-busy={busy}>
                                <button
                                    className="btn secondary"
                                    disabled={busy}
                                    onClick={close}
                                >
                                    إلغاء
                                </button>
                                <button
                                    className="btn primary"
                                    disabled={busy}
                                    onClick={async () => {
                                        if (lock.current) return;
                                        lock.current = true;
                                        setBusy(true);
                                        setError("");
                                        try {
                                            const id =
                                                await importProject(file);
                                            setOpen(false);
                                            setFile(null);
                                            onImported(id);
                                        } catch (err) {
                                            if (
                                                err instanceof
                                                ActiveProjectLimitError
                                            )
                                                setCapacity(err);
                                            setError(userError(err));
                                        } finally {
                                            lock.current = false;
                                            setBusy(false);
                                        }
                                    }}
                                >
                                    {busy
                                        ? "جارٍ استيراد المشروع…"
                                        : "تأكيد استيراد المشروع"}
                                </button>
                            </div>
                        </>
                    )}
                </Dialog>
            )}
        </div>
    );
}
