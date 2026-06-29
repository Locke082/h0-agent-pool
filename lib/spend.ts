import { txOn, queryOn, type Region } from "./db/db";

type Result = { ok: true; balance: number } | { ok: false; reason: string };
type Exec = (sql: string, args: unknown[]) => Promise<unknown>;

// Record a denied transaction. INSERT...SELECT pulls pool_id from the agent row
// so the NOT NULL pool_id is always satisfied (and inserts nothing if the agent
// doesn't exist). `exec` is the tx client inside a tx, or a region-bound queryOn
// for a fresh connection once the original tx has aborted. `regionLabel` is the
// human-facing region string stored in transactions.region (e.g. "eu-west-1").
async function recordDenied(
  exec: Exec,
  agentId: string,
  amount: number,
  reason: string,
  regionLabel: string | undefined,
) {
  await exec(
    `INSERT INTO transactions (pool_id, agent_id, amount, outcome, reason, region)
     SELECT pool_id, id, $2, 'denied', $3, $4 FROM agents WHERE id = $1`,
    [agentId, amount, reason, regionLabel],
  );
}

async function attempt(
  region: Region,
  agentId: string,
  amount: number,
  regionLabel: string | undefined,
): Promise<Result> {
  return txOn(region, async (client) => {
    const exec: Exec = (sql, args) => client.query(sql, args);
    const { rows } = await client.query(
      "SELECT id, pool_id, cap, status FROM agents WHERE id = $1 FOR UPDATE",
      [agentId],
    );
    const agent = rows[0];
    if (!agent) return { ok: false, reason: "agent_not_found" }; // COMMIT no-op
    if (agent.status === "suspended") {
      await recordDenied(exec, agentId, amount, "suspended", regionLabel);
      return { ok: false, reason: "suspended" };
    }
    if (amount > agent.cap) {
      await recordDenied(exec, agentId, amount, "over_cap", regionLabel);
      return { ok: false, reason: "over_cap" };
    }
    const upd = await client.query(
      "UPDATE pools SET balance = balance - $1 WHERE id = $2 RETURNING balance",
      [amount, agent.pool_id],
    );
    await client.query(
      `INSERT INTO transactions (pool_id, agent_id, amount, outcome, region)
       VALUES ($1, $2, $3, 'approved', $4)`,
      [agent.pool_id, agentId, amount, regionLabel],
    );
    return { ok: true, balance: upd.rows[0].balance };
  });
}

export async function authorizeSpend({
  agentId,
  amount,
  region = "primary",
  regionLabel,
}: {
  agentId: string;
  amount: number;
  region?: Region; // routing: which regional pool to spend against
  regionLabel?: string; // display: stored in transactions.region
}): Promise<Result> {
  // Fresh-connection denial path uses the same region's pool as the tx.
  const denyOn: Exec = (sql, args) => queryOn(region, sql, args);
  if (!(amount > 0)) {
    await recordDenied(denyOn, agentId, amount, "invalid_amount", regionLabel);
    return { ok: false, reason: "invalid_amount" };
  }
  // Up to 4 attempts (1 original + 3 retries) on serialization failures.
  const MAX_ATTEMPTS = 4;
  for (let n = 0; n < MAX_ATTEMPTS; n++) {
    try {
      return await attempt(region, agentId, amount, regionLabel);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "23514") {
        // CHECK violation = pool genuinely too low; not transient, no retry.
        await recordDenied(denyOn, agentId, amount, "insufficient_pool", regionLabel);
        return { ok: false, reason: "insufficient_pool" };
      }
      if (code === "40001") {
        if (n < MAX_ATTEMPTS - 1) {
          // serialization failure is transient; back off (5-20ms jitter) and retry
          await new Promise((r) => setTimeout(r, 5 + Math.random() * 15));
          continue;
        }
        await recordDenied(denyOn, agentId, amount, "serialization_conflict", regionLabel);
        return { ok: false, reason: "serialization_conflict" };
      }
      console.error("authorizeSpend failed", err);
      throw err;
    }
  }
  throw new Error("unreachable");
}
