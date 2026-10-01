import "server-only";
import { Type } from "@google/genai";
import { redactSecrets, findCandidateByFile, getCandidate, getRubric, getRole, getRoles, insertCandidate, listCandidates, updateCandidate } from "./db";
import { extractText, splitPersonalDetails } from "./extract";
import { generateJson } from "./gemini";
import { criteriaSig, roleScore, type Candidate, type Criterion, type InterviewQuestion, type Role, type RoleDef, type RoleScore } from "./types";

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
    interview_questions: null,
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
// 2. Score against EVERY open role's rubric (AI sees only the redacted CV text)
// ---------------------------------------------------------------------------
const scoreSchema = {
  type: Type.OBJECT,
  properties: {
    is_cv: { type: Type.BOOLEAN, description: "true only if this document is a person's CV/resume (not a job description, cover letter or other document)" },
    headline: { type: Type.STRING, description: "Max 18 words, anonymised: current role, years, domain. No names." },
    scores: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          role: { type: Type.STRING, description: "role key exactly as given" },
          key: { type: Type.STRING, description: "criterion key exactly as given" },
          reason: { type: Type.STRING, description: "One line citing the specific CV evidence (or its absence)" },
          score: { type: Type.INTEGER, description: "0-5" },
        },
        required: ["role", "key", "reason", "score"],
        propertyOrdering: ["role", "key", "reason", "score"],
      },
    },
  },
  required: ["is_cv", "headline", "scores"],
  propertyOrdering: ["is_cv", "headline", "scores"],
};

function rubricBlock(rubric: Criterion[], role: RoleDef) {
  return `ROLE key=${role.key}: ${role.title}${role.requirements ? `\nWhat the role needs: ${role.requirements.slice(0, 900)}` : ""}
Criteria:
${rubric
  .filter((c) => c.role === role.key)
  .map((c) => `- key: ${c.key}\n  name: ${c.name} (weight ${c.weight}%)\n  what strong looks like: ${c.description}`)
  .join("\n")}`;
}

/**
 * Scores a CV against every open role (or only `onlyRoles`, e.g. when a new role is added).
 * New scores are merged into the existing ones.
 */
export async function scoreCandidate(id: string, deadline = Date.now() + 50_000, onlyRoles?: Role[]): Promise<Candidate> {
  const c = await getCandidate(id);
  const [rubric, allRoles] = await Promise.all([getRubric(), getRoles()]);
  const roles = allRoles.filter((r) => (onlyRoles ? onlyRoles.includes(r.key) : true) && rubric.some((x) => x.role === r.key));
  if (!roles.length) throw new Error("No open role has scoring criteria yet. Add criteria on the Roles page.");
  const prompt = `You are scoring a CV for Kargo, a Series A logistics SaaS company in Mumbai, against hiring rubrics
built from the company's own best past hires. Score strictly on evidence written in the CV. Do not reward
years of experience, titles, company prestige, certifications or buzzwords on their own. If there is no evidence
for a criterion, score it 0-1 and say what is missing. Every reason must point to something specific in the CV.
Personal details have been redacted ([CANDIDATE], [EMAIL], [PHONE], [LINK]) - never guess or mention them.

Score this CV against EVERY role below (regardless of the role applied for), using this scale:
5 = strong, specific evidence exactly as described · 3-4 = partial · 1-2 = weak/indirect · 0 = none.
Return one item per criterion per role, using the role key and criterion key exactly as written.

${roles.map((r) => rubricBlock(rubric, r)).join("\n\n")}

CV (redacted):
"""
${c.cv_text}
"""`;

  type Raw = { is_cv?: boolean; headline: string; scores: { role: string; key: string; score: number; reason: string }[] };
  const out = await generateJson<Raw>(prompt, scoreSchema, { deadline });
  if (!onlyRoles && (out.is_cv === false || /^job description/i.test(out.headline ?? ""))) {
    throw new Error("NOT_A_CV: This looks like a job description or another document, not a candidate's CV. Remove it or upload the right file.");
  }

  const scores: Record<Role, RoleScore> = { ...(c.scores ?? {}) };
  for (const role of roles) {
    const criteria = rubric
      .filter((r) => r.role === role.key)
      .map((r) => {
        const hit = out.scores?.find((x) => x.role === role.key && x.key === r.key);
        const score = Math.max(0, Math.min(5, Math.round(Number(hit?.score ?? 0))));
        return { key: r.key, name: r.name, weight: r.weight, score, reason: hit?.reason ?? "Not scored" };
      });
    const weightSum = criteria.reduce((a, x) => a + x.weight, 0) || 100;
    const total = Math.round((criteria.reduce((a, x) => a + (x.weight * x.score) / 5, 0) * 1000) / weightSum) / 10;
    scores[role.key] = { total, criteria, sig: criteriaSig(rubric.filter((r) => r.role === role.key)) };
  }

  const patch: Partial<Candidate> = {
    scores,
    pm_score: scores.PM?.total ?? null,
    spm_score: scores.SPM?.total ?? null,
  };
  if (!onlyRoles) Object.assign(patch, { headline: out.headline?.slice(0, 200) ?? null, status: "scored", error: null });
  await updateCandidate(id, patch);
  return getCandidate(id);
}

