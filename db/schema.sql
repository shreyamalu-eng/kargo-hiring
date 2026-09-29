-- Kargo hiring dashboard schema (Neon Postgres). Applied by `npm run db:setup`, or paste into Neon Console -> SQL Editor.
-- Rubric rows come from rubric.txt (db/seed.sql).


-- The standard every candidate is scored against. One row per criterion per role.
create table if not exists rubric_criteria (
  id          uuid primary key default gen_random_uuid(),
  role        text not null check (role in ('PM','SPM')),
  key         text not null,
  name        text not null,
  description text not null,
  weight      integer not null check (weight between 0 and 100),
  sort_order  integer not null default 0,
  unique (role, key)
);

create table if not exists candidates (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  applied_role     text not null check (applied_role in ('PM','SPM')),
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

