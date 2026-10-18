import { test } from "@playwright/test";

/** Benchmark in a fresh process, independent from hundreds of prior contexts.
 * Keep each test's viewport/timezone and all original latency/frame limits.
 * Long-session navigation/observer regressions remain separate interaction tests. */
export const performanceTest = test.extend({
    page: async (
        {
            playwright,
            browserName,
            launchOptions,
            baseURL,
            viewport,
            timezoneId,
            contextOptions,
            headless,
        },
        use,
    ) => {
        const browser = await playwright[browserName].launch({
            ...launchOptions,
            headless,
        });
        try {
            const context = await browser.newContext({
                ...contextOptions,
                baseURL,
                viewport,
                timezoneId,
            });
            await use(await context.newPage());
        } finally {
            await browser.close();
        }
    },
});
