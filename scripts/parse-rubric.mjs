// Parses rubric.txt into [{role, key, name, description, weight, sort_order}]
import fs from "node:fs";

export function parseRubric(text) {
  const rows = [];
  let role = null;
  let cur = null;
  let order = 0;
  const push = () => {
    if (cur && role && cur.name) {
      if (!cur.key) cur.key = cur.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      rows.push({ role, ...cur, sort_order: order++ });
    }
    cur = null;
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    let m;
    if ((m = line.match(/^ROLE:\s*(PM|SPM)\b/i))) { push(); role = m[1].toUpperCase(); order = 0; continue; }
    if (!role) continue;
    if ((m = line.match(/^Criterion name:\s*(.+)$/i))) { push(); cur = { name: m[1].trim(), key: "", description: "", weight: 0 }; continue; }
    if (!cur) continue;
    if ((m = line.match(/^Key:\s*(.+)$/i))) cur.key = m[1].trim();
    else if ((m = line.match(/^What a strong candidate looks like:\s*(.+)$/i))) cur.description = m[1].trim();
    else if ((m = line.match(/^Weight:\s*(\d+)/i))) cur.weight = Number(m[1]);
  }
  push();
  for (const r of ["PM", "SPM"]) {
    const list = rows.filter((x) => x.role === r);
    const sum = list.reduce((a, b) => a + b.weight, 0);
    if (list.length < 4 || list.length > 6) throw new Error(`${r}: expected 4-6 criteria, found ${list.length}`);
    if (sum !== 100) throw new Error(`${r}: weights add to ${sum}, not 100`);
    for (const c of list) if (!c.description) throw new Error(`${r}/${c.name}: missing description`);
  }
  return rows;
}

export function readRubric(path = new URL("../rubric.txt", import.meta.url)) {
  return parseRubric(fs.readFileSync(path, "utf8"));
}
