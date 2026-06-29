import { tx, query } from "./db/db";

type Result = { ok: true; balance: number } | { ok: false; reason: string };
type Exec = (sql: string, args: unknown[]) => Promise<unknown>;

// Record a denied transaction. INSERT...SELECT pulls pool_id from the agent row
// so the NOT NULL pool_id is always satisfied (and inserts nothing if the agent
// doesn't exist). `exec` is the tx client inside a tx, or `query` for a fresh
// connection once the original tx has aborted.
async function recordDenied(
  exec: Exec,
  agentId: string,
  amount: number,
  reason: string,
  region: string | undefined,
) {
  await exec(
    `INSERT INTO transactions (pool_id, agent_id, amount, outcome, reason, region)
     SELECT pool_id, id, $2, 'denied', $3, $4 FROM agents WHERE id = $1`,
    [agentId, amount, reason, region],
  );
}

async function attempt(
  agentId: string,
  amount: number,
  region: string | undefined,
): Promise<Result> {
  return tx(async (client) => {
    const exec: Exec = (sql, args) => client.query(sql, args);
    const { rows } = await client.query(
      "SELECT id, pool_id, cap, status FROM agents WHERE id = $1 FOR UPDATE",
      [agentId],
    );
    const agent = rows[0];
    if (!agent) return { ok: false, reason: "agent_not_found" }; // COMMIT no-op
    if (agent.status === "suspended") {
      await recordDenied(exec, agentId, amount, "suspended", region);
      return { ok: false, reason: "suspended" };
    }
    if (amount > agent.cap) {
      await recordDenied(exec, agentId, amount, "over_cap", region);
      return { ok: false, reason: "over_cap" };
    }
    const upd = await client.query(
      "UPDATE pools SET balance = balance - $1 WHERE id = $2 RETURNING balance",
      [amount, agent.pool_id],
    );
    await client.query(
      `INSERT INTO transactions (pool_id, agent_id, amount, outcome, region)
       VALUES ($1, $2, $3, 'approved', $4)`,
      [agent.pool_id, agentId, amount, region],
    );
    return { ok: true, balance: upd.rows[0].balance };
  });
}

export async function authorizeSpend({
  agentId,
  amount,
  region,
}: {
  agentId: string;
  amount: number;
  region?: string;
}): Promise<Result> {
  if (!(amount > 0)) {
    await recordDenied(query, agentId, amount, "invalid_amount", region);
    return { ok: false, reason: "invalid_amount" };
  }
  for (let n = 0; n < 2; n++) {
    try {
      return await attempt(agentId, amount, region);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "23514") {
        await recordDenied(query, agentId, amount, "insufficient_pool", region);
        return { ok: false, reason: "insufficient_pool" };
      }
      if (code === "40001") {
        if (n === 0) continue; // retry the whole tx once
        await recordDenied(query, agentId, amount, "serialization_conflict", region);
        return { ok: false, reason: "serialization_conflict" };
      }
      console.error("authorizeSpend failed", err);
      throw err;
    }
  }
  throw new Error("unreachable");
}
