import { createClient } from "@supabase/supabase-js";

/* -------------------------------------------------------------------------
 * Shared database layer (Supabase)
 * -------------------------------------------------------------------------
 * Run supabase/migration.sql once in the Supabase SQL editor. It creates the
 * employees / tasks / profiles / invites tables and replaces the old
 * "public read / public write" policies with approval-based row level
 * security, enforced by the database itself.
 *
 * Vercel env vars: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (anon key only;
 * never put a service-role key in frontend code).
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
  // Real database: never substitute demo data. Errors propagate to the caller.
  const { data, error } = await supabase.from("projects").select("*");
  if (error) throw error;
  return data || [];
}

export async function saveProjects(next) {
  if (!isDbConfigured) { writeLocal(LOCAL_PROJECTS_KEY, next); return; }
  const { error } = await supabase.from("projects").upsert(next);
  if (error) throw error;
}

export async function deleteProjectRemote(id) {
  if (!isDbConfigured) return;
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw error;
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
  if (!isDbConfigured) { writeLocal(LOCAL_NOTIFS_KEY, next); return; }
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

/* ------------------------- employees & tasks ---------------------------- */
// Both live only in the database (no local fallback), so every manufacturing
// page reads exactly the records Task Feeds writes.

function need() {
  if (!supabase) throw new Error("Database is not configured.");
  return supabase;
}

export async function fetchEmployees() {
  const { data, error } = await need().from("employees").select("*").order("name");
  if (error) throw error;
  return data || [];
}
export async function createEmployee(emp) {
  const { data, error } = await need().from("employees").insert(emp).select().single();
  if (error) throw error;
  return data;
}
export async function deleteEmployee(id) {
  const { error } = await need().from("employees").delete().eq("id", id);
  if (error) throw error;
}
export async function fetchTasks() {
  const { data, error } = await need().from("tasks").select("*");
  if (error) throw error;
  return data || [];
}
export async function upsertTask(task) {
  const { data, error } = await need().from("tasks").upsert(task).select().single();
  if (error) throw error;
  return data;
}
export async function deleteTask(id) {
  const { error } = await need().from("tasks").delete().eq("id", id);
  if (error) throw error;
}
export function subscribeTable(table, onChange) {
  if (!isDbConfigured) return () => {};
  const channel = supabase
    .channel(`${table}-changes`)
    .on("postgres_changes", { event: "*", schema: "public", table }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

/* ------------------------------ auth & users ---------------------------- */
// Passwords are handled entirely by Supabase Auth (hashed server-side).
// Access is decided by public.profiles.status, which RLS checks in the
// database, so hiding a page in the UI is never the only protection.

export async function signIn(email, password) {
  const { error } = await need().auth.signInWithPassword({ email, password });
  if (error) throw error;
}
export async function signUp(name, email, password) {
  const { data, error } = await need().auth.signUp({
    email, password, options: { data: { name } },
  });
  if (error) throw error;
  return data; // data.session is null while email confirmation is pending
}
export async function signOut() {
  if (supabase) await supabase.auth.signOut();
}
export async function getSessionUser() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user || null;
}
export function onAuthChange(cb) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_evt, session) => cb(session?.user || null));
  return () => data.subscription.unsubscribe();
}
export async function fetchMyProfile(userId) {
  const { data, error } = await need().from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data;
}
export async function fetchProfiles() {
  const { data, error } = await need().from("profiles").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}
export async function updateProfile(id, patch) {
  const { error } = await need().from("profiles").update(patch).eq("id", id);
  if (error) throw error;
}
export async function adminDeleteUser(id) {
  const { error } = await need().rpc("admin_delete_user", { target: id });
  if (error) throw error;
}
export async function fetchInvites() {
  const { data, error } = await need().from("invites").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}
export async function addInvite(inv) {
  const { error } = await need().from("invites").insert(inv);
  if (error) throw error;
}
export async function deleteInvite(email) {
  const { error } = await need().from("invites").delete().eq("email", email);
  if (error) throw error;
}

/* ------------------------------- documents ------------------------------- */
// Documents -> RCA / Costing / Bottleneck. Tables: rca_reports,
// costing_records, bottleneck_studies (supabase/documents.sql). Approved
// users read; administrators write (enforced by row-level security).
// In local development mode (no database) records are kept in localStorage
// so the pages can still be tried out.

const docKey = (table) => `gt_dashboard_doc_${table}_v1`;

export async function fetchDocs(table) {
  if (!isDbConfigured) return readLocal(docKey(table), []);
  const { data, error } = await supabase.from(table).select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function upsertDoc(table, row) {
  if (!isDbConfigured) {
    const list = readLocal(docKey(table), []);
    writeLocal(docKey(table), [row, ...list.filter((r) => r.id !== row.id)]);
    return row;
  }
  const { data, error } = await supabase.from(table).upsert(row).select().single();
  if (error) throw error;
  return data;
}

export async function deleteDoc(table, id) {
  if (!isDbConfigured) {
    writeLocal(docKey(table), readLocal(docKey(table), []).filter((r) => r.id !== id));
    return;
  }
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw error;
}