/** Scores already-uploaded CVs against a role they haven't been scored for (e.g. a new role). */
export async function backfillRole(roleKey: Role, budgetMs = 45_000) {
  const deadline = Date.now() + budgetMs;
  const sig = criteriaSig(await getRubric().then((r) => r.filter((x) => x.role === roleKey)));
  // Missing a score for this role, or scored with an older version of its criteria.
  const all = (await listCandidates()).filter((c) => c.status === "scored" && (!c.scores?.[roleKey] || (c.scores[roleKey].sig ?? sig) !== sig));
  let done = 0;
  let lastError: string | null = null;
  for (const c of all) {
    if (Date.now() > deadline - 10_000) break;
    try { await scoreCandidate(c.id, deadline, [roleKey]); done++; }
    catch (e) {
      lastError = redactSecrets(e instanceof Error ? e.message : String(e));
      if (/^(RATE_LIMITED|DAILY_LIMIT)/.test(lastError)) break;
    }
  }
  return { done, remaining: all.length - done, lastError };
}

// ---------------------------------------------------------------------------
// 3. Brief (shortlisted) and 4. draft email (everyone) - still no personal details sent
// ---------------------------------------------------------------------------
function scoreSummary(c: Candidate, role: Role) {
  const s = c.scores?.[role];
  if (!s) return "";
  return s.criteria.map((x) => `- ${x.name} (${x.weight}%): ${x.score}/5 - ${x.reason}`).join("\n") + `\nTotal: ${s.total}/100`;
}

export type BriefPack = { brief: string; questions: InterviewQuestion[] };

/** One AI call writes the 3-sentence brief and the tailored interview questions together. */
export async function generateBrief(c: Candidate, rank: number, deadline?: number): Promise<BriefPack> {
  const role = c.applied_role;
  const def = await getRole(role);
  const prompt = `You are preparing Arjun, Kargo's founder, to interview this candidate for the ${def?.title ?? role} role.
Never use names (say "the candidate").

A) "brief": exactly three sentences, plain text:
1) who they are - their background in one line;
2) why the system ranked them #${rank} - name the rubric criteria that drove it, with the CV evidence;
3) what to probe - the weakest or least-evidenced criterion.

B) "questions": 6 interview questions written for THIS candidate, each tied to a rubric criterion:
- 3 of kind "probe": the weakest or least-evidenced criteria. Ask for a specific past situation, not a hypothetical.
- 2 of kind "verify": the strongest CV claims. Ask for the concrete detail that only someone who did it would know
  (numbers, who used it, what broke, what they changed).
- 1 of kind "role": the most important requirement of the role that the CV says little about.
Each question: one or two sentences, refers to something specific in the CV, plain conversational English.
"listen_for": one short sentence on what a strong answer contains (or a red flag).
"criterion": the exact rubric criterion name it tests (for "role", use "Role fit").
${def?.requirements ? `\nRole requirements:\n${def.requirements.slice(0, 2000)}\n` : ""}
Rubric scores:
${scoreSummary(c, role)}

CV (redacted):
"""
${(c.cv_text ?? "").slice(0, 12000)}
"""`;
  const out = await generateJson<BriefPack>(
    prompt,
    {
      type: Type.OBJECT,
      properties: {
        brief: { type: Type.STRING },
        questions: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              kind: { type: Type.STRING, enum: ["probe", "verify", "role"] },
              criterion: { type: Type.STRING },
              question: { type: Type.STRING },
              listen_for: { type: Type.STRING },
            },
            required: ["kind", "criterion", "question", "listen_for"],
          },
        },
      },
      required: ["brief", "questions"],
    },
    { deadline, temperature: 0.4 }
  );
  const order = { probe: 0, verify: 1, role: 2 } as const;
  const questions = (out.questions ?? [])
    .filter((q) => q?.question?.trim())
    .slice(0, 8)
    .map((q) => ({ kind: (["probe", "verify", "role"].includes(q.kind) ? q.kind : "probe") as InterviewQuestion["kind"], criterion: (q.criterion ?? "").trim(), question: q.question.trim(), listen_for: (q.listen_for ?? "").trim() }))
    .sort((x, y) => order[x.kind] - order[y.kind]);
  return { brief: out.brief.trim(), questions };
}

