import { redactSecrets } from "@/lib/db";
import { NextResponse } from "next/server";
import { sendCandidateEmail } from "@/lib/email";

export const runtime = "nodejs";

// The only way an email leaves the system: the founder clicks Confirm & send on one card.
export async function POST(req: Request) {
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  try {
    const c = await sendCandidateEmail(id);
    return NextResponse.json({ ok: true, sent_at: c.sent_at, sent_to: c.sent_to });
  } catch (e) {
    return NextResponse.json({ error: redactSecrets(e instanceof Error ? e.message : String(e)) }, { status: 400 });
  }
}
