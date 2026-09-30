import Link from "next/link";
import { getRoles, getRubric, listCandidates, redactSecrets } from "@/lib/db";
import { renderEmail, testRecipient } from "@/lib/email";
import { pendingWork, rankRole, staleCount } from "@/lib/pipeline";
import { criteriaSig } from "@/lib/types";
import Inbox, { type CardData } from "./ui/Inbox";
import Shell from "./ui/Shell";
import { I } from "./ui/icons";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const sp = await searchParams;
  let all, rubric, roles;
  try {
    [all, rubric, roles] = await Promise.all([listCandidates(), getRubric(), getRoles()]);
  } catch (e) {
    return (
      <Shell active="">
        <div className="card stack" style={{ maxWidth: 560, marginTop: 24 }}>
          <div className="row"><span className="chip rose"><I.Alert size={14} /> Setup needed</span></div>
          <h1 className="h2">The app can&apos;t reach its database yet</h1>
          <p className="muted" style={{ margin: 0 }}>{redactSecrets(e instanceof Error ? e.message : String(e))}</p>
          <p className="small faint" style={{ margin: 0 }}>Check that DATABASE_URL is set in Vercel → Settings → Environment Variables, then redeploy.</p>
        </div>
      </Shell>
    );
  }
  if (!roles.length) {
    return (
      <Shell active="">
        <div className="card empty" style={{ marginTop: 16 }}>
          <div className="art"><I.Target size={30} /></div>
          <h1 className="h2">No open roles</h1>
          <p className="muted">Add a role and its criteria, then add CVs.</p>
          <Link href="/roles/new" className="btn primary lg"><I.Plus size={18} /> Add a role</Link>
        </div>
      </Shell>
    );
  }
  const role = roles.find((r) => r.key === sp.role) ?? roles[0];
  const toCard = (c: (typeof all)[number], rank: number | null): CardData => {
    const { cv_text: _drop, ...rest } = c;
    void _drop;
    return { ...rest, rank, preview: c.draft_body ? renderEmail(c) : null };
  };
  const cards = rankRole(all, role.key).map((c, i) => toCard(c, i + 1));
  const pending = all.filter((c) => c.applied_role === role.key && c.status !== "scored").map((c) => toCard(c, null));
  const crit = rubric.filter((r) => r.role === role.key);
  // People who applied elsewhere but score clearly better for this role.
  const fits = all
    .filter((c) => c.applied_role !== role.key && c.status === "scored" && c.email_status !== "sent" && c.scores?.[role.key])
    .map((c) => ({ c, s: c.scores![role.key].total, own: c.scores?.[c.applied_role]?.total ?? 0 }))
    .filter((x) => x.s >= 45 && x.s >= x.own + 10)
    .sort((a, b) => b.s - a.s)
    .slice(0, 5)
    .map((x) => ({ id: x.c.id, name: x.c.personal_details?.name ?? x.c.file_name, headline: x.c.headline ?? "", score: x.s, from: roles.find((r) => r.key === x.c.applied_role)?.title ?? x.c.applied_role }));
  const waitingOf = (k: string) => all.filter((c) => c.applied_role === k && c.status === "scored" && c.email_status !== "sent").length;
  return (
    <Shell app active={role.key}>
      <Inbox
        role={role.key}
        roleTitle={role.title}
        others={roles.filter((r) => r.key !== role.key).map((r) => ({ key: r.key, title: r.title }))}
        roles={roles.map((r) => ({ key: r.key, title: r.title, waiting: waitingOf(r.key) }))}
        cards={cards}
        pending={pending}
        shortlist={role.shortlist_size}
        rubric={crit}
        resendReady={!!process.env.RESEND_API_KEY}
        testRecipient={testRecipient()}
        pendingDrafts={pendingWork(all, role.key, role.shortlist_size).length}
        fits={fits}
        stale={crit.length ? staleCount(all, role.key, criteriaSig(crit)) : 0}
      />
    </Shell>
  );
}
