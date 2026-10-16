import { memo } from "react";

// Two static gradients form a normal map: neutral in the middle, bending
// inward at the edges. No turbulence, texture downloads or animation loop.
const normalMap =
    "data:image/svg+xml," +
    encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">' +
            '<defs><linearGradient id="x"><stop stop-color="#ff0080"/><stop offset=".12" stop-color="#800080"/><stop offset=".88" stop-color="#800080"/><stop offset="1" stop-color="#000080"/></linearGradient>' +
            '<linearGradient id="y" x2="0" y2="1"><stop stop-color="#00ff00"/><stop offset=".12" stop-color="#008000"/><stop offset=".88" stop-color="#008000"/><stop offset="1" stop-color="#000000"/></linearGradient></defs>' +
            '<rect width="64" height="64" fill="url(#x)"/><rect width="64" height="64" fill="url(#y)" style="mix-blend-mode:screen"/></svg>',
    );

/** One shared, nonvisual filter. Only a masked decorative rim references it. */
export const GlassOptics = memo(function GlassOptics() {
    return (
        <svg
            className="sky-glass-optics"
            width="0"
            height="0"
            aria-hidden="true"
            focusable="false"
        >
            <defs>
                <filter
                    id="masar-glass-rim"
                    x="0"
                    y="0"
                    width="100%"
                    height="100%"
                    colorInterpolationFilters="sRGB"
                >
                    <feImage
                        href={normalMap}
                        x="0"
                        y="0"
                        width="100%"
                        height="100%"
                        preserveAspectRatio="none"
                        result="normals"
                    />
                    <feDisplacementMap
                        in="SourceGraphic"
                        in2="normals"
                        scale="5"
                        xChannelSelector="R"
                        yChannelSelector="G"
                    />
                </filter>
            </defs>
        </svg>
    );
});
