"use client"

import { useCallback, useEffect, useRef, useState } from "react"

type DashboardState = {
  pool: { id: string; name: string; balance: number } // cents
  agents: Array<{ id: string; name: string; cap: number; status: "active" | "suspended" }> // cap in cents
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

// ascii reservoir: fills from the bottom up based on level ratio
function reservoir(ratio: number, rows = 6, cols = 14): string {
  const clamped = Math.max(0, Math.min(1, ratio))
  const filledRows = Math.round(clamped * rows)
  const lines: string[] = ["╔" + "═".repeat(cols) + "╗"]
  for (let r = 0; r < rows; r++) {
    const fromBottom = rows - r
    const glyph = fromBottom <= filledRows ? "█" : "·"
    lines.push("║" + glyph.repeat(cols) + "║")
  }
  lines.push("╚" + "═".repeat(cols) + "╝")
  return lines.join("\n")
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

  function spend(agentId: string, amount: number, region: string) {
    return fetch("/api/spend", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentId, amount, region }),
    })
  }

  function runRace() {
    if (!state || state.agents.length < 2) return
    // don't await — the 1s poll reflects results
    Promise.all([
      spend(state.agents[0].id, 8000, "us-east-1"),
      spend(state.agents[1].id, 8000, "eu-west-1"),
    ]).catch(() => {})
  }

  function toggleAgent(id: string, status: "active" | "suspended") {
    const path = status === "active" ? "suspend" : "reactivate"
    fetch(`/api/agents/${id}/${path}`, { method: "POST" }).catch(() => {})
  }

  return (
    <>
      <style>{styles}</style>
      <main className="ap-root">
        {!state ? (
          <div className="ap-loading caps">loading {MIDDOT} alpha pool</div>
        ) : (
          <Dashboard state={state} balance={tweenedBalance} onRunRace={runRace} onToggle={toggleAgent} />
        )}
      </main>
    </>
  )
}

function Dashboard({
  state,
  balance,
  onRunRace,
  onToggle,
}: {
  state: DashboardState
  balance: number
  onRunRace: () => void
  onToggle: (id: string, status: "active" | "suspended") => void
}) {
  const { pool, agents, activity, counters, lastConflict } = state
  const spark = sparkline(activity.slice(0, 24).map((a) => a.amount).reverse())

  return (
    <div className="ap-page">
      {/* header */}
      <header className="ap-header">
        <div>
          <div className="ap-wordmark">agent {MIDDOT} pool</div>
        </div>
        <div className="ap-cluster">
          <div className="ap-cluster-val">dsql / us-east-1</div>
        </div>
      </header>
      <div className="rule-thick" />

      {/* hero */}
      <section className="ap-hero">
        <div className="ap-hero-left">
          <div className="caps mute">pool balance</div>
          <div className="ap-balance">
            {`$${Math.floor(balance / 100).toLocaleString("en-US")}`}
            <span className="ap-balance-cents">.{String(Math.round(balance % 100)).padStart(2, "0")}</span>
          </div>
          <div className="ap-spark">{spark || " "}</div>
          <div className="caps mute">last 24 spends</div>
        </div>
        <div className="ap-hero-right">
          <div className="caps mute">reservoir</div>
          <Reservoir balance={balance} />
          <button className="ap-runrace" onClick={onRunRace} type="button">
            {`> run race  [ 2 × $80 vs $100 ]`}
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
          return (
            <div key={a.id} className={`ap-agent-row${suspended ? " faint" : ""}`}>
              <span className="ap-agent-info">
                {`us-east-1 ${MIDDOT} ${a.name} ${MIDDOT} cap ${money(a.cap)} ${MIDDOT} `}
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
        {activity.slice(0, 20).map((row) => {
          const pill = row.outcome === "approved" ? "[ approved ]" : "[ denied   ]"
          return (
            <div key={row.id} className="ap-activity-row">
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
      </footer>
    </div>
  )
}

function Reservoir({ balance }: { balance: number }) {
  // high-water mark = the largest balance seen this session, used as tank capacity
  const capRef = useRef(Math.max(balance, 1))
  capRef.current = Math.max(capRef.current, balance, 1)
  const ratio = balance / capRef.current
  const pct = Math.round(ratio * 100)
  return (
    <div className="ap-reservoir">
      <pre className="ap-tank">{reservoir(ratio)}</pre>
      <div className="caps mute">{`pool level ${MIDDOT} ${pct}%`}</div>
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
.ap-reservoir {
  margin: 12px 0 16px;
}
.ap-tank {
  font-family: inherit;
  font-size: 15px;
  line-height: 1;
  letter-spacing: -0.06em;
  color: var(--ink);
  margin: 0 0 8px;
  white-space: pre;
}
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
