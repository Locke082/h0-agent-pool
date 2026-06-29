"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import type { TankSegment } from "@/components/webgl-tank"

// WebGL renders client-only (three.js touches window/canvas)
const WebglTank = dynamic(() => import("@/components/webgl-tank"), {
  ssr: false,
  loading: () => <div className="gl-loading">···</div>,
})

// fixed tank colors: pool green, then one per agent (blue / red / amber)
const POOL_COLOR = "#4ADE80"
const AGENT_COLORS = ["#60A5FA", "#F87171", "#FBBF24"]

type DashboardState = {
  pool: { id: string; name: string; balance: number } // cents
  agents: Array<{ id: string; name: string; cap: number; status: "active" | "suspended"; spent: number }> // cap + spent in cents
  activity: Array<{
    id: string
    agentName: string
    amount: number // cents
    outcome: "approved" | "denied"
    reason: string | null
    region: string | null
    createdAt: string // ISO
  }>
  counters: { spends: number; approved: number; denied: number; serialization: number }
  lastConflict: { agentName: string; createdAt: string; secondsAgo: number } | null
}

const MIDDOT = "·"

// human-facing region per agent (routing is separate — see runRace)
function agentRegionLabel(name: string): string {
  return name === "agent-02" ? "eu-west-3" : "eu-west-1"
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, "0")
  const mm = String(d.getMinutes()).padStart(2, "0")
  const ss = String(d.getSeconds()).padStart(2, "0")
  const ms = String(d.getMilliseconds()).padStart(3, "0")
  return `${hh}:${mm}:${ss}.${ms}`
}

const RAMP = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"]

function sparkline(amounts: number[]): string {
  if (amounts.length === 0) return ""
  const last = amounts.slice(-24)
  const min = Math.min(...last)
  const max = Math.max(...last)
  const span = max - min || 1
  return last
    .map((a) => {
      const idx = Math.round(((a - min) / span) * (RAMP.length - 1))
      return RAMP[idx]
    })
    .join("")
}

// soft 150ms ease-out tween for the hero balance numeral
function useTween(target: number): number {
  const [value, setValue] = useState(target)
  const fromRef = useRef(target)
  const startRef = useRef(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    fromRef.current = value
    startRef.current = performance.now()
    const from = fromRef.current
    const delta = target - from
    if (delta === 0) return

    const tick = (now: number) => {
      const t = Math.min((now - startRef.current) / 150, 1)
      const eased = 1 - Math.pow(1 - t, 2) // ease-out quad
      setValue(from + delta * eased)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        setValue(target)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  return value
}

export default function Page() {
  const [state, setState] = useState<DashboardState | null>(null)
  const [raceFlash, setRaceFlash] = useState(0)

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" })
      if (!res.ok) return
      const data = (await res.json()) as DashboardState
      setState(data)
    } catch {
      // keep last known state until the next poll lands
    }
  }, [])

  useEffect(() => {
    poll()
    const id = setInterval(poll, 1000)
    return () => clearInterval(id)
  }, [poll])

  const tweenedBalance = useTween(state?.pool.balance ?? 0)

  function spend(
    agentId: string,
    amount: number,
    regionDisplay: string,
    regionRoute: "primary" | "secondary",
  ) {
    return fetch("/api/spend", {
      method: "POST",
      headers: { "content-type": "application/json" },
      // region = routing pool, regionLabel = human-facing region for the feed
      body: JSON.stringify({ agentId, amount, region: regionRoute, regionLabel: regionDisplay }),
    })
  }

  function runRace() {
    if (!state) return
    const byName = (n: string) => state.agents.find((a) => a.name === n)
    const a1 = byName("agent-01")
    const a2 = byName("agent-02")
    const a3 = byName("agent-03")
    if (!a1 || !a2 || !a3) return
    setRaceFlash(Date.now()) // pulse the tanks while the race resolves
    // fleet burst: 30 concurrent $80 spends — agent-01 & agent-03 hit primary
    // (eu-west-1), agent-02 hits secondary (eu-west-3). 10 each.
    // per-promise catch so one failed request can't sink the rest.
    const burst: Promise<unknown>[] = []
    for (let i = 0; i < 10; i++) {
      burst.push(spend(a1.id, 8000, "eu-west-1", "primary").catch(() => {}))
      burst.push(spend(a2.id, 8000, "eu-west-3", "secondary").catch(() => {}))
      burst.push(spend(a3.id, 8000, "eu-west-1", "primary").catch(() => {}))
    }
    // fire all 30 at once; the 1s poll reflects results
    Promise.all(burst).catch(() => {})
  }

  function toggleAgent(id: string, status: "active" | "suspended") {
    const path = status === "active" ? "suspend" : "reactivate"
    fetch(`/api/agents/${id}/${path}`, { method: "POST" }).catch(() => {})
  }

  function resetDemo() {
    // refill the pool, clear activity, reactivate agents — then poll immediately
    fetch("/api/reset", { method: "POST" })
      .then(() => poll())
      .catch(() => {})
  }

  return (
    <>
      <style>{styles}</style>
      <main className="ap-root">
        {!state ? (
          <div className="ap-loading caps">loading {MIDDOT} alpha pool</div>
        ) : (
          <Dashboard
            state={state}
            balance={tweenedBalance}
            raceFlash={raceFlash}
            onRunRace={runRace}
            onReset={resetDemo}
            onToggle={toggleAgent}
          />
        )}
      </main>
    </>
  )
}

