import { queryOn } from "./db/db";

// Dashboard reads always hit the primary pool — single source of truth
// (writes replicate cross-region, so primary reflects everything).
const query = (sql: string, args: unknown[]) => queryOn("primary", sql, args);

export type DashboardState = {
  pool: { id: string; name: string; balance: number }; // balance in cents
  agents: Array<{
    id: string;
    name: string;
    cap: number;
    status: "active" | "suspended";
    spent: number; // cumulative approved spend in cents, across ALL transactions
  }>;
  activity: Array<{
    id: string;
    agentName: string;
    amount: number; // cents, always positive in DB
    outcome: "approved" | "denied";
    reason: string | null;
    region: string | null;
    createdAt: string; // ISO string
  }>;
  counters: { spends: number; approved: number; denied: number; serialization: number }; // last 100 transactions
  lastConflict: { agentName: string; createdAt: string; secondsAgo: number } | null; // last 'serialization_conflict'
};

type Row = Record<string, any>;

function toActivity(r: Row): DashboardState["activity"][number] {
  return {
    id: r.id,
    agentName: r.agent_name,
    amount: r.amount,
    outcome: r.outcome,
    reason: r.reason,
    region: r.region,
    createdAt: r.created_at.toISOString(),
  };
}

async function agentNames(): Promise<Map<string, string>> {
  const { rows } = await query("SELECT id, name FROM agents", []);
  return new Map(rows.map((a: Row) => [a.id, a.name]));
}

// JOIN first; fall back to two queries + JS merge if DSQL rejects the JOIN.
async function fetchActivity(): Promise<DashboardState["activity"]> {
  try {
    const { rows } = await query(
      `SELECT t.id, a.name AS agent_name, t.amount, t.outcome, t.reason, t.region, t.created_at
       FROM transactions t JOIN agents a ON a.id = t.agent_id
       ORDER BY t.created_at DESC LIMIT 30`,
      [],
    );
    return rows.map(toActivity);
  } catch {
    const [{ rows }, names] = await Promise.all([
      query(
        "SELECT id, agent_id, amount, outcome, reason, region, created_at FROM transactions ORDER BY created_at DESC LIMIT 30",
        [],
      ),
      agentNames(),
    ]);
    return rows.map((r: Row) => toActivity({ ...r, agent_name: names.get(r.agent_id) ?? "" }));
  }
}

async function fetchLastConflict(): Promise<DashboardState["lastConflict"]> {
  try {
    const { rows } = await query(
      `SELECT a.name AS agent_name, t.created_at,
              EXTRACT(EPOCH FROM (now() - t.created_at))::int AS seconds_ago
       FROM transactions t JOIN agents a ON a.id = t.agent_id
       WHERE t.reason = 'serialization_conflict' ORDER BY t.created_at DESC LIMIT 1`,
      [],
    );
    const r = rows[0];
    return r ? { agentName: r.agent_name, createdAt: r.created_at.toISOString(), secondsAgo: r.seconds_ago } : null;
  } catch {
    const { rows } = await query(
      `SELECT agent_id, created_at, EXTRACT(EPOCH FROM (now() - created_at))::int AS seconds_ago
       FROM transactions WHERE reason = 'serialization_conflict' ORDER BY created_at DESC LIMIT 1`,
      [],
    );
    const r = rows[0];
    if (!r) return null;
    const names = await agentNames();
    return { agentName: names.get(r.agent_id) ?? "", createdAt: r.created_at.toISOString(), secondsAgo: r.seconds_ago };
  }
}

// Agents with their authoritative cumulative approved spend (across ALL
// transactions, not the 30-row activity window). JOIN+GROUP BY first; fall back
// to two queries merged in JS if DSQL rejects the combo.
async function fetchAgents(): Promise<DashboardState["agents"]> {
  const toAgent = (a: Row) => ({
    id: a.id,
    name: a.name,
    cap: a.cap,
    status: a.status as "active" | "suspended",
    spent: a.spent ?? 0,
  });
  try {
    const { rows } = await query(
      `SELECT a.id, a.name, a.cap, a.status,
              COALESCE(SUM(t.amount) FILTER (WHERE t.outcome = 'approved'), 0)::bigint AS spent
       FROM agents a LEFT JOIN transactions t ON t.agent_id = a.id
       GROUP BY a.id, a.name, a.cap, a.status
       ORDER BY a.name`,
      [],
    );
    return rows.map(toAgent);
  } catch {
    const [{ rows: agents }, { rows: sums }] = await Promise.all([
      query("SELECT id, name, cap, status FROM agents ORDER BY name", []),
      query(
        `SELECT agent_id, COALESCE(SUM(amount) FILTER (WHERE outcome = 'approved'), 0)::bigint AS spent
         FROM transactions GROUP BY agent_id`,
        [],
      ),
    ]);
    const spentByAgent = new Map<string, number>(sums.map((s: Row) => [s.agent_id, s.spent]));
    return agents.map((a: Row) => toAgent({ ...a, spent: spentByAgent.get(a.id) ?? 0 }));
  }
}

export async function getDashboardState(): Promise<DashboardState> {
  const [poolRes, agents, activity, countersRes, lastConflict] = await Promise.all([
    query("SELECT id, name, balance FROM pools WHERE name = 'alpha' LIMIT 1", []),
    fetchAgents(),
    fetchActivity(),
    query(
      `SELECT COUNT(*) AS spends,
              COUNT(*) FILTER (WHERE outcome = 'approved') AS approved,
              COUNT(*) FILTER (WHERE outcome = 'denied') AS denied,
              COUNT(*) FILTER (WHERE reason = 'serialization_conflict') AS serialization
       FROM (SELECT outcome, reason FROM transactions ORDER BY created_at DESC LIMIT 100) recent`,
      [],
    ),
    fetchLastConflict(),
  ]);
  const p = poolRes.rows[0];
  const c = countersRes.rows[0];
  return {
    pool: { id: p.id, name: p.name, balance: p.balance },
    agents,
    activity,
    counters: { spends: c.spends, approved: c.approved, denied: c.denied, serialization: c.serialization },
    lastConflict,
  };
}
