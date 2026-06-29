import { NextResponse } from "next/server";
import { getDashboardState } from "@/lib/state";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    return NextResponse.json(await getDashboardState());
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
