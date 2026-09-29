export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="wrap" style={{ maxWidth: 360, paddingTop: 80 }}>
      <h1 style={{ fontSize: 18 }}>Kargo Hiring</h1>
      {sp.error && <div className="notice err">Wrong password</div>}
      <form method="post" action="/api/login">
        <div className="field"><input type="password" name="password" placeholder="Password" autoFocus /></div>
        <button className="primary" type="submit">Sign in</button>
      </form>
    </div>
  );
}
