import "server-only";
import { Type } from "@google/genai";
import { findCandidateByFile, getCandidate, getRubric, insertCandidate, listCandidates, updateCandidate } from "./db";
import { extractText, splitPersonalDetails } from "./extract";
import { generateJson } from "./gemini";
import { ROLES, ROLE_TITLE, roleScore, shortlistSize, type Candidate, type Criterion, type Role, type RoleScore } from "./types";

// ---------------------------------------------------------------------------
// 1. Ingest: file -> personal details (stored, never sent to AI) + redacted CV text
// ---------------------------------------------------------------------------
export async function ingest(file: File, role: Role): Promise<Candidate> {
  const buf = Buffer.from(await file.arrayBuffer());
  const raw = await extractText(buf, file.name);
  if (raw.replace(/\s/g, "").length < 200)
    throw new Error("Could not read text from this file (is it a scanned image?). Upload a text-based PDF or DOCX.");
  const { personal, cvText } = splitPersonalDetails(raw, file.name);

  // Re-uploading the same file for the same role replaces the earlier row instead of duplicating it.
  const existing = await findCandidateByFile(file.name, role);
  if (existing?.email_status === "sent") throw new Error("This candidate has already been emailed - not re-processing.");

  const row = {
    applied_role: role,
    file_name: file.name,
    personal_details: personal,
    cv_text: cvText,
    status: "processing" as const,
    error: null,
    scores: null,
    pm_score: null,
    spm_score: null,
    headline: null,
    brief: null,
    draft_type: null,
    draft_locked: false,
    draft_subject: null,
    draft_body: null,
    email_status: "none" as const,
  };
  if (existing) {
    await updateCandidate(existing.id, row);
    return getCandidate(existing.id);
  }
  return insertCandidate(row);
}

// ---------------------------------------------------------------------------
// 2. Score against BOTH rubrics (AI sees only the redacted CV text)
// ---------------------------------------------------------------------------
const scoreItem = {
  type: Type.OBJECT,
  properties: {
    key: { type: Type.STRING },
    score: { type: Type.INTEGER, description: "0-5" },
    reason: { type: Type.STRING, description: "One line citing the specific CV evidence (or its absence)" },
  },
  required: ["key", "score", "reason"],
  propertyOrdering: ["key", "reason", "score"],
};
const scoreSchema = {
  type: Type.OBJECT,
  properties: {
    headline: { type: Type.STRING, description: "Max 18 words, anonymised: current role, years, domain. No names." },
    PM: { type: Type.ARRAY, items: scoreItem },
    SPM: { type: Type.ARRAY, items: scoreItem },
  },
  required: ["headline", "PM", "SPM"],
  propertyOrdering: ["headline", "PM", "SPM"],
};

function rubricBlock(rubric: Criterion[], role: Role) {
  return rubric
    .filter((c) => c.role === role)
    .map((c) => `- key: ${c.key}\n  name: ${c.name} (weight ${c.weight}%)\n  what strong looks like: ${c.description}`)
    .join("\n");
}

export async function scoreCandidate(id: string, deadline = Date.now() + 50_000): Promise<Candidate> {
  const c = await getCandidate(id);
  const rubric = await getRubric();
  const prompt = `You are scoring a CV for Kargo, a Series A logistics SaaS company in Mumbai, against a hiring rubric
built from the company's own best past hires. Score strictly on evidence written in the CV. Do not reward
years of experience, titles, company prestige, certifications or buzzwords on their own. If there is no evidence
for a criterion, score it 0-1 and say what is missing. Every reason must point to something specific in the CV.
Personal details have been redacted ([CANDIDATE], [EMAIL], [PHONE], [LINK]) - never guess or mention them.

Score this CV against BOTH rubrics below (regardless of the role applied for), using this scale:
5 = strong, specific evidence exactly as described · 3-4 = partial · 1-2 = weak/indirect · 0 = none.
Return one item per criterion key, for each role.

PM RUBRIC:
${rubricBlock(rubric, "PM")}

SPM RUBRIC (same criteria, higher bar):
${rubricBlock(rubric, "SPM")}

CV (redacted):
"""
${c.cv_text}
"""`;

  type Raw = { headline: string } & Record<Role, { key: string; score: number; reason: string }[]>;
  const out = await generateJson<Raw>(prompt, scoreSchema, { deadline });

  const scores: Partial<Record<Role, RoleScore>> = {};
  for (const role of ROLES) {
    const criteria = rubric
      .filter((r) => r.role === role)
      .map((r) => {
        const hit = out[role]?.find((x) => x.key === r.key);
        const score = Math.max(0, Math.min(5, Math.round(Number(hit?.score ?? 0))));
        return { key: r.key, name: r.name, weight: r.weight, score, reason: hit?.reason ?? "Not scored" };
      });
    const total = Math.round(criteria.reduce((a, x) => a + (x.weight * x.score) / 5, 0) * 10) / 10;
    scores[role] = { total, criteria };
  }

  await updateCandidate(id, {
    scores,
    pm_score: scores.PM!.total,
    spm_score: scores.SPM!.total,
    headline: out.headline?.slice(0, 200) ?? null,
    status: "scored",
    error: null,
  });
  return getCandidate(id);
}

