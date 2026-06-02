
-- VENDORS
create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  name text not null,
  category text not null default 'other',
  data_access text[] not null default '{}',
  soc2_status text not null default 'unknown',
  criticality text not null default 'medium',
  owner text,
  renewal_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.vendors enable row level security;
create policy "session can view own vendors" on public.vendors for select using (session_id = current_session_id() and current_session_id() <> '');
create policy "session can insert own vendors" on public.vendors for insert with check (session_id = current_session_id() and current_session_id() <> '');
create policy "session can update own vendors" on public.vendors for update using (session_id = current_session_id() and current_session_id() <> '');
create policy "session can delete own vendors" on public.vendors for delete using (session_id = current_session_id() and current_session_id() <> '');

-- CHECKLIST
create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  framework text not null default 'starter',
  category text not null,
  title text not null,
  description text,
  priority text not null default 'medium',
  done boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.checklist_items enable row level security;
create policy "session can view own checklist" on public.checklist_items for select using (session_id = current_session_id() and current_session_id() <> '');
create policy "session can insert own checklist" on public.checklist_items for insert with check (session_id = current_session_id() and current_session_id() <> '');
create policy "session can update own checklist" on public.checklist_items for update using (session_id = current_session_id() and current_session_id() <> '');
create policy "session can delete own checklist" on public.checklist_items for delete using (session_id = current_session_id() and current_session_id() <> '');

-- INCIDENTS
create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  title text not null,
  severity text not null default 'medium',
  status text not null default 'open',
  playbook text,
  summary text,
  timeline jsonb not null default '[]'::jsonb,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.incidents enable row level security;
create policy "session can view own incidents" on public.incidents for select using (session_id = current_session_id() and current_session_id() <> '');
create policy "session can insert own incidents" on public.incidents for insert with check (session_id = current_session_id() and current_session_id() <> '');
create policy "session can update own incidents" on public.incidents for update using (session_id = current_session_id() and current_session_id() <> '');
create policy "session can delete own incidents" on public.incidents for delete using (session_id = current_session_id() and current_session_id() <> '');

-- QUESTIONNAIRES
create table public.questionnaires (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  name text not null,
  questions jsonb not null default '[]'::jsonb,
  answers jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.questionnaires enable row level security;
create policy "session can view own questionnaires" on public.questionnaires for select using (session_id = current_session_id() and current_session_id() <> '');
create policy "session can insert own questionnaires" on public.questionnaires for insert with check (session_id = current_session_id() and current_session_id() <> '');
create policy "session can update own questionnaires" on public.questionnaires for update using (session_id = current_session_id() and current_session_id() <> '');
create policy "session can delete own questionnaires" on public.questionnaires for delete using (session_id = current_session_id() and current_session_id() <> '');
