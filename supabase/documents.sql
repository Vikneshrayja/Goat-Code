-- GOAT Robotics dashboard: Documents (RCA, Costing, Bottleneck, Scrap, Minutes of Meeting).
-- Run ONCE in the Supabase SQL editor, AFTER migration.sql (it uses the
-- is_approved() / is_admin() helper functions created there). Safe to re-run.

-- ------------------------------------------------------------- RCA reports
create table if not exists public.rca_reports (
  id text primary key,
  ref text,
  incident_at text,                 -- date & time of the incident
  reported_by text,
  witness_name text,
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

-- Existing databases: add the Witness Name column (safe to re-run).
alter table public.rca_reports add column if not exists witness_name text;

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

-- ------------------------------------------------------- Scrap / Wastage
create table if not exists public.scrap_wastage (
  id text primary key,
  ref text,
  scrap_date text,
  project_name text,
  material_name text,
  designer_name text,
  weight numeric,                   -- scrap weight, in weight_unit
  weight_unit text default 'kg',    -- kg | g | ton
  amount_loss numeric,
  currency text default 'INR',
  downtime_value numeric,           -- downtime, in downtime_unit
  downtime_unit text default 'Hours', -- Minutes | Hours | Days
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- Scrap components: one record = one project with several components.
alter table public.scrap_wastage add column if not exists components jsonb not null default '[]'::jsonb;
-- [{"component":"Bracket","material_name":"MS","weight":2.5,"weight_unit":"kg","price_per_kg":55,"amount":137.5,"currency":"INR"}]

-- ----------------------------------- Scrap materials & current market cost
create table if not exists public.scrap_materials (
  id text primary key,
  name text not null,
  price_per_kg numeric not null default 0,
  currency text default 'INR',
  history jsonb not null default '[]'::jsonb,   -- [{"date":"2026-10-20","price":55}]
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- ------------------------------------------------- Minutes of Meeting
create table if not exists public.meeting_minutes (
  id text primary key,
  ref text,
  project_name text,
  meeting_at text,                  -- date & time of the meeting (local, e.g. 2026-10-20T10:30)
  attendees jsonb not null,         -- 1-15: [{"name":"A","org":"Goat|External","company":"","sig":"data:image/png;base64,..."}]
  points jsonb not null default '[]'::jsonb,   -- [{"point":"","summary":"","expected_date":"2026-10-30","owner":"A"}]
  scope jsonb not null default '[]'::jsonb,    -- [{"party":"Goat|Client","item":"..."}]
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint meeting_minutes_attendees_1_15
    check (jsonb_typeof(attendees) = 'array' and jsonb_array_length(attendees) between 1 and 15)
);

-- --------------------------------------------------------------------- RLS
-- Approved users can read; only administrators can create / edit / delete.
do $$
declare t text;
begin
  foreach t in array array['rca_reports','costing_records','bottleneck_studies','scrap_wastage','scrap_materials','meeting_minutes'] loop
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
  begin alter publication supabase_realtime add table public.scrap_wastage;      exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.scrap_materials;   exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.meeting_minutes;   exception when duplicate_object then null; end;
end $$;

notify pgrst, 'reload schema';
