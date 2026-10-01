"use client";

import { Fragment, useState } from "react";

type Under = { cv_text: string; model: string; withheld: { name: boolean; email: boolean; phone: boolean; links: number } };
import type { Criterion, Role } from "@/lib/types";
import { I } from "./icons";
import { api, avatarStyle, band, initials, scoreOf, type CardData } from "./Inbox";

type Props = {
  c: CardData; role: Role; other: Role | null; otherTitle: string; testRecipient: string | null; total: number; shortlist: number; rubric: Criterion[];
  resendReady: boolean; isDesktop: boolean;
  onBack: () => void; onPrev: () => void; onNext: () => void;
  onSent: () => void; onChanged: (t: string) => void; onError: (t: string) => void; onRemoved: () => void;
};

function Ring({ value }: { value: number }) {
  const r = 27, C = 2 * Math.PI * r, b = band(value);
  const color = b === "strong" ? "var(--green)" : b === "mid" ? "var(--blue)" : "#b9b7cc";
  return (
    <div className="ring" aria-label={`Score ${Math.round(value)} out of 100`}>
      <svg width="64" height="64"><circle cx="32" cy="32" r={r} stroke="var(--grey-soft)" strokeWidth="7" fill="none" />
        <circle cx="32" cy="32" r={r} stroke={color} strokeWidth="7" fill="none" strokeLinecap="round" strokeDasharray={`${(value / 100) * C} ${C}`} /></svg>
      <b className="num">{Math.round(value)}</b>
    </div>
  );
}

const splitBrief = (b: string) => {
  const parts = b.match(/[^.!?]+[.!?]+(\s|$)/g)?.map((s) => s.trim()) ?? [b];
  if (parts.length <= 3) return parts;
  return [parts[0], parts.slice(1, -1).join(" "), parts[parts.length - 1]];
};

