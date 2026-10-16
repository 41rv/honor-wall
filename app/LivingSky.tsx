import { memo, useEffect, useState, type CSSProperties } from "react";
import { skyAt, type SkyScene } from "./livingSky";
import { GlassOptics } from "./GlassOptics";

type Frame = { layers: [SkyScene, SkyScene]; front: 0 | 1 };
function paint(scene: SkyScene): CSSProperties {
    return {
        "--sky-top": scene.colors[0],
        "--sky-middle": scene.colors[1],
        "--sky-horizon": scene.colors[2],
        "--sky-ground": scene.colors[3],
    } as CSSProperties;
}
/** Time lives here, so decorative clock ticks never rerender task/project lists. */
export const LivingSky = memo(function LivingSky({ blur }: { blur: number }) {
    const [frame, setFrame] = useState<Frame>(() => {
        const scene = skyAt(new Date());
        return { layers: [scene, scene], front: 0 };
    });
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;
        const tick = () => {
            clearTimeout(timer);
            if (document.visibilityState === "hidden") return;
            const next = skyAt(new Date());
            setFrame((previous) => {
                if (
                    Math.floor(previous.layers[previous.front].minute) ===
                    Math.floor(next.minute)
                )
                    return previous;
                const front = previous.front === 0 ? 1 : 0;
                const layers: Frame["layers"] = [...previous.layers];
                layers[front] = next;
                return { layers, front };
            });
            timer = setTimeout(tick, 60000 - (Date.now() % 60000));
        };
        tick();
        window.addEventListener("focus", tick);
        window.addEventListener("pageshow", tick);
        document.addEventListener("visibilitychange", tick);
        return () => {
            clearTimeout(timer);
            window.removeEventListener("focus", tick);
            window.removeEventListener("pageshow", tick);
            document.removeEventListener("visibilitychange", tick);
        };
    }, []);
    const scene = frame.layers[frame.front];
    return (
        <div
            className="living-sky"
            aria-hidden="true"
            data-phase={scene.phase}
            data-minute={Math.floor(scene.minute)}
            style={
                {
                    ...paint(scene),
                    "--sky-light": scene.light,
                    "--sky-blur": `${blur}px`,
                } as CSSProperties
            }
        >
            <GlassOptics />
            <div className="sky-scene">
                {frame.layers.map((layer, index) => (
                    <div
                        key={index}
                        className="sky-atmosphere"
                        style={{
                            ...paint(layer),
                            opacity: index === frame.front ? 1 : 0,
                        }}
                    />
                ))}
                <div className="sky-orbit">
                    <div
                        className="sky-stars"
                        style={{ opacity: scene.stars }}
                    />
                    <div
                        className="sky-sun"
                        style={{
                            left: `${scene.sun.x}%`,
                            top: `${scene.sun.y}%`,
                            opacity: scene.sun.opacity,
                        }}
                    />
                    <div
                        className="sky-moon"
                        style={{
                            left: `${scene.moon.x}%`,
                            top: `${scene.moon.y}%`,
                            opacity: scene.moon.opacity,
                        }}
                    />
                </div>
            </div>
            <div className="sky-legibility" />
        </div>
    );
});
