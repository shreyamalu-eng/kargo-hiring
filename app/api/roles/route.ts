import { NextResponse } from "next/server";
import { getRole, getRoles, nextSortOrder, redactSecrets, saveRole } from "@/lib/db";
import { normalizeCriteria } from "@/lib/pipeline";
import { slugify } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await getRoles(true));
}

// Create a role with its criteria.
export async function POST(req: Request) {
  try {
    const b = await req.json();
    const title = String(b.title ?? "").trim();
    if (!title) throw new Error("Give the role a title");
    let key = slugify(title);
    for (let i = 2; await getRole(key); i++) key = `${slugify(title)}-${i}`;
    const criteria = normalizeCriteria(b.criteria ?? []);
    if (criteria.length < 1) throw new Error("Add at least one scoring criterion");
    await saveRole(
      {
        key, title,
        tagline: String(b.tagline ?? "").slice(0, 80),
        requirements: String(b.requirements ?? ""),
        interview_note: String(b.interview_note ?? ""),
        shortlist_size: Math.min(50, Math.max(1, Number(b.shortlist_size) || 5)),
        sort_order: await nextSortOrder(),
        archived: false,
      },
      criteria
    );
    return NextResponse.json({ key });
  } catch (e) {
    return NextResponse.json({ error: redactSecrets(e instanceof Error ? e.message : String(e)) }, { status: 400 });
  }
}