function Dashboard({
  state,
  balance,
  raceFlash,
  onRunRace,
  onReset,
  onToggle,
}: {
  state: DashboardState
  balance: number
  raceFlash: number
  onRunRace: () => void
  onReset: () => void
  onToggle: (id: string, status: "active" | "suspended") => void
}) {
  const { pool, agents, activity, counters, lastConflict } = state
  const spark = sparkline(activity.slice(0, 24).map((a) => a.amount).reverse())
  const freshIds = useFreshRows(activity)

  // pool tank capacity = $500 seed, or the highest balance seen if it ever exceeds that
  const poolCapRef = useRef(50000)
  poolCapRef.current = Math.max(poolCapRef.current, balance)
  const poolRatio = balance / poolCapRef.current
  const poolPct = Math.round(poolRatio * 100)

  return (
    <div className="ap-page">
      {/* header */}
      <header className="ap-header">
        <div>
          <div className="ap-wordmark">agent {MIDDOT} pool</div>
        </div>
        <div className="ap-cluster">
          <div className="ap-cluster-val">dsql / eu-west-1 + eu-west-3</div>
        </div>
      </header>
      <div className="rule-thick" />

      {/* context strip */}
      <div className="ap-context caps mute">
        {`tenant: acme-ai  ${MIDDOT}  daily budget cycle  ${MIDDOT}  ceiling: $500.00  ${MIDDOT}  3 agents ${MIDDOT} 2 regions`}
      </div>

      {/* hero */}
      <section className="ap-hero">
        <div className="ap-hero-left">
          <div className="caps mute">pool balance</div>
          <div className="ap-balance">
            {`$${Math.floor(balance / 100).toLocaleString("en-US")}`}
            <span className="ap-balance-cents">.{String(Math.round(balance % 100)).padStart(2, "0")}</span>
          </div>
          <div className="ap-spark">{spark || " "}</div>
          <div className="caps mute">last 24 spends</div>
        </div>
        <div className="ap-hero-right">
          <div className="caps mute">{`pool ${MIDDOT} agents`}</div>
          <div className="iso-tanks">
            <DashTank
              size="lg"
              segments={[{ amount: balance, outcome: "approved" }]}
              capacity={poolCapRef.current}
              color={POOL_COLOR}
              flash={raceFlash}
              value={money(Math.round(balance))}
              label={`pool ${MIDDOT} ${poolPct}%`}
            />
            {agents.map((a, i) => (
              <DashTank
                key={a.id}
                size="sm"
                // authoritative cumulative approved spend — stable across polls,
                // not derived from the 30-row activity window
                segments={[{ amount: a.spent, outcome: "approved" }]}
                capacity={poolCapRef.current}
                color={AGENT_COLORS[i % AGENT_COLORS.length]}
                flash={raceFlash}
                value={money(a.spent)}
                label={a.name}
              />
            ))}
          </div>
          <button className="ap-runrace" onClick={onRunRace} type="button">
            {`▸ simulate fleet burst  [ 30 concurrent spends ]`}
          </button>
          <div className="ap-burst-caption">
            30 concurrent authorization requests across eu-west-1 + eu-west-3
          </div>
          <button className="ap-reset" onClick={onReset} type="button">
            {`<< reset demo  [ refill $500 ]`}
          </button>
        </div>
      </section>
      <div className="rule-hair" />

      {/* counter strip */}
      <section className="ap-counters">
        <Counter label="spends" value={counters.spends} />
        <span className="ap-mid">{MIDDOT}</span>
        <Counter label="approved" value={counters.approved} />
        <span className="ap-mid">{MIDDOT}</span>
        <Counter label="denied" value={counters.denied} />
        <span className="ap-mid">{MIDDOT}</span>
        <Counter label="40001 caught" value={counters.serialization} />
      </section>
      <div className="rule-hair" />

      {/* last-conflict callout */}
      <section className="ap-callout mute">
        {lastConflict
          ? `last 40001 caught ${MIDDOT} ${lastConflict.secondsAgo}s ago ${MIDDOT} ${lastConflict.agentName}`
          : `no serialization conflicts yet ${MIDDOT} run race to trigger one`}
      </section>
      <div className="rule-hair" />

      {/* agents */}
      <section className="ap-section">
        <div className="caps mute ap-section-label">agents</div>
        {agents.map((a) => {
          const suspended = a.status === "suspended"
          const regionLabel = agentRegionLabel(a.name)
          return (
            <div key={a.id} className={`ap-agent-row${suspended ? " faint" : ""}`}>
              <span className="ap-agent-info">
                {`${regionLabel} ${MIDDOT} ${a.name} ${MIDDOT} cap ${money(a.cap)} ${MIDDOT} `}
                {suspended ? (
                  <span className="mute">{"○ suspended"}</span>
                ) : (
                  <span>{"● active"}</span>
                )}
              </span>
              <button
                className="ap-link"
                type="button"
                onClick={() => onToggle(a.id, a.status)}
              >
                {suspended ? "[ reactivate ]" : "[ suspend ]"}
              </button>
            </div>
          )
        })}
      </section>
      <div className="rule-hair" />

      {/* activity feed */}
      <section className="ap-section">
        <div className="caps mute ap-section-label">activity</div>
        {activity.slice(0, 30).map((row) => {
          const pill = row.outcome === "approved" ? "[ approved ]" : "[ denied   ]"
          const fresh = freshIds.has(row.id)
          const freshClass = fresh ? (row.outcome === "approved" ? " fresh-approved" : " fresh-denied") : ""
          return (
            <div key={row.id} className={`ap-activity-row${freshClass}`}>
              <span className="mute">{fmtTime(row.createdAt)}</span>
              <span>{` ${MIDDOT} ${row.agentName} ${MIDDOT} −${money(row.amount)} ${MIDDOT} `}</span>
              <span className={row.outcome === "approved" ? "approved" : "denied"}>{pill}</span>
              {row.region ? <span>{` ${MIDDOT} ${row.region}`}</span> : null}
              {row.outcome === "denied" && row.reason ? (
                <span className="mute">{` ${MIDDOT} ${row.reason}`}</span>
              ) : null}
            </div>
          )
        })}
      </section>

      {/* footer */}
      <div className="rule-thick" />
      <footer className="ap-footer caps">
        <span>invariant {MIDDOT} balance {"≥"} 0 {MIDDOT} enforced in db</span>
        <span>built on aurora dsql {MIDDOT} multi-region active-active</span>
      </footer>
    </div>
  )
}

