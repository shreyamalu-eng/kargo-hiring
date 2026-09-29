import { I } from "../ui/icons";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="login-wrap">
      <form method="post" action="/api/login" className="card login stack" style={{ padding: 32, gap: 18 }}>
        <span className="brand" style={{ justifyContent: "center", padding: 0 }}><span className="mark"><I.Logo size={18} /></span>Kargo Hiring</span>
        <div>
          <h1 className="h2">Welcome back, Arjun</h1>
          <p className="muted small" style={{ margin: "6px 0 0" }}>Your shortlist and replies are waiting.</p>
        </div>
        {sp.error && <div className="banner err" style={{ margin: 0 }}><I.Alert size={18} /> That password didn&apos;t match. Try again.</div>}
        <input className="input" type="password" name="password" placeholder="Password" autoFocus autoComplete="current-password" aria-label="Password" />
        <button className="btn primary lg block" type="submit">Sign in <I.ArrowRight size={18} /></button>
        <p className="small faint" style={{ margin: 0 }}><I.Lock size={12} /> Private. Candidate details are only visible after sign in.</p>
      </form>
    </div>
  );
}
