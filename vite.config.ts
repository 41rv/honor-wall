import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
const base = process.env.VITE_BASE_PATH || "/";
if (!base.startsWith("/") || !base.endsWith("/"))
    throw new Error("VITE_BASE_PATH must start and end with /");
export default defineConfig({
    base,
    build: {
        outDir: "build",
        rolldownOptions: {
            output: {
                codeSplitting: {
                    groups: [{ name: "calendar", test: /@js-temporal|jsbi/ }],
                },
            },
        },
    },
    plugins: [
        react(),
        tailwindcss(),
        VitePWA({
            registerType: "prompt",
            devOptions: { enabled: false },
            includeAssets: ["icon.svg", "icon-192.png", "icon-512.png"],
            manifest: {
                id: base,
                scope: base,
                name: "مسار — مساحة لإنجازك",
                short_name: "مسار",
                lang: "ar",
                dir: "rtl",
                description: "مشاريعك ومهامك وأفكارك، على جهازك.",
                theme_color: "#185c4b",
                // Native launch screens cannot read the user's localStorage theme.
                // A stable dark brand color avoids a white PWA splash in dark mode.
                background_color: "#185c4b",
                display: "standalone",
                start_url: base,
                icons: [
                    {
                        src: `${base}icon-192.png`,
                        sizes: "192x192",
                        type: "image/png",
                        purpose: "any",
                    },
                    {
                        src: `${base}icon-512.png`,
                        sizes: "512x512",
                        type: "image/png",
                        purpose: "any",
                    },
                    {
                        src: `${base}icon-512.png`,
                        sizes: "512x512",
                        type: "image/png",
                        purpose: "maskable",
                    },
                ],
            },
            workbox: {
                clientsClaim: true,
                globPatterns: ["**/*.{js,css,html,svg,png,woff,woff2}"],
                navigateFallback: `${base}index.html`,
            },
        }),
    ],
    test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
