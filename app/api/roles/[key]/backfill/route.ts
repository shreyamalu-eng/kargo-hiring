import { NextResponse } from "next/server";
import { redactSecrets } from "@/lib/db";
import { backfillRole } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

// Scores CVs that were uploaded before this role existed (or before its criteria changed, with ?all=1).
export async function POST(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  try {
    return NextResponse.json(await backfillRole(key, 45_000));
  } catch (e) {
    return NextResponse.json({ error: redactSecrets(e instanceof Error ? e.message : String(e)) }, { status: 400 });
  }
}
