import { getRole, redactSecrets } from "@/lib/db";
import { NextResponse } from "next/server";
import { ingest, scoreCandidate } from "@/lib/pipeline";
import { updateCandidate } from "@/lib/db";
import type { Role } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// One CV per request: extract -> split personal details -> score against every open role.
export async function POST(req: Request) {
  const deadline = Date.now() + 50_000;
  const form = await req.formData();
  const file = form.get("file");
  const role = String(form.get("role") ?? "") as Role;
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (!role || !(await getRole(role))) return NextResponse.json({ error: "Pick which role these CVs are for" }, { status: 400 });

  let id: string | null = null;
  try {
    const c = await ingest(file, role);
    id = c.id;
    const scored = await scoreCandidate(c.id, deadline);
    return NextResponse.json({ id, status: scored.status, score: scored.scores?.[role]?.total ?? null });
  } catch (e) {
    const msg = redactSecrets(e instanceof Error ? e.message : String(e));
    if (id) await updateCandidate(id, { status: "error", error: msg }).catch(() => {});
    const rateLimited = msg.startsWith("RATE_LIMITED");
    return NextResponse.json({ id, error: msg, rateLimited }, { status: rateLimited ? 429 : 500 });
  }
}