export async function generateEmail(c: Candidate, type: "invite" | "rejection", deadline?: number) {
  const def = await getRole(c.applied_role);
  const role = def?.title ?? c.applied_role;
  const meeting = def?.interview_note?.trim() || "a 45-minute conversation with Arjun in Mumbai or on video";
  const instructions =
    type === "invite"
      ? `An interview invitation. Warm and direct. Mention ONE specific thing from their CV that stood out (from the
strongest rubric criterion) so it is clearly not a template. Invite them to ${meeting},
and ask them to reply with two or three times that work next week. Under 150 words.`
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
export function pendingWork(all: Candidate[], role: Role, n = 5) {
  const ranked = rankRole(all, role);
  const work: { c: Candidate; rank: number; needBrief: boolean; draftType: "invite" | "rejection" | null }[] = [];
  ranked.forEach((c, i) => {
    if (c.email_status === "sent") return;
    const recommended = i < n ? "invite" : "rejection";
    const wanted = c.draft_locked && c.draft_type ? c.draft_type : recommended;
    const needBrief = wanted === "invite" && (!c.brief || !c.interview_questions?.length);
    const draftType = c.draft_type !== wanted || !c.draft_body ? wanted : null;
    if (needBrief || draftType) work.push({ c, rank: i + 1, needBrief, draftType });
  });
  return work;
}

/** Generates missing briefs/drafts until the time budget runs out. Returns how many are still pending. */
export async function refreshDrafts(role: Role, budgetMs = 45_000) {
  const deadline = Date.now() + budgetMs;
  const [all, def] = await Promise.all([listCandidates(role), getRole(role)]);
  const work = pendingWork(all, role, def?.shortlist_size ?? 5);
  let done = 0;
  let lastError: string | null = null;
  for (const w of work) {
    if (Date.now() > deadline - 8_000) break;
    try {
      const patch: Partial<Candidate> = {};
      if (w.needBrief) { const b = await generateBrief(w.c, w.rank, deadline); patch.brief = b.brief; patch.interview_questions = b.questions; }
      if (w.draftType) {
        const e = await generateEmail(w.c, w.draftType, deadline);
        Object.assign(patch, { draft_type: w.draftType, draft_subject: e.subject, draft_body: e.body, email_status: "draft" });
      }
      await updateCandidate(w.c.id, patch);
      done++;
    } catch (e) {
      lastError = redactSecrets(e instanceof Error ? e.message : String(e));
      if (lastError.startsWith("RATE_LIMITED") || lastError.startsWith("DAILY_LIMIT")) break;
    }
  }
  return { done, remaining: work.length - done, lastError };
}

// ---------------------------------------------------------------------------
// Criteria suggestions for a new or edited role, grounded in the past-hire patterns
// ---------------------------------------------------------------------------
export async function suggestCriteria(title: string, requirements: string) {
  const { HIRE_PATTERNS } = await import("./patterns");
  const prompt = `You are helping Arjun, founder of Kargo (Series A logistics SaaS, Mumbai), set up a hiring rubric for a new role.

ROLE: ${title}
WHAT THE ROLE NEEDS (use only to understand the job - do NOT copy requirements into criteria):
${requirements.slice(0, 3000) || "(not given)"}

The rubric must come from what Kargo's best past hires had in common:
${HIRE_PATTERNS}

Create 5 criteria that apply these patterns to THIS role (translate each pattern into what it looks like for this
kind of work, and raise or lower the bar to match the seniority). Rules:
- Each criterion needs a short name (2-5 words), a snake_case key, and a description of what a strong candidate
  looks like, specific enough that two people would score the same CV the same way. Include a "Partial (2-3): ..."
  and "Weak (0-1): ..." sentence, like "Strong: ... Partial (2-3): ... Weak (0-1): ...".
- Never use years of experience, degrees, job titles or anything that is just a job-description requirement.
- Integer weights that add up to exactly 100, most weight on the patterns that matter most for this role.`;
  const { Type } = await import("@google/genai");
  const out = await generateJson<{ criteria: { key: string; name: string; description: string; weight: number }[] }>(
    prompt,
    {
      type: Type.OBJECT,
      properties: {
        criteria: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: { name: { type: Type.STRING }, key: { type: Type.STRING }, description: { type: Type.STRING }, weight: { type: Type.INTEGER } },
            required: ["name", "key", "description", "weight"],
            propertyOrdering: ["name", "key", "description", "weight"],
          },
        },
      },
      required: ["criteria"],
    },
    { temperature: 0.4 }
  );
  return normalizeCriteria(out.criteria ?? []);
}

/** Cleans keys, keeps 1-8 criteria and makes weights add up to exactly 100. */
export function normalizeCriteria(list: { key?: string; name: string; description: string; weight: number }[]) {
  const seen = new Set<string>();
  const clean = list
    .filter((c) => c.name?.trim())
    .slice(0, 8)
    .map((c) => {
      let key = (c.key || c.name).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "criterion";
      while (seen.has(key)) key += "_2";
      seen.add(key);
      return { key, name: c.name.trim().slice(0, 60), description: (c.description ?? "").trim(), weight: Math.max(0, Math.round(Number(c.weight) || 0)) };
    });
  const sum = clean.reduce((a, c) => a + c.weight, 0);
  if (clean.length && sum !== 100) {
    if (sum === 0) clean.forEach((c) => (c.weight = Math.floor(100 / clean.length)));
    else clean.forEach((c) => (c.weight = Math.round((c.weight * 100) / sum)));
    const diff = 100 - clean.reduce((a, c) => a + c.weight, 0);
    clean[0].weight += diff;
  }
  return clean;
}

/** How many scored CVs still need scoring against this role's current criteria. */
export function staleCount(all: Candidate[], roleKey: Role, sig: string) {
  return all.filter((c) => c.status === "scored" && (!c.scores?.[roleKey] || (c.scores[roleKey].sig ?? sig) !== sig)).length;
}
