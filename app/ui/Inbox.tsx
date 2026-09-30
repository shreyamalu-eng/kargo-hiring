"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Candidate, Criterion, Role } from "@/lib/types";
import { I } from "./icons";
import Detail from "./Detail";

export type CardData = Omit<Candidate, "cv_text"> & { rank: number | null; preview: { subject: string; body: string } | null };

type RoleLite = { key: Role; title: string };
type Props = {
  role: Role; roleTitle: string; others: RoleLite[]; roles: (RoleLite & { waiting: number })[];
  testRecipient: string | null; stale: number;
  fits: { id: string; name: string; headline: string; score: number; from: string }[];
  cards: CardData[]; pending: CardData[]; shortlist: number; rubric: Criterion[];
  resendReady: boolean; pendingDrafts: number;
};

export async function api(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Something went wrong (${res.status})`);
  return json;
}

export const band = (s: number) => (s >= 65 ? "strong" : s >= 45 ? "mid" : "low");
export const initials = (n?: string) => (n || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
export const avatarStyle = (s: number) =>
  band(s) === "strong" ? { background: "var(--green-soft)", color: "var(--green)" }
  : band(s) === "mid" ? { background: "var(--blue-soft)", color: "var(--blue)" }
  : { background: "var(--grey-soft)", color: "var(--ink-2)" };
export const scoreOf = (c: CardData, r: Role) => Number(c.scores?.[r]?.total ?? 0);

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function Inbox(p: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<"desktop" | "phone" | null>(null); // unknown until the first client render
  const isDesktop = mode === "desktop";
  const [filter, setFilter] = useState<"todo" | "sent" | "all">("todo");
  const [q, setQ] = useState("");
  const [toast, setToast] = useState<{ text: string; err?: boolean } | null>(null);
  const [gen, setGen] = useState<{ running: boolean; left: number; note?: string }>({ running: false, left: p.pendingDrafts });
  const genStarted = useRef(false);
  const [justSent, setJustSent] = useState<Set<string>>(new Set());
  const [back, setBack] = useState<{ running: boolean; left: number; note?: string }>({ running: false, left: p.stale });
  const [batch, setBatch] = useState<{ open: boolean; running: boolean; done: number; failed: string[] }>({ open: false, running: false, done: 0, failed: [] });

  async function runBackfill() {
    setBack({ running: true, left: p.stale });
    for (let i = 0; i < 80; i++) {
      try {
        const r = await api(`/api/roles/${encodeURIComponent(p.role)}/backfill`, "POST");
        if (r.remaining === 0) { setBack({ running: false, left: 0 }); router.refresh(); return; }
        if (r.done === 0 && r.lastError) {
          if (String(r.lastError).startsWith("DAILY_LIMIT")) { setBack({ running: false, left: r.remaining, note: String(r.lastError).replace("DAILY_LIMIT: ", "") }); return; }
          await new Promise((s) => setTimeout(s, 30_000));
        }
        setBack({ running: true, left: r.remaining });
        router.refresh();
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        if (/\((502|503|504)\)/.test(m)) { await new Promise((s) => setTimeout(s, 8000)); continue; }
        setBack({ running: false, left: 0, note: m });
        return;
      }
    }
  }

  const notify = useCallback((text: string, err?: boolean) => {
    setToast({ text, err });
    window.clearTimeout((notify as unknown as { t?: number }).t);
    (notify as unknown as { t?: number }).t = window.setTimeout(() => setToast(null), err ? 6000 : 3200);
  }, []);

  // ---- layout mode + URL-synced selection (phone back button closes the detail) ----
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => setMode(mq.matches ? "desktop" : "phone");
    apply();
    mq.addEventListener("change", apply);
    const fromUrl = () => setSelected(new URLSearchParams(location.search).get("c"));
    fromUrl();
    window.addEventListener("popstate", fromUrl);
    return () => { mq.removeEventListener("change", apply); window.removeEventListener("popstate", fromUrl); };
  }, []);

  const select = useCallback((id: string | null, replace = false) => {
    setSelected(id);
    requestAnimationFrame(() => {
      document.querySelector(".detail-scroll")?.scrollTo({ top: 0 });
      document.querySelector(".detail-layer")?.scrollTo({ top: 0 });
      if (id) document.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: "nearest" });
    });
    const u = new URL(location.href);
    if (id) u.searchParams.set("c", id); else u.searchParams.delete("c");
    u.searchParams.set("role", p.role);
    if (replace || isDesktop) history.replaceState(null, "", u); else history.pushState(null, "", u);
  }, [isDesktop, p.role]);

  // Optimistic: someone you just emailed leaves "To reply" immediately, before the server round-trip.
  const cards = useMemo(() => p.cards.map((c) => (justSent.has(c.id) && c.email_status !== "sent" ? { ...c, email_status: "sent" as const } : c)), [p.cards, justSent]);
  const undecided = useMemo(() => cards.filter((c) => c.email_status !== "sent"), [cards]);
  const sentCount = cards.length - undecided.length;

  // Desktop always shows someone: the next person who still needs a decision.
  useEffect(() => {
    if (mode !== "desktop") return;
    if (!selected || !p.cards.some((c) => c.id === selected)) {
      const first = undecided[0] ?? p.cards[0];
      if (first) select(first.id, true);
    }
  }, [mode, selected, p.cards, undecided, select]);

  // ---- briefs & drafts are prepared automatically; no button to remember ----
  useEffect(() => {
    if (p.pendingDrafts === 0 || genStarted.current) return;
    genStarted.current = true;
    (async () => {
      setGen({ running: true, left: p.pendingDrafts });
      for (let i = 0; i < 60; i++) {
        try {
          const r = await api("/api/drafts", "POST", { role: p.role });
          router.refresh();
          if (r.remaining === 0) break;
          if (r.done === 0 && r.lastError) {
            if (String(r.lastError).startsWith("DAILY_LIMIT")) {
              setGen({ running: false, left: r.remaining, note: String(r.lastError).replace("DAILY_LIMIT: ", "") });
              return;
            }
            if (String(r.lastError).startsWith("RATE_LIMITED")) {
              setGen({ running: true, left: r.remaining, note: "The AI is busy for a moment, retrying in 30s…" });
              await new Promise((s) => setTimeout(s, 30_000));
              continue;
            }
            setGen({ running: false, left: r.remaining, note: r.lastError });
            return;
          }
          setGen({ running: true, left: r.remaining });
        } catch (e) {
          const m = e instanceof Error ? e.message : String(e);
          if (/\((502|503|504)\)/.test(m)) { await new Promise((s) => setTimeout(s, 8000)); continue; } // slow request, try again
          setGen({ running: false, left: 0, note: m });
          return;
        }
      }
      setGen({ running: false, left: 0 });
      genStarted.current = false;
    })();
  }, [p.pendingDrafts, p.role, router]);

  const needle = q.trim().toLowerCase();
  const visible = cards.filter((c) => {
    if (filter === "todo" && c.email_status === "sent") return false;
    if (filter === "sent" && c.email_status !== "sent") return false;
    if (!needle) return true;
    return [c.personal_details?.name, c.headline, c.file_name].some((v) => (v ?? "").toLowerCase().includes(needle));
  });
  const top = visible.filter((c) => (c.rank ?? 99) <= p.shortlist);
  const batchable = cards.filter((c) => (c.rank ?? 99) <= p.shortlist && c.email_status !== "sent" && c.draft_type === "invite" && c.draft_body && c.personal_details?.email);

  async function sendShortlist() {
    setBatch({ open: true, running: true, done: 0, failed: [] });
    const failed: string[] = [];
    let done = 0;
    for (const c of batchable) {
      try { await api("/api/send", "POST", { id: c.id }); done++; setJustSent((xs) => new Set(xs).add(c.id)); }
      catch (e) { failed.push(`${c.personal_details?.name ?? c.file_name}: ${e instanceof Error ? e.message : e}`); }
      setBatch({ open: true, running: true, done, failed });
    }
    setBatch({ open: false, running: false, done, failed });
    notify(failed.length ? `Sent ${done}, ${failed.length} failed: ${failed[0]}` : `Sent ${done} interview invite${done === 1 ? "" : "s"}`, failed.length > 0);
    router.refresh();
  }
  const rest = visible.filter((c) => (c.rank ?? 99) > p.shortlist);
  const current = cards.find((c) => c.id === selected) ?? null;
  const bestOther = (c: CardData) =>
    p.others.map((r) => ({ ...r, s: scoreOf(c, r.key) })).filter((r) => c.scores?.[r.key]).sort((a, b) => b.s - a.s)[0] ?? null;

  const nextAfter = useCallback((id: string) => {
    const idx = cards.findIndex((c) => c.id === id);
    const after = [...cards.slice(idx + 1), ...cards.slice(0, idx)].find((c) => c.email_status !== "sent" && c.id !== id);
    return after ?? null;
  }, [cards]);

  // Keyboard: ↑/↓ or j/k to move through the list on desktop.
  useEffect(() => {
    if (!isDesktop) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      const list = visible;
      const i = list.findIndex((c) => c.id === selected);
      if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); const n = list[Math.min(list.length - 1, i + 1)]; if (n) select(n.id); }
      if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); const n = list[Math.max(0, i - 1)]; if (n) select(n.id); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDesktop, visible, selected, select]);

  const firstName = (c: CardData) => (c.personal_details?.name ?? "").split(" ")[0] || "the candidate";
  const progress = cards.length ? Math.round((sentCount / cards.length) * 100) : 0;
  const inviteReady = cards.filter((c) => c.email_status !== "sent" && c.draft_type === "invite" && c.draft_body).length;
  const declineReady = cards.filter((c) => c.email_status !== "sent" && c.draft_type === "rejection" && c.draft_body).length;

  // ---------------- empty state ----------------
  if (p.cards.length === 0 && p.pending.length === 0) {
    return (
      <div className="card empty" style={{ marginTop: 16 }}>
        <div className="art"><I.Upload size={30} /></div>
        <h1 className="h2">No {p.roleTitle} candidates yet</h1>
        <p className="muted" style={{ maxWidth: 420, margin: "8px auto 20px" }}>
          Add CVs and each one is read, scored against the rubric built from your best hires, and ranked. Your shortlist is ready in a few minutes.
        </p>
        <Link href={`/upload?role=${encodeURIComponent(p.role)}`} className="btn primary lg"><I.Plus size={18} /> Add CVs for this role</Link>
        {p.fits.length > 0 && (
          <div className="stack" style={{ gap: 6, textAlign: "left", maxWidth: 640, margin: "28px auto 0" }}>
            <Fits fits={p.fits} role={p.role} roleTitle={p.roleTitle} onDone={(t, e) => { notify(t, e); router.refresh(); }} />
          </div>
        )}
        {toast && <div className={`toast ${toast.err ? "err" : ""}`} role="status">{toast.err ? <I.Alert size={18} /> : <I.CheckCircle size={18} />}{toast.text}</div>}
      </div>
    );
  }

  const strengths = (c: CardData) =>
    (c.scores?.[p.role]?.criteria ?? []).filter((x) => x.score >= 4).sort((a, b) => b.score - a.score || b.weight - a.weight).slice(0, 2).map((x) => x.name);

  const Row = ({ c }: { c: CardData }) => {
    const s = scoreOf(c, p.role);
    const sent = c.email_status === "sent";
    return (
      <button data-id={c.id} className={`person ${selected === c.id ? "on" : ""} ${sent ? "done" : ""}`} onClick={() => select(c.id)} aria-current={selected === c.id}>
        <span className="avatar" style={sent ? { background: "var(--grey-soft)", color: "var(--ink-3)" } : avatarStyle(s)}>{sent ? <I.Check size={18} /> : initials(c.personal_details?.name)}</span>
        <span style={{ minWidth: 0 }}>
          <div className="name">{c.personal_details?.name || c.file_name}</div>
          <div className="sub two">#{c.rank} · {c.headline || "Reading CV…"}</div>
          {strengths(c).length > 0 && (
            <div className="strengths">{strengths(c).map((x) => <span key={x} className="mini"><I.Check size={11} /> {x}</span>)}</div>
          )}
        </span>
        <span className="right">
          <span className={`score-pill num band-${band(s)}`}>{Math.round(s)}</span>
          {sent ? <span className="chip small"><I.Check size={12} /> Sent</span>
            : c.draft_type === "invite" ? <span className="chip green">Interview</span>
            : c.draft_type === "rejection" ? <span className="chip">Decline</span>
            : <span className="chip">Preparing</span>}
        </span>
      </button>
    );
  };

  return (
    <div className="home">
      <div className="role-switch mobile-only" role="tablist" aria-label="Open roles">
        {p.roles.map((r) => (
          <Link key={r.key} href={`/?role=${encodeURIComponent(r.key)}`} className={`chip ${r.key === p.role ? "accent" : ""}`} role="tab" aria-selected={r.key === p.role}>
            {r.title}{r.waiting > 0 && <span className="num" style={{ opacity: 0.7 }}> · {r.waiting}</span>}
          </Link>
        ))}
        <Link href="/roles/new" className="chip"><I.Plus size={12} /> Role</Link>
      </div>
      <div className="hello">
        <div>
          <div className="label">{p.roleTitle.toUpperCase()} · {p.cards.length + p.pending.length} CANDIDATES</div>
          <h1 className="h1" suppressHydrationWarning>{greeting()}, Arjun</h1>
        </div>
        <span className="spacer" />
        <Link href={`/roles/${encodeURIComponent(p.role)}`} className="btn sm quiet"><I.Edit size={14} /> Edit role &amp; criteria</Link>
        <Link href={`/upload?role=${encodeURIComponent(p.role)}`} className="btn sm"><I.Plus size={14} /> Add CVs</Link>
      </div>

      <section className="progress-card">
        <div className="stack" style={{ gap: 10 }}>
          <div className="h3">
            {undecided.length === 0 ? "Everyone has heard back. Nice work." :
              <>You&apos;ve replied to <span className="num">{sentCount}</span> of <span className="num">{p.cards.length}</span> candidates · <span className="num">{undecided.length}</span> still waiting to hear from you</>}
          </div>
          <div className="bar" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${progress}%` }} /></div>
          <div className="stats">
            <div className="stat"><b className="num">{Math.min(p.shortlist, p.cards.length)}</b><span>on the shortlist</span></div>
            <div className="stat"><b className="num">{inviteReady}</b><span>invites ready</span></div>
            <div className="stat"><b className="num">{declineReady}</b><span>declines ready</span></div>
            <div className="stat"><b className="num">{sentCount}</b><span>sent</span></div>
          </div>
        </div>
        {undecided.length > 0 && (
          <button className="btn primary lg" onClick={() => { setFilter("todo"); select(undecided[0].id); }}>
            {sentCount === 0 ? "Start with #1" : "Continue reviewing"} <I.ArrowRight size={18} />
          </button>
        )}
      </section>

      {p.testRecipient && (
        <div className="banner small"><I.Mail size={16} /><span><b>Test mode</b> · emails go to {p.testRecipient}</span></div>
      )}
      {(p.stale > 0 || back.running || back.note) && (
        <div className={`banner ${back.note && !back.running ? "err" : ""}`}>
          {back.running ? <span className="spin" /> : <I.Refresh size={18} />}
          <span style={{ flex: 1 }}>
            {back.running ? <>Updating scores for this role… <b className="num">{back.left}</b> left.</>
              : back.note ? back.note
              : <><b className="num">{p.stale}</b> CV{p.stale === 1 ? " hasn't" : "s haven't"} been scored with this role&apos;s current criteria yet.</>}
          </span>
          {!back.running && p.stale > 0 && <button className="btn sm" onClick={runBackfill}>Update scores</button>}
        </div>
      )}
      {(gen.running || gen.note) && (
        <div className={`banner ${gen.running ? "" : "err"}`}>
          {gen.running ? <span className="spin" /> : <I.Alert size={18} />}
          <span>{gen.running ? <>Writing briefs and emails… <b className="num">{gen.left}</b> left. You can start reviewing now.</> : gen.note}</span>
          {!gen.running && <button className="btn sm quiet" onClick={() => { genStarted.current = false; setGen({ running: false, left: 0 }); router.refresh(); }}>Try again</button>}
        </div>
      )}

      <div className="split">
        <div className="list-pane">
          <div className="search">
            <I.Search size={18} />
            <input className="input" placeholder="Search by name or background" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search candidates" />
          </div>
          <div className="seg" role="tablist" aria-label="Filter">
            <button className={filter === "todo" ? "on" : ""} onClick={() => setFilter("todo")}>To reply <span className="count num">{undecided.length}</span></button>
            <button className={filter === "sent" ? "on" : ""} onClick={() => setFilter("sent")}>Sent <span className="count num">{sentCount}</span></button>
            <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>All</button>
          </div>

          <div className="list-scroll">
            {p.pending.length > 0 && (
              <>
                <div className="section-head"><span className="chip rose"><I.Alert size={12} /> Needs attention</span><span className="small faint">{p.pending.length} CV{p.pending.length === 1 ? "" : "s"} couldn&apos;t be scored</span></div>
                {p.pending.map((c) => <PendingRow key={c.id} c={c} onDone={(t, e) => { notify(t, e); router.refresh(); }} />)}
              </>
            )}
            {top.length > 0 && (
              <div className="section-head"><span className="chip green"><I.Star size={12} /> Shortlist</span><span className="small faint">Top {p.shortlist} · recommended for interview</span>
                <span className="spacer" />
                {batchable.length > 1 && p.resendReady && !batch.open && (
                  <button className="btn sm green" onClick={() => setBatch({ open: true, running: false, done: 0, failed: [] })}><I.Send size={13} /> Invite all {batchable.length}</button>
                )}
              </div>
            )}
            {batch.open && (
              <div className="card flat stack" style={{ background: "var(--green-soft)", padding: 14, gap: 10 }}>
                <div className="h3">Send interview invites to {batchable.length} people?</div>
                <div className="small" style={{ display: "grid", gap: 4 }}>
                  {batchable.map((c) => <div key={c.id}>• <b>{c.personal_details?.name}</b> <span className="muted">{p.testRecipient ? `(test copy to ${p.testRecipient})` : c.personal_details?.email}</span></div>)}
                </div>
                <div className="small muted">Each gets the draft shown on their card. Open a card first if you want to edit one.</div>
                <div className="row">
                  <button className="btn quiet" disabled={batch.running} onClick={() => setBatch({ open: false, running: false, done: 0, failed: [] })}>Cancel</button>
                  <button className="btn primary" disabled={batch.running} onClick={sendShortlist}>{batch.running ? <><span className="spin" style={{ borderTopColor: "#fff" }} /> Sending {batch.done + 1} of {batchable.length}</> : <><I.Send size={15} /> Yes, send {batchable.length} invites</>}</button>
                </div>
              </div>
            )}
            {top.map((c) => <Row key={c.id} c={c} />)}
            {rest.length > 0 && (
              <div className="section-head"><span className="chip amber">Below the line</span><span className="small faint">Recommended decline · skim once</span></div>
            )}
            {rest.map((c) => <Row key={c.id} c={c} />)}
            {filter !== "sent" && !needle && <Fits fits={p.fits} role={p.role} roleTitle={p.roleTitle} onDone={(t, e) => { notify(t, e); router.refresh(); }} />}
            {visible.length === 0 && (
              <div className="empty small">{needle ? "No one matches that search." : filter === "sent" ? "Nothing sent yet." : "Everyone here has heard back."}</div>
            )}
          </div>
        </div>

        {current && mode ? (
          <div className={isDesktop ? "detail-scroll" : "detail-layer"}>
            <Detail
              key={current.id}
              c={current}
              role={p.role}
              other={bestOther(current)?.key ?? null}
              otherTitle={bestOther(current)?.title ?? ""}
              testRecipient={p.testRecipient}
              total={p.cards.length}
              shortlist={p.shortlist}
              rubric={p.rubric}
              resendReady={p.resendReady}
              isDesktop={isDesktop}
              onBack={() => (isDesktop ? null : history.back())}
              onPrev={() => { const i = p.cards.findIndex((x) => x.id === current.id); if (i > 0) select(p.cards[i - 1].id, true); }}
              onNext={() => { const i = p.cards.findIndex((x) => x.id === current.id); if (i < p.cards.length - 1) select(p.cards[i + 1].id, true); }}
              onSent={() => {
                setJustSent((xs) => new Set(xs).add(current.id));
                const n = nextAfter(current.id);
                notify(`Sent to ${firstName(current)}${n ? " · here's the next one" : ""}`);
                router.refresh();
                if (n) select(n.id, true);
              }}
              onChanged={(t) => { notify(t); router.refresh(); }}
              onError={(t) => notify(t, true)}
              onRemoved={() => { notify("Removed"); select(null, true); router.refresh(); }}
            />
          </div>
        ) : (
          <div className="card empty desktop-only"><div className="art"><I.Users size={28} /></div>Pick someone on the left.</div>
        )}
      </div>

      {toast && <div className={`toast ${toast.err ? "err" : ""}`} role="status">{toast.err ? <I.Alert size={18} /> : <I.CheckCircle size={18} />}{toast.text}</div>}
    </div>
  );
}

