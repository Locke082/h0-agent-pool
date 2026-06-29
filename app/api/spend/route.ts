import { NextResponse } from "next/server";
import { authorizeSpend } from "@/lib/spend";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { agentId, amount, region, regionLabel } = await req.json();
    if (
      typeof agentId !== "string" ||
      agentId.length === 0 ||
      typeof amount !== "number" ||
      !Number.isInteger(amount) ||
      amount <= 0
    ) {
      return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
    }
    // routing region: only 'primary'/'secondary' are valid; anything else -> primary
    const route = region === "secondary" ? "secondary" : "primary";
    const label = typeof regionLabel === "string" ? regionLabel : undefined;
    const result = await authorizeSpend({ agentId, amount, region: route, regionLabel: label });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ ok: false, reason: "internal_error" }, { status: 500 });
  }
}
