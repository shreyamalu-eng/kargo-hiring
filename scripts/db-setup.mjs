// Creates the tables in Neon and loads rubric.txt into rubric_criteria. Safe to re-run.
// Usage: npm run db:setup           (needs DATABASE_URL in .env or .env.local - `neon deploy` writes it)
//        npm run db:setup -- --sql  (only regenerate db/seed.sql)
import fs from "node:fs";
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { readRubric } from "./parse-rubric.mjs";

config({ path: ".env.local" });
config({ path: ".env" });
const rows = readRubric();

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const seed =
  "-- Generated from rubric.txt by `npm run db:setup`.\n" +
  "delete from rubric_criteria;\n" +
  "insert into rubric_criteria (role, key, name, description, weight, sort_order) values\n" +
  rows.map((r) => `  (${q(r.role)}, ${q(r.key)}, ${q(r.name)}, ${q(r.description)}, ${r.weight}, ${r.sort_order})`).join(",\n") +
  ";\n";
fs.writeFileSync(new URL("../db/seed.sql", import.meta.url), seed);
for (const r of ["PM", "SPM"]) console.log(`${r}: ` + rows.filter((x) => x.role === r).map((x) => `${x.name} ${x.weight}%`).join(" | "));
if (process.argv.includes("--sql")) process.exit(0);

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set. Run `neon deploy` (writes .env) or add it to .env.local.");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);
const schema = fs.readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
const statements = schema
  .split(/;\s*$/m)
  .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
  .filter(Boolean);
for (const st of statements) await sql.query(st);
console.log(`Schema applied (${statements.length} statements).`);

await sql.transaction((tx) => [
  tx`delete from rubric_criteria`,
  ...rows.map((r) => tx`insert into rubric_criteria (role, key, name, description, weight, sort_order)
                        values (${r.role}, ${r.key}, ${r.name}, ${r.description}, ${r.weight}, ${r.sort_order})`),
]);
const [{ n }] = await sql`select count(*)::int as n from rubric_criteria`;
console.log(`rubric_criteria now has ${n} rows.`);