function Fits({ fits, role, roleTitle, onDone }: { fits: Props["fits"]; role: Role; roleTitle: string; onDone: (t: string, err?: boolean) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!fits.length) return null;
  return (
    <>
      <div className="section-head"><span className="chip blue"><I.Swap size={12} /> Strong fits from other roles</span><span className="small faint">Scored higher for {roleTitle}</span></div>
      {fits.map((f) => (
        <div key={f.id} className="person" style={{ cursor: "default" }}>
          <span className="avatar" style={{ background: "var(--blue-soft)", color: "var(--blue)" }}>{initials(f.name)}</span>
          <span style={{ minWidth: 0 }}>
            <div className="name">{f.name}</div>
            <div className="sub two">Applied for {f.from} · {f.headline}</div>
          </span>
          <span className="right">
            <span className="score-pill num band-mid">{Math.round(f.score)}</span>
            <button className="btn sm" disabled={!!busy} onClick={async () => {
              setBusy(f.id);
              try { await api(`/api/candidates/${f.id}`, "PATCH", { action: "move", to: role }); onDone(`Moved ${f.name} to ${roleTitle}`); }
              catch (e) { onDone(e instanceof Error ? e.message : String(e), true); }
              finally { setBusy(null); }
            }}>{busy === f.id ? "…" : "Move here"}</button>
          </span>
        </div>
      ))}
    </>
  );
}

