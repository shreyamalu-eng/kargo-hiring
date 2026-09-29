import { listCandidates } from "@/lib/db";
import { rankRole } from "@/lib/pipeline";
import { ROLES, type Role } from "@/lib/types";

export const runtime = "nodejs";

// Decision record: why each person was ranked where they were, and what happened. Something Arjun can hand to anyone.
export async function GET() {
  const all = await listCandidates();
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows: string[] = [];
  const criteriaNames = new Set<string>();
  all.forEach((c) => c.scores?.[c.applied_role]?.criteria.forEach((x) => criteriaNames.add(x.name)));
  const crit = [...criteriaNames];
  rows.push(["Role", "Rank", "Name", "Email", "Score", "Other role score", ...crit.flatMap((n) => [`${n} (0-5)`, `${n} - reason`]), "Decision", "Email status", "Sent at", "Brief", "File"].map(esc).join(","));
  for (const role of ROLES as Role[]) {
    rankRole(all, role).forEach((c, i) => {
      const s = c.scores?.[role];
      const other = c.scores?.[role === "PM" ? "SPM" : "PM"];
      rows.push([
        role, i + 1, c.personal_details?.name, c.personal_details?.email, s?.total, other?.total,
        ...crit.flatMap((n) => { const x = s?.criteria.find((k) => k.name === n); return [x?.score, x?.reason]; }),
        c.draft_type === "invite" ? "Interview" : c.draft_type === "rejection" ? "Decline" : "", c.email_status, c.sent_at, c.brief, c.file_name,
      ].map(esc).join(","));
    });
  }
  return new Response("﻿" + rows.join("\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="kargo-hiring-decisions-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
