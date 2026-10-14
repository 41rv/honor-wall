// Date-only test clock. Keep native timers, performance.now and browser tracing.
export async function freezeDate(page, instant) {
    const timestamp = new Date(instant).getTime();
    if (!Number.isFinite(timestamp)) throw new Error("Invalid test clock");
    await page.addInitScript((at) => {
        const NativeDate = window.Date;
        const FixedDate = function Date(...args) {
            if (!new.target) return new NativeDate(at).toString();
            return Reflect.construct(
                NativeDate,
                args.length ? args : [at],
                new.target,
            );
        };
        Object.setPrototypeOf(FixedDate, NativeDate);
        FixedDate.prototype = NativeDate.prototype;
        FixedDate.now = () => at;
        window.Date = FixedDate;
    }, timestamp);
}
