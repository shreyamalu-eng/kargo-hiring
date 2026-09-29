import Link from "next/link";
import { I } from "./icons";

type Active = "PM" | "SPM" | "upload" | "about";
type Props = { app?: boolean; active: Active; counts?: { PM: number; SPM: number }; waiting?: { PM: number; SPM: number }; children: React.ReactNode; hideTopbar?: boolean };

export default function Shell({ app, active, counts, waiting, children, hideTopbar }: Props) {
  const lockOn = !!process.env.DASHBOARD_PASSWORD;
  return (
    <div className="shell">
      {/* Desktop: calm sidebar, everything one click away */}
      <aside className="side">
        <Link href="/" className="brand"><span className="mark"><I.Logo size={18} /></span>Kargo Hiring</Link>
        <div className="label nav-label">OPEN ROLES</div>
        <Link href="/?role=PM" className={`nav ${active === "PM" ? "on" : ""}`}>
          <I.Users /> Product Manager
          {waiting && waiting.PM > 0 && <span className="count" title={`${waiting.PM} waiting for a reply`}>{waiting.PM}</span>}
        </Link>
        <Link href="/?role=SPM" className={`nav ${active === "SPM" ? "on" : ""}`}>
          <I.Star /> Senior PM
          {waiting && waiting.SPM > 0 && <span className="count" title={`${waiting.SPM} waiting for a reply`}>{waiting.SPM}</span>}
        </Link>
        <div className="label nav-label">WORKSPACE</div>
        <Link href="/upload" className={`nav ${active === "upload" ? "on" : ""}`}><I.Upload /> Add CVs</Link>
        <Link href="/about" className={`nav ${active === "about" ? "on" : ""}`}><I.Shield /> How it works</Link>
        <div className="side-foot">
          <a href="/api/export" className="nav"><I.Download /> Export decisions</a>
          {lockOn && <a href="/api/logout" className="nav"><I.Lock /> Lock</a>}
        </div>
      </aside>

      <main className={`main ${app ? "app" : ""}`}>
        {!hideTopbar && (
          <div className="topbar">
            <Link href="/" className="brand"><span className="mark"><I.Logo size={18} /></span>Kargo Hiring</Link>
            <span className="spacer" />
            {lockOn && <a href="/api/logout" className="btn icon quiet" aria-label="Lock"><I.Lock size={18} /></a>}
          </div>
        )}
        {children}
      </main>

      {/* Phone: thumb-reachable tab bar with one clear primary action */}
      <nav className="tabbar" aria-label="Main">
        <Link href="/?role=PM" className={`tab ${active === "PM" ? "on" : ""}`}><I.Users size={22} />PM</Link>
        <Link href="/?role=SPM" className={`tab ${active === "SPM" ? "on" : ""}`}><I.Star size={22} />Senior PM</Link>
        <Link href="/upload" className="fab" aria-label="Add CVs"><I.Plus size={26} /></Link>
        <Link href="/about" className={`tab ${active === "about" ? "on" : ""}`}><I.Shield size={22} />How it works</Link>
        <a href="/api/export" className="tab"><I.Download size={22} />Export</a>
      </nav>
    </div>
  );
}
