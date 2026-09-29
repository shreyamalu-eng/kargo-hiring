"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Candidate, Criterion, Role } from "@/lib/types";

export type CardData = Omit<Candidate, "cv_text"> & { rank: number | null; preview: { subject: string; body: string } | null };

type Props = {
  role: Role;
  other: Role;
  cards: CardData[];
  pending: CardData[];
  counts: Record<Role, number>;
  shortlist: number;
  rubric: Criterion[];
  resendReady: boolean;
  pendingDrafts: number;
};

async function api(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

export default function Dashboard({ role, other, cards, pending, counts, shortlist, rubric, resendReady, pendingDrafts }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>((cards.find((c) => c.email_status !== "sent") ?? cards[0])?.id ?? null);
  const [filter, setFilter] = useState<"all" | "todo" | "sent">("todo");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);

  const needsDrafts = pendingDrafts;
  const sent = cards.filter((c) => c.email_status === "sent").length;
  const visible = cards.filter((c) => (filter === "all" ? true : filter === "sent" ? c.email_status === "sent" : c.email_status !== "sent"));

  async function generateDrafts() {
    setBusy("drafts");
    setMsg({ text: "Generating briefs and drafts…" });
    try {
      for (let i = 0; i < 40; i++) {
        const r = await api("/api/drafts", "POST", { role });
        router.refresh();
        if (r.remaining === 0) { setMsg({ text: "All briefs and drafts are ready." }); break; }
        if (r.done === 0 && r.lastError) {
          if (String(r.lastError).startsWith("RATE_LIMITED")) { setMsg({ text: `Gemini rate limit hit - waiting 30s… (${r.remaining} left)` }); await new Promise((s) => setTimeout(s, 30_000)); continue; }
          throw new Error(r.lastError);
        }
        setMsg({ text: `Generating… ${r.remaining} left` });
      }
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), err: true });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="wrap">
      <header className="top">
        <h1>Kargo Hiring · {role === "PM" ? "Product Manager" : "Senior Product Manager"}</h1>
        <nav className="tabs">
          <a className={`tab ${role === "PM" ? "on" : ""}`} href="/?role=PM">PM ({counts.PM})</a>
          <a className={`tab ${role === "SPM" ? "on" : ""}`} href="/?role=SPM">SPM ({counts.SPM})</a>
        </nav>
        <a className="btn primary" href={`/upload?role=${role}`}>Upload CVs</a>
      </header>

      <div className="stats">
        <div className="stat"><b>{cards.length}</b><span>scored</span></div>
        <div className="stat"><b>{Math.min(shortlist, cards.length)}</b><span>above the line</span></div>
        <div className="stat"><b>{cards.filter((c) => c.draft_body && c.email_status !== "sent").length}</b><span>drafts ready</span></div>
        <div className="stat"><b>{sent}</b><span>sent</span></div>
        {pending.length > 0 && <div className="stat"><b>{pending.length}</b><span>processing / failed</span></div>}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} style={{ width: "auto" }}>
            <option value="todo">Not sent yet</option>
            <option value="sent">Sent</option>
            <option value="all">All</option>
          </select>
          <button onClick={generateDrafts} disabled={!!busy} className={needsDrafts ? "primary" : ""}>
            {busy === "drafts" ? "Working…" : needsDrafts ? `Generate drafts (${needsDrafts})` : "Refresh drafts"}
          </button>
        </div>
      </div>

      {!resendReady && <div className="notice">RESEND_API_KEY is not set yet - you can review and edit drafts, but sending is disabled.</div>}
      {msg && <div className={`notice ${msg.err ? "err" : ""}`}>{msg.text}</div>}
      {cards.length === 0 && pending.length === 0 && (
        <div className="notice">No candidates yet for this role. <a href={`/upload?role=${role}`}>Upload CVs</a> to get started.</div>
      )}

      {visible.map((c, i) => (
        <div key={c.id}>
          {c.rank === shortlist + 1 && (filter !== "sent") && (i === 0 || visible[i - 1].rank! <= shortlist) && (
            <div className="line">Shortlist line · below here: recommended rejection</div>
          )}
          <Card
            c={c}
            role={role}
            other={other}
            shortlist={shortlist}
            rubric={rubric}
            open={open === c.id}
            toggle={() => setOpen(open === c.id ? null : c.id)}
            resendReady={resendReady}
            onDone={(text, err) => { setMsg({ text, err }); router.refresh(); }}
          />
        </div>
      ))}

      {pending.length > 0 && (
        <>
          <h3 style={{ marginTop: 28 }}>Processing / failed</h3>
          {pending.map((c) => (
            <PendingRow key={c.id} c={c} onDone={(text, err) => { setMsg({ text, err }); router.refresh(); }} />
          ))}
        </>
      )}
    </div>
  );
}

