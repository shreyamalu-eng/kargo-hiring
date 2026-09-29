import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const res = NextResponse.redirect(new URL("/login", req.url), 303);
  res.cookies.set("kargo_auth", "", { path: "/", maxAge: 0 });
  return res;
}
