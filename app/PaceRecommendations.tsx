import { useEffect, useRef, useState } from "react";
import type { PaceRecommendation } from "./paceTypes";
import type { Project } from "./model";
import { date } from "./model";
import { acceptRecommendation, rejectRecommendation } from "./projectPaceStore";
import { Dialog } from "./Dialog";
import { userError } from "./userError";
export function PaceRecommendations({
    rows,
    projects,
    main = false,
}: {
    rows: PaceRecommendation[];
    projects: Project[];
    main?: boolean;
}) {
    const [preview, setPreview] = useState<PaceRecommendation | null>(null),
        [busy, setBusy] = useState(false),
        [error, setError] = useState(""),
        lock = useRef(false),
        [history, setHistory] = useState(false);
    useEffect(() => {
        if (!main && location.hash === "#progress/recommendations") {
            const frame = requestAnimationFrame(() =>
                document
                    .getElementById("pace-recommendations")
                    ?.scrollIntoView({ block: "start" }),
            );
            return () => cancelAnimationFrame(frame);
        }
    }, [main]);
    const fresh = rows
        .filter((r) => r.status === "new")
        .sort(
            (a, b) =>
                ({ ease: 0, focus: 1, accelerate: 2 })[a.type] -
                    { ease: 0, focus: 1, accelerate: 2 }[b.type] ||
                b.createdAt.localeCompare(a.createdAt),
        );
    const visible = main ? fresh.slice(0, 1) : history ? rows : fresh;
    async function act(fn: () => Promise<unknown>) {
        if (lock.current) return;
        lock.current = true;
        setBusy(true);
        setError("");
        try {
            await fn();
            setPreview(null);
        } catch (e) {
            setError(userError(e));
        } finally {
            lock.current = false;
            setBusy(false);
        }
    }
    return (
        <section
            id={main ? undefined : "pace-recommendations"}
            className="pace-recommendations"
            aria-label={main ? "التوصية الأبرز" : "سجل توصيات مسار"}
        >
            <div className="section-heading">
                <h2>{main ? "اقتراح لك" : "توصيات مسار"}</h2>
                {main ? (
                    <a href="#progress/recommendations" className="text-btn">
                        كل التوصيات
                    </a>
                ) : (
                    <button
                        className="text-btn"
                        onClick={() => setHistory((v) => !v)}
                    >
                        {history ? "التوصيات الجديدة" : "عرض سجل القرارات"}
                    </button>
                )}
            </div>
            {visible.map((r) => (
                <article className="surface recommendation-card" key={r.id}>
                    <h3>
                        {
                            {
                                accelerate: "فرصة لتبكير الإنجاز",
                                ease: "خطة أكثر واقعية",
                                focus: "مساحة لتركيز أكبر",
                            }[r.type]
                        }
                    </h3>
                    <p className="small muted">
                        {r.projectIds
                            .map(
                                (id) =>
                                    projects.find((p) => p.id === id)?.title ??
                                    "مشروع",
                            )
                            .join("، ")}
                    </p>
                    <p>{r.reason}</p>
                    <p>{r.effect}</p>
                    {r.status === "new" ? (
                        <div className="pace-actions">
                            <button
                                className="btn primary"
                                disabled={busy}
                                onClick={() => {
                                    setError("");
                                    setPreview(structuredClone(r));
                                }}
                            >
                                معاينة الاقتراح
                            </button>
                            <button
                                className="text-btn"
                                disabled={busy}
                                onClick={() =>
                                    void act(() => rejectRecommendation(r.id))
                                }
                            >
                                رفض الاقتراح
                            </button>
                        </div>
                    ) : (
                        <p className="small muted">
                            {
                                {
                                    accepted: "مقبولة",
                                    rejected: "مرفوضة",
                                    invalid: "لم تعد صالحة",
                                }[r.status]
                            }{" "}
                            · {date(r.decidedAt)}
                        </p>
                    )}
                </article>
            ))}
            {!visible.length && (
                <p className="compact-empty muted">
                    {history
                        ? "لا توجد توصيات محفوظة بعد."
                        : "لا يوجد اقتراح جديد تدعمه البيانات الآن."}
                </p>
            )}
            {!main && history && rows.length >= 100 && (
                <p className="small muted">
                    يُعرض آخر 100 سجل مع جميع التوصيات الجديدة. يُحفظ السجل
                    الكامل في النسخة الاحتياطية.
                </p>
            )}
            {error && !preview && (
                <p className="warning" role="alert">
                    {error}
                </p>
            )}
            {preview && (
                <Dialog
                    title="تأكيد تغييرات التوصية"
                    onClose={() => {
                        if (!lock.current) setPreview(null);
                    }}
                >
                    <p>{preview.reason}</p>
                    <p>{preview.effect}</p>
                    <ul>
                        {preview.changes.map((c) => (
                            <li key={c.projectId}>
                                {
                                    projects.find((p) => p.id === c.projectId)
                                        ?.title
                                }
                                :{" "}
                                {c.type === "pause"
                                    ? "إيقاف مؤقت مع تجميد الهدف المرن"
                                    : c.type === "pace"
                                      ? `اعتماد ${c.daily} خطوة يوميًا مع بقاء الموعد الإلزامي؛ انتهاء حسابي ${c.targetDate}`
                                      : `استبدال الهدف المرن بـ ${c.targetDate}، واعتماد ${c.daily} خطوة يوميًا`}
                            </li>
                        ))}
                    </ul>
                    <p className="muted small">
                        لا تتغير المشاريع الأخرى. يمكن تعديل الخطة أو استئناف
                        المشروع لاحقًا. تُفحص صلاحية البيانات مرة أخرى عند
                        التأكيد.
                    </p>
                    <div className="dialog-buttons">
                        <button
                            className="btn secondary"
                            disabled={busy}
                            onClick={() => setPreview(null)}
                        >
                            إلغاء
                        </button>
                        <button
                            className="btn primary"
                            disabled={busy}
                            onClick={() =>
                                void act(() =>
                                    acceptRecommendation(preview, true),
                                )
                            }
                        >
                            تأكيد اعتماد التغييرات
                        </button>
                    </div>
                    {error && (
                        <p className="warning" role="alert">
                            {error}
                        </p>
                    )}
                </Dialog>
            )}
        </section>
    );
}
