import { NextResponse } from "next/server";
import { redactSecrets } from "@/lib/db";
import { suggestCriteria } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const b = await req.json();
    const criteria = await suggestCriteria(String(b.title ?? ""), String(b.requirements ?? ""));
    return NextResponse.json({ criteria });
  } catch (e) {
    const msg = redactSecrets(e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: msg }, { status: /^(RATE_LIMITED|DAILY_LIMIT)/.test(msg) ? 429 : 400 });
  }
}
