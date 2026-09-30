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

/**
 * Test mode: Resend's free sender (onboarding@resend.dev) only delivers to the Resend account's own address.
 * Set EMAIL_TEST_RECIPIENT to that address and every email goes there, with the real recipient in the subject.
 */
export function testRecipient() {
  const t = (process.env.EMAIL_TEST_RECIPIENT ?? "").trim();
  return t || null;
}

function friendlyResendError(msg: string) {
  if (/only send testing emails to your own email/i.test(msg))
    return "Resend's free test sender can only email your own Resend address. Add EMAIL_TEST_RECIPIENT (your address) in Vercel to test, or verify a domain in Resend to email candidates.";
  if (/api key is invalid|invalid api key|unauthor/i.test(msg)) return "Resend rejected the API key. Check RESEND_API_KEY in Vercel.";
  return `Resend: ${msg}`;
}

export async function sendCandidateEmail(id: string) {
  const c = await getCandidate(id);
  if (c.email_status === "sent") throw new Error("Already sent");
  if (!c.draft_body || !c.draft_subject) throw new Error("No draft to send yet");
  const to = c.personal_details?.email;
  if (!to) throw new Error("No email address found on this CV - add one on the card first");
  if (!testRecipient() && !allowed(to)) throw new Error(`Blocked: ${to} is outside EMAIL_ALLOWED_DOMAINS (${process.env.EMAIL_ALLOWED_DOMAINS})`);
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set");

  const { subject, body } = renderEmail(c);
  if (/\[(NAME|CANDIDATE|EMAIL|PHONE|LINK)\]/.test(subject + body)) throw new Error("Draft still contains a placeholder - edit it first");

  const test = testRecipient();
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({
    from: process.env.RESEND_FROM || "Arjun Mehta <onboarding@resend.dev>",
    to: test ?? to,
    subject: test ? `[Test · for ${to}] ${subject}` : subject,
    text: body,
  });
  if (error) {
    const msg = friendlyResendError(error.message);
    await updateCandidate(id, { email_status: "failed", email_error: msg });
    throw new Error(msg);
  }
  await updateCandidate(id, {
    email_status: "sent",
    email_error: null,
    sent_at: new Date().toISOString(),
    sent_to: test ? `${test} (test copy for ${to})` : to,
    resend_id: data?.id ?? null,
  });
  return getCandidate(id);
}
