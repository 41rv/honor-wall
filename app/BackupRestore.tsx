import "./backupRestore.css";
import { useEffect, useRef, useState } from "react";
import { Dialog } from "./Dialog";
import { date, type Snapshot } from "./model";
import { restoreImpact, type RestoreMode } from "./db";
import { habitStores, legacyStores, type BackupStore } from "./backupTables";

export function BackupRestore({
    data,
    onClose,
    onRestore,
    onMerge,
}: {
    data: Snapshot;
    onClose: () => void;
    onRestore: (
        mode: RestoreMode,
        counts: Record<BackupStore, number>,
    ) => Promise<void>;
    onMerge: () => Promise<void>;
}) {
    const [counts, setCounts] = useState<Record<BackupStore, number>>();
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const acting = useRef(false);
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    const [confirmFull, setConfirmFull] = useState(false);
    useEffect(() => {
        let active = true;
        void restoreImpact()
            .then((value) => {
                if (active) setCounts(value);
            })
            .catch(() => {
                if (active)
                    setError(
                        "تعذر قراءة أثر الاستعادة. أغلق المعاينة وأعد المحاولة؛ لم تتغير بياناتك.",
                    );
            });
        return () => {
            active = false;
        };
    }, [data]);
    const sum = (names: readonly BackupStore[]) =>
        names.reduce((n, key) => n + (counts?.[key] ?? 0), 0);
    const incoming = habitStores.reduce(
        (n, key) => n + (data[key]?.length ?? 0),
        0,
    );
    const act = async (operation: () => Promise<void>) => {
        if (acting.current) return;
        acting.current = true;
        setBusy(true);
        try {
            await operation();
        } finally {
            acting.current = false;
            if (mounted.current) {
                setBusy(false);
                void restoreImpact()
                    .then((value) => {
                        if (mounted.current) setCounts(value);
                    })
                    .catch(() => {});
            }
        }
    };
    return (
        <Dialog
            title="معاينة النسخة الاحتياطية"
            onClose={onClose}
            canClose={() => !acting.current}
        >
            <p className="dialog-text">
                النسخة بتاريخ {date(data.exportedAt)}، بالإصدار{data.version}،
                تحتوي على {data.projects.length} مشاريع و{data.steps.length}{" "}
                مراحل وخطوات و{data.tasks.length} مهام و{data.ideas.length}{" "}
                أفكار و{data.taskCycles?.length ?? 0} دورات و
                {data.events.length} أحداث.
            </p>
            {data.version === 5 && (
                <p className="dialog-text">
                    وتحتوي على {data.habitPaths?.length ?? 0} مسارات عادات و
                    {data.habits?.length ?? 0} عادات و
                    {data.habitEntries?.length ?? 0} تسجيلات و
                    {data.reminders?.length ?? 0} تذكيرات؛ وبقية الخطط والقرارات
                    وإيصالات الاستيراد ضمن {incoming} سجلًا جديدًا.
                </p>
            )}
            <p className="warning">
                الاستعادة تستبدل محتويات الأقسام الموجودة في الملف داخل معاملة
                واحدة. تُحفظ أولًا نسخة أمان محلية قابلة للتنزيل من صفحة النسخ
                الاحتياطي؛ إذا تعذر حفظها فلن تبدأ عملية المسح. الدمج يضيف
                بمعرفات جديدة دون استبدال.
            </p>
            {counts && (
                <p className="dialog-text" role="status">
                    {data.version < 5 ? (
                        <>
                            ستُستبدل {sum(legacyStores)} سجلات حالية في أقسام
                            المشاريع والمهام والأفكار وسجلاتها وإعدادات الوتيرة.{" "}
                            <strong>
                                ستبقى بيانات العادات والتذكيرات وسجلاتها (
                                {sum(habitStores)} سجلًا) كما هي؛ هذه الأقسام
                                غير موجودة في النسخة القديمة.
                            </strong>
                        </>
                    ) : (
                        <>
                            ستُستبدل محتويات الأقسام التسعة عشر، بما فيها
                            العادات والتذكيرات:{" "}
                            {sum(legacyStores) + sum(habitStores)} سجلًا حاليًا،
                            منها {sum(habitStores)} في الأقسام الجديدة. المصفوفة
                            الفارغة في نسخة5 تعني إفراغ قسمها.
                        </>
                    )}
                </p>
            )}
            {error && <p role="alert">{error}</p>}
            <p className="muted small">
                حالات المشاريع والأهداف والإيقافات وأيام الراحة وسجلات الإنجاز
                تبقى وفق محتوى النسخة. لا يُوقف مشروع تلقائيًا عند تجاوز الحد
                النشط.
            </p>
            <div className="dialog-buttons backup-restore-actions">
                <button
                    className="btn secondary"
                    disabled={busy}
                    onClick={onClose}
                >
                    إلغاء
                </button>
                <button
                    className="btn primary"
                    disabled={busy || !counts}
                    onClick={() =>
                        void act(() => onRestore("preserve-missing", counts!))
                    }
                >
                    تأكيد استبدال البيانات
                </button>
                <button
                    className="btn secondary"
                    disabled={busy || !counts}
                    onClick={() => void act(onMerge)}
                >
                    دمج دون استبدال
                </button>
            </div>
            {data.version < 5 && (
                <details className="period-details">
                    <summary>الاستبدال الكامل — خيارات متقدمة</summary>
                    <p className="warning">
                        هذا الخيار يمسح أيضًا العادات والمسارات والتسجيلات
                        والتذكيرات والخطط والقرارات وإيصالاتها غير الموجودة في
                        الملف: {sum(habitStores)} سجلًا إضافيًا. تُحفظ نسخة
                        الأمان قبل التنفيذ ويمكن استعادتها بملفSnapshot5.
                    </p>
                    <label className="backup-restore-confirm">
                        <input
                            type="checkbox"
                            checked={confirmFull}
                            disabled={busy}
                            onChange={(e) => setConfirmFull(e.target.checked)}
                        />
                        <span>أوافق على حذف الأقسام غير الموجودة في الملف</span>
                    </label>
                    <button
                        className="btn danger"
                        disabled={!confirmFull || busy || !counts}
                        onClick={() =>
                            void act(() => onRestore("full", counts!))
                        }
                    >
                        تأكيد الاستبدال الكامل
                    </button>
                </details>
            )}
        </Dialog>
    );
}