// returns the set of activity ids that arrived since the previous poll,
// briefly, so the feed can highlight just-landed rows
function useFreshRows(activity: DashboardState["activity"]): Set<string> {
  const seenRef = useRef<Set<string> | null>(null)
  const [fresh, setFresh] = useState<Set<string>>(new Set())
  const key = activity.map((a) => a.id).join(",")

  useEffect(() => {
    const ids = activity.map((a) => a.id)
    if (seenRef.current === null) {
      // first load: adopt baseline without flagging everything as fresh
      seenRef.current = new Set(ids)
      return
    }
    const seen = seenRef.current
    const incoming = ids.filter((id) => !seen.has(id))
    ids.forEach((id) => seen.add(id))
    if (incoming.length === 0) return
    setFresh(new Set(incoming))
    const t = setTimeout(() => setFresh(new Set()), 1100)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return fresh
}

// WebGL 3D tank: real lit volume that fills bottom-up, fixed color per tank
function DashTank({
  segments,
  capacity,
  color,
  size = "lg",
  flash,
  label,
  value,
}: {
  segments: TankSegment[]
  capacity: number
  color: string
  size?: "lg" | "sm"
  flash?: number
  label: string
  value: string
}) {
  const [flashing, setFlashing] = useState(false)
  useEffect(() => {
    if (!flash) return
    setFlashing(true)
    const t = setTimeout(() => setFlashing(false), 1400)
    return () => clearTimeout(t)
  }, [flash])

  return (
    <div className={`iso-col iso-${size}`}>
      <div className={`gl-stage${flashing ? " gl-flash" : ""}`}>
        <WebglTank segments={segments} capacity={capacity} color={color} />
      </div>
      <div className="iso-meta">
        <div className="iso-val">{value}</div>
        <div className="caps mute">{label}</div>
      </div>
    </div>
  )
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <span className="ap-counter">
      <span className="caps mute">{label}</span>
      <span className="ap-counter-num">{value}</span>
    </span>
  )
}

const styles = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&display=swap');

:root {
  --ink: #FAFAF7;
  --paper: #0A0A0A;
  --mute: #8A8A84;
  --faint: #5A5A55;
  --approved: #4ADE80;
  --denied: #F87171;
}

.ap-root * {
  box-sizing: border-box;
  font-feature-settings: "ss02", "zero";
}

.ap-root {
  min-height: 100vh;
  background: var(--paper);
  color: var(--ink);
  font-family: "IBM Plex Mono", ui-monospace, SFMono-Regular, monospace;
  font-weight: 400;
  text-transform: lowercase;
  -webkit-font-smoothing: antialiased;
}

.ap-loading {
  padding: 18px;
  color: var(--mute);
}

.ap-page {
  max-width: 980px;
  margin: 0 auto;
  padding: 0 18px 48px;
}

.caps {
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 10px;
  font-weight: 400;
  line-height: 1;
}

.mute { color: var(--mute); }
.faint { color: var(--faint); }
.approved { color: var(--approved); }
.denied { color: var(--denied); }

.rule-thick { border-top: 3px solid var(--ink); }
.rule-hair { border-top: 1px solid var(--ink); }

/* header */
.ap-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 24px 0 16px;
  gap: 16px;
}
.ap-wordmark {
  font-size: 26px;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1;
}
.ap-subtitle {
  margin-top: 8px;
  font-size: 11px;
  color: var(--mute);
  line-height: 1.4;
}
.ap-cluster { text-align: right; }
.ap-cluster-val {
  margin-top: 8px;
  font-size: 11px;
  color: var(--mute);
}

