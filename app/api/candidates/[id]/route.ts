import { NextResponse } from "next/server";
import { deleteCandidate, getCandidate, updateCandidate } from "@/lib/db";
import { generateBrief, generateEmail, rankRole, scoreCandidate } from "@/lib/pipeline";
import { listCandidates } from "@/lib/db";
import type { Candidate } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  action?: "save" | "switch" | "rescore" | "regenerate" | "move";
  draft_subject?: string;
  draft_body?: string;
  draft_type?: "invite" | "rejection";
  name?: string;
  email?: string;
};

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const b = (await req.json().catch(() => ({}))) as Body;
  try {
    const c = await getCandidate(id);
    if (c.email_status === "sent" && b.action !== "save") throw new Error("Already sent - nothing to change");

    if (b.action === "move") {
      // Candidate is a stronger fit for the other role: move them. Drafts are regenerated for the new role.
      await updateCandidate(id, {
        applied_role: c.applied_role === "PM" ? "SPM" : "PM",
        brief: null, draft_type: null, draft_subject: null, draft_body: null, draft_locked: false, email_status: "none",
      });
    } else if (b.action === "rescore") {
      await scoreCandidate(id, Date.now() + 50_000);
    } else if (b.action === "switch" || b.action === "regenerate") {
      // Founder overrides the recommendation (or asks for a fresh draft). Locked so re-ranking won't flip it back.
      const type = b.action === "switch" ? (b.draft_type ?? (c.draft_type === "invite" ? "rejection" : "invite")) : (c.draft_type ?? "rejection");
      const patch: Partial<Candidate> = { draft_locked: b.action === "switch" ? true : c.draft_locked, draft_type: type };
      const deadline = Date.now() + 50_000;
      if (type === "invite" && !c.brief) {
        const ranked = rankRole(await listCandidates(c.applied_role), c.applied_role);
        patch.brief = await generateBrief(c, ranked.findIndex((x) => x.id === id) + 1, deadline);
      }
      const e = await generateEmail(c, type, deadline);
      Object.assign(patch, { draft_subject: e.subject, draft_body: e.body, email_status: "draft" });
      await updateCandidate(id, patch);
    } else {
      const patch: Partial<Candidate> = {};
      if (b.draft_subject !== undefined) patch.draft_subject = b.draft_subject;
      if (b.draft_body !== undefined) patch.draft_body = b.draft_body;
      if (b.draft_subject !== undefined || b.draft_body !== undefined) patch.draft_locked = true;
      if (b.name !== undefined || b.email !== undefined)
        patch.personal_details = { ...c.personal_details, ...(b.name !== undefined && { name: b.name.trim() }), ...(b.email !== undefined && { email: b.email.trim() }) };
      await updateCandidate(id, patch);
    }
    return NextResponse.json(await getCandidate(id));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: msg.startsWith("RATE_LIMITED") ? 429 : 400 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    await deleteCandidate(id);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