function Dots({ n }: { n: number }) {
  return <span className="dots">{"●".repeat(n)}<span style={{ color: "#cfd6dc" }}>{"●".repeat(5 - n)}</span></span>;
}

function Card({ c, role, other, shortlist, rubric, open, toggle, resendReady, onDone }: {
  c: CardData; role: Role; other: Role; shortlist: number; rubric: Criterion[]; open: boolean; toggle: () => void; resendReady: boolean;
  onDone: (text: string, err?: boolean) => void;
}) {
  const s = c.scores?.[role];
  const os = c.scores?.[other];
  const above = (c.rank ?? 99) <= shortlist;
  const recommended = above ? "invite" : "rejection";
  const [subject, setSubject] = useState(c.draft_subject ?? "");
  const [body, setBody] = useState(c.draft_body ?? "");
  const [email, setEmail] = useState(c.personal_details?.email ?? "");
  const [name, setName] = useState(c.personal_details?.name ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [synced, setSynced] = useState(c.draft_body);
  if (synced !== c.draft_body) { setSynced(c.draft_body); setSubject(c.draft_subject ?? ""); setBody(c.draft_body ?? ""); }
  const dirty = subject !== (c.draft_subject ?? "") || body !== (c.draft_body ?? "") || email !== (c.personal_details?.email ?? "") || name !== (c.personal_details?.name ?? "");
  const isSent = c.email_status === "sent";

  async function run(label: string, fn: () => Promise<unknown>, okText: string) {
    setBusy(label);
    try { await fn(); onDone(okText); } catch (e) { onDone(e instanceof Error ? e.message : String(e), true); } finally { setBusy(null); }
  }
  const save = () => api(`/api/candidates/${c.id}`, "PATCH", { action: "save", draft_subject: subject, draft_body: body, email, name });

  return (
    <div className="card">
      <div className="head" onClick={toggle}>
        <div className="rank">#{c.rank}</div>
        <div>
          <div className="name">{c.personal_details?.name || c.file_name}</div>
          <div className="sub">{c.headline}</div>
        </div>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span className="score">{s?.total ?? "-"}</span>
            <span className="sub">{other}: {os?.total ?? "-"}</span>
          </div>
          <div className="bar"><i style={{ width: `${s?.total ?? 0}%` }} /></div>
        </div>
        <div className="badges">
          {os && s && os.total >= s.total + 10 && <span className="badge">stronger {other} fit</span>}
          {isSent ? <span className="badge sent">sent {c.draft_type}</span>
            : c.draft_type ? <span className={`badge ${c.draft_type}`}>{c.draft_type}{c.draft_locked && c.draft_type !== recommended ? " (your call)" : ""}</span>
            : <span className="badge">no draft yet</span>}
          {c.email_status === "failed" && <span className="badge err">send failed</span>}
        </div>
      </div>

      {open && (
        <div className="body">
          <div>
            {c.brief && (<><h4>Interview brief</h4><div className="brief">{c.brief}</div></>)}
            <h4>Why ranked #{c.rank} - {role} rubric</h4>
            <table className="crit">
              <tbody>
                {(s?.criteria ?? []).map((x) => (
                  <tr key={x.key} title={rubric.find((r) => r.key === x.key)?.description}>
                    <td style={{ width: "34%" }}><b>{x.name}</b><div className="sub">{x.weight}%</div></td>
                    <td style={{ width: 70 }}><Dots n={x.score} /></td>
                    <td>{x.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {os && <p className="sub">Also scored {os.total}/100 on the {other} rubric.</p>}
            <p className="sub">File: {c.file_name}{c.personal_details?.phone ? ` · ${c.personal_details.phone}` : ""}</p>
          </div>

          <div onClick={(e) => e.stopPropagation()}>
            <h4>
              {isSent ? `Sent ${new Date(c.sent_at!).toLocaleString()} to ${c.sent_to}` : `Draft ${c.draft_type ?? ""} email`}
              {!isSent && c.draft_type && c.draft_type !== recommended && " · differs from recommendation"}
            </h4>
            {c.email_error && !isSent && <div className="notice err">{c.email_error}</div>}
            {!c.draft_body && !isSent && <div className="notice">No draft yet - click “Generate drafts” above.</div>}
            {c.draft_body && (
              <>
                <div className="row" style={{ marginTop: 0 }}>
                  <div className="field" style={{ flex: 1 }}><label>Name ([NAME] = first name)</label><input type="text" value={name} disabled={isSent} onChange={(e) => setName(e.target.value)} /></div>
                  <div className="field" style={{ flex: 1.4 }}><label>To</label><input type="email" value={email} disabled={isSent} onChange={(e) => setEmail(e.target.value)} /></div>
                </div>
                <div className="field"><label>Subject</label><input type="text" value={subject} disabled={isSent} onChange={(e) => setSubject(e.target.value)} /></div>
                <div className="field"><label>Body</label><textarea value={isSent ? (c.preview?.body ?? body) : body} disabled={isSent} onChange={(e) => setBody(e.target.value)} /></div>
              </>
            )}
            {!isSent && (
              <div className="row">
                {dirty && <button disabled={!!busy} onClick={() => run("save", save, "Saved")}>Save edits</button>}
                <button disabled={!!busy} onClick={() => run("switch", () => api(`/api/candidates/${c.id}`, "PATCH", { action: "switch", draft_type: c.draft_type === "invite" ? "rejection" : "invite" }), "Switched draft")}>
                  {busy === "switch" ? "Drafting…" : c.draft_type === "invite" ? "Switch to rejection" : "Switch to invite"}
                </button>
                {c.draft_body && <button disabled={!!busy} onClick={() => run("regen", () => api(`/api/candidates/${c.id}`, "PATCH", { action: "regenerate" }), "New draft ready")}>{busy === "regen" ? "Drafting…" : "Regenerate"}</button>}
                <span style={{ flex: 1 }} />
                <button
                  className="primary"
                  disabled={!!busy || !c.draft_body || !resendReady || !email}
                  onClick={() => {
                    if (!confirm(`Send this ${c.draft_type} to ${email}?\n\nSubject: ${subject.replaceAll("[NAME]", name.split(" ")[0])}`)) return;
                    run("send", async () => { if (dirty) await save(); await api("/api/send", "POST", { id: c.id }); }, `Sent to ${email}`);
                  }}
                >
                  {busy === "send" ? "Sending…" : "Confirm & send"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PendingRow({ c, onDone }: { c: CardData; onDone: (t: string, err?: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); onDone(ok); } catch (e) { onDone(e instanceof Error ? e.message : String(e), true); } finally { setBusy(false); }
  };
  return (
    <div className="card">
      <div className="head" style={{ cursor: "default" }}>
        <div className="rank">–</div>
        <div>
          <div className="name">{c.personal_details?.name || c.file_name}</div>
          <div className="sub">{c.status === "error" ? c.error : "Processing…"}</div>
        </div>
        <div />
        <div className="badges">
          <button disabled={busy} onClick={() => act(() => api(`/api/candidates/${c.id}`, "PATCH", { action: "rescore" }), "Re-scored")}>Retry scoring</button>
          <button className="danger" disabled={busy} onClick={() => confirm("Delete this candidate?") && act(() => api(`/api/candidates/${c.id}`, "DELETE"), "Deleted")}>Delete</button>
        </div>
      </div>
    </div>
  );
}
