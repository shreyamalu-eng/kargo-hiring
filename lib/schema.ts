// Generated from db/schema.sql and rubric.txt. The app applies this automatically on first use.
// If you edit rubric.txt, run `npm run db:setup` to reload the rubric rows.
export const SCHEMA_STATEMENTS: string[] = [
  "create table if not exists rubric_criteria (\n  id          uuid primary key default gen_random_uuid(),\n  role        text not null check (role in ('PM','SPM')),\n  key         text not null,\n  name        text not null,\n  description text not null,\n  weight      integer not null check (weight between 0 and 100),\n  sort_order  integer not null default 0,\n  unique (role, key)\n)",
  "create table if not exists candidates (\n  id               uuid primary key default gen_random_uuid(),\n  created_at       timestamptz not null default now(),\n  applied_role     text not null check (applied_role in ('PM','SPM')),\n  file_name        text not null,\n\n  personal_details jsonb not null default '{}'::jsonb,   -- {name, email, phone, links[]}\n\n  cv_text          text,\n\n  status           text not null default 'processing'\n                   check (status in ('processing','scored','error')),\n  error            text,\n\n  scores           jsonb,\n  pm_score         numeric,\n  spm_score        numeric,\n  headline         text,          -- one-line anonymised summary of the profile\n\n  brief            text,          -- 3-sentence interview brief (shortlisted only)\n  draft_type       text check (draft_type in ('invite','rejection')),\n  draft_locked     boolean not null default false,  -- true once the founder overrides or edits\n  draft_subject    text,\n  draft_body       text,          -- contains [NAME]; real name substituted only at send time\n\n  email_status     text not null default 'none' check (email_status in ('none','draft','sent','failed')),\n  email_error      text,\n  sent_at          timestamptz,\n  sent_to          text,\n  resend_id        text\n)",
  "create index if not exists candidates_role_pm  on candidates (applied_role, pm_score desc)",
  "create index if not exists candidates_role_spm on candidates (applied_role, spm_score desc)"
];

export const RUBRIC_ROWS = [
  {
    "role": "PM",
    "name": "Hands-on Operations Time",
    "key": "hands_on_ops",
    "description": "Has personally done operational work in freight, logistics, ports, supply chain or a similarly operations-heavy floor - handled shipments, documentation, carriers, customs or exceptions themselves - for at least a year, and the CV names the specifics (Bills of Lading, CHAs, carrier allocation, berth windows, exception queues). Partial (2-3): built software for operations users, or embedded/visited with them, but never did the work. Weak (0-1): operations knowledge only from software, consulting, or interviews.",
    "weight": 30,
    "sort_order": 0
  },
  {
    "role": "PM",
    "name": "Unasked Builds That Got Adopted",
    "key": "unasked_builds",
    "description": "Noticed a gap nobody assigned them, built a fix on their own initiative (a tracker, prototype, SOP, framework, template or process), and other people adopted it - with the adoption named (e.g. \"adopted by the 12-person team within two weeks\", \"now the team standard\"). Partial (2-3): improvements inside their assigned scope, or self-started builds with no adoption evidence. Weak (0-1): only assigned deliverables.",
    "weight": 25,
    "sort_order": 1
  },
  {
    "role": "PM",
    "name": "Owns the Miss",
    "key": "owns_the_miss",
    "description": "Describes a specific thing that went wrong - a killed feature, a lost deal, an outage, a crisis - and shows they owned it personally and turned it into a fix or a documented lesson others now use (post-mortem shared, feature killed with the data behind it, practice adopted). Partial (2-3): handled a crisis but no lesson captured, or generic \"managed incidents\". Weak (0-1): the CV contains only wins and rising metrics.",
    "weight": 20,
    "sort_order": 2
  },
  {
    "role": "PM",
    "name": "Direct Line to the User",
    "key": "direct_line",
    "description": "Worked face to face with the people who use the work, with no intermediary layer, and changed what got built because of it - e.g. \"no product layer\", embedded with ops teams, primary client contact, and a concrete change that came from it. Partial (2-3): user research through structured interviews, surveys or analytics. Weak (0-1): works through stakeholders and presents roadmaps upward; no direct user contact.",
    "weight": 15,
    "sort_order": 3
  },
  {
    "role": "PM",
    "name": "Makes the Call",
    "key": "makes_the_call",
    "description": "Makes decisions and acts on them quickly without waiting for approval or consensus - killed their own work, redirected capacity, chose a path under pressure - or has a third-party quote about decisiveness. Partial (2-3): executed decisions that others made. Weak (0-1): language centred on \"aligned\", \"socialised\", \"supported\", \"managed stakeholder priorities\".",
    "weight": 10,
    "sort_order": 4
  },
  {
    "role": "SPM",
    "name": "Hands-on Operations Time",
    "key": "hands_on_ops",
    "description": "Two or more years doing operational work themselves (freight, ports, customs, carriers, supply chain) AND at least one example where that ground knowledge shaped a technical, data or integration decision later (e.g. \"designed the integration because I knew what the data actually contained\"). Partial (2-3): hands-on operations time with no link to later product decisions, or under a year of it. Weak (0-1): no hands-on operations time.",
    "weight": 25,
    "sort_order": 0
  },
  {
    "role": "SPM",
    "name": "Unasked Builds That Got Adopted",
    "key": "unasked_builds",
    "description": "Self-initiated builds whose adoption spread beyond their own team - to other teams, other shifts, other branches or the whole company - or became a core product feature. Partial (2-3): self-started builds adopted only within their own team. Weak (0-1): only assigned deliverables.",
    "weight": 15,
    "sort_order": 1
  },
  {
    "role": "SPM",
    "name": "Owns the Miss",
    "key": "owns_the_miss",
    "description": "Owned failure at the level of a product area or function - killed features including their own ideas, reversed a direction on evidence, ran the post-mortem and changed how the team works as a result. Partial (2-3): owned individual incidents or kills without a lasting change to practice. Weak (0-1): only wins and rising metrics.",
    "weight": 20,
    "sort_order": 2
  },
  {
    "role": "SPM",
    "name": "Direct Line to the User",
    "key": "direct_line",
    "description": "Even at a senior level still personally in the room with customers or operators (onboardings, discovery, field visits) with a named decision that came from it. Partial (2-3): contact through their team, research reports or account managers. Weak (0-1): no direct contact at senior level.",
    "weight": 10,
    "sort_order": 3
  },
  {
    "role": "SPM",
    "name": "Makes the Call",
    "key": "makes_the_call",
    "description": "Has owned a product area or function with no senior layer above them for 2+ years, AND made at least one high-consequence, hard-to-reverse call themselves (architecture, build vs configure vs not touch, killing a product line) and lived with the result. Partial (2-3): made calls inside a structure where a senior PM or committee had final say. Weak (0-1): mainly executed or \"aligned\" on others' decisions.",
    "weight": 30,
    "sort_order": 4
  }
] as const;
