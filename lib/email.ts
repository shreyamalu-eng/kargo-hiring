import "server-only";
import { Resend } from "resend";
import { getCandidate, updateCandidate } from "./db";
import type { Candidate } from "./types";

export function firstName(c: Candidate) {
  return (c.personal_details?.name ?? "").trim().split(/\s+/)[0] || "there";
}

/** The only place the real name is put back into the text - at render/send time, on our server. */
export function renderEmail(c: Candidate) {
  const name = firstName(c);
  return {
    subject: (c.draft_subject ?? "").replaceAll("[NAME]", name),
    body: (c.draft_body ?? "").replaceAll("[NAME]", name),
  };
}

function allowed(email: string) {
  const domains = (process.env.EMAIL_ALLOWED_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  if (!domains.length) return true;
  return domains.some((d) => email.toLowerCase().endsWith("@" + d));
}

export async function sendCandidateEmail(id: string) {
  const c = await getCandidate(id);
  if (c.email_status === "sent") throw new Error("Already sent");
  if (!c.draft_body || !c.draft_subject) throw new Error("No draft to send yet");
  const to = c.personal_details?.email;
  if (!to) throw new Error("No email address found on this CV - add one on the card first");
  if (!allowed(to)) throw new Error(`Blocked: ${to} is outside EMAIL_ALLOWED_DOMAINS (${process.env.EMAIL_ALLOWED_DOMAINS})`);
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set");

  const { subject, body } = renderEmail(c);
  if (/\[(NAME|CANDIDATE|EMAIL|PHONE|LINK)\]/.test(subject + body)) throw new Error("Draft still contains a placeholder - edit it first");

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({
    from: process.env.RESEND_FROM || "Arjun Mehta <onboarding@resend.dev>",
    to,
    subject,
    text: body,
  });
  if (error) {
    await updateCandidate(id, { email_status: "failed", email_error: error.message });
    throw new Error(`Resend: ${error.message}`);
  }
  await updateCandidate(id, {
    email_status: "sent",
    email_error: null,
    sent_at: new Date().toISOString(),
    sent_to: to,
    resend_id: data?.id ?? null,
  });
  return getCandidate(id);
}
