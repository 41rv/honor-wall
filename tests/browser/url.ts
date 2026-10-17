// Keep the same test journeys on both local-root and deployed-path artifacts.
const basePath = process.env.MASAR_E2E_BASE_PATH ?? "/";
if (!basePath.startsWith("/") || !basePath.endsWith("/"))
    throw new Error("MASAR_E2E_BASE_PATH must start and end with /");
export const appUrl = (route: string) => basePath + route.replace(/^\//, "");