function PendingRow({ c, onDone }: { c: CardData; onDone: (t: string, err?: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); onDone(ok); } catch (e) { onDone(e instanceof Error ? e.message : String(e), true); } finally { setBusy(false); }
  };
  const stuck = c.status === "processing" && Date.now() - new Date(c.created_at).getTime() > 120_000;
  const friendly = (e?: string | null) =>
    !e ? (stuck ? "This took too long and stopped. Press Retry." : "Still reading this CV…") :
    e.startsWith("NOT_A_CV") ? "This looks like a job description, not a CV. Remove it." : e.startsWith("RATE_LIMITED") ? "The AI was busy. Retry in a minute." : e.startsWith("DAILY_LIMIT") ? "The AI's free daily limit is used up. Retry after it resets." : e.includes("scanned") ? "This file is an image, not text. Upload a text PDF or DOCX." : e;
  return (
    <div className="person" style={{ cursor: "default" }}>
      <span className="avatar" style={{ background: "var(--rose-soft)", color: "var(--rose)" }}>{c.status === "processing" && !stuck ? <span className="spin" /> : <I.Alert size={18} />}</span>
      <span style={{ minWidth: 0 }}>
        <div className="name">{c.personal_details?.name || c.file_name}</div>
        <div className="sub" style={{ whiteSpace: "normal" }}>{friendly(c.error)}</div>
      </span>
      <span className="right">
        <button className="btn sm" disabled={busy} onClick={() => act(() => api(`/api/candidates/${c.id}`, "PATCH", { action: "rescore" }), "Scored")}>{busy ? "…" : "Retry"}</button>
        <button className="btn sm ghost" disabled={busy} onClick={() => act(() => api(`/api/candidates/${c.id}`, "DELETE"), "Removed")} aria-label="Remove"><I.Trash size={15} /></button>
      </span>
    </div>
  );
}
