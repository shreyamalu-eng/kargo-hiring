import { listCandidates, getRubric } from "@/lib/db";
import { renderEmail } from "@/lib/email";
import { pendingWork, rankRole } from "@/lib/pipeline";
import { shortlistSize, type Role } from "@/lib/types";
import Dashboard, { type CardData } from "./Dashboard";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const sp = await searchParams;
  const role: Role = sp.role === "SPM" ? "SPM" : "PM";
  let all, rubric;
  try {
    [all, rubric] = await Promise.all([listCandidates(), getRubric()]);
  } catch (e) {
    return (
      <div className="wrap">
        <h1>Kargo Hiring</h1>
        <div className="notice err">Setup problem: {e instanceof Error ? e.message : String(e)}</div>
        <p>Check DATABASE_URL (run <code>neon deploy</code>, which writes it to .env), then run <code>npm run db:setup</code>.</p>
      </div>
    );
  }
  const ranked = rankRole(all, role);
  const other: Role = role === "PM" ? "SPM" : "PM";
  const toCard = (c: (typeof all)[number], rank: number | null): CardData => {
    const { cv_text: _drop, ...rest } = c;
    void _drop;
    return { ...rest, rank, preview: c.draft_body ? renderEmail(c) : null };
  };
  const cards = ranked.map((c, i) => toCard(c, i + 1));
  const pending = all.filter((c) => c.applied_role === role && c.status !== "scored").map((c) => toCard(c, null));
  const counts = { PM: all.filter((c) => c.applied_role === "PM").length, SPM: all.filter((c) => c.applied_role === "SPM").length };
  return (
    <Dashboard
      role={role}
      other={other}
      cards={cards}
      pending={pending}
      counts={counts}
      shortlist={shortlistSize()}
      rubric={rubric.filter((r) => r.role === role)}
      resendReady={!!process.env.RESEND_API_KEY}
      pendingDrafts={pendingWork(all, role).length}
    />
  );
}
