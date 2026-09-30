import Link from "next/link";
import { getRoles, getRubric, listCandidates } from "@/lib/db";
import Shell from "../ui/Shell";
import { I } from "../ui/icons";

export const dynamic = "force-dynamic";
export const metadata = { title: "Roles · Kargo Hiring" };

export default async function RolesPage() {
  const [roles, rubric, all] = await Promise.all([getRoles(true), getRubric(), listCandidates()]).catch(() => [[], [], []] as const);
  const open = roles.filter((r) => !r.archived);
  const archived = roles.filter((r) => r.archived);
  return (
    <Shell active="roles">
      <div className="stack" style={{ gap: 18, maxWidth: 1100 }}>
        <div className="row wrap" style={{ alignItems: "flex-end" }}>
          <div>
            <div className="label">ROLES &amp; CRITERIA</div>
            <h1 className="h1">What you&apos;re hiring for</h1>
            <p className="muted" style={{ margin: "6px 0 0", maxWidth: 620 }}>Each role has its own requirements, shortlist size, interview details and scoring criteria. Every CV is scored against every open role.</p>
          </div>
          <span className="spacer" />
          <Link href="/roles/new" className="btn primary lg"><I.Plus size={18} /> Add a role</Link>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
          {open.map((r, idx) => {
            const crit = rubric.filter((c) => c.role === r.key);
            const n = all.filter((c) => c.applied_role === r.key).length;
            return (
              <Link key={r.key} href={`/roles/${encodeURIComponent(r.key)}`} className="card stack role-card" style={{ gap: 12 }}>
                <div className="row">
                  <span className="avatar" style={{ background: idx % 2 ? "var(--blue-soft)" : "var(--accent-soft)", color: idx % 2 ? "var(--blue)" : "var(--accent)" }}>{idx % 2 ? <I.Star size={18} /> : <I.Users size={18} />}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="h3">{r.title}</div>
                    <div className="small faint">{r.tagline || "No summary yet"}</div>
                  </div>
                </div>
                <div className="row wrap" style={{ gap: 6 }}>
                  <span className="chip">{n} candidate{n === 1 ? "" : "s"}</span>
                  <span className="chip">Shortlist top {r.shortlist_size}</span>
                  <span className={`chip ${crit.length ? "" : "rose"}`}>{crit.length} criteria</span>
                </div>
                <div className="weights">
                  {crit.slice(0, 5).map((c) => (
                    <div className="weight-row" key={c.key}>
                      <span className="small">{c.name}</span><span className="num small muted" style={{ textAlign: "right" }}>{c.weight}%</span>
                      <div className="bar"><i style={{ width: `${Math.min(100, c.weight * 2.5)}%` }} /></div>
                    </div>
                  ))}
                </div>
                <span className="small" style={{ color: "var(--accent-ink)", fontWeight: 600 }}>Edit role <I.ChevronRight size={14} /></span>
              </Link>
            );
          })}
          <Link href="/roles/new" className="card empty role-card" style={{ boxShadow: "inset 0 0 0 2px var(--line)", background: "transparent" }}>
            <div className="art"><I.Plus size={28} /></div>
            <div className="h3">Add a role</div>
            <div className="small muted">Paste the requirements, get criteria suggested from your best hires</div>
          </Link>
        </div>

        {archived.length > 0 && (
          <div className="stack" style={{ gap: 8 }}>
            <div className="label">ARCHIVED</div>
            {archived.map((r) => (
              <Link key={r.key} href={`/roles/${encodeURIComponent(r.key)}`} className="person done"><span className="avatar" style={{ background: "var(--grey-soft)", color: "var(--ink-3)" }}><I.Lock size={16} /></span><span className="name">{r.title}</span><span className="chip">Archived</span></Link>
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}