/* hero */
.ap-hero {
  display: grid;
  grid-template-columns: 1fr 1fr;
}
.ap-hero-left { padding: 24px 24px 24px 0; }
.ap-hero-right {
  padding: 24px 0 24px 24px;
  border-left: 1px solid var(--ink);
}
.ap-balance {
  font-size: 64px;
  font-weight: 300;
  letter-spacing: -0.04em;
  line-height: 1;
  margin: 16px 0;
}
.ap-balance-cents {
  font-size: 22px;
  font-weight: 300;
  color: var(--mute);
  letter-spacing: 0;
}
.ap-spark {
  font-size: 18px;
  line-height: 1;
  margin-bottom: 8px;
  letter-spacing: 0.04em;
}
/* webgl 3d tanks */
.iso-tanks {
  display: flex;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: 20px 18px;
  margin: 18px 0 20px;
}
.iso-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.gl-stage {
  border: 1px solid var(--faint);
  background: var(--paper);
}
.iso-lg .gl-stage { width: 168px; height: 188px; }
.iso-sm .gl-stage { width: 104px; height: 148px; }
.gl-flash { animation: gl-pulse 0.34s steps(1) 4; }
@keyframes gl-pulse {
  0%, 100% { border-color: var(--faint); }
  50% { border-color: var(--ink); }
}
.gl-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--mute);
  font-size: 14px;
}
.iso-meta { text-align: center; }
.iso-val { font-size: 14px; line-height: 1; margin-bottom: 7px; }
.iso-sm .iso-val { font-size: 12px; color: var(--mute); }
.ap-runrace {
  width: 100%;
  background: var(--ink);
  color: var(--paper);
  border: 2px solid var(--ink);
  border-radius: 0;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  text-transform: lowercase;
  padding: 12px;
  cursor: pointer;
  text-align: center;
}
.ap-runrace:hover { opacity: 0.88; }
.ap-reset {
  width: 100%;
  margin-top: 8px;
  background: transparent;
  color: var(--ink);
  border: 2px solid var(--ink);
  border-radius: 0;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  text-transform: lowercase;
  padding: 12px;
  cursor: pointer;
  text-align: center;
}
.ap-reset:hover { background: var(--ink); color: var(--paper); }
.ap-burst-caption {
  margin-top: 8px;
  font-size: 10px;
  color: var(--mute);
  letter-spacing: 0.04em;
  text-align: center;
  line-height: 1.4;
}

