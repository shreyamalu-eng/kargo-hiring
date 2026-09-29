import Link from "next/link";
import Shell from "../ui/Shell";
import { I } from "../ui/icons";
import { RUBRIC_ROWS } from "@/lib/schema";

export const metadata = { title: "How it works · Kargo Hiring" };

const steps = [
  { t: "You add CVs", d: "Pick the role, drop the files.", icon: <I.Upload size={20} />, c: ["var(--accent-soft)", "var(--accent)"] },
  { t: "Contact details removed", d: "Name, email, phone and links are split off and never sent to the AI.", icon: <I.Lock size={20} />, c: ["var(--grey-soft)", "var(--ink-2)"] },
  { t: "Scored on both rubrics", d: "Every CV gets a 0–5 score and a reason on each criterion, for PM and Senior PM.", icon: <I.Target size={20} />, c: ["var(--blue-soft)", "var(--blue)"] },
  { t: "Brief + draft reply", d: "Top 5 get an interview brief and invite. Everyone else gets a kind decline.", icon: <I.Sparkle size={20} />, c: ["var(--green-soft)", "var(--green)"] },
  { t: "You decide and send", d: "Nothing leaves without your click. Your name goes back in only at send time.", icon: <I.Send size={20} />, c: ["var(--amber-soft)", "var(--amber)"] },
];

const sources: Record<string, string> = {
  hands_on_ops: "Rohan, Sunita, Aditya, Meghna and Lavanya all ran shipments, documentation or carriers themselves. None of the lower-rated hires did.",
  unasked_builds: "Rohan's tracker and weekend prototype, Sunita's workflow redesign, Lavanya's dashboard, Meghna's onboarding framework.",
  owns_the_miss: "Lavanya killed her own features and wrote the outage post-mortem. Aditya's lost-deal post-mortem became standard practice.",
  direct_line: "Rohan worked \"without a product layer\". Aditya had \"no account manager layer\".",
  makes_the_call: "Lavanya's engineering lead: \"made calls we trusted immediately. She doesn't hedge.\"",
};

export default function About() {
  const roles = [
    { r: "PM", t: "Product Manager" },
    { r: "SPM", t: "Senior Product Manager" },
  ] as const;
  return (
    <Shell active="about">
      <div className="stack" style={{ gap: 22, maxWidth: 1080 }}>
        <div>
          <div className="label">HOW IT WORKS</div>
          <h1 className="h1">The system ranks and explains. You decide.</h1>
          <p className="muted" style={{ margin: "6px 0 0", maxWidth: 640 }}>
            You look at the list once, in minutes rather than evenings, because the ranking does the heavy lifting. It never rejects anyone on your behalf.
          </p>
        </div>

        <div className="flow">
          {steps.map((s, i) => (
            <div className="card" key={s.t}>
              <div className="ic" style={{ background: s.c[0], color: s.c[1] }}>{s.icon}</div>
              <div className="label">STEP {i + 1}</div>
              <div className="h3" style={{ margin: "2px 0 4px" }}>{s.t}</div>
              <div className="small muted">{s.d}</div>
            </div>
          ))}
        </div>

        <section className="card stack">
          <div className="row"><span className="chip accent"><I.Shield size={13} /> Your data &amp; privacy</span></div>
          <div className="qa">
            <div className="h3">What&apos;s the difference between Gemini&apos;s free tier and the paid Gemini API for the data we send?</div>
            <div className="muted">On the free tier (AI Studio, no billing), Google may use prompts and responses to improve its models. With billing turned on, it does not. It&apos;s one setting, and the data is treated completely differently. For real candidates, use a billing-enabled key.</div>
          </div>
          <div className="qa">
            <div className="h3">What does the extraction step do that keeps the pipeline DPDP-compliant?</div>
            <div className="muted">When a CV arrives, the name, email, phone and profile links are split off and stored only in your own database. Every AI call after that gets the redacted CV text (&ldquo;[CANDIDATE]&rdquo;, &ldquo;[EMAIL]&rdquo;). The real name is put back into the email on our server only at the moment you press send.</div>
          </div>
          <div className="qa">
            <div className="h3">What will this system never do?</div>
            <div className="muted">It never sends an email by itself and never auto-rejects. A wrong rejection is invisible and can&apos;t be undone, so every send is one person&apos;s decision: yours. Only addresses on the allowed domain can be emailed.</div>
          </div>
        </section>

        <section className="stack">
          <div>
            <h2 className="h2">The rubric</h2>
            <p className="muted small" style={{ margin: "4px 0 0" }}>Built from what your best hires had in common, not from the job descriptions. Senior PM uses the same criteria with a higher bar on independence.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
            {roles.map(({ r, t }) => (
              <div className="card stack" key={r} style={{ gap: 14 }}>
                <div className="row"><span className={`chip ${r === "PM" ? "accent" : "blue"}`}>{r === "PM" ? <I.Users size={13} /> : <I.Star size={13} />} {t}</span></div>
                <div className="weights">
                  {RUBRIC_ROWS.filter((x) => x.role === r).map((x) => (
                    <div className="weight-row" key={x.key}>
                      <b style={{ fontWeight: 600 }}>{x.name}</b><span className="num small muted" style={{ textAlign: "right" }}>{x.weight}%</span>
                      <div className="bar"><i style={{ width: `${x.weight * 2.5}%` }} /></div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="card stack" style={{ gap: 10 }}>
            <h3 className="h3">Where each criterion came from</h3>
            {RUBRIC_ROWS.filter((x) => x.role === "PM").map((x) => (
              <div key={x.key} className="qa" style={{ padding: "12px 14px" }}>
                <b style={{ fontWeight: 600 }}>{x.name}</b>
                <div className="small muted">{sources[x.key] ?? ""}</div>
              </div>
            ))}
          </div>
        </section>

        <div className="row wrap">
          <Link href="/upload" className="btn primary lg"><I.Plus size={18} /> Add CVs</Link>
          <a href="/api/export" className="btn quiet lg"><I.Download size={18} /> Export the decision record</a>
        </div>
      </div>
    </Shell>
  );
}
