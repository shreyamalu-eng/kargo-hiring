# Kargo Hiring Dashboard

Internal tool for Arjun (Case 2). Upload CVs → personal details split off → scored against the PM **and** SPM rubric → ranked → 3-sentence brief for the shortlist → invite / rejection draft for everyone → Arjun reviews and clicks **Confirm & send** (Resend). Nothing is ever sent without that click.

Stack: Next.js 15 (App Router) · Neon (Postgres) · Gemini Flash · Resend · Vercel.

## Pipeline (matches the Components Map)

| Step | Where | What happens |
|---|---|---|
| Trigger / Input | `/upload` | Founder picks PM or SPM and drops one or many CVs (PDF / DOCX / TXT) |
| Context | `lib/extract.ts` (our code, **not** AI) | Text extracted. Name, email, phone, profile links and handles are pulled into `personal_details`, and redacted from the CV text as `[CANDIDATE]`, `[EMAIL]`, `[PHONE]`, `[LINK]` |
| Processing | `lib/pipeline.ts → scoreCandidate` | One Gemini call scores the **redacted** CV 0–5 on every criterion of both rubrics, with a one-line evidence reason. Weighted totals (0–100) are computed in code |
| AI | `refreshDrafts` | Top `SHORTLIST_SIZE` per role get a 3-sentence brief (who / why ranked here / what to probe) + interview invite. Everyone else gets a warm rejection. Drafts use `[NAME]` |
| Output | `/` dashboard | Ranked per role, shortlist line, per-criterion breakdown, brief, editable draft, other-role score and a "stronger SPM fit" flag |
| Email | `/api/send` | Only on Confirm & send: `[NAME]` is replaced with the real first name on the server, sent via Resend, row marked `sent` |

**The Cut (checks 06 + 09):** no auto-send and no auto-rejection. The system recommends; Arjun can switch any invite ↔ rejection ("your call" is then locked so re-ranking won't override it), edit the text, and send one at a time.

## Setup

Run these in Terminal **inside this folder** (`cargo/kargo-hiring-dashboard`):

```bash
npm i -g neon@latest && neon login      # opens the browser to sign in
neon skills -y
neon mcp -y
neon link --project-id purple-darkness-57650812 --branch production -y
npm install                              # neon.ts + @neon/config are already here (neon config init was run)
neon deploy                              # applies neon.ts and writes DATABASE_URL into .env
npm run db:setup                         # creates the tables and loads rubric.txt (10 rows)
```

Then `cp .env.example .env.local` and fill in `GEMINI_API_KEY` (and later `RESEND_API_KEY`). `DATABASE_URL` is already in `.env`.
`GEMINI_MODEL` defaults to `gemini-3.5-flash`; change it if your key lists a different Flash model.

`npm run dev` → http://localhost:3000

Deploy: push to GitHub (`.env` and `.env.local` are git-ignored) → import in Vercel → add `DATABASE_URL`, `GEMINI_API_KEY`, `RESEND_API_KEY`, `EMAIL_ALLOWED_DOMAINS`, `RESEND_FROM`, `DASHBOARD_PASSWORD` → deploy. Set `DASHBOARD_PASSWORD` — the dashboard shows personal details.

Changed the rubric? Edit `rubric.txt`, then `npm run db:setup` again (safe to re-run; it replaces the rubric rows and keeps candidates).

## B-1 · test the pipeline

Upload 3 CVs first (a strong PM, a weak SPM, an ambiguous one) with the right role. In Neon Console → Tables → `candidates`: `personal_details` has name/email/phone; `cv_text` has none of them; `scores` has both `PM` and `SPM`. Then upload the rest. The upload page generates briefs and drafts automatically at the end; **Generate drafts** on the dashboard finishes anything left (e.g. after a rate limit).

Gemini free tier is rate-limited to a few requests a minute — the app waits and retries, so 60 CVs take several minutes.

## B-2 · Resend

Add `RESEND_API_KEY` in Vercel and redeploy. `EMAIL_ALLOWED_DOMAINS=pg27.mesaschool.co` blocks any address outside the MESA test domain.
With the default sender `onboarding@resend.dev`, Resend only delivers to the email address your Resend account was created with — sign up with the MESA test inbox, or verify a domain and set `RESEND_FROM`.

## Data privacy block

- Gemini free tier (AI Studio, unbilled key): Google may use prompts and responses to improve its models. Billing-enabled API: it doesn't. Use a billed key for real candidates.
- The extraction step keeps identifiers (name, email, phone, links) in Neon only. Every AI call gets redacted content; the real name is substituted only when the email is sent.

## Rubric

See `rubric.txt` — 5 criteria derived from what the *Exceeds Expectations* hires (Rohan, Sunita, Aditya, Meghna, Lavanya) share and the others (Vikram, Rahul, Preetham) lack. No criterion comes from the JDs; each names the hire profiles it came from.

| Criterion | PM | SPM |
|---|---|---|
| Hands-on Operations Time | 30% | 25% |
| Unasked Builds That Got Adopted | 25% | 15% |
| Owns the Miss | 20% | 20% |
| Direct Line to the User | 15% | 10% |
| Makes the Call | 10% | 30% |
