import { NextResponse } from "next/server";
import { getRole, redactSecrets, saveRole, setRoleArchived } from "@/lib/db";
import { normalizeCriteria } from "@/lib/pipeline";

export const runtime = "nodejs";

// Update a role. Changing criteria affects new scores; existing ones can be re-scored from the Roles page.
export async function PUT(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  try {
    const cur = await getRole(key);
    if (!cur) throw new Error("Role not found");
    const b = await req.json();
    if (typeof b.archived === "boolean" && Object.keys(b).length === 1) {
      await setRoleArchived(key, b.archived);
      return NextResponse.json({ ok: true });
    }
    const criteria = normalizeCriteria(b.criteria ?? []);
    if (criteria.length < 1) throw new Error("Add at least one scoring criterion");
    await saveRole(
      {
        ...cur,
        title: String(b.title ?? cur.title).trim() || cur.title,
        tagline: String(b.tagline ?? cur.tagline).slice(0, 80),
        requirements: String(b.requirements ?? cur.requirements),
        interview_note: String(b.interview_note ?? cur.interview_note),
        shortlist_size: Math.min(50, Math.max(1, Number(b.shortlist_size) || cur.shortlist_size)),
      },
      criteria
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: redactSecrets(e instanceof Error ? e.message : String(e)) }, { status: 400 });
  }
}
