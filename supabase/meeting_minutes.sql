-- GOAT Robotics dashboard: Documents > Minutes of Meeting.
-- Run in the Supabase SQL editor. Needs is_approved() / is_admin() from
-- migration.sql. Safe to re-run. Copy the WHOLE script, down to the last line.

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

-- Approved users can read; only administrators can create / edit / delete.
alter table public.meeting_minutes enable row level security;
drop policy if exists meeting_minutes_read on public.meeting_minutes;
drop policy if exists meeting_minutes_write on public.meeting_minutes;
create policy meeting_minutes_read on public.meeting_minutes
  for select using (public.is_approved());
create policy meeting_minutes_write on public.meeting_minutes
  for all using (public.is_admin()) with check (public.is_admin());

-- Live updates between users.
do $$ begin
  begin alter publication supabase_realtime add table public.meeting_minutes;
  exception when duplicate_object then null; end;
end $$;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.meeting_minutes to authenticated;

notify pgrst, 'reload schema';