// ---------------------------------------------------------------------------
// 3. Brief (shortlisted) and 4. draft email (everyone) - still no personal details sent
// ---------------------------------------------------------------------------
function scoreSummary(c: Candidate, role: Role) {
  const s = c.scores?.[role];
  if (!s) return "";
  return s.criteria.map((x) => `- ${x.name} (${x.weight}%): ${x.score}/5 - ${x.reason}`).join("\n") + `\nTotal: ${s.total}/100`;
}

export async function generateBrief(c: Candidate, rank: number, deadline?: number): Promise<string> {
  const role = c.applied_role;
  const prompt = `Write a 3-sentence interview brief for Arjun, Kargo's founder, who will interview this candidate for the
${ROLE_TITLE[role]} role. Exactly three sentences, plain text, no bullet points, no names (say "the candidate"):
1) who they are - their background in one line;
2) why the system ranked them #${rank} for ${role} - name the rubric criteria that drove it, with the CV evidence;
3) what Arjun should probe in the interview - the weakest or least-evidenced criterion, as a concrete question to ask.

Rubric scores:
${scoreSummary(c, role)}

CV (redacted):
"""
${(c.cv_text ?? "").slice(0, 12000)}
"""`;
  const out = await generateJson<{ brief: string }>(
    prompt,
    { type: Type.OBJECT, properties: { brief: { type: Type.STRING } }, required: ["brief"] },
    { deadline, temperature: 0.3 }
  );
  return out.brief.trim();
}

export async function generateEmail(c: Candidate, type: "invite" | "rejection", deadline?: number) {
  const role = ROLE_TITLE[c.applied_role];
  const instructions =
    type === "invite"
      ? `An interview invitation. Warm and direct. Mention ONE specific thing from their CV that stood out (from the
strongest rubric criterion) so it is clearly not a template. Invite them to a 45-minute conversation with Arjun
in Mumbai or on video, and ask them to reply with two or three times that work next week. Under 150 words.`
      : `A kind rejection. Thank them for applying and for their patience (the process has taken longer than it
should). Be honest that Kargo is moving forward with candidates whose experience is closer to what this role
needs right now, and name one genuine strength from their CV. No scores, no rubric language, no false promises,
no "we'll keep your CV on file" unless you mean it - instead say they are welcome to apply for future roles.
Under 120 words.`;
  const prompt = `Draft an email from Arjun Mehta, Founder of Kargo (Series A logistics SaaS, Mumbai), to a candidate who applied
for the ${role} role. ${instructions}

Rules: plain text. Start the body with "Hi [NAME]," - use the literal placeholder [NAME] and never invent a name.
Sign off as:
Arjun Mehta
Founder, Kargo

Rubric scores for context (do not quote them):
${scoreSummary(c, c.applied_role)}

CV (redacted):
"""
${(c.cv_text ?? "").slice(0, 8000)}
"""`;
  const out = await generateJson<{ subject: string; body: string }>(
    prompt,
    {
      type: Type.OBJECT,
      properties: { subject: { type: Type.STRING }, body: { type: Type.STRING } },
      required: ["subject", "body"],
      propertyOrdering: ["subject", "body"],
    },
    { deadline, temperature: 0.5 }
  );
  let body = out.body.trim();
  if (!body.includes("[NAME]")) body = body.replace(/^(Hi|Hello|Dear)\s+[^,\n]*,/i, "$1 [NAME],");
  return { subject: out.subject.trim(), body };
}

// ---------------------------------------------------------------------------
// Ranking + keeping briefs/drafts in sync with the ranking
// ---------------------------------------------------------------------------
export function rankRole(all: Candidate[], role: Role) {
  return all
    .filter((c) => c.applied_role === role && c.status === "scored")
    .sort((a, b) => roleScore(b, role) - roleScore(a, role) || a.created_at.localeCompare(b.created_at));
}

/** What still needs generating, per candidate, given the current ranking. */
export function pendingWork(all: Candidate[], role: Role) {
  const n = shortlistSize();
  const ranked = rankRole(all, role);
  const work: { c: Candidate; rank: number; needBrief: boolean; draftType: "invite" | "rejection" | null }[] = [];
  ranked.forEach((c, i) => {
    if (c.email_status === "sent") return;
    const recommended = i < n ? "invite" : "rejection";
    const wanted = c.draft_locked && c.draft_type ? c.draft_type : recommended;
    const needBrief = wanted === "invite" && !c.brief;
    const draftType = c.draft_type !== wanted || !c.draft_body ? wanted : null;
    if (needBrief || draftType) work.push({ c, rank: i + 1, needBrief, draftType });
  });
  return work;
}

/** Generates missing briefs/drafts until the time budget runs out. Returns how many are still pending. */
export async function refreshDrafts(role: Role, budgetMs = 45_000) {
  const deadline = Date.now() + budgetMs;
  const all = await listCandidates(role);
  const work = pendingWork(all, role);
  let done = 0;
  let lastError: string | null = null;
  for (const w of work) {
    if (Date.now() > deadline - 8_000) break;
    try {
      const patch: Partial<Candidate> = {};
      if (w.needBrief) patch.brief = await generateBrief(w.c, w.rank, deadline);
      if (w.draftType) {
        const e = await generateEmail(w.c, w.draftType, deadline);
        Object.assign(patch, { draft_type: w.draftType, draft_subject: e.subject, draft_body: e.body, email_status: "draft" });
      }
      await updateCandidate(w.c.id, patch);
      done++;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      if (lastError.startsWith("RATE_LIMITED")) break;
    }
  }
  return { done, remaining: work.length - done, lastError };
}
