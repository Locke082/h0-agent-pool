import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";
import { AuroraDSQLPool } from "@aws/aurora-dsql-node-postgres-connector";
import { ClientBase, types } from "pg";
import { attachDatabasePool } from "@vercel/functions";

types.setTypeParser(20, (v) => parseInt(v, 10)); // 20 = OID for int8/bigint

const pool = new AuroraDSQLPool({
  host: process.env.PGHOST!,
  region: process.env.AWS_REGION!,
  user: process.env.PGUSER || "admin",
  database: process.env.PGDATABASE || "postgres",
  port: Number(process.env.PGPORT || 5432),
  customCredentialsProvider: awsCredentialsProvider({
    roleArn: process.env.AWS_ROLE_ARN!,
    clientConfig: { region: process.env.AWS_REGION! },
  }),
});
attachDatabasePool(pool);

// Single query transaction.
export async function query(sql: string, args: unknown[]) {
  return pool.query(sql, args);
}

// Use it for multiple queries transaction.
export async function withConnection<T>(
  fn: (client: ClientBase) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

// Run multiple queries inside a BEGIN/COMMIT transaction, rolling back on error.
export async function tx<T>(
  fn: (client: ClientBase) => Promise<T>,
): Promise<T> {
  return withConnection(async (client) => {
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
