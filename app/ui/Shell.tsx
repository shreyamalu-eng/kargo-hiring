import Link from "next/link";
import { getRoles, listCandidates } from "@/lib/db";
import type { RoleDef } from "@/lib/types";
import { I } from "./icons";

type Props = { app?: boolean; active: string; children: React.ReactNode; hideTopbar?: boolean };

/** App frame: sidebar on desktop, tab bar on phone. Loads the open roles itself so every page shows them. */
export default async function Shell({ app, active, children, hideTopbar }: Props) {
  let roles: RoleDef[] = [];
  const waiting: Record<string, number> = {};
  try {
    const [r, all] = await Promise.all([getRoles(), listCandidates()]);
    roles = r;
    for (const c of all) if (c.email_status !== "sent" && c.status === "scored") waiting[c.applied_role] = (waiting[c.applied_role] ?? 0) + 1;
  } catch {
    /* the page itself explains setup problems */
  }
  const home = roles.find((r) => r.key === active)?.key ?? roles[0]?.key ?? "";
  const icon = (i: number) => (i % 2 === 0 ? <I.Users /> : <I.Star />);

  return (
    <div className="shell">
      {/* Desktop: calm sidebar, everything one click away */}
      <aside className="side">
        <Link href="/" className="brand"><span className="mark"><I.Logo size={18} /></span>Kargo Hiring</Link>
        <div className="label nav-label">OPEN ROLES</div>
        <div className="nav-roles">
          {roles.map((r, i) => (
            <Link key={r.key} href={`/?role=${encodeURIComponent(r.key)}`} className={`nav ${active === r.key ? "on" : ""}`} title={r.title}>
              {icon(i)} <span className="nav-text">{r.title}</span>
              {(waiting[r.key] ?? 0) > 0 && <span className="count" title={`${waiting[r.key]} waiting for a reply`}>{waiting[r.key]}</span>}
            </Link>
          ))}
        </div>
        <Link href="/roles/new" className="nav add"><I.Plus /> Add a role</Link>
        <div className="label nav-label">WORKSPACE</div>
        <Link href="/upload" className={`nav ${active === "upload" ? "on" : ""}`}><I.Upload /> Add CVs</Link>
        <Link href="/roles" className={`nav ${active === "roles" ? "on" : ""}`}><I.Target /> Roles &amp; criteria</Link>
        <Link href="/about" className={`nav ${active === "about" ? "on" : ""}`}><I.Shield /> How it works</Link>
        <div className="side-foot">
          <a href="/api/export" className="nav"><I.Download /> Export decisions</a>
        </div>
      </aside>

      <main className={`main ${app ? "app" : ""}`}>
        {!hideTopbar && (
          <div className="topbar">
            <Link href="/" className="brand"><span className="mark"><I.Logo size={18} /></span>Kargo Hiring</Link>
            <span className="spacer" />
            <a href="/api/export" className="btn icon quiet" aria-label="Export decisions"><I.Download size={18} /></a>
          </div>
        )}
        {children}
      </main>

      {/* Phone: thumb-reachable tab bar with one clear primary action */}
      <nav className="tabbar" aria-label="Main">
        <Link href={home ? `/?role=${encodeURIComponent(home)}` : "/"} className={`tab ${roles.some((r) => r.key === active) ? "on" : ""}`}><I.Users size={22} />Candidates</Link>
        <Link href="/roles" className={`tab ${active === "roles" ? "on" : ""}`}><I.Target size={22} />Roles</Link>
        <Link href="/upload" className="fab" aria-label="Add CVs"><I.Plus size={26} /></Link>
        <Link href="/about" className={`tab ${active === "about" ? "on" : ""}`}><I.Shield size={22} />How it works</Link>
        <Link href="/roles/new" className="tab"><I.Star size={22} />New role</Link>
      </nav>
    </div>
  );
}
