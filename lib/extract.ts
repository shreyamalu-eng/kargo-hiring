// Step 1 of the pipeline (runs in our code, never in the AI):
// read the CV file, pull out personal details, and redact them from the text the AI will see.
import type { PersonalDetails } from "./types";

export async function extractText(buf: Buffer, fileName: string): Promise<string> {
  const ext = fileName.toLowerCase().split(".").pop();
  if (ext === "pdf") {
    const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await pdfText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join("\n") : text;
  }
  if (ext === "docx") {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return value;
  }
  if (ext === "txt" || ext === "md") return buf.toString("utf8");
  throw new Error(`Unsupported file type .${ext} - upload PDF, DOCX or TXT`);
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const URL_RE =
  /[\w.-]*(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com|github\.com|gitlab\.com|leetcode\.com|behance\.net|medium\.com|twitter\.com|x\.com)\/[^\s|·,;)]*|\bhttps?:\/\/[^\s|·,;)]+|\b[\w-]+\.(?:vercel\.app|netlify\.app|github\.io|notion\.site|substack\.com)[^\s|·,;)]*/gi;
// A run of digits with separators. PDF text sometimes glues duplicated numbers together
// ("+91 98202 1134598202 11345"), so a run counts as a phone if it contains a 10-digit mobile.
const PHONE_CANDIDATE_RE = /\+?\(?\d[\d \t().-]{8,}\d/g;
const MOBILE_RE = /[6-9]\d{9}/;
const localDigits = (d: string) => (d.length > 10 && d.startsWith("91") ? d.slice(2) : d.length > 10 && d.startsWith("0") ? d.slice(1) : d);

const HEADING_WORDS =
  /^(curriculum|vitae|resume|résumé|profile|summary|professional|experience|education|skills|contact|about|objective|work|product|manager|senior|associate|lead|head|director|consultant|engineer|analyst|executive|operations)$/i;

function titleCase(s: string) {
  return s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

/** Name from the file name ("pm_01_priya_krishnan.pdf" -> "Priya Krishnan"), else from the first lines of the CV. */
export function guessName(text: string, fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "");
  const fromFile = base
    .replace(/^(?:pm|spm|cv|resume)?[_-]?\d+[_-]/i, "")
    .replace(/[_-]?(?:cv|resume|final|updated|v\d+)$/gi, "")
    .split(/[_\-\s]+/)
    .filter((w) => /^[a-z]{2,}$/i.test(w) && !HEADING_WORDS.test(w));
  if (fromFile.length >= 2 && fromFile.length <= 4) return titleCase(fromFile.join(" "));

  for (const line of text.split(/\r?\n/).slice(0, 12)) {
    const words = line.trim().split(/\s+/).filter(Boolean);
    if (words.length >= 2 && words.length <= 4 && words.every((w) => /^[A-Za-z.'-]{2,}$/.test(w)) && !words.some((w) => HEADING_WORDS.test(w)))
      return titleCase(words.join(" "));
  }
  return fromFile.length ? titleCase(fromFile.join(" ")) : "Candidate";
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const isLetter = (c: string | undefined) => !!c && /\p{L}/u.test(c);
const isUpper = (c: string | undefined) => !!c && c !== c.toLowerCase() && c === c.toUpperCase();

/**
 * Redact a name token case-insensitively, including where PDF layout has glued it to other text
 * ("KumarRAVI", "64037ravi-"), but not inside ordinary words ("Senior" for "Sen", "Dashboard" for "Das").
 */
function redactToken(text: string, token: string): string {
  const re = new RegExp(escapeRe(token), "gi");
  return text.replace(re, (m, offset: number) => {
    const prev = text[offset - 1];
    const next = text[offset + m.length];
    const startOk = !isLetter(prev) || isUpper(m[0]);
    const allCaps = m === m.toUpperCase();
    const endOk = !isLetter(next) || (isUpper(next) && (!allCaps || token.length >= 5 || !isLetter(prev) || !isUpper(prev)));
    const midCapsWord = allCaps && isUpper(prev) && isUpper(next); // e.g. "SEN" inside "ABSENT"
    return startOk && endOk && !midCapsWord ? "[CANDIDATE]" : m;
  });
}

export function splitPersonalDetails(rawText: string, fileName: string): { personal: PersonalDetails; cvText: string } {
  let text = rawText.replace(/\u0000/g, "");

  // Strip an all-caps name glued in front of the address by the PDF layout ("REDDYsquad_5@...").
  const emails = [...new Set((text.match(EMAIL_RE) ?? []).map((e) => e.replace(/^[A-Z]{2,}(?=[a-z0-9_])/, "")))];
  text = text.replace(EMAIL_RE, "[EMAIL]");

  const links = [...new Set((text.match(URL_RE) ?? []).map((l) => l.trim()))];
  text = text.replace(URL_RE, "[LINK]");

  // Social handles ("@builtforbharat") can identify a person too.
  text = text.replace(/(^|[\s(])@[\w.]{3,}/g, "$1[HANDLE]");

  const phones: string[] = [];
  text = text.replace(PHONE_CANDIDATE_RE, (m) => {
    const digits = m.replace(/\D/g, "");
    if (digits.length >= 10 && (digits.length <= 13 || MOBILE_RE.test(digits))) {
      const mobile = localDigits(digits).match(MOBILE_RE)?.[0];
      phones.push(digits.length <= 13 ? m.trim() : mobile ? `+91 ${mobile.slice(0, 5)} ${mobile.slice(5)}` : m.trim());
      return "[PHONE]";
    }
    return m;
  });
  // Remove leftover fragments of the number that appear elsewhere in the layout.
  for (const p of phones) {
    const d = p.replace(/\D/g, "");
    const mobile = localDigits(d).match(MOBILE_RE)?.[0] ?? d;
    for (const g of [mobile, mobile.slice(0, 5), mobile.slice(5)]) if (g.length >= 5) text = text.split(g).join("[PHONE]");
  }

  const name = guessName(rawText, fileName);
  const tokens = [...new Set(name.split(/\s+/).filter((t) => t.length >= 3))];
  for (const t of tokens) text = redactToken(text, t);
  // Profile slugs such as "ravi-[CANDIDATE]-pm" are links without a domain.
  text = text.replace(/[\w]*\[CANDIDATE\](?:-[\w\[\]]+)+|[\w]+(?:-[\w]+)*-\[CANDIDATE\][\w\[\]-]*/g, "[LINK]");
  text = text
    .replace(/(\[CANDIDATE\][\s]*){2,}/g, "[CANDIDATE] ")
    .replace(/(\[PHONE\][\s]*){2,}/g, "[PHONE] ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    personal: { name, email: emails[0], phone: phones[0], links },
    cvText: text,
  };
}
