export type Role = "PM" | "SPM";
export const ROLES: Role[] = ["PM", "SPM"];
export const ROLE_TITLE: Record<Role, string> = { PM: "Product Manager", SPM: "Senior Product Manager" };

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
export type RoleScore = { total: number; criteria: CriterionScore[] };

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
  scores: Partial<Record<Role, RoleScore>> | null;
  pm_score: number | null;
  spm_score: number | null;
  headline: string | null;
  brief: string | null;
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

export function roleScore(c: Pick<Candidate, "pm_score" | "spm_score">, role: Role): number {
  return Number((role === "PM" ? c.pm_score : c.spm_score) ?? 0);
}

export function shortlistSize(): number {
  const n = Number(process.env.SHORTLIST_SIZE ?? 5);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 5;
}
