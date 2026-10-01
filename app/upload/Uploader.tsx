"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { I } from "../ui/icons";
import { SAMPLE_SETS } from "@/lib/samples";

type Role = string;
type RoleOpt = { key: string; title: string; tagline: string };
type Item = { file: File; state: "queued" | "working" | "done" | "error"; note?: string };
const MAX = 4 * 1024 * 1024; // Vercel request limit is 4.5 MB
const OK_EXT = /\.(pdf|docx|txt)$/i;

export default function Uploader({ initialRole, roles }: { initialRole: Role | null; roles: RoleOpt[] }) {
  const [role, setRole] = useState<Role | null>(initialRole);
  const [items, setItems] = useState<Item[]>([]);
  const [phase, setPhase] = useState<"pick" | "running" | "done">("pick");
  const [over, setOver] = useState(false);
  const [waitNote, setWaitNote] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [loadingSet, setLoadingSet] = useState<string | null>(null);

  // Loads one of the case's sample CV sets from /samples so anyone can test without their own files.
  async function loadSample(id: string) {
    const set = SAMPLE_SETS.find((x) => x.id === id);
    if (!set) return;
    if (set.role && roles.some((r) => r.key === set.role)) setRole(set.role);
    setLoadingSet(id);
    try {
      const files = await Promise.all(set.files.map(async (f) => {
        const r = await fetch(`/samples/${encodeURIComponent(f)}`);
        if (!r.ok) throw new Error(f);
        return new File([await r.blob()], f, { type: "application/pdf" });
      }));
      add(files);
    } catch {
      setWaitNote("Couldn't load the sample CVs. Refresh and try again.");
    } finally {
      setLoadingSet(null);
    }
  }

  // Don't lose an upload by closing the tab halfway.
  useEffect(() => {
    if (phase !== "running") return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [phase]);

  const add = (files: FileList | File[]) => {
    const list = Array.from(files);
    setItems((xs) => {
      const names = new Set(xs.map((x) => x.file.name));
      const fresh = list.filter((f) => !names.has(f.name)).map<Item>((f) =>
        !OK_EXT.test(f.name) ? { file: f, state: "error", note: "Only PDF, DOCX or TXT" }
        : f.size > MAX ? { file: f, state: "error", note: "Larger than 4 MB" }
        : { file: f, state: "queued" });
      return [...xs, ...fresh];
    });
  };
  const set = (i: number, patch: Partial<Item>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function uploadOne(i: number, it: Item) {
    for (let attempt = 0; attempt < 6; attempt++) {
      set(i, { state: "working", note: attempt ? "Retrying…" : "Reading and scoring…" });
      const fd = new FormData();
      fd.append("file", it.file);
      fd.append("role", role!);
      try {
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const json = await res.json().catch(() => ({ error: `Error ${res.status}` }));
        if (res.ok) return set(i, { state: "done", note: json.score != null ? `Scored ${Math.round(json.score)}` : "Scored" });
        if (String(json.error ?? "").startsWith("DAILY_LIMIT")) {
          setWaitNote(String(json.error).replace("DAILY_LIMIT: ", ""));
          return set(i, { state: "error", note: "Not scored yet: the AI's daily limit is used up" });
        }
        if (res.status === 429 || json.rateLimited) {
          setWaitNote("The AI is at its free-tier limit. Pausing 30 seconds, then carrying on by itself.");
          set(i, { note: "Waiting for the AI…" });
          await new Promise((r) => setTimeout(r, 30_000));
          setWaitNote(null);
          continue;
        }
        if (res.status === 502 || res.status === 503 || res.status === 504) {
          set(i, { note: "The server took too long, retrying…" });
          await new Promise((r) => setTimeout(r, 8000));
          continue;
        }
        return set(i, { state: "error", note: friendly(json.error) });
      } catch {
        set(i, { note: "Connection dropped, retrying…" });
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    set(i, { state: "error", note: "Couldn't finish. Retry it from the dashboard." });
  }

  async function start() {
    if (!role) return;
    setPhase("running");
    const queue = items.map((x, i) => ({ x, i })).filter(({ x }) => x.state === "queued" || x.state === "error" && !/Only|Larger/.test(x.note ?? ""));
    let next = 0;
    const worker = async () => { while (next < queue.length) { const { x, i } = queue[next++]; await uploadOne(i, x); } };
    await Promise.all([worker(), worker()]);
    setPhase("done");
  }

  const done = items.filter((x) => x.state === "done").length;
  const failed = items.filter((x) => x.state === "error").length;
  const valid = items.filter((x) => !(x.state === "error" && /Only|Larger/.test(x.note ?? ""))).length;
  const pct = valid ? Math.round(((done + (phase === "done" ? failed : 0)) / valid) * 100) : 0;
  const step = !role ? 1 : phase === "pick" ? 2 : 3;

  return (
    <div className="stack" style={{ maxWidth: 760, gap: 18 }}>
      <div>
        <div className="label">ADD CVS</div>
        <h1 className="h1">Who applied, and for which role?</h1>
        <p className="muted" style={{ margin: "6px 0 0" }}>Each CV is scored against every open role, ranked, and gets a draft reply. Nothing is sent until you press send.</p>
      </div>

      <div className="steps" aria-label="Progress">
        <span className={`step ${step === 1 ? "on" : "done"}`}><i>{step > 1 ? <I.Check size={13} /> : 1}</i>Role</span><span className="step-line" />
        <span className={`step ${step === 2 ? "on" : step > 2 ? "done" : ""}`}><i>{step > 2 ? <I.Check size={13} /> : 2}</i>CVs</span><span className="step-line" />
        <span className={`step ${step === 3 ? "on" : ""}`}><i>3</i>Scoring</span>
      </div>

      <div className="choice-grid">
        {roles.map((r, idx) => (
          <button key={r.key} className={`choice ${role === r.key ? "on" : ""}`} onClick={() => phase === "pick" && setRole(r.key)} disabled={phase !== "pick"} aria-pressed={role === r.key}>
            <span className="ic">{idx % 2 === 0 ? <I.Users /> : <I.Star />}</span>
            <span style={{ minWidth: 0 }}><div className="h3">{r.title}</div>
              {r.tagline && <div className="small muted">{r.tagline}</div>}</span>
            {role === r.key && <span style={{ marginLeft: "auto", color: "var(--accent)" }}><I.CheckCircle /></span>}
          </button>
        ))}
        <Link href="/roles/new" className="choice" style={{ borderStyle: "dashed" }}>
          <span className="ic"><I.Plus /></span>
          <span><div className="h3">Another role</div><div className="small muted">Add its requirements and criteria first</div></span>
        </Link>
      </div>

      {role && phase === "pick" && (
        <label
          className={`drop ${over ? "over" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
        >
          <input ref={input} type="file" multiple accept=".pdf,.docx,.txt" hidden onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ""; }} />
          <span className="art"><I.Upload size={26} /></span>
          <span className="h3">Drop CVs here, or tap to choose</span>
          <span className="small faint">PDF, DOCX or TXT · select as many as you like</span>
        </label>
      )}

      {phase === "pick" && (
        <section className="card stack" id="samples" style={{ gap: 12 }}>
          <div>
            <h3 className="h3">No CVs at hand? Use the case&apos;s sample CVs</h3>
            <p className="small muted" style={{ margin: "4px 0 0" }}>Fictional applicants from the Kargo case. They go through exactly the same pipeline as real uploads.</p>
          </div>
          <div className="samples">
            {SAMPLE_SETS.map((x) => (
              <button key={x.id} className="choice" disabled={!!loadingSet} onClick={() => loadSample(x.id)}>
                <span className="ic">{loadingSet === x.id ? <span className="spin" /> : <I.File />}</span>
                <span><div className="h3">{x.label}</div><div className="small muted">{x.files.length} PDFs{x.role ? ` · usually for ${roles.find((r) => r.key === x.role)?.title ?? x.role}` : " · any role"}</div></span>
              </button>
            ))}
          </div>
          {<p className="small faint" style={{ margin: 0 }}>Picking a PM or Senior PM set also selects that role. You can change it before scoring.</p>}
        </section>
      )}

      {waitNote && <div className="banner"><span className="spin" />{waitNote}</div>}

      {items.length > 0 && (
        <section className="card stack" style={{ gap: 12 }}>
          <div className="row">
            <h3 className="h3">{phase === "pick" ? `${valid} CV${valid === 1 ? "" : "s"} ready` : phase === "running" ? `Scoring ${done} of ${valid}…` : `Done · ${done} scored${failed ? ` · ${failed} need attention` : ""}`}</h3>
            <span className="spacer" />
            {phase === "pick" && <button className="btn sm ghost" onClick={() => setItems([])}>Clear</button>}
          </div>
          {phase !== "pick" && <div className="bar"><i style={{ width: `${pct}%` }} /></div>}
          <div className="stack" style={{ gap: 6, maxHeight: 360, overflow: "auto" }}>
            {items.map((it, i) => ({ it, i })).sort((a, b) => (phase === "pick" ? 0 : (b.it.state === "error" ? 1 : 0) - (a.it.state === "error" ? 1 : 0))).map(({ it, i }) => (
              <div className="file-row" key={it.file.name}>
                <span className="ic">{it.state === "working" ? <span className="spin" /> : it.state === "done" ? <I.CheckCircle size={18} className="" /> : it.state === "error" ? <I.Alert size={18} /> : <I.File size={18} />}</span>
                <span style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.file.name}</div>
                  {it.note && <div className="small" style={{ color: it.state === "error" ? "var(--rose)" : "var(--ink-3)" }}>{it.note}</div>}
                </span>
                {phase === "pick"
                  ? <button className="btn sm ghost icon" aria-label={`Remove ${it.file.name}`} onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}><I.X size={16} /></button>
                  : <span className={`chip ${it.state === "done" ? "green" : it.state === "error" ? "rose" : ""}`}>{it.state === "done" ? "Scored" : it.state === "error" ? "Problem" : it.state === "working" ? "Working" : "Queued"}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="row wrap">
        {phase === "pick" && (
          <button className="btn primary lg" disabled={!role || valid === 0} onClick={start}>
            <I.Sparkle size={18} /> {valid ? `Score ${valid} CV${valid === 1 ? "" : "s"}` : "Choose CVs first"}
          </button>
        )}
        {phase === "running" && <span className="small muted">Keep this tab open. About 10 seconds per CV.</span>}
        {phase === "done" && (
          <>
            <Link href={`/?role=${role}`} className="btn primary lg">Review the shortlist <I.ArrowRight size={18} /></Link>
            <button className="btn quiet lg" onClick={() => { setItems([]); setPhase("pick"); }}>Add more</button>
          </>
        )}
      </div>
      {phase === "done" && <p className="small faint" style={{ margin: 0 }}>Briefs and draft emails are written automatically while you review.</p>}
    </div>
  );
}

function friendly(e?: string) {
  if (!e) return "Something went wrong";
  if (/scanned|read text/i.test(e)) return "This file is an image. Upload a text-based PDF or DOCX.";
  if (/already been emailed/i.test(e)) return "Already emailed, so it was left as is";
  if (/NOT_A_CV/.test(e)) return "This looks like a job description, not a CV. It wasn't added to the ranking.";
  if (/GEMINI_API_KEY|DATABASE_URL/.test(e)) return "The app isn't fully set up: " + e;
  return e.length > 140 ? e.slice(0, 140) + "…" : e;
}