/* context strip */
.ap-context {
  padding: 12px 0;
  color: var(--mute);
}

/* counters */
.ap-counters {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  padding: 16px 0;
}
.ap-counter { display: flex; flex-direction: column; gap: 8px; }
.ap-counter-num { font-size: 18px; font-weight: 400; line-height: 1; }
.ap-mid { color: var(--faint); align-self: flex-end; font-size: 18px; }

/* callout */
.ap-callout {
  padding: 12px 0;
  font-size: 11px;
  letter-spacing: 0.02em;
}

/* sections */
.ap-section { padding: 16px 0; }
.ap-section-label { display: block; margin-bottom: 12px; color: var(--mute); }

.ap-agent-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 32px;
  font-size: 13px;
  line-height: 1.9;
}
.ap-agent-info { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ap-link {
  background: none;
  border: none;
  font-family: inherit;
  font-size: 13px;
  color: var(--ink);
  text-decoration: underline;
  text-transform: lowercase;
  cursor: pointer;
  padding: 0;
  white-space: nowrap;
}
.ap-link:hover { color: var(--denied); }

.ap-activity-row {
  font-size: 13px;
  line-height: 1.9;
  white-space: pre-wrap;
  word-break: break-word;
  margin-left: 0;
  padding-left: 0;
  border-left: 2px solid transparent;
  transition: margin-left 0.15s ease-out;
}
.fresh-approved {
  margin-left: 8px;
  padding-left: 8px;
  border-left-color: var(--approved);
  animation: ap-row-fade 1.1s ease-out forwards;
}
.fresh-denied {
  margin-left: 8px;
  padding-left: 8px;
  border-left-color: var(--denied);
  animation: ap-row-fade 1.1s ease-out forwards;
}
@keyframes ap-row-fade {
  0% { background: var(--faint); }
  100% { background: transparent; }
}

/* footer */
.ap-footer {
  display: flex;
  justify-content: space-between;
  padding: 16px 0 0;
  color: var(--ink);
  gap: 16px;
}

@media (max-width: 720px) {
  .ap-hero { grid-template-columns: 1fr; }
  .ap-hero-left { padding-right: 0; border-bottom: 1px solid var(--ink); }
  .ap-hero-right { padding-left: 0; border-left: none; }
  .ap-balance { font-size: 48px; }
}
`