export default function Detail(p: Props) {
  const { c } = p;
  const s = scoreOf(c, p.role);
  const os = p.other ? scoreOf(c, p.other) : 0;
  const sc = c.scores?.[p.role];
  const sent = c.email_status === "sent";
  const above = (c.rank ?? 99) <= p.shortlist;
  const recommended = above ? "invite" : "rejection";
  const type = c.draft_type;
  const first = (c.personal_details?.name ?? "").split(" ")[0] || "the candidate";

  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(c.draft_subject ?? "");
  const [body, setBody] = useState(c.draft_body ?? "");
  const [email, setEmail] = useState(c.personal_details?.email ?? "");
  const [name, setName] = useState(c.personal_details?.name ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [seen, setSeen] = useState(c.draft_body);
  if (seen !== c.draft_body) { setSeen(c.draft_body); setSubject(c.draft_subject ?? ""); setBody(c.draft_body ?? ""); }

  const dirty = subject !== (c.draft_subject ?? "") || body !== (c.draft_body ?? "") || email !== (c.personal_details?.email ?? "") || name !== (c.personal_details?.name ?? "");
  const save = () => api(`/api/candidates/${c.id}`, "PATCH", { action: "save", draft_subject: subject, draft_body: body, email, name });

  async function run(label: string, fn: () => Promise<unknown>, ok?: string) {
    setBusy(label);
    try { await fn(); if (ok) p.onChanged(ok); return true; }
    catch (e) { p.onError(e instanceof Error ? e.message : String(e)); return false; }
    finally { setBusy(null); }
  }
  const autosave = () => { if (dirty) run("save", save, "Saved"); };
  const switchTo = (t: "invite" | "rejection") => {
    if (t === type || busy) return;
    run("switch", () => api(`/api/candidates/${c.id}`, "PATCH", { action: "switch", draft_type: t }), t === "invite" ? "Switched to an interview invite" : "Switched to a decline");
  };
  const send = async () => {
    const ok = await run("send", async () => { if (dirty) await save(); await api("/api/send", "POST", { id: c.id }); });
    setConfirming(false);
    if (ok) p.onSent();
  };

  const firstFromName = name.split(" ")[0] || first;
  const preview = (t: string) => t.replaceAll("[NAME]", firstFromName);
  const sendLabel = (type ?? recommended) === "invite" ? "Send interview invite" : "Send decline";
  const briefParts = c.brief ? splitBrief(c.brief) : [];
  const briefMeta = [
    { label: "Who they are", icon: <I.User size={16} />, style: { background: "var(--accent-soft)", color: "var(--accent)" } },
    { label: `Why they're #${c.rank}`, icon: <I.Target size={16} />, style: { background: "var(--green-soft)", color: "var(--green)" } },
    { label: "Ask in the interview", icon: <I.Question size={16} />, style: { background: "var(--amber-soft)", color: "var(--amber)" } },
  ];

  return (
    <div className="detail">
      {/* phone header: back + position + prev/next */}
      <div className="topbar mobile-only">
        <button className="btn icon quiet" onClick={p.onBack} aria-label="Back to list"><I.ArrowLeft size={18} /></button>
        <span className="h3">#{c.rank} <span className="faint">of {p.total}</span></span>
        <span className="spacer" />
        <div className="seg"><button onClick={p.onPrev} aria-label="Previous candidate"><I.ChevronLeft size={16} /></button><button onClick={p.onNext} aria-label="Next candidate"><I.ChevronRight size={16} /></button></div>
      </div>

      <section className="card">
        <div className="detail-head">
          <span className="avatar lg" style={avatarStyle(s)}>{initials(c.personal_details?.name)}</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 className="h2">{c.personal_details?.name || c.file_name}</h2>
            <div className="muted small" style={{ marginTop: 2 }}>{c.headline}</div>
            <div className="row wrap" style={{ marginTop: 10, gap: 6 }}>
              <span className="chip accent">Rank #{c.rank} of {p.total}</span>
              <span className={`chip ${band(s) === "strong" ? "green" : band(s) === "mid" ? "blue" : ""}`}>{band(s) === "strong" ? "Strong match" : band(s) === "mid" ? "Promising" : "Weak match"}</span>
              <span className="chip" title="Name, email and phone were removed before the AI read this CV"><I.Lock size={12} /> Contact hidden from AI</span>
            </div>
          </div>
          <Ring value={s} />
        </div>
        {p.other && os >= s + 10 && !sent && (
          <div className="reco" style={{ background: "var(--blue-soft)", color: "#1f4fa8", marginTop: 14 }}>
            <I.Swap size={18} />
            <div style={{ flex: 1 }}>Scores <b className="num">{Math.round(os)}</b> against the {p.otherTitle} rubric, well above this role. Worth considering for that role instead.</div>
            <button className="btn sm quiet" disabled={!!busy} onClick={() => run("move", () => api(`/api/candidates/${c.id}`, "PATCH", { action: "move", to: p.other }), `Moved to ${p.otherTitle}`)}>Move</button>
          </div>
        )}
      </section>

      {/* the recommendation, in one sentence */}
      <div className={`reco ${sent ? "sent" : (type ?? recommended) === "invite" ? "invite" : "decline"}`}>
        {sent ? <I.CheckCircle size={20} /> : (type ?? recommended) === "invite" ? <I.Calendar size={20} /> : <I.Mail size={20} />}
        <div>
          {sent ? <><b>{c.draft_type === "invite" ? "Invite sent" : "Decline sent"}</b> to {c.sent_to} · {new Date(c.sent_at!).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</>
            : type && type !== recommended && c.draft_locked ? <><b>Your call: {type === "invite" ? "interview" : "decline"}.</b> The ranking suggested {recommended === "invite" ? "an interview" : "a decline"}, and your choice is kept even if rankings change.</>
            : above && band(s) === "low" ? <><b>Top of this pool, but a weak match overall ({Math.round(s)}/100).</b> The rubric found little of what your best hires had. Interview only if the brief convinces you. It may be better to wait for stronger applicants.</>
            : above ? <><b>Recommended: interview.</b> In the top {p.shortlist}, above the shortlist line. Read the brief, then send the invite.</>
            : <><b>Recommended: decline.</b> Ranked #{c.rank}, below the top {p.shortlist}. Skim the reasons below. If you disagree, switch to an invite.</>}
        </div>
      </div>

      {briefParts.length > 0 && (
        <section className="card">
          <div className="row" style={{ marginBottom: 14 }}><I.Sparkle size={18} className="" /><h3 className="h3">Interview brief</h3></div>
          <div className="brief-list">
            {briefParts.map((t, i) => (
              <div className="brief-item" key={i}>
                <span className="ic" style={briefMeta[i]?.style}>{briefMeta[i]?.icon}</span>
                <div><div className="label" style={{ marginBottom: 2 }}>{briefMeta[i]?.label}</div><div>{t}</div></div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <div className="row" style={{ marginBottom: 16 }}>
          <h3 className="h3">Why they&apos;re ranked #{c.rank}</h3>
          <span className="spacer" />
          <span className="small faint">Rubric from your best past hires</span>
        </div>
        <div className="crit">
          {(sc?.criteria ?? []).map((x) => (
            <div className="crit-row" key={x.key} title={p.rubric.find((r) => r.key === x.key)?.description}>
              <div className="row" style={{ gap: 8 }}><b style={{ fontWeight: 600 }}>{x.name}</b><span className="chip small num">{x.weight}%</span></div>
              <div className={`meter ${x.score >= 4 ? "good" : x.score >= 2 ? "mid" : "low"}`} aria-label={`${x.score} out of 5`}>
                {[1, 2, 3, 4, 5].map((n) => <i key={n} className={n <= x.score ? "on" : ""} />)}
              </div>
              <div className="reason">{x.reason}</div>
            </div>
          ))}
        </div>
      </section>

      {sc && <UnderTheHood id={c.id} sc={sc} />}

      <section className="card">
        <div className="row wrap" style={{ marginBottom: 14 }}>
          <h3 className="h3">Email to {firstFromName}</h3>
          <span className="spacer" />
          {!sent && (
            <div className="seg" aria-label="Email type">
              <button className={type === "invite" ? "on" : ""} disabled={!!busy} onClick={() => switchTo("invite")}><I.Calendar size={14} /> Interview</button>
              <button className={type === "rejection" ? "on" : ""} disabled={!!busy} onClick={() => switchTo("rejection")}><I.Mail size={14} /> Decline</button>
            </div>
          )}
        </div>

        {busy === "switch" || busy === "regen" ? (
          <div className="email-box row"><span className="spin" /> Writing a new {type === "invite" && busy === "regen" ? "invite" : "draft"}…</div>
        ) : !c.draft_body ? (
          <div className="email-box row faint"><span className="spin" /> Preparing this email…</div>
        ) : editing && !sent ? (
          <div className="stack" style={{ gap: 12 }}>
            <div className="row wrap" style={{ gap: 12 }}>
              <div className="field" style={{ flex: 1, minWidth: 180 }}><span className="label">Name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} onBlur={autosave} /></div>
              <div className="field" style={{ flex: 1.4, minWidth: 220 }}><span className="label">To</span><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} onBlur={autosave} /></div>
            </div>
            <div className="field"><span className="label">Subject</span><input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} onBlur={autosave} /></div>
            <div className="field"><span className="label">Message · [NAME] becomes “{firstFromName}”</span><textarea className="textarea" value={body} onChange={(e) => setBody(e.target.value)} onBlur={autosave} /></div>
            <div className="row"><span className="small faint">Changes save automatically.</span><span className="spacer" /><button className="btn sm" onClick={() => { autosave(); setEditing(false); }}><I.Check size={15} /> Done</button></div>
          </div>
        ) : (
          <>
            <div className="small faint" style={{ marginBottom: 8 }}>To {sent ? c.sent_to : email || "— no email found on this CV"}</div>
            <div className="email-box"><b>{preview(subject)}</b>{"\n\n"}{preview(body)}</div>
            {!sent && (
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn sm quiet" onClick={() => setEditing(true)}><I.Edit size={15} /> Edit</button>
                <button className="btn sm ghost" disabled={!!busy} onClick={() => run("regen", () => api(`/api/candidates/${c.id}`, "PATCH", { action: "regenerate" }), "New draft ready")}><I.Refresh size={15} /> Rewrite</button>
              </div>
            )}
          </>
        )}
      </section>

      {!sent && (
        <div className={`detail-actions ${p.isDesktop ? "dock" : "sticky"}`}>
          {confirming ? (
            <div className="confirm" style={{ flex: 1 }}>
              <span style={{ flex: 1, minWidth: 180 }}>Send to <b>{email}</b>{p.testRecipient ? <> (test copy goes to {p.testRecipient})</> : null}? This can&apos;t be undone.</span>
              <button className="btn quiet" onClick={() => setConfirming(false)} disabled={busy === "send"}>Cancel</button>
              <button className="btn primary" onClick={send} disabled={busy === "send"}>{busy === "send" ? <><span className="spin" style={{ borderTopColor: "#fff" }} /> Sending</> : <><I.Send size={16} /> Yes, send</>}</button>
            </div>
          ) : (
            <>
              <button className="btn primary lg" disabled={!!busy || !c.draft_body || !p.resendReady || !email} onClick={() => setConfirming(true)}>
                <I.Send size={17} /> {sendLabel}
              </button>
              <button className="btn quiet lg" onClick={p.onNext}>{p.isDesktop ? "Skip for now" : "Skip"}</button>
              {p.isDesktop && <span className="small faint" style={{ marginLeft: "auto" }}><span className="kbd">↑</span> <span className="kbd">↓</span> to move</span>}
            </>
          )}
          {!p.resendReady && !confirming && <div className="small faint" style={{ width: "100%" }}>Sending turns on once RESEND_API_KEY is added in Vercel.</div>}
          {!email && p.resendReady && !confirming && <div className="small faint" style={{ width: "100%" }}>No email address on this CV. Add one with Edit.</div>}
        </div>
      )}

      <div className="row small faint" style={{ justifyContent: "space-between", padding: "0 4px" }}>
        <span><I.File size={14} /> {c.file_name}{c.personal_details?.phone ? ` · ${c.personal_details.phone}` : ""}</span>
        {!sent && (removing ? (
          <span className="row"><span>Remove this candidate?</span><button className="btn sm quiet" onClick={() => setRemoving(false)}>Keep</button>
            <button className="btn sm" style={{ background: "var(--rose-soft)", color: "var(--rose)" }} onClick={() => run("rm", () => api(`/api/candidates/${c.id}`, "DELETE")).then((ok) => ok && p.onRemoved())}>Remove</button></span>
        ) : <button className="btn sm ghost" onClick={() => setRemoving(true)}><I.Trash size={14} /> Remove</button>)}
      </div>
    </div>
  );
}

/** Shows how the score was produced: the weighted maths, and the exact redacted text the AI read. */
function UnderTheHood({ id, sc }: { id: string; sc: NonNullable<CardData["scores"]>[string] }) {
  const [data, setData] = useState<Under | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const wSum = sc.criteria.reduce((a, x) => a + x.weight, 0) || 100;
  const load = async () => {
    if (data || err) return;
    try {
      const r = await fetch(`/api/candidates/${id}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setData(j);
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't load"); }
  };
  return (
    <section className="card under">
      <details onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && load()}>
        <summary><I.Eye size={18} /> <span className="h3">Under the hood: how this score was made</span><span className="spacer" /><span className="small faint">for checking</span></summary>
        <div className="stack" style={{ gap: 16, marginTop: 14 }}>
          <div>
            <div className="label" style={{ marginBottom: 8 }}>THE MATHS</div>
            <div className="math">
              <span className="small faint">Criterion</span><span className="small faint">Score</span><span className="small faint">Weight</span><span className="small faint" style={{ textAlign: "right" }}>Points</span>
              {sc.criteria.map((x) => (
                <Fragment key={x.key}><span>{x.name}</span><span className="num">{x.score}/5</span><span className="num">{x.weight}%</span><span className="num" style={{ textAlign: "right" }}>{((x.score / 5) * x.weight).toFixed(1)}</span></Fragment>
              ))}
              <span className="tot">Total {wSum !== 100 ? `(scaled to 100 from ${wSum})` : ""}</span><span className="tot" /><span className="tot num">{wSum}%</span><span className="tot num" style={{ textAlign: "right" }}>{Math.round(sc.total)}/100</span>
            </div>
            <p className="small muted" style={{ margin: "8px 0 0" }}>Points = score ÷ 5 × weight. The AI gives only the 0–5 score and the reason for each criterion; the app does the adding, so the total can always be checked by hand.</p>
          </div>
          <div>
            <div className="label" style={{ marginBottom: 8 }}>WHAT THE AI READ</div>
            {err ? <p className="small" style={{ color: "var(--rose)" }}>{err}</p> : !data ? <p className="small muted"><span className="spin" /> Loading…</p> : (
              <>
                <div className="row wrap" style={{ gap: 6, marginBottom: 8 }}>
                  <span className="chip"><I.Lock size={12} /> Kept back: {[data.withheld.name && "name", data.withheld.email && "email", data.withheld.phone && "phone", data.withheld.links && `${data.withheld.links} link${data.withheld.links > 1 ? "s" : ""}`].filter(Boolean).join(", ") || "nothing found"}</span>
                  <span className="chip">Model: {data.model}</span>
                </div>
                <pre>{data.cv_text || "(no text)"}</pre>
                <p className="small muted" style={{ margin: "8px 0 0" }}>This is the only CV text sent to the AI. [CANDIDATE], [EMAIL], [PHONE] and [LINK] mark what was removed on our server first.</p>
              </>
            )}
          </div>
        </div>
      </details>
    </section>
  );
}
