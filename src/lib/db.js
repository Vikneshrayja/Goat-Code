import { createClient } from "@supabase/supabase-js";

/* -------------------------------------------------------------------------
 * Shared database layer
 * -------------------------------------------------------------------------
 * Point 8: "connect this with a database so every ID can see updates
 * without logging in, on the Vercel app."
 *
 * To turn this on:
 *  1. Create a free project at https://supabase.com
 *  2. In the SQL editor, run:
 *
 *     create table projects (
 *       id text primary key,
 *       name text, "projectNumber" text, mode text, variants text,
 *       payload text, custom text, manufacturing text,
 *       department text, team text,
 *       "startDate" text, "endDate" text,
 *       priority text, status text, remarks text, progress int,
 *       "createdDate" text, "updatedDate" text
 *     );
 *     create table notifications (
 *       id text primary key,
 *       message text, time text, read boolean default false,
 *       "projectId" text, page text
 *     );
 *     alter table projects enable row level security;
 *     alter table notifications enable row level security;
 *     create policy "public read" on projects for select using (true);
 *     create policy "public read" on notifications for select using (true);
 *     create policy "public write" on projects for all using (true);
 *     create policy "public write" on notifications for all using (true);
 *
 *  3. In Vercel → Project → Settings → Environment Variables add:
 *       VITE_SUPABASE_URL      = https://xxxx.supabase.co
 *       VITE_SUPABASE_ANON_KEY = the "anon public" key
 *     (Also add them to a local .env file for `npm run dev`.)
 *  4. Redeploy. Every visitor now reads/writes the same live data —
 *     viewing never requires login; only Create / Edit / Delete do.
 *
 * Until those env vars are set, everything below falls back to
 * localStorage so the app works exactly as it did before.
 * ---------------------------------------------------------------------- */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isDbConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = isDbConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const LOCAL_PROJECTS_KEY = "gt_dashboard_projects_v1";
const LOCAL_NOTIFS_KEY = "gt_dashboard_notifications_v1";

function readLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return fallback;
}
function writeLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {}
}

/* ------------------------------- projects ------------------------------- */

export async function fetchProjects(seedFn) {
  if (!isDbConfigured) {
    const raw = readLocal(LOCAL_PROJECTS_KEY, null);
    if (raw) return raw;
    const seed = seedFn();
    writeLocal(LOCAL_PROJECTS_KEY, seed);
    return seed;
  }
  const { data, error } = await supabase.from("projects").select("*");
  if (error || !data || data.length === 0) {
    const seed = seedFn();
    if (!error) await supabase.from("projects").upsert(seed);
    return seed;
  }
  return data;
}

export async function saveProjects(next) {
  writeLocal(LOCAL_PROJECTS_KEY, next);
  if (!isDbConfigured) return;
  await supabase.from("projects").upsert(next);
}

export async function deleteProjectRemote(id) {
  if (!isDbConfigured) return;
  await supabase.from("projects").delete().eq("id", id);
}

export function subscribeProjects(onChange) {
  if (!isDbConfigured) return () => {};
  const channel = supabase
    .channel("projects-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

/* ----------------------------- notifications ----------------------------- */

export async function fetchNotifications() {
  if (!isDbConfigured) return readLocal(LOCAL_NOTIFS_KEY, []);
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .order("time", { ascending: false })
    .limit(30);
  return data || [];
}

export async function saveNotifications(next) {
  writeLocal(LOCAL_NOTIFS_KEY, next);
  if (!isDbConfigured) return;
  await supabase.from("notifications").upsert(next);
}

export function subscribeNotifications(onChange) {
  if (!isDbConfigured) return () => {};
  const channel = supabase
    .channel("notifications-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}
