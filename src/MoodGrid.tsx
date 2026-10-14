import { useCallback, useRef } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { EMOTIONS, MIXED_RADIUS, emotionAt } from "./mood";
import type { PlacedSong } from "./mood";

interface Props {
  valence: number;
  arousal: number;
  songs: PlacedSong[];
  /** Smaller, fainter dots for large catalogs. */
  dense?: boolean;
  matchIds: Set<string>;
  hoveredId: string | null;
  onMove: (valence: number, arousal: number) => void;
  onHover: (id: string | null) => void;
}

const clamp = (v: number) => Math.max(-1, Math.min(1, v));
// Grid space [-1, 1] -> percent from the top-left corner.
const left = (v: number) => `${((v + 1) / 2) * 100}%`;
const top = (a: number) => `${((1 - a) / 2) * 100}%`;
const rad = (deg: number) => (deg * Math.PI) / 180;
// SVG space: x = valence, y = -arousal, so the viewBox is [-1, 1] on both axes.
const ray = (deg: number, r = 1.5) => `${r * Math.cos(rad(deg))} ${-r * Math.sin(rad(deg))}`;
const wedge = (from: number, to: number) => `M0 0 L${ray(from)} L${ray(to)} Z`;

export function MoodGrid({ valence, arousal, songs, dense, matchIds, hoveredId, onMove, onHover }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const active = emotionAt(valence, arousal);
  const dragging = useRef(false);

  const moveTo = useCallback((clientX: number, clientY: number) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    onMove(
      clamp(((clientX - box.left) / box.width) * 2 - 1),
      clamp(1 - ((clientY - box.top) / box.height) * 2),
    );
  }, [onMove]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    moveTo(e.clientX, e.clientY);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) moveTo(e.clientX, e.clientY);
  };
  const stop = () => { dragging.current = false; };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 0.2 : 0.05;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step],
    };
    const d = delta[e.key];
    if (!d) return;
    e.preventDefault();
    onMove(clamp(valence + d[0]), clamp(arousal + d[1]));
  };

  return (
    <div className="grid-wrap">
      <span className="axis-label axis-top">Wired</span>
      <span className="axis-label axis-bottom">Calm</span>
      <span className="axis-label axis-left">Feels bad</span>
      <span className="axis-label axis-right">Feels good</span>
      <div
        ref={ref}
        className="grid"
        role="slider"
        tabIndex={0}
        aria-label="Mood position. Arrow keys move; left and right change valence, up and down change arousal."
        aria-valuetext={`Valence ${valence.toFixed(2)}, arousal ${arousal.toFixed(2)}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stop}
        onPointerCancel={stop}
        onKeyDown={onKeyDown}
      >
        <svg className="sections" viewBox="-1 -1 2 2" aria-hidden="true">
          {active && <path className={`wedge wedge-${active.mood}`} d={wedge(active.from, active.to)} />}
          {EMOTIONS.map((e) => (
            <line key={e.name} className={e.from % 90 === 0 ? "rule rule-axis" : "rule"} x1="0" y1="0"
              x2={1.5 * Math.cos(rad(e.from))} y2={-1.5 * Math.sin(rad(e.from))} />
          ))}
          <circle className="mixed-ring" cx="0" cy="0" r={MIXED_RADIUS} />
        </svg>
        {EMOTIONS.map((e) => {
          const mid = rad((e.from + e.to) / 2);
          return (
            <span
              key={e.name}
              className={`section-label mood-${e.mood}${active === e ? " is-active" : ""}`}
              style={{ left: left(0.74 * Math.cos(mid)), top: top(0.74 * Math.sin(mid)) }}
            >
              {e.name}
            </span>
          );
        })}
        <span className={`section-label mixed-label${active ? "" : " is-active"}`} style={{ left: "50%", top: "50%" }}>
          Mixed
        </span>

        {songs.map((s) => (
          <span
            key={s.id}
            className={`dot${dense ? " dot-sm" : ""} dot-${s.top}${matchIds.has(s.id) ? " is-match" : ""}${hoveredId === s.id ? " is-hovered" : ""}`}
            style={{ left: left(s.valence), top: top(s.arousal), opacity: dense && !matchIds.has(s.id) ? 0.45 : 0.35 + s.confidence * 0.65 }}
            onPointerEnter={() => onHover(s.id)}
            onPointerLeave={() => onHover(null)}
            title={`${s.title} · ${s.artist}`}
          />
        ))}

        <span className="puck" style={{ left: left(valence), top: top(arousal) }} aria-hidden="true">
          <span className="spark s1" /><span className="spark s2" /><span className="spark s3" /><span className="spark s4" />
        </span>
      </div>
    </div>
  );
}
