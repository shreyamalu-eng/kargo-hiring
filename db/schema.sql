-- Kargo hiring dashboard schema (Neon Postgres). Applied by `npm run db:setup`, or paste into Neon Console -> SQL Editor.
-- Rubric rows come from rubric.txt (db/seed.sql).


-- Open roles. Add, edit or archive them from the Roles page in the app.
create table if not exists roles (
  workspace      text not null default 'main',  -- each test workspace has its own roles, CVs and results
  key            text not null,
  title          text not null,
  tagline        text not null default '',
  requirements   text not null default '',
  interview_note text not null default '',
  shortlist_size integer not null default 5 check (shortlist_size between 1 and 50),
  sort_order     integer not null default 0,
  archived       boolean not null default false,
  created_at     timestamptz not null default now(),
  constraint roles_ws_pkey primary key (workspace, key)
);

-- The standard every candidate is scored against. One row per criterion per role.
create table if not exists rubric_criteria (
  id          uuid primary key default gen_random_uuid(),
  workspace   text not null default 'main',
  role        text not null,          -- roles.key
  key         text not null,
  name        text not null,
  description text not null,
  weight      integer not null check (weight between 0 and 100),
  sort_order  integer not null default 0,
  constraint rubric_ws_role_key unique (workspace, role, key)
);

create table if not exists candidates (
  id               uuid primary key default gen_random_uuid(),
  workspace        text not null default 'main',
  created_at       timestamptz not null default now(),
  applied_role     text not null,   -- roles.key
  file_name        text not null,

  -- Personal details: stored here only, never sent to any AI call.
  personal_details jsonb not null default '{}'::jsonb,   -- {name, email, phone, links[]}
  -- CV content with name/email/phone/links redacted. This is the only CV text the AI sees.
  cv_text          text,

  status           text not null default 'processing'
                   check (status in ('processing','scored','error')),
  error            text,

  -- Both rubrics, regardless of applied role: {PM:{total, criteria:[{key,name,weight,score,reason}]}, SPM:{...}}
  scores           jsonb,
  pm_score         numeric,
  spm_score        numeric,
  headline         text,          -- one-line anonymised summary of the profile

  brief            text,          -- 3-sentence interview brief (shortlisted only)
  interview_questions jsonb,      -- tailored interview questions [{question, criterion, listen_for, kind}]
  draft_type       text check (draft_type in ('invite','rejection')),
  draft_locked     boolean not null default false,  -- true once the founder overrides or edits
  draft_subject    text,
  draft_body       text,          -- contains [NAME]; real name substituted only at send time

  email_status     text not null default 'none' check (email_status in ('none','draft','sent','failed')),
  email_error      text,
  sent_at          timestamptz,
  sent_to          text,
  resend_id        text
);

create index if not exists candidates_role_pm  on candidates (applied_role, pm_score desc);
create index if not exists candidates_role_spm on candidates (applied_role, spm_score desc);


-- Databases created before roles were editable had PM/SPM hard-coded; lift that limit.
alter table rubric_criteria drop constraint if exists rubric_criteria_role_check;
alter table candidates drop constraint if exists candidates_applied_role_check;

-- Databases created before workspaces existed: add the column and widen the keys. Existing data stays in 'main'.
alter table roles add column if not exists workspace text not null default 'main';
alter table rubric_criteria add column if not exists workspace text not null default 'main';
alter table candidates add column if not exists workspace text not null default 'main';
do $$ begin if not exists (select 1 from pg_constraint where conname = 'roles_ws_pkey') then alter table roles drop constraint if exists roles_pkey; alter table roles add constraint roles_ws_pkey primary key (workspace, key); end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'rubric_ws_role_key') then alter table rubric_criteria drop constraint if exists rubric_criteria_role_key_key; alter table rubric_criteria add constraint rubric_ws_role_key unique (workspace, role, key); end if; end $$;
create index if not exists candidates_ws on candidates (workspace, applied_role);
alter table candidates add column if not exists interview_questions jsonb;
