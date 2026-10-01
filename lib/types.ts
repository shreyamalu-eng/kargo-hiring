/** A role key, e.g. "PM", "SPM" or "head-of-engineering". Roles live in the `roles` table. */
export type Role = string;

export type RoleDef = {
  key: Role;
  title: string;
  tagline: string;
  requirements: string;
  interview_note: string;
  shortlist_size: number;
  sort_order: number;
  archived: boolean;
};

export type Criterion = {
  id?: string;
  role: Role;
  key: string;
  name: string;
  description: string;
  weight: number;
  sort_order: number;
};

export type CriterionScore = { key: string; name: string; weight: number; score: number; reason: string };
/** `sig` records which version of the role's criteria produced this score, so edits can trigger a re-score. */
export type RoleScore = { total: number; criteria: CriterionScore[]; sig?: string };

/** Short fingerprint of a role's criteria (keys, names, weights, descriptions). */
export function criteriaSig(list: Pick<Criterion, "key" | "name" | "weight" | "description">[]) {
  const str = list.map((c) => `${c.key}|${c.name}|${c.weight}|${c.description}`).join("\n");
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export type PersonalDetails = { name?: string; email?: string; phone?: string; links?: string[] };

export type Candidate = {
  id: string;
  created_at: string;
  applied_role: Role;
  file_name: string;
  personal_details: PersonalDetails;
  cv_text: string | null;
  status: "processing" | "scored" | "error";
  error: string | null;
  /** One entry per role the CV has been scored against. */
  scores: Record<Role, RoleScore> | null;
  pm_score: number | null; // legacy columns, kept in sync for PM/SPM
  spm_score: number | null;
  headline: string | null;
  brief: string | null;
  interview_questions: InterviewQuestion[] | null; // tailored questions for the interview
  draft_type: "invite" | "rejection" | null;
  draft_locked: boolean;
  draft_subject: string | null;
  draft_body: string | null;
  email_status: "none" | "draft" | "sent" | "failed";
  email_error: string | null;
  sent_at: string | null;
  sent_to: string | null;
  resend_id: string | null;
};

export function roleScore(c: Pick<Candidate, "scores">, role: Role): number {
  return Number(c.scores?.[role]?.total ?? 0);
}

export function slugify(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "role";
}

export type InterviewQuestion = { question: string; criterion: string; listen_for: string; kind: "probe" | "verify" | "role" };
