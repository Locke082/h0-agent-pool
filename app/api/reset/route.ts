import { NextResponse } from "next/server";
import { queryOn } from "@/lib/db/db";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await queryOn("primary", "UPDATE pools SET balance = 50000 WHERE name = 'alpha'", []);
    await queryOn("primary", "DELETE FROM transactions", []);
    await queryOn("primary", "UPDATE agents SET status = 'active'", []);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, reason: "internal_error" }, { status: 500 });
  }
}
