-- GOAT Robotics dashboard: Documents (RCA, Costing, Bottleneck).
-- Run ONCE in the Supabase SQL editor, AFTER migration.sql (it uses the
-- is_approved() / is_admin() helper functions created there). Safe to re-run.

-- ------------------------------------------------------------- RCA reports
create table if not exists public.rca_reports (
  id text primary key,
  ref text,
  incident_at text,                 -- date & time of the incident
  reported_by text,
  location text,
  description text,
  explanation text,
  corrective_action text,
  preventive_action text,
  fix_date text,
  expected_date text,
  dept_head_name text,     dept_head_sig text,     dept_head_signed_at text,
  team_manager_name text,  team_manager_sig text,  team_manager_signed_at text,
  employee_name text,      employee_sig text,      employee_signed_at text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- ---------------------------------------------------- Costing (vendor change)
create table if not exists public.costing_records (
  id text primary key,
  ref text,
  item text,
  project_name text,
  previous_vendor text,
  new_vendor text,
  previous_cost numeric,            -- unit cost with the old vendor
  new_cost numeric,                 -- unit cost with the new vendor
  quantity numeric,
  currency text default 'INR',
  change_date text,
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- ------------------------------------------- Bottleneck (project studies)
create table if not exists public.bottleneck_studies (
  id text primary key,
  ref text,
  project_name text,
  duration text,
  improvements jsonb not null default '[]'::jsonb,   -- ["...", "..."]
  points jsonb not null default '[]'::jsonb,         -- [{"bottleneck":"...","solution":"..."}]
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- --------------------------------------------------------------------- RLS
-- Approved users can read; only administrators can create / edit / delete.
do $$
declare t text;
begin
  foreach t in array array['rca_reports','costing_records','bottleneck_studies'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_read', t);
    execute format('drop policy if exists %I on public.%I', t||'_write', t);
    execute format('create policy %I on public.%I for select using (public.is_approved())', t||'_read', t);
    execute format('create policy %I on public.%I for all using (public.is_admin()) with check (public.is_admin())', t||'_write', t);
  end loop;
end $$;

-- Live updates between users.
do $$ begin
  begin alter publication supabase_realtime add table public.rca_reports;        exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.costing_records;    exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.bottleneck_studies; exception when duplicate_object then null; end;
end $$;
