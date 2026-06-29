import { NextResponse } from "next/server";
import { tx } from "@/lib/db/db";

export const dynamic = "force-dynamic";

// Reset the demo to its seeded state: refill the pool to $100, clear the
// activity log, and reactivate any suspended agents — all in one transaction.
export async function POST() {
  try {
    await tx(async (client) => {
      await client.query("DELETE FROM transactions", []);
      await client.query("UPDATE pools SET balance = 10000 WHERE name = 'alpha'", []);
      await client.query("UPDATE agents SET status = 'active' WHERE status <> 'active'", []);
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, reason: "internal_error" }, { status: 500 });
  }
}
