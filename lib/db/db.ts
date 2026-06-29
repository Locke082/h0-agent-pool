import { AuroraDSQLPool } from "@aws/aurora-dsql-node-postgres-connector";
import { ClientBase, types } from "pg";
import { attachDatabasePool } from "@vercel/functions";

types.setTypeParser(20, (v) => parseInt(v, 10)); // 20 = OID for int8/bigint

export type Region = "primary" | "secondary";

// Shared connection settings. Credentials come from the AWS SDK default chain
// (AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY in env).
const base = {
  user: process.env.PGUSER || "admin",
  database: process.env.PGDATABASE || "postgres",
  port: Number(process.env.PGPORT || 5432),
};

const poolPrimary = new AuroraDSQLPool({
  ...base,
  host: process.env.PGHOST_PRIMARY!,
  region: process.env.AWS_REGION_PRIMARY!,
});

const poolSecondary = new AuroraDSQLPool({
  ...base,
  host: process.env.PGHOST_SECONDARY!,
  region: process.env.AWS_REGION_SECONDARY!,
});

attachDatabasePool(poolPrimary);
attachDatabasePool(poolSecondary);

export function getPool(region: Region = "primary") {
  return region === "secondary" ? poolSecondary : poolPrimary;
}

// Single query. Defaults to the primary region.
export async function query(sql: string, args: unknown[]) {
  return queryOn("primary", sql, args);
}

export async function queryOn(region: Region, sql: string, args: unknown[]) {
  return getPool(region).query(sql, args);
}

// Multiple queries on one connection. Defaults to the primary region.
export async function withConnection<T>(
  fn: (client: ClientBase) => Promise<T>,
): Promise<T> {
  return withConnectionOn("primary", fn);
}

export async function withConnectionOn<T>(
  region: Region,
  fn: (client: ClientBase) => Promise<T>,
): Promise<T> {
  const client = await getPool(region).connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

// BEGIN/COMMIT transaction, rolling back on error. Defaults to the primary region.
export async function tx<T>(fn: (client: ClientBase) => Promise<T>): Promise<T> {
  return txOn("primary", fn);
}

export async function txOn<T>(
  region: Region,
  fn: (client: ClientBase) => Promise<T>,
): Promise<T> {
  return withConnectionOn(region, async (client) => {
    await client.query("BEGIN");
    try {
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}
