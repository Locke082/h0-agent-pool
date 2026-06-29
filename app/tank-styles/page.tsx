"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"

// WebGL must render client-only (three.js touches window/canvas)
const WebglTank = dynamic(() => import("@/components/webgl-tank"), {
  ssr: false,
  loading: () => <div className="webgl-loading">loading webgl…</div>,
})

const MIDDOT = "·"
type Tone = "neutral" | "approved" | "denied"

// ascii reservoir: fills bottom-up based on level ratio
function reservoir(ratio: number, rows = 7, cols = 12): string {
  const clamped = Math.max(0, Math.min(1, ratio))
  const filled = Math.round(clamped * rows)
  const lines: string[] = ["╔" + "═".repeat(cols) + "╗"]
  for (let r = 0; r < rows; r++) {
    const fromBottom = rows - r
    const glyph = fromBottom <= filled ? "█" : "·"
    lines.push("║" + glyph.repeat(cols) + "║")
  }
  lines.push("╚" + "═".repeat(cols) + "╝")
  return lines.join("\n")
}

// ---- Style 1: CSS 3D isometric box ----
function IsoTank({ ratio, tone }: { ratio: number; tone: Tone }) {
  const lvl = `${Math.max(0, Math.min(1, ratio)) * 100}%`
  return (
    <div className="iso-scene">
      <div
        className={`iso-tank tone-${tone}`}
        style={{ "--lvl": lvl } as Record<string, string>}
      >
        <div className="iso-face iso-front" />
        <div className="iso-face iso-right" />
        <div className="iso-face iso-top" />
      </div>
    </div>
  )
}

// ---- Style 3: skewed ASCII ----
function SkewTank({ ratio, tone }: { ratio: number; tone: Tone }) {
  return (
    <div className="skew-scene">
      <pre className={`skew-tank tone-text-${tone}`}>{reservoir(ratio)}</pre>
    </div>
  )
}

function ToneDot({ tone }: { tone: Tone }) {
  return <span className={`tone-text-${tone}`}>{"●"}</span>
}

