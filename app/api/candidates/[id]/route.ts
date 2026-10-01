import { redactSecrets } from "@/lib/db";
import { NextResponse } from "next/server";
import { deleteCandidate, getCandidate, getRoles, updateCandidate } from "@/lib/db";
import { generateBrief, generateEmail, rankRole, scoreCandidate } from "@/lib/pipeline";
import { listCandidates } from "@/lib/db";
import type { Candidate } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  action?: "save" | "switch" | "rescore" | "regenerate" | "move" | "questions";
  draft_subject?: string;
  draft_body?: string;
  draft_type?: "invite" | "rejection";
  to?: string;
  name?: string;
  email?: string;
};

/** "Under the hood": the exact redacted text the AI was given for this CV, and which model scored it. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const c = await getCandidate(id);
    const pd = c.personal_details ?? {};
    return NextResponse.json({
      cv_text: c.cv_text ?? "",
      model: process.env.GEMINI_MODEL || "gemini-3.5-flash",
      withheld: { name: !!pd.name, email: !!pd.email, phone: !!pd.phone, links: Array.isArray(pd.links) ? pd.links.length : 0 },
    });
  } catch (e) {
    return NextResponse.json({ error: redactSecrets(e instanceof Error ? e.message : String(e)) }, { status: 404 });
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const b = (await req.json().catch(() => ({}))) as Body;
  try {
    const c = await getCandidate(id);
    if (c.email_status === "sent" && b.action !== "save" && b.action !== "questions") throw new Error("Already sent - nothing to change");

    if (b.action === "move") {
      // Candidate is a stronger fit for the other role: move them. Drafts are regenerated for the new role.
      const roles = (await getRoles()).map((r) => r.key).filter((k) => k !== c.applied_role);
      const best = roles.sort((a, b) => (c.scores?.[b]?.total ?? 0) - (c.scores?.[a]?.total ?? 0))[0];
      const to = b.to && roles.includes(b.to) ? b.to : best;
      if (!to) throw new Error("There is no other open role to move this candidate to");
      await updateCandidate(id, {
        applied_role: to,
        brief: null, interview_questions: null, draft_type: null, draft_subject: null, draft_body: null, draft_locked: false, email_status: "none",
      });
    } else if (b.action === "questions") {
      // Interview questions on demand (also for people below the shortlist line), with a fresh brief.
      const ranked = rankRole(await listCandidates(c.applied_role), c.applied_role);
      const pack = await generateBrief(c, ranked.findIndex((x) => x.id === id) + 1, Date.now() + 50_000);
      await updateCandidate(id, { brief: pack.brief, interview_questions: pack.questions });
    } else if (b.action === "rescore") {
      await scoreCandidate(id, Date.now() + 50_000);
    } else if (b.action === "switch" || b.action === "regenerate") {
      // Founder overrides the recommendation (or asks for a fresh draft). Locked so re-ranking won't flip it back.
      const type = b.action === "switch" ? (b.draft_type ?? (c.draft_type === "invite" ? "rejection" : "invite")) : (c.draft_type ?? "rejection");
      const patch: Partial<Candidate> = { draft_locked: b.action === "switch" ? true : c.draft_locked, draft_type: type };
      const deadline = Date.now() + 50_000;
      if (type === "invite" && (!c.brief || !c.interview_questions?.length)) {
        const ranked = rankRole(await listCandidates(c.applied_role), c.applied_role);
        const pack = await generateBrief(c, ranked.findIndex((x) => x.id === id) + 1, deadline);
        patch.brief = pack.brief;
        patch.interview_questions = pack.questions;
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
    const msg = redactSecrets(e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: msg }, { status: msg.startsWith("RATE_LIMITED") ? 429 : 400 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    await deleteCandidate(id);
  } catch (e) {
    return NextResponse.json({ error: redactSecrets(e instanceof Error ? e.message : String(e)) }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
