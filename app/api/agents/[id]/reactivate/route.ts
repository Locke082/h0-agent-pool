import { NextResponse } from "next/server";
import { query } from "@/lib/db/db";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const upd = await query(
      "UPDATE agents SET status = 'active' WHERE id = $1 AND status = 'suspended'",
      [id],
    );
    if (upd.rowCount === 0) {
      const { rows } = await query("SELECT 1 FROM agents WHERE id = $1", [id]);
      if (rows.length === 0)
        return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, reason: "internal_error" }, { status: 500 });
  }
}
