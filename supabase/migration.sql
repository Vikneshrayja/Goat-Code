-- GOAT Robotics dashboard: approval-based access + manufacturing tasks.
-- Run once in the Supabase SQL editor. Safe to re-run.

-- ---------------------------------------------------------------- tables
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text,
  role text not null default 'Viewer' check (role in ('Admin','Viewer')),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- Admin "Add User": pre-approves an email. When that person registers
-- (with a confirmed email) their profile is created already approved.
create table if not exists public.invites (
  email text primary key,
  name text,
  role text not null default 'Viewer' check (role in ('Admin','Viewer')),
  created_at timestamptz not null default now()
);

create table if not exists public.employees (
  id text primary key,
  name text not null,
  category text,                       -- Machining | Sheet Metal | Welding
  created_at timestamptz not null default now()
);
create unique index if not exists employees_name_cat_uq on public.employees (lower(name), coalesce(category,''));

create table if not exists public.tasks (
  id text primary key,
  name text not null,
  "projectId" text references public.projects(id) on delete cascade,
  category text not null check (category in ('Machining','Sheet Metal','Welding')),
  "employeeId" text references public.employees(id) on delete restrict,
  "startDate" text, "endDate" text,
  status text not null default 'Planned',
  remarks text,
  progress int default 0,
  "createdDate" text, "updatedDate" text
);

-- ------------------------------------------------------- helper functions
create or replace function public.is_approved() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'approved' and enabled);
$$;
create or replace function public.is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'approved' and enabled and role = 'Admin');
$$;

-- New sign-up -> pending profile (or approved if the admin pre-invited the email).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare inv invites%rowtype;
begin
  select * into inv from invites where lower(email) = lower(new.email);
  insert into profiles (id, email, name, role, status)
  values (
    new.id, new.email,
    coalesce(nullif(new.raw_user_meta_data->>'name',''), inv.name, split_part(new.email,'@',1)),
    coalesce(inv.role, 'Viewer'),
    case when inv.email is not null then 'approved' else 'pending' end
  );
  if inv.email is not null then delete from invites where email = inv.email; end if;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Admin-only full user removal (profile cascades from auth.users).
create or replace function public.admin_delete_user(target uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Administrator only'; end if;
  if target = auth.uid() then raise exception 'You cannot delete your own account'; end if;
  delete from auth.users where id = target;
end $$;

-- Block employee deletion while they still hold active tasks (server-side).
create or replace function public.guard_employee_delete() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from tasks where "employeeId" = old.id and status not in ('Completed','Cancelled')) then
    raise exception 'Employee has active project allocations. Reassign or complete them first.';
  end if;
  update tasks set "employeeId" = null where "employeeId" = old.id;  -- keep history of finished tasks
  return old;
end $$;
drop trigger if exists employees_guard_delete on public.employees;
create trigger employees_guard_delete before delete on public.employees
  for each row execute function public.guard_employee_delete();

-- Users may never change their own role/status/enabled (only admins can).
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() is null for the SQL editor / service role (one-time bootstrap)
  if auth.uid() is not null and not public.is_admin() then raise exception 'Administrator only'; end if;
  return new;
end $$;
drop trigger if exists profiles_guard_update on public.profiles;
create trigger profiles_guard_update before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ------------------------------------------------------------------ RLS
alter table public.profiles   enable row level security;
alter table public.invites    enable row level security;
alter table public.employees  enable row level security;
alter table public.tasks      enable row level security;
alter table public.projects   enable row level security;
alter table public.notifications enable row level security;

-- Remove the old wide-open policies.
drop policy if exists "public read"  on public.projects;
drop policy if exists "public write" on public.projects;
drop policy if exists "public read"  on public.notifications;
drop policy if exists "public write" on public.notifications;

-- profiles: see your own row (needed to learn your status); admins see/modify all.
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles for select using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists invites_admin on public.invites;
create policy invites_admin on public.invites for all using (public.is_admin()) with check (public.is_admin());

-- Data tables: approved users read; admins write.
do $$
declare t text;
begin
  foreach t in array array['projects','employees','tasks'] loop
    execute format('drop policy if exists %I on public.%I', t||'_read', t);
    execute format('drop policy if exists %I on public.%I', t||'_write', t);
    execute format('create policy %I on public.%I for select using (public.is_approved())', t||'_read', t);
    execute format('create policy %I on public.%I for all using (public.is_admin()) with check (public.is_admin())', t||'_write', t);
  end loop;
end $$;
drop policy if exists notifications_read on public.notifications;
drop policy if exists notifications_write on public.notifications;
create policy notifications_read  on public.notifications for select using (public.is_approved());
create policy notifications_write on public.notifications for all using (public.is_admin()) with check (public.is_admin());

-- Realtime for live sync across pages/users.
do $$ begin
  begin alter publication supabase_realtime add table public.tasks; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.employees; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.profiles; exception when duplicate_object then null; end;
end $$;

-- ------------------------------------------------- ONE-TIME ADMIN BOOTSTRAP
-- 1) Sign up in the app with vikneshraja@goat-robotics.com (confirm the email).
-- 2) Then run:
--   update public.profiles set role='Admin', status='approved', enabled=true
--   where lower(email)='vikneshraja@goat-robotics.com';
-- (Auto-promotion by email is deliberately NOT done: anyone could register that address.)
