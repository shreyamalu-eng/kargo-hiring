import "server-only";
import { neon, neonConfig, type NeonQueryFunction } from "@neondatabase/serverless";
import type { Candidate, Criterion, Role, RoleDef } from "./types";
import { DEFAULT_ROLES, RUBRIC_ROWS, SCHEMA_STATEMENTS } from "./schema";

let client: NeonQueryFunction<false, false> | null = null;

/**
 * Accepts DATABASE_URL even when a whole .env block was pasted into it
 * (quotes, extra lines, DATABASE_URL_UNPOOLED=…): uses the first postgres:// address.
 */
export function databaseUrl(): string | null {
  const raw = process.env.DATABASE_URL ?? "";
  const m = raw.match(/postgres(?:ql)?:\/\/[^\s"'`]+/);
  return m ? m[0] : null;
}

/** Never show a connection string (it contains the database password) in any message. */
export function redactSecrets(msg: string) {
  return msg.replace(/postgres(?:ql)?:\/\/[^\s"'`]+/g, "[database address hidden]").replace(/npg_[A-Za-z0-9]+/g, "[hidden]");
}

/** Neon Postgres over HTTP (works in Vercel serverless functions). DATABASE_URL comes from `neon deploy` / Neon console. */
export function sql() {
  if (client) return client;
  const url = databaseUrl();
  if (!url) throw new Error("DATABASE_URL is missing or isn't a postgres:// address. Set it in Vercel → Settings → Environment Variables.");
  // Optional override, used only for local testing against a mock Neon HTTP endpoint.
  if (process.env.NEON_HTTP_ENDPOINT) neonConfig.fetchEndpoint = process.env.NEON_HTTP_ENDPOINT;
  client = neon(url);
  return client;
}

// Creates the tables (idempotent) and loads the rubric if it's empty - once per server instance.
let ready: Promise<void> | null = null;
function ensureSchema() {
  if (!ready) {
    ready = (async () => {
      const q = sql();
      for (const st of SCHEMA_STATEMENTS) await q.query(st);
      const [{ n }] = (await q.query("select count(*)::int as n from rubric_criteria")) as { n: number }[];
      if (n === 0) {
        await q.transaction((tx) =>
          RUBRIC_ROWS.map((r) =>
            tx`insert into rubric_criteria (role, key, name, description, weight, sort_order)
               values (${r.role}, ${r.key}, ${r.name}, ${r.description}, ${r.weight}, ${r.sort_order})`
          )
        );
      }
      const [{ r }] = (await q.query("select count(*)::int as r from roles")) as { r: number }[];
      if (r === 0) {
        await q.transaction((tx) =>
          DEFAULT_ROLES.map((x) =>
            tx`insert into roles (key, title, tagline, requirements, interview_note, shortlist_size, sort_order)
               values (${x.key}, ${x.title}, ${x.tagline}, ${x.requirements}, ${x.interview_note}, ${x.shortlist_size}, ${x.sort_order})
               on conflict (key) do nothing`
          )
        );
      }
    })();
    ready.catch(() => (ready = null));
  }
  return ready;
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
  await ensureSchema();
  const rows = await sql().query("select * from rubric_criteria order by role, sort_order");
  if (!rows.length) throw new Error("rubric_criteria is empty");
  return rows as Criterion[];
}

export async function getCandidate(id: string): Promise<Candidate> {
  await ensureSchema();
  const rows = await sql().query("select * from candidates where id = $1", [id]);
  if (!rows[0]) throw new Error("Candidate not found");
  return toRow(rows[0]);
}

export async function findCandidateByFile(fileName: string, role: Role): Promise<Candidate | null> {
  await ensureSchema();
  const rows = await sql().query("select * from candidates where file_name = $1 and applied_role = $2 order by created_at limit 1", [fileName, role]);
  return rows[0] ? toRow(rows[0]) : null;
}

export async function listCandidates(role?: Role): Promise<Candidate[]> {
  await ensureSchema();
  const rows = role
    ? await sql().query("select * from candidates where applied_role = $1 order by created_at", [role])
    : await sql().query("select * from candidates order by created_at");
  return rows.map(toRow);
}

export async function insertCandidate(row: Partial<Candidate>): Promise<Candidate> {
  await ensureSchema();
  const { keys, values, cast } = params(row);
  const rows = await sql().query(
    `insert into candidates (${keys.join(", ")}) values (${keys.map(cast).join(", ")}) returning *`,
    values
  );
  return toRow(rows[0]);
}

export async function updateCandidate(id: string, patch: Partial<Candidate>) {
  await ensureSchema();
  const { keys, values, cast } = params(patch);
  if (!keys.length) return;
  await sql().query(`update candidates set ${keys.map((k, i) => `${k} = ${cast(k, i)}`).join(", ")} where id = $${keys.length + 1}`, [...values, id]);
}

export async function deleteCandidate(id: string) {
  await ensureSchema();
  await sql().query("delete from candidates where id = $1", [id]);
}

// ---------------- roles ----------------
function toRole(r: Record<string, unknown>): RoleDef {
  return { ...(r as RoleDef), shortlist_size: Number(r.shortlist_size ?? 5), sort_order: Number(r.sort_order ?? 0), archived: !!r.archived };
}

export async function getRoles(includeArchived = false): Promise<RoleDef[]> {
  await ensureSchema();
  const rows = await sql().query(`select * from roles ${includeArchived ? "" : "where not archived"} order by sort_order, created_at`);
  return rows.map(toRole);
}

export async function getRole(key: Role): Promise<RoleDef | null> {
  await ensureSchema();
  const rows = await sql().query("select * from roles where key = $1", [key]);
  return rows[0] ? toRole(rows[0]) : null;
}

export async function getCriteria(role: Role): Promise<Criterion[]> {
  await ensureSchema();
  return (await sql().query("select * from rubric_criteria where role = $1 order by sort_order", [role])) as Criterion[];
}

/** Creates or updates a role and replaces its criteria in one transaction. */
export async function saveRole(role: RoleDef, criteria: Omit<Criterion, "role" | "sort_order">[]) {
  await ensureSchema();
  await sql().transaction((tx) => [
    tx`insert into roles (key, title, tagline, requirements, interview_note, shortlist_size, sort_order, archived)
       values (${role.key}, ${role.title}, ${role.tagline}, ${role.requirements}, ${role.interview_note}, ${role.shortlist_size}, ${role.sort_order}, ${role.archived})
       on conflict (key) do update set title = excluded.title, tagline = excluded.tagline, requirements = excluded.requirements,
         interview_note = excluded.interview_note, shortlist_size = excluded.shortlist_size, archived = excluded.archived`,
    tx`delete from rubric_criteria where role = ${role.key}`,
    ...criteria.map((c, i) => tx`insert into rubric_criteria (role, key, name, description, weight, sort_order)
       values (${role.key}, ${c.key}, ${c.name}, ${c.description}, ${c.weight}, ${i})`),
  ]);
}

export async function setRoleArchived(key: Role, archived: boolean) {
  await ensureSchema();
  await sql().query("update roles set archived = $1 where key = $2", [archived, key]);
}

export async function nextSortOrder() {
  await ensureSchema();
  const [{ m }] = (await sql().query("select coalesce(max(sort_order), -1)::int + 1 as m from roles")) as { m: number }[];
  return m;
}