export default function TankStylesPage() {
  const [level, setLevel] = useState(60)
  const [tone, setTone] = useState<Tone>("neutral")
  const ratio = level / 100

  const tones: Tone[] = ["neutral", "approved", "denied"]

  return (
    <main className="wrap">
      <style>{styles}</style>

      <header className="head">
        <div>
          <div className="wordmark">tank {MIDDOT} styles</div>
          <div className="caps mute">three ways to render the pool</div>
        </div>
        <Link href="/" className="back caps">
          {"< back to pool"}
        </Link>
      </header>

      <div className="rule" />

      {/* controls */}
      <section className="controls">
        <label className="ctrl">
          <span className="caps mute">{`fill level ${MIDDOT} ${level}%`}</span>
          <input
            type="range"
            min={0}
            max={100}
            value={level}
            onChange={(e) => setLevel(Number(e.target.value))}
          />
        </label>
        <div className="ctrl">
          <span className="caps mute">tone</span>
          <div className="tone-btns">
            {tones.map((t) => (
              <button
                key={t}
                type="button"
                className={`tone-btn${tone === t ? " on" : ""}`}
                onClick={() => setTone(t)}
              >
                <ToneDot tone={t} /> {t}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="rule" />

      {/* the three styles */}
      <section className="grid">
        <article className="card">
          <div className="card-stage">
            <IsoTank ratio={ratio} tone={tone} />
          </div>
          <h2 className="card-title">css 3d iso boxes</h2>
          <p className="card-desc">
            Hard-edged isometric box built from three CSS-transform faces. Lightweight, no
            dependencies, and matches the flat brutalist aesthetic. Used on the live dashboard.
          </p>
          <div className="card-tags caps mute">{`no deps ${MIDDOT} fixed angle ${MIDDOT} fast`}</div>
        </article>

        <article className="card">
          <div className="card-stage webgl-stage">
            <WebglTank ratio={ratio} tone={tone} />
          </div>
          <h2 className="card-title">webgl {MIDDOT} react-three-fiber</h2>
          <p className="card-desc">
            A true 3D volume you can orbit with the mouse — real depth, lighting, and reflections.
            Heavier (adds three.js) and the glossy realism reads less brutalist. Drag to rotate.
          </p>
          <div className="card-tags caps mute">{`rotatable ${MIDDOT} lit ${MIDDOT} +three.js`}</div>
        </article>

        <article className="card">
          <div className="card-stage">
            <SkewTank ratio={ratio} tone={tone} />
          </div>
          <h2 className="card-title">skewed ascii</h2>
          <p className="card-desc">
            The original ASCII tank with a CSS skew/rotate for a faux-3D tilt. Most minimal, but
            reads as tilted text rather than a real volume.
          </p>
          <div className="card-tags caps mute">{`text only ${MIDDOT} faux 3d ${MIDDOT} tiny`}</div>
        </article>
      </section>
    </main>
  )
}

const styles = `
:root {
  --ink: #FAFAF7;
  --paper: #0A0A0A;
  --mute: #8A8A84;
  --faint: #5A5A55;
  --approved: #4ADE80;
  --denied: #F87171;
}
* { box-sizing: border-box; }
.wrap {
  min-height: 100vh;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--font-mono, ui-monospace, "SF Mono", Menlo, monospace);
  max-width: 1080px;
  margin: 0 auto;
  padding: 40px 28px 80px;
}
.caps { text-transform: lowercase; letter-spacing: 0.08em; font-size: 11px; }
.mute { color: var(--mute); }
.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.wordmark { font-size: 26px; font-weight: 600; letter-spacing: 0.02em; margin-bottom: 6px; }
.back { color: var(--ink); text-decoration: none; border: 1px solid var(--mute); padding: 8px 12px; }
.back:hover { background: var(--ink); color: var(--paper); }
.rule { height: 1px; background: var(--faint); margin: 22px 0; opacity: 0.5; }

.controls { display: flex; flex-wrap: wrap; gap: 28px; align-items: center; }
.ctrl { display: flex; flex-direction: column; gap: 10px; }
.ctrl input[type="range"] {
  width: 260px;
  accent-color: var(--ink);
}
.tone-btns { display: flex; gap: 8px; }
.tone-btn {
  background: transparent;
  color: var(--ink);
  border: 1px solid var(--mute);
  font-family: inherit;
  font-size: 12px;
  padding: 7px 12px;
  cursor: pointer;
  text-transform: lowercase;
}
.tone-btn.on { background: var(--ink); color: var(--paper); }

.grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 24px;
}
@media (min-width: 860px) {
  .grid { grid-template-columns: repeat(3, 1fr); }
}
.card {
  border: 1px solid var(--faint);
  padding: 20px;
  display: flex;
  flex-direction: column;
}
.card-stage {
  height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 18px;
  overflow: hidden;
}
.webgl-stage { border: 1px solid var(--faint); }
.webgl-loading {
  display: flex; align-items: center; justify-content: center;
  width: 100%; height: 100%; color: var(--mute); font-size: 11px;
}
.card-title { font-size: 15px; font-weight: 600; margin: 0 0 8px; }
.card-desc { font-size: 13px; line-height: 1.6; color: var(--mute); margin: 0 0 14px; }
.card-tags { margin-top: auto; }

/* tones */
.tone-text-neutral { color: var(--ink); }
.tone-text-approved { color: var(--approved); }
.tone-text-denied { color: var(--denied); }

/* iso */
.iso-scene {
  --w: 96px; --h: 132px; --d: 64px;
  perspective: 760px;
  display: flex; align-items: center; justify-content: center;
}
.iso-tank {
  position: relative; width: var(--w); height: var(--h);
  transform-style: preserve-3d;
  transform: rotateX(-20deg) rotateY(-36deg);
  --tone: var(--ink);
}
.tone-approved { --tone: var(--approved); }
.tone-denied { --tone: var(--denied); }
.iso-face { position: absolute; border: 1px solid var(--mute); }
.iso-front {
  width: var(--w); height: var(--h);
  left: calc(50% - var(--w) / 2); top: calc(50% - var(--h) / 2);
  transform: translateZ(calc(var(--d) / 2));
  background: linear-gradient(to top, var(--tone) 0 var(--lvl), transparent var(--lvl));
}
.iso-right {
  width: var(--d); height: var(--h);
  left: calc(50% - var(--d) / 2); top: calc(50% - var(--h) / 2);
  transform: rotateY(90deg) translateZ(calc(var(--w) / 2));
  background: linear-gradient(to top, color-mix(in srgb, var(--tone) 62%, #000) 0 var(--lvl), transparent var(--lvl));
}
.iso-top {
  width: var(--w); height: var(--d);
  left: calc(50% - var(--w) / 2); top: calc(50% - var(--d) / 2);
  transform: rotateX(90deg) translateZ(calc(var(--h) / 2));
  background: color-mix(in srgb, var(--ink) 8%, transparent);
}

/* skewed ascii */
.skew-scene {
  perspective: 600px;
  display: flex; align-items: center; justify-content: center;
}
.skew-tank {
  font-family: inherit;
  font-size: 16px;
  line-height: 1;
  letter-spacing: -0.05em;
  white-space: pre;
  margin: 0;
  transform: rotateX(34deg) rotateZ(-24deg) skewX(8deg);
  transform-origin: center;
}
`
