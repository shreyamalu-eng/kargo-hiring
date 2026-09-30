import { getRoles, listCandidates } from "@/lib/db";
import { rankRole } from "@/lib/pipeline";

export const runtime = "nodejs";

// Decision record: why each person was ranked where they were, and what happened. Something Arjun can hand to anyone.
export async function GET() {
  const [all, roles] = await Promise.all([listCandidates(), getRoles(true)]);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows: string[] = [];
  rows.push(["Role", "Rank", "Name", "Email", "Score", "Best other role", "Criterion scores and reasons", "Decision", "Email status", "Sent at", "Brief", "File"].map(esc).join(","));
  for (const role of roles) {
    rankRole(all, role.key).forEach((c, i) => {
      const s = c.scores?.[role.key];
      const other = Object.entries(c.scores ?? {}).filter(([k]) => k !== role.key).sort((a, b) => b[1].total - a[1].total)[0];
      const otherTitle = other ? `${roles.find((r) => r.key === other[0])?.title ?? other[0]}: ${other[1].total}` : "";
      rows.push([
        role.title, i + 1, c.personal_details?.name, c.personal_details?.email, s?.total, otherTitle,
        (s?.criteria ?? []).map((x) => `${x.name} ${x.score}/5 - ${x.reason}`).join(" | "),
        c.draft_type === "invite" ? "Interview" : c.draft_type === "rejection" ? "Decline" : "", c.email_status, c.sent_at, c.brief, c.file_name,
      ].map(esc).join(","));
    });
  }
  return new Response("﻿" + rows.join("\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="kargo-hiring-decisions-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
