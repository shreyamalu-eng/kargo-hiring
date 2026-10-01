import "server-only";
import { cookies } from "next/headers";

/**
 * Workspaces let anyone start from scratch without touching anyone else's data.
 * "main" is the founder's real workspace. A fresh test workspace gets a random id kept in a cookie,
 * starts with the two default roles (rubric from the past hires) and no CVs.
 */
export const WS_COOKIE = "kh_ws";
export const MAIN = "main";
const VALID = /^t[a-z0-9]{6,24}$/;

export async function workspace(): Promise<string> {
  try {
    const v = (await cookies()).get(WS_COOKIE)?.value ?? "";
    return VALID.test(v) ? v : MAIN;
  } catch {
    return MAIN; // outside a request (scripts)
  }
}

export function newWorkspaceId() {
  return "t" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}
