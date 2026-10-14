import { useRef, useState } from "react";
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
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const lock = useRef(false);
    const nodes = file ? importNodes(file) : [];
    const parents = new Set(nodes.map((node) => node.parent));
    const leaves = nodes.filter(
        (node, i) => node.kind === "step" && !parents.has(i),
    ).length;
    const close = () => {
        if (!lock.current) {
            setFile(null);
            setError("");
        }
    };
    return (
        <div className="project-import">
            <label className="btn secondary file-input">
                <Upload size={18} /> استيراد مشروع
                <input
                    aria-label="استيراد مشروع"
                    type="file"
                    accept=".json,application/json"
                    disabled={busy}
                    onChange={async (e) => {
                        const upload = e.currentTarget.files?.[0];
                        e.currentTarget.value = "";
                        if (!upload || lock.current) return;
                        lock.current = true;
                        setBusy(true);
                        setError("");
                        try {
                            if (upload.size > PROJECT_IMPORT_MAX_BYTES)
                                throw new Error(
                                    "ملف المشروع أكبر من ٥ ميجابايت.",
                                );
                            setFile(parseProjectImport(await upload.text()));
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
            </label>
            <p className="muted">
                ملف JSON يضيف مشروعًا جديدًا. راجع محتواه قبل الحفظ.
            </p>
            {!file && error && (
                <p role="alert" className="warning">
                    {error}
                </p>
            )}
            {file && (
                <Dialog title="معاينة استيراد المشروع" onClose={close}>
                    <h3 className="import-title">{file.project.title}</h3>
                    {file.project.description && (
                        <p className="import-description">
                            {file.project.description}
                        </p>
                    )}
                    <p>
                        {file.project.stages.length} مراحل ·{" "}
                        {nodes.length - file.project.stages.length} خطوات
                        إجمالًا · {leaves} خطوات نهائية لحساب التقدم
                    </p>
                    <p>
                        سيُنشأ مشروع جديد، وتبقى مشاريعك الحالية محفوظة. تبدأ
                        جميع الخطوات دون إتمام.
                    </p>
                    <ol
                        className="import-preview"
                        aria-label="ترتيب مراحل وخطوات المشروع"
                    >
                        {nodes.slice(0, 100).map((node) => (
                            <li
                                key={node.number}
                                className={
                                    node.kind === "stage" ? "import-stage" : ""
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
                            تعرض المعاينة أول ١٠٠ عنصر؛ سيُحفظ جميع العناصر
                            وعددها {nodes.length}.
                        </p>
                    )}
                    {error && (
                        <p role="alert" className="warning">
                            {error}
                        </p>
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
                                    const id = await importProject(file);
                                    setFile(null);
                                    onImported(id);
                                } catch (err) {
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
                </Dialog>
            )}
        </div>
    );
}
