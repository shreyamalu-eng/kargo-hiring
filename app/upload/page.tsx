"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

type Item = { file: File; state: "queued" | "working" | "done" | "error"; note?: string };

function Upload() {
  const params = useSearchParams();
  const [role, setRole] = useState<"PM" | "SPM" | "">(params.get("role") === "SPM" ? "SPM" : params.get("role") === "PM" ? "PM" : "");
  const [items, setItems] = useState<Item[]>([]);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState("");

  const set = (i: number, patch: Partial<Item>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function uploadOne(i: number, it: Item) {
    for (let attempt = 0; attempt < 6; attempt++) {
      set(i, { state: "working", note: attempt ? `retrying (${attempt})…` : "reading + scoring…" });
      const fd = new FormData();
      fd.append("file", it.file);
      fd.append("role", role);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (res.ok) return set(i, { state: "done", note: `PM ${json.pm} · SPM ${json.spm}` });
      if (res.status === 429 || json.rateLimited) {
        set(i, { note: "Gemini rate limit - waiting 30s…" });
        await new Promise((r) => setTimeout(r, 30_000));
        continue;
      }
      return set(i, { state: "error", note: json.error || `HTTP ${res.status}` });
    }
    set(i, { state: "error", note: "Gave up after repeated rate limits - retry from the dashboard" });
  }

  async function start() {
    if (!role || !items.length) return;
    setRunning(true);
    setPhase("Scoring CVs…");
    // Two at a time keeps us inside the Gemini free-tier rate limit most of the time.
    let next = 0;
    const worker = async () => {
      while (next < items.length) {
        const i = next++;
        if (items[i].state !== "done") await uploadOne(i, items[i]);
      }
    };
    await Promise.all([worker(), worker()]);

    setPhase("Generating briefs and draft emails…");
    for (let k = 0; k < 60; k++) {
      const res = await fetch("/api/drafts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ role }) });
      const r = await res.json().catch(() => ({}));
      if (!res.ok) { setPhase(`Draft generation error: ${r.error ?? res.status} - finish from the dashboard`); break; }
      if (r.remaining === 0) { setPhase("Done - all candidates scored, ranked and drafted."); break; }
      if (r.done === 0 && r.lastError) {
        if (!String(r.lastError).startsWith("RATE_LIMITED")) { setPhase(`Draft error: ${r.lastError}`); break; }
        setPhase(`Rate limited - waiting 30s (${r.remaining} drafts left)…`);
        await new Promise((s) => setTimeout(s, 30_000));
      } else setPhase(`Generating briefs and draft emails… ${r.remaining} left`);
    }
    setRunning(false);
  }

  const done = items.filter((x) => x.state === "done").length;

  return (
    <div className="wrap" style={{ maxWidth: 760 }}>
      <header className="top">
        <h1>Upload CVs</h1>
        <a className="btn" href={`/?role=${role || "PM"}`}>← Dashboard</a>
      </header>

      <div className="field">
        <label>Role these candidates applied for</label>
        <select value={role} onChange={(e) => setRole(e.target.value as "PM" | "SPM")} disabled={running}>
          <option value="">Select role…</option>
          <option value="PM">Product Manager (PM)</option>
          <option value="SPM">Senior Product Manager (SPM)</option>
        </select>
      </div>

      <label className="drop" style={{ display: "block", cursor: running ? "default" : "pointer" }}>
        <input
          type="file"
          multiple
          accept=".pdf,.docx,.txt"
          disabled={running}
          style={{ display: "none" }}
          onChange={(e) => setItems(Array.from(e.target.files ?? []).map((file) => ({ file, state: "queued" })))}
        />
        <b>Choose CV files</b>
        <div className="sub">PDF, DOCX or TXT · select one or many · each is scored against both the PM and SPM rubric</div>
      </label>

      <p className="sub">
        Personal details (name, email, phone, profile links) are separated from the CV on our server and stored only in
        the database. Gemini only ever sees the redacted CV text.
      </p>

      <div className="row">
        <button className="primary" disabled={!role || !items.length || running} onClick={start}>
          {running ? "Working…" : `Process ${items.length || ""} CV${items.length === 1 ? "" : "s"}`}
        </button>
        {phase && <span>{phase}</span>}
        {items.length > 0 && <span className="sub">{done}/{items.length} scored</span>}
      </div>

      {items.length > 0 && (
        <table className="queue" style={{ width: "100%", marginTop: 16, borderCollapse: "collapse" }}>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td>{it.file.name}</td>
                <td><span className={`badge ${it.state === "done" ? "invite" : it.state === "error" ? "err" : ""}`}>{it.state}</span></td>
                <td className="sub">{it.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function Page() {
  return <Suspense><Upload /></Suspense>;
}
