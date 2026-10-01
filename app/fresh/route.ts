import { NextResponse } from "next/server";
import { MAIN, newWorkspaceId, WS_COOKIE } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/**
 * /fresh       -> a brand-new empty workspace (default roles, no CVs). Anyone can use it; nothing else is touched.
 * /fresh?main  -> back to the main workspace.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const toMain = url.searchParams.has("main");
  const res = NextResponse.redirect(new URL(toMain ? "/" : "/?welcome=1", url.origin), 303);
  if (toMain) res.cookies.set(WS_COOKIE, MAIN, { path: "/", maxAge: 0 });
  else res.cookies.set(WS_COOKIE, newWorkspaceId(), { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax", httpOnly: true, secure: url.protocol === "https:" });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
