import "server-only";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type { Candidate, Criterion, Role } from "./types";

let client: NeonQueryFunction<false, false> | null = null;

/** Neon Postgres over HTTP (works in Vercel serverless functions). DATABASE_URL comes from `neon deploy` / Neon console. */
export function sql() {
  if (client) return client;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set - run `neon deploy` (writes .env) or copy it from the Neon console");
  client = neon(url);
  return client;
}

const JSON_COLS = new Set(["personal_details", "scores"]);
const COLS = new Set([
  "applied_role", "file_name", "personal_details", "cv_text", "status", "error", "scores", "pm_score", "spm_score",
  "headline", "brief", "draft_type", "draft_locked", "draft_subject", "draft_body", "email_status", "email_error",
  "sent_at", "sent_to", "resend_id",
]);

function toRow(r: Record<string, unknown>): Candidate {
  const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : (v as string | null));
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return { ...(r as Candidate), created_at: iso(r.created_at)!, sent_at: iso(r.sent_at), pm_score: num(r.pm_score), spm_score: num(r.spm_score) };
}

function params(patch: Record<string, unknown>) {
  const keys = Object.keys(patch).filter((k) => COLS.has(k));
  const values = keys.map((k) => (JSON_COLS.has(k) && patch[k] !== null ? JSON.stringify(patch[k]) : patch[k]));
  const cast = (k: string, i: number) => `$${i + 1}${JSON_COLS.has(k) ? "::jsonb" : ""}`;
  return { keys, values, cast };
}

export async function getRubric(): Promise<Criterion[]> {
  const rows = await sql().query("select * from rubric_criteria order by role, sort_order");
  if (!rows.length) throw new Error("rubric_criteria is empty - run `npm run db:setup`");
  return rows as Criterion[];
}

export async function getCandidate(id: string): Promise<Candidate> {
  const rows = await sql().query("select * from candidates where id = $1", [id]);
  if (!rows[0]) throw new Error("Candidate not found");
  return toRow(rows[0]);
}

export async function findCandidateByFile(fileName: string, role: Role): Promise<Candidate | null> {
  const rows = await sql().query("select * from candidates where file_name = $1 and applied_role = $2 order by created_at limit 1", [fileName, role]);
  return rows[0] ? toRow(rows[0]) : null;
}

export async function listCandidates(role?: Role): Promise<Candidate[]> {
  const rows = role
    ? await sql().query("select * from candidates where applied_role = $1 order by created_at", [role])
    : await sql().query("select * from candidates order by created_at");
  return rows.map(toRow);
}

export async function insertCandidate(row: Partial<Candidate>): Promise<Candidate> {
  const { keys, values, cast } = params(row);
  const rows = await sql().query(
    `insert into candidates (${keys.join(", ")}) values (${keys.map(cast).join(", ")}) returning *`,
    values
  );
  return toRow(rows[0]);
}

export async function updateCandidate(id: string, patch: Partial<Candidate>) {
  const { keys, values, cast } = params(patch);
  if (!keys.length) return;
  await sql().query(`update candidates set ${keys.map((k, i) => `${k} = ${cast(k, i)}`).join(", ")} where id = $${keys.length + 1}`, [...values, id]);
}

export async function deleteCandidate(id: string) {
  await sql().query("delete from candidates where id = $1", [id]);
}
