"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import type { RoleDef } from "@/lib/types";
import { I } from "../ui/icons";

type Crit = { key?: string; name: string; description: string; weight: number };
type Props = { mode: "new" | "edit"; role?: RoleDef; criteria?: Crit[]; candidates?: number };

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Something went wrong (${res.status})`);
  return json;
}

const EXAMPLES = ["Head of Engineering", "Customer Success Lead", "Sales Lead", "Operations Manager"];

export default function RoleEditor({ mode, role, criteria: initial = [], candidates = 0 }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [title, setTitle] = useState(role?.title ?? "");
  const [tagline, setTagline] = useState(role?.tagline ?? "");
  const [requirements, setRequirements] = useState(role?.requirements ?? "");
  const [interview, setInterview] = useState(role?.interview_note ?? "a 45-minute conversation with Arjun in Mumbai or on video");
  const [size, setSize] = useState(role?.shortlist_size ?? 5);
  const [crit, setCrit] = useState<Crit[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(params.get("created") ? { text: "Role created. It's in the sidebar now." } : null);
  const [archiving, setArchiving] = useState(false);
  const [back, setBack] = useState<{ running: boolean; left: number; done: boolean }>({ running: false, left: 0, done: false });

  const total = crit.reduce((a, c) => a + (Number(c.weight) || 0), 0);
  const valid = title.trim() && crit.length > 0 && crit.every((c) => c.name.trim()) && total === 100;
  const dirty = useMemo(
    () => JSON.stringify({ title, tagline, requirements, interview, size, crit }) !==
      JSON.stringify({ title: role?.title ?? "", tagline: role?.tagline ?? "", requirements: role?.requirements ?? "", interview: role?.interview_note ?? "a 45-minute conversation with Arjun in Mumbai or on video", size: role?.shortlist_size ?? 5, crit: initial }),
    [title, tagline, requirements, interview, size, crit, role, initial]
  );

  const setC = (i: number, patch: Partial<Crit>) => setCrit((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const balance = () => {
    if (!crit.length) return;
    const sum = total || 1;
    const next = crit.map((c) => ({ ...c, weight: Math.round(((Number(c.weight) || 0) * 100) / sum) || Math.floor(100 / crit.length) }));
    const diff = 100 - next.reduce((a, c) => a + c.weight, 0);
    next[0].weight += diff;
    setCrit(next);
  };

  async function suggest() {
    if (!title.trim()) { setMsg({ text: "Add a role title first, and ideally the requirements.", err: true }); return; }
    setBusy("suggest"); setMsg(null);
    try {
      const r = await call("/api/roles/suggest", "POST", { title, requirements });
      setCrit(r.criteria);
      setMsg({ text: "Suggested from what your best past hires had in common. Edit anything you like." });
    } catch (e) {
      setMsg({ text: (e instanceof Error ? e.message : String(e)).replace(/^(DAILY_LIMIT|RATE_LIMITED): /, ""), err: true });
    } finally { setBusy(null); }
  }

  async function save() {
    setBusy("save"); setMsg(null);
    const body = { title, tagline, requirements, interview_note: interview, shortlist_size: size, criteria: crit };
    try {
      if (mode === "new") {
        const r = await call("/api/roles", "POST", body);
        router.push(`/roles/${encodeURIComponent(r.key)}?created=1`);
        router.refresh();
      } else {
        await call(`/api/roles/${encodeURIComponent(role!.key)}`, "PUT", body);
        setMsg({ text: "Saved." });
        router.refresh();
      }
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), err: true });
    } finally { setBusy(null); }
  }

  async function backfill() {
    setBack({ running: true, left: 0, done: false });
    for (let i = 0; i < 80; i++) {
      try {
        const r = await call(`/api/roles/${encodeURIComponent(role!.key)}/backfill`, "POST");
        setBack({ running: r.remaining > 0, left: r.remaining, done: r.remaining === 0 });
        if (r.remaining === 0) { router.refresh(); return; }
        if (r.done === 0 && r.lastError) {
          if (String(r.lastError).startsWith("DAILY_LIMIT")) { setMsg({ text: String(r.lastError).replace("DAILY_LIMIT: ", ""), err: true }); setBack({ running: false, left: r.remaining, done: false }); return; }
          await new Promise((s) => setTimeout(s, 30_000));
        }
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        if (/\((502|503|504)\)/.test(m)) { await new Promise((s) => setTimeout(s, 8000)); continue; }
        setMsg({ text: m, err: true }); setBack({ running: false, left: 0, done: false }); return;
      }
    }
  }

  async function toggleArchive() {
    setBusy("archive");
    try {
      await call(`/api/roles/${encodeURIComponent(role!.key)}`, "PUT", { archived: !role!.archived });
      router.push("/roles"); router.refresh();
    } catch (e) { setMsg({ text: e instanceof Error ? e.message : String(e), err: true }); }
    finally { setBusy(null); setArchiving(false); }
  }

  return (
    <div className="stack editor" style={{ gap: 18, maxWidth: 920 }}>
      <div className="row wrap" style={{ alignItems: "flex-end" }}>
        <div>
          <Link href="/roles" className="small faint"><I.ArrowLeft size={13} /> All roles</Link>
          <h1 className="h1" style={{ marginTop: 6 }}>{mode === "new" ? "Add a role" : role!.title}</h1>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            {mode === "new" ? "Describe the role, then set how candidates are scored. You can change everything later." : `${candidates} candidate${candidates === 1 ? "" : "s"} applied · every CV is scored against this role too.`}
          </p>
        </div>
        <span className="spacer" />
        {mode === "edit" && <Link href={`/?role=${encodeURIComponent(role!.key)}`} className="btn quiet"><I.Users size={16} /> View candidates</Link>}
      </div>

      {msg && <div className={`banner ${msg.err ? "err" : "ok"}`}>{msg.err ? <I.Alert size={18} /> : <I.CheckCircle size={18} />}<span>{msg.text}</span></div>}

      {mode === "edit" && (params.get("created") || back.running || back.done) && (
        <div className="card tint row wrap" style={{ gap: 12 }}>
          <I.Sparkle size={20} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="h3">{back.done ? "All existing CVs are scored for this role." : "Score the CVs you already have against this role?"}</div>
            <div className="small muted">{back.running ? `Scoring… ${back.left} left` : "New CVs are scored against every role automatically. This catches up on the ones uploaded earlier."}</div>
          </div>
          {!back.done && <button className="btn primary" disabled={back.running} onClick={backfill}>{back.running ? <><span className="spin" style={{ borderTopColor: "#fff" }} /> Scoring</> : "Score existing CVs"}</button>}
          <Link href={`/upload?role=${encodeURIComponent(role!.key)}`} className="btn">Add CVs for this role</Link>
        </div>
      )}

      <section className="card stack" style={{ gap: 14 }}>
        <div className="row"><span className="step on"><i>1</i></span><h2 className="h3">About the role</h2></div>
        <div className="grid-2">
          <div className="field">
            <span className="label">Role title</span>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Head of Engineering" />
            {mode === "new" && !title && <div className="row wrap" style={{ gap: 6 }}>{EXAMPLES.map((x) => <button key={x} className="chip" style={{ border: 0, cursor: "pointer" }} onClick={() => setTitle(x)}>{x}</button>)}</div>}
          </div>
          <div className="field">
            <span className="label">One-line summary (shown in lists)</span>
            <input className="input" value={tagline} maxLength={80} onChange={(e) => setTagline(e.target.value)} placeholder="e.g. Platform team · 8+ yrs" />
          </div>
        </div>
        <div className="field">
          <span className="label">Requirements: what the role owns and needs</span>
          <textarea className="textarea" style={{ minHeight: 150 }} value={requirements} onChange={(e) => setRequirements(e.target.value)} placeholder="Paste the job description, or write a few lines on what this person will own and what success looks like in 6 months." />
          <span className="small faint">Used to understand the role and suggest criteria. Candidates are scored on the criteria below, not on this text.</span>
        </div>
        <div className="grid-2">
          <div className="field">
            <span className="label">Interview details (used in invite emails)</span>
            <input className="input" value={interview} onChange={(e) => setInterview(e.target.value)} placeholder="a 45-minute conversation with Arjun in Mumbai or on video" />
          </div>
          <div className="field">
            <span className="label">Shortlist size (how many get an interview draft)</span>
            <div className="row">
              <button className="btn icon quiet" onClick={() => setSize((n) => Math.max(1, n - 1))} aria-label="Fewer">–</button>
              <input className="input num" style={{ width: 70, textAlign: "center" }} type="number" min={1} max={50} value={size} onChange={(e) => setSize(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} />
              <button className="btn icon quiet" onClick={() => setSize((n) => Math.min(50, n + 1))} aria-label="More">+</button>
              <span className="small faint">top candidates</span>
            </div>
          </div>
        </div>
      </section>

      <section className="card stack" style={{ gap: 14 }}>
        <div className="row wrap">
          <span className="step on"><i>2</i></span><h2 className="h3">How candidates are scored</h2>
          <span className="spacer" />
          <span className={`chip ${total === 100 ? "green" : "amber"} num`}>Weights: {total}%{total !== 100 ? " (needs 100)" : ""}</span>
        </div>
        <div className="row wrap">
          <button className="btn" disabled={busy === "suggest"} onClick={suggest}>
            {busy === "suggest" ? <><span className="spin" /> Thinking…</> : <><I.Sparkle size={16} /> {crit.length ? "Re-suggest" : "Suggest"} from past hires</>}
          </button>
          <button className="btn quiet" onClick={() => setCrit((xs) => [...xs, { name: "", description: "", weight: 0 }])}><I.Plus size={16} /> Add criterion</button>
          {total !== 100 && crit.length > 0 && <button className="btn quiet" onClick={balance}>Balance to 100%</button>}
        </div>
        {crit.length === 0 && (
          <div className="empty small" style={{ padding: 24 }}>
            No criteria yet. <b>Suggest from past hires</b> turns what Kargo&apos;s best hires had in common into criteria for this role, or you can add your own.
          </div>
        )}
        <div className="stack" style={{ gap: 10 }}>
          {crit.map((c, i) => (
            <div key={i} className="crit-edit">
              <div className="row" style={{ gap: 10 }}>
                <span className="chip num">{i + 1}</span>
                <input className="input" style={{ flex: 1 }} value={c.name} onChange={(e) => setC(i, { name: e.target.value })} placeholder="Criterion name, e.g. Owns the Miss" aria-label="Criterion name" />
                <div className="row" style={{ gap: 4 }}>
                  <input className="input num" style={{ width: 72, textAlign: "right" }} type="number" min={0} max={100} value={c.weight} onChange={(e) => setC(i, { weight: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} aria-label="Weight percent" />
                  <span className="small faint">%</span>
                </div>
                <button className="btn icon ghost" onClick={() => setCrit((xs) => xs.filter((_, j) => j !== i))} aria-label="Remove criterion"><I.Trash size={16} /></button>
              </div>
              <textarea className="textarea" style={{ minHeight: 70 }} value={c.description} onChange={(e) => setC(i, { description: e.target.value })} placeholder="What a strong candidate looks like, specifically enough to score a CV the same way twice. e.g. Strong: … Partial (2-3): … Weak (0-1): …" aria-label="What strong looks like" />
            </div>
          ))}
        </div>
      </section>

      <div className="detail-actions dock">
        <button className="btn primary lg" disabled={!valid || busy === "save" || (mode === "edit" && !dirty)} onClick={save}>
          {busy === "save" ? <><span className="spin" style={{ borderTopColor: "#fff" }} /> Saving</> : mode === "new" ? <><I.Check size={17} /> Create role</> : <><I.Check size={17} /> Save changes</>}
        </button>
        <Link href={mode === "edit" ? `/?role=${encodeURIComponent(role!.key)}` : "/roles"} className="btn quiet lg">Cancel</Link>
        <span className="small faint" style={{ marginLeft: "auto" }}>
          {!title.trim() ? "Add a title" : crit.length === 0 ? "Add at least one criterion" : total !== 100 ? "Weights must add up to 100%" : mode === "edit" && dirty ? "Changed criteria re-score CVs when you press Update scores" : ""}
        </span>
      </div>

      {mode === "edit" && (
        <div className="row small faint" style={{ justifyContent: "flex-end" }}>
          {archiving ? (
            <span className="row"><span>{role!.archived ? "Reopen this role?" : "Archive this role? Candidates are kept; it just leaves the sidebar."}</span>
              <button className="btn sm quiet" onClick={() => setArchiving(false)}>Keep</button>
              <button className="btn sm" onClick={toggleArchive} disabled={busy === "archive"}>{role!.archived ? "Reopen" : "Archive"}</button></span>
          ) : <button className="btn sm ghost" onClick={() => setArchiving(true)}><I.Lock size={14} /> {role!.archived ? "Reopen role" : "Archive role"}</button>}
        </div>
      )}
    </div>
  );
}
