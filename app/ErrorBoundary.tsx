import { Component, type ReactNode } from "react";
export class ErrorBoundary extends Component<
    { children: ReactNode },
    { error: boolean }
> {
    state = { error: false };
    static getDerivedStateFromError() {
        return { error: true };
    }
    render() {
        if (this.state.error)
            return (
                <main>
                    <section className="surface">
                        <h1>تعذر فتح مساحتك</h1>
                        <p>
                            تحقق من دعم المتصفح للتخزين المحلي ومساحة الجهاز.
                            أعد المحاولة دون مسح بيانات الموقع، حتى تحافظ على
                            بياناتك.
                        </p>
                        <button
                            className="btn primary"
                            onClick={() => location.reload()}
                        >
                            إعادة المحاولة
                        </button>
                    </section>
                </main>
            );
        return this.props.children;
    }
}
