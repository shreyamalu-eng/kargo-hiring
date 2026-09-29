import { NextResponse } from "next/server";
import { refreshDrafts } from "@/lib/pipeline";
import type { Role } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Generates briefs for the shortlist and invite/rejection drafts for everyone, in time-boxed batches.
// The client calls this repeatedly until remaining === 0.
export async function POST(req: Request) {
  const { role } = (await req.json().catch(() => ({}))) as { role?: Role };
  const roles: Role[] = role === "PM" || role === "SPM" ? [role] : ["PM", "SPM"];
  let remaining = 0, done = 0;
  let lastError: string | null = null;
  const start = Date.now();
  for (const r of roles) {
    const budget = 50_000 - (Date.now() - start);
    if (budget < 10_000) { remaining += 1; break; }
    const res = await refreshDrafts(r, budget);
    remaining += res.remaining; done += res.done; lastError = res.lastError ?? lastError;
  }
  return NextResponse.json({ done, remaining, lastError });
}
