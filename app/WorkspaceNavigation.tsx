import {
    CheckCheck,
    Lightbulb,
    ChartNoAxesCombined,
    ArrowUpLeft,
    FolderKanban,
    Sprout,
} from "lucide-react";

/** Links to the original screens; there are no new data sources or counters. */
export function ProjectGateway() {
    return (
        <nav
            className="workspace-navigation project-gateway"
            aria-label="أدوات التنظيم"
        >
            <a className="surface" href="#tasks">
                <CheckCheck size={21} />
                <span>
                    <strong>المهام</strong>
                    <small>مهامك ومواعيدك</small>
                </span>
                <ArrowUpLeft size={16} />
            </a>
            <a className="surface" href="#ideas">
                <Lightbulb size={21} />
                <span>
                    <strong>الأفكار</strong>
                    <small>أفكارك المحفوظة</small>
                </span>
                <ArrowUpLeft size={16} />
            </a>
            <a className="surface" href="#progress">
                <ChartNoAxesCombined size={21} />
                <span>
                    <strong>التقدم</strong>
                    <small>الإحصاءات والرؤى والسجل</small>
                </span>
                <ArrowUpLeft size={16} />
            </a>
        </nav>
    );
}

export function WorkspaceBack({ onBack }: { onBack: () => void }) {
    return (
        <div className="workspace-back">
            <button className="text-btn" onClick={onBack}>
                الرجوع
            </button>
            <a className="text-btn" href="#projects">
                <FolderKanban size={16} />
                بوابة المشاريع
            </a>
        </div>
    );
}

/** Navigation destination only. Habit models, forms and storage are NOT added
 * in phase 1; no simulated records or nonfunctional creation buttons. */
export function HabitsLanding() {
    return (
        <section
            className="surface habits-introduction"
            aria-label="مسار العادات"
        >
            <Sprout size={32} aria-hidden="true" />
            <h2>مساحة لعاداتك، بخطوات صغيرة</h2>
            <p className="muted">
                سيُضاف هنا نظام المسارات والعادات في مراحل التنفيذ التالية.
                مهامك ومشاريعك وأفكارك متاحة الآن من بوابة المشاريع.
            </p>
            <div className="planning-links">
                <a className="btn secondary" href="#home">
                    الرئيسية
                </a>
                <a className="btn secondary" href="#projects">
                    بوابة المشاريع
                </a>
            </div>
        </section>
    );
}
