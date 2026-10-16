import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/tajawal/arabic-400.css";
import "@fontsource/tajawal/arabic-500.css";
import "@fontsource/tajawal/arabic-700.css";
import "./styles.css";
import "./livingSky.css";
import "./controls.css";
import App from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <ErrorBoundary>
            <App />
        </ErrorBoundary>
    </React.StrictMode>,
);
