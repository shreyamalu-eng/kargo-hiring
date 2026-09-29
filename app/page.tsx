import { listCandidates, getRubric, redactSecrets } from "@/lib/db";
import { renderEmail } from "@/lib/email";
import { pendingWork, rankRole } from "@/lib/pipeline";
import { ROLE_TITLE, shortlistSize, type Role } from "@/lib/types";
import Inbox, { type CardData } from "./ui/Inbox";
import Shell from "./ui/Shell";
import { I } from "./ui/icons";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const sp = await searchParams;
  const role: Role = sp.role === "SPM" ? "SPM" : "PM";
  let all, rubric;
  try {
    [all, rubric] = await Promise.all([listCandidates(), getRubric()]);
  } catch (e) {
    return (
      <Shell active={role}>
        <div className="card stack" style={{ maxWidth: 560, marginTop: 24 }}>
          <div className="row"><span className="chip rose"><I.Alert size={14} /> Setup needed</span></div>
          <h1 className="h2">The app can&apos;t reach its database yet</h1>
          <p className="muted" style={{ margin: 0 }}>{redactSecrets(e instanceof Error ? e.message : String(e))}</p>
          <p className="small faint" style={{ margin: 0 }}>Check that DATABASE_URL is set in Vercel → Settings → Environment Variables, then redeploy.</p>
        </div>
      </Shell>
    );
  }
  const other: Role = role === "PM" ? "SPM" : "PM";
  const toCard = (c: (typeof all)[number], rank: number | null): CardData => {
    const { cv_text: _drop, ...rest } = c;
    void _drop;
    return { ...rest, rank, preview: c.draft_body ? renderEmail(c) : null };
  };
  const cards = rankRole(all, role).map((c, i) => toCard(c, i + 1));
  const pending = all.filter((c) => c.applied_role === role && c.status !== "scored").map((c) => toCard(c, null));
  const counts = { PM: all.filter((c) => c.applied_role === "PM").length, SPM: all.filter((c) => c.applied_role === "SPM").length };
  const waiting = {
    PM: all.filter((c) => c.applied_role === "PM" && c.email_status !== "sent").length,
    SPM: all.filter((c) => c.applied_role === "SPM" && c.email_status !== "sent").length,
  };
  return (
    <Shell app active={role} counts={counts} waiting={waiting}>
      <Inbox
        role={role}
        roleTitle={ROLE_TITLE[role]}
        other={other}
        otherTitle={ROLE_TITLE[other]}
        cards={cards}
        pending={pending}
        shortlist={shortlistSize()}
        rubric={rubric.filter((r) => r.role === role)}
        resendReady={!!process.env.RESEND_API_KEY}
        pendingDrafts={pendingWork(all, role).length}
      />
    </Shell>
  );
}
