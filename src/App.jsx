import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import {
  LayoutGrid, Bot, Flame, Settings, Layers, Paintbrush, Wrench, Factory,
  ListChecks, Plus, Search, X, Trash2, Pencil, AlertTriangle, ChevronLeft,
  ChevronRight, CheckCircle2, Clock, CircleDot,
  CalendarDays, Filter, Bell, TriangleAlert, Database, Menu, ChevronDown,
  Download, Upload, FileSpreadsheet, Flag, Lock, Mail, Eye, EyeOff, LogOut,
  ShieldCheck, LogIn, GitBranch, SlidersHorizontal, Users, UserPlus, KeyRound,
  ToggleLeft, PanelsTopLeft, Phone, Info, ChevronUp, GripVertical, Sparkles,
  Save, Bookmark, Boxes, TrendingUp, Send, FileText, ClipboardCheck, Wallet, Gauge,
} from "lucide-react";
import logo from "./assets/logo.png";
import loginSplash from "./assets/login-splash.png";
import { exportTeamTimeline } from "./lib/exportTimeline";
import {
  toISO, toDate, todayISO, daysBetween, durationDays, addDaysISO, fmtDisplay, fmtShort,
  deptLabel, normalizeDept, OVERVIEW_DEPTS, TASK_CATEGORIES, STATUS_COLOR, ADMIN_CONTACT_EMAIL,
  Field, SectionHeading, StatusTag, ConfirmModal,
} from "./shared";
import {
  isDbConfigured, fetchProjects, saveProjects, deleteProjectRemote, subscribeProjects,
  fetchNotifications, saveNotifications, subscribeNotifications,
  fetchEmployees, createEmployee, deleteEmployee as deleteEmployeeRemote,
  fetchTasks, upsertTask, deleteTask as deleteTaskRemote, subscribeTable,
  signIn, signUp, signOut, getSessionUser, onAuthChange, fetchMyProfile,
} from "./lib/db";
import { TaskFeedsPage, EmployeeAllocationPage } from "./pages/Manufacturing";
import { AuthorizedUsersPage, ApprovalPage } from "./pages/Access";
import { RcaPage, CostingPage, BottleneckPage, ScrapPage, MaterialPricePage } from "./pages/Documents";

/* ----------------------------- constants ----------------------------- */

// Teams are now a persisted, admin-editable list (Create + Delete from
// Project Teams and from the Assignee Team picker) instead of a fixed
// constant. Each team carries its own code + person capacity.
const TEAMS_KEY = "gt_dashboard_teams_v2";
const DEFAULT_TEAMS = [
  { name: "GT-Team 1", code: "GT1", capacity: 5 },
  { name: "GTX-Team 2", code: "GTX2", capacity: 6 },
  { name: "GT-XP-Team 3", code: "GXP3", capacity: 4 },
];
function loadTeams() {
  try {
    const raw = localStorage.getItem(TEAMS_KEY);
    if (raw) { const arr = JSON.parse(raw); if (Array.isArray(arr) && arr.length) return arr; }
  } catch (e) {}
  return DEFAULT_TEAMS.map((t) => ({ ...t }));
}
function saveTeams(list) {
  try { localStorage.setItem(TEAMS_KEY, JSON.stringify(list)); } catch (e) {}
}
const DEPARTMENTS = ["Production", "Assembly", "Welding", "Machining", "Sheet Metal", "Coating"];
const MANUFACTURING_DEPTS = ["Welding", "Sheet Metal", "Coating", "Machining"];
const DEP_CHAIN = ["Machining", "Welding", "Coating", "Assembly"];
const STATUSES = ["Planned", "In Progress", "Completed", "Delayed", "On Hold", "Cancelled"];
const PRIORITIES = ["Low", "Medium", "High", "Critical"];
const VARIANTS = ["GT-Series", "GTX-Series", "GTXP", "GT-Custom", "GTX-Customs", "GTXP-Customs"];

const PRIORITY_COLOR = {
  "Low": "#5B84A6",
  "Medium": "#C7891E",
  "High": "#D8703A",
  "Critical": "#C0332B",
};

const DEPT_ICON = { Welding: Flame, "Sheet Metal": Layers, Coating: Paintbrush, Machining: Settings, Assembly: Wrench, Production: Factory };

/* --------------------------- navigation tree ---------------------------- */
// Follows Master Requirement Document V3, Section 3 — sidebar structure is
// fixed; do not rename without approval.

const NAV_TREE = [
  { key: "overview", label: "Overview", icon: LayoutGrid, direct: "overview.counts",
    children: [{ key: "overview.counts", label: "Overview", icon: LayoutGrid }] },
  {
    key: "projectconfig", label: "Project Configuration", icon: Database,
    children: [
      { key: "projectconfig.teams", label: "Project Team", icon: Users },
      { key: "projectconfig.feeds", label: "Project Feeds", icon: Database },
      { key: "projectconfig.timeline", label: "Timeline Calculation", icon: CalendarDays },
    ],
  },
  {
    // Task Feeds exists ONLY here (requirement C).
    key: "manufacturing", label: "Manufacturing", icon: Factory,
    children: [
      { key: "manufacturing.taskfeeds", label: "Task Feeds", icon: ListChecks },
      { key: "manufacturing.Machining", label: "Machining", icon: Settings },
      { key: "manufacturing.Sheet Metal", label: "Sheetmetal", icon: Layers },
      { key: "manufacturing.Welding", label: "Welding", icon: Flame },
    ],
  },
  {
    // Replaces the old single "Timeline" item; Timeline is now the first option.
    key: "documents", label: "Documents", icon: FileText,
    children: [
      { key: "documents.timeline", label: "Timeline", icon: CalendarDays },
      { key: "documents.rca", label: "RCA", icon: ClipboardCheck },
      { key: "documents.costing", label: "Costing", icon: Wallet },
      { key: "documents.bottleneck", label: "Bottleneck", icon: Gauge },
      { key: "documents.scrap", label: "Scrap / Wastage", icon: Boxes },
      { key: "documents.materialprice", label: "Material Price", icon: TrendingUp },
    ],
  },
  {
    key: "settings", label: "Settings", icon: Settings,
    children: [
      { key: "settings.settings", label: "Settings", icon: Settings },
      { key: "settings.contact", label: "Admin Contact", icon: Phone },
    ],
  },
  {
    key: "configportal", label: "Configuration Portal", icon: PanelsTopLeft, adminOnly: true,
    children: [
      { key: "configportal.users", label: "Authorized Users", icon: Users },
      { key: "configportal.approval", label: "Approval", icon: ShieldCheck },
      { key: "configportal.dependencies", label: "Project Dependencies", icon: GitBranch },
      { key: "configportal.menu", label: "All Menu Configuration", icon: SlidersHorizontal },
    ],
  },
];

const STORAGE_KEY = "gt_dashboard_projects_v1";
const NOTIFS_KEY = "gt_dashboard_notifications_v1";
const MENU_CONFIG_KEY = "gt_menu_config_v1";

/* ------------------------------ menu config ------------------------------ */
// Configuration Portal -> All Menu Configuration (spec section 22-24).
// Administrator can enable/disable manufacturing modules without touching
// source code. Disabled modules are hidden from the sidebar and from every
// project/task creation dropdown, but historical data stays intact.

function loadMenuConfig() {
  try {
    const raw = localStorage.getItem(MENU_CONFIG_KEY);
    if (raw) return { ...defaultMenuConfig(), ...JSON.parse(raw) };
  } catch (e) {}
  return defaultMenuConfig();
}
function defaultMenuConfig() {
  const cfg = {};
  DEPARTMENTS.forEach((d) => { cfg[d] = true; });
  return cfg;
}
function saveMenuConfig(cfg) {
  try { localStorage.setItem(MENU_CONFIG_KEY, JSON.stringify(cfg)); } catch (e) {}
}

/* ------------------------------ appearance -------------------------------- */
// Settings -> Appearance. Admin-adjustable brightness + gradient colors for
// the side menu (sidebar) and the option menus (profile / notifications /
// search-result dropdown panels). Applied live via CSS custom properties on
// the document root, and persisted so every visitor sees the same look.

const THEME_KEY = "gt_dashboard_theme_v1";

const DEFAULT_THEME = {
  sidebarBrightness: 100,   // %
  sidebarColor: "#2F6F51",  // solid color (no gradient)
  menuBrightness: 96,       // % -- slightly under 100 so "option menu" white isn't stark
  menuFrom: "#ffffff",
  menuTo: "#f2f4f6",
};

function loadTheme() {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw) return { ...DEFAULT_THEME, ...JSON.parse(raw) };
  } catch (e) {}
  return { ...DEFAULT_THEME };
}
function saveTheme(t) {
  try { localStorage.setItem(THEME_KEY, JSON.stringify(t)); } catch (e) {}
}
function applyTheme(t) {
  const root = document.documentElement.style;
  root.setProperty("--gt-sidebar-color", t.sidebarColor || DEFAULT_THEME.sidebarColor);
  root.setProperty("--gt-sidebar-brightness", String((t.sidebarBrightness ?? 100) / 100));
  root.setProperty("--gt-menu-from", t.menuFrom);
  root.setProperty("--gt-menu-to", t.menuTo);
  root.setProperty("--gt-menu-brightness", String((t.menuBrightness ?? 100) / 100));
}

/* ------------------------- custom side menu items ------------------------ */
// Admin -> Overview -> Create / Menu Management. Each entry becomes its own
// top-level sidebar group with a single generic page, in addition to the
// fixed NAV_TREE above (which stays untouched per the Master Requirement Doc).

const CUSTOM_MENU_KEY = "gt_dashboard_custom_menu_v1";

function loadCustomMenu() {
  try {
    const raw = localStorage.getItem(CUSTOM_MENU_KEY);
    if (raw) { const arr = JSON.parse(raw); if (Array.isArray(arr)) return arr; }
  } catch (e) {}
  return [];
}
function saveCustomMenu(list) {
  try { localStorage.setItem(CUSTOM_MENU_KEY, JSON.stringify(list)); } catch (e) {}
}
function slugify(s) {
  return (s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "menu";
}
function buildNavTree(customMenu) {
  const customGroups = (customMenu || [])
    .filter((m) => m.enabled !== false)
    .slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((m) => ({
      key: `custom-${m.slug}`,
      label: m.label,
      icon: Sparkles,
      isCustom: true,
      children: [{ key: `custom-${m.slug}.main`, label: m.label, icon: Sparkles }],
    }));
  return [...NAV_TREE, ...customGroups];
}

/* ------------------- Feed Project: editable dropdown lists ---------------- */
// The Quick "Feed Project" modal shows ONE of two option groups depending on
// the Variant / Manufacturing toggle: Manufacturing (Machining, Welding,
// Coating, Sheet Metal) or Variant (GT/GTX/GTXP + Payload + fully Custom).
// Every list starts from a default and admins can add / remove options
// forever — nothing is hard-coded once it reaches this screen.

const VARIANT_OPTIONS_KEY = "gt_dashboard_variant_opts_v1";
const MANUFACTURING_OPTIONS_KEY = "gt_dashboard_manufacturing_opts_v1";
const PAYLOAD_OPTIONS_KEY = "gt_dashboard_payload_opts_v1";
const CUSTOM_VARIANT_OPTIONS_KEY = "gt_dashboard_custom_variant_opts_v1";

const DEFAULT_VARIANT_OPTIONS = ["GT", "GTX", "GTXP"];
const DEFAULT_MANUFACTURING_OPTIONS = ["Machining", "Welding", "Coating", "Sheet Metal", "Assembly"];
const DEFAULT_PAYLOAD_OPTIONS = ["100", "250", "500", "1000", "1500", "2000", "3000", "5000"];
const DEFAULT_CUSTOM_VARIANT_OPTIONS = [];

function loadOptionList(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) { const arr = JSON.parse(raw); if (Array.isArray(arr) && arr.length) return arr; }
  } catch (e) {}
  return [...fallback];
}
function saveOptionList(key, list) {
  try { localStorage.setItem(key, JSON.stringify(list)); } catch (e) {}
}

// Saved Timeline Calculation results — a small local history so a
// calculated Manufacturing/Assembly timeline can be kept for later
// reference instead of being lost when the page is left.
const SAVED_TIMELINES_KEY = "gt_dashboard_saved_timelines_v1";
function loadSavedTimelines() {
  try {
    const raw = localStorage.getItem(SAVED_TIMELINES_KEY);
    if (raw) { const arr = JSON.parse(raw); if (Array.isArray(arr)) return arr; }
  } catch (e) {}
  return [];
}
function persistSavedTimelines(list) {
  try { localStorage.setItem(SAVED_TIMELINES_KEY, JSON.stringify(list)); } catch (e) {}
}

/* ------------------------------ date utils ----------------------------- */

// Format a Date object back to "YYYY-MM-DD" using its LOCAL calendar
// fields (getFullYear/getMonth/getDate), never toISOString(). toISOString()
// always converts to UTC first, so for any user whose timezone is ahead of
// UTC (e.g. India, UTC+5:30) it silently rolls local midnight back onto the
// previous day. That mismatch was making isValidISODate() below reject
// every date the user typed (a locally-valid date would round-trip to the
// day before), which made `valid` permanently false on the Timeline
// Calculation page and quietly lost a day everywhere else that used
// addDaysISO()/todayISO().
// Strict "YYYY-MM-DD" check (exactly 4-digit year, real calendar date).
// Native <input type="date"> elements can briefly report malformed values
// while a user is mid-keystroke on the year segment (e.g. a runaway
// 5-digit year like "82920-08-29"), which are non-empty but not a real
// date. Anything failing this check is treated as not-yet-usable input
// rather than being fed into the day-math below, which previously threw
// "Invalid time value" and silently collapsed End Date to Start Date.
const isValidISODate = (s) => {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const year = Number(s.slice(0, 4));
  if (year < 1970 || year > 2200) return false;
  const d = new Date(s + "T00:00:00");
  return !isNaN(d.getTime()) && toISO(d) === s;
};
// Factory working-calendar rule for Timeline Calculation: every Sunday is
// off, plus only the 1st and 3rd Saturday of each month (2nd, 4th, and any
// 5th Saturday are normal working days).
const satOccurrence = (d) => Math.ceil(d.getDate() / 7);
const isOffDay = (iso) => {
  const d = toDate(iso);
  const dow = d.getDay();
  if (dow === 0) return true;
  if (dow === 6) { const occ = satOccurrence(d); return occ === 1 || occ === 3; }
  return false;
};
const offDayReason = (iso) => {
  const d = toDate(iso);
  if (d.getDay() === 0) return "Sunday";
  return satOccurrence(d) === 1 ? "1st Saturday" : "3rd Saturday";
};
const nextWorkingDay = (iso) => { let d = iso; while (isOffDay(d)) d = addDaysISO(d, 1); return d; };

// Counts `numDays` working days starting from `startISO` (auto-advancing to
// the next working day first if startISO itself falls on an off day).
// Returns the resulting date window plus any off days that fell inside it.
function calcWorkingPhase(startISO, numDays) {
  const n = Math.max(0, Math.floor(Number(numDays) || 0));
  const phaseStart = nextWorkingDay(startISO);
  const skipped = [];
  if (n === 0) return { start: phaseStart, end: phaseStart, counted: 0, skipped };
  let cursor = phaseStart, counted = 0, end = phaseStart;
  while (counted < n) {
    if (isOffDay(cursor)) { skipped.push(cursor); cursor = addDaysISO(cursor, 1); continue; }
    counted++; end = cursor;
    if (counted < n) cursor = addDaysISO(cursor, 1);
  }
  return { start: phaseStart, end, counted, skipped };
}

/* --------------------------------- seed -------------------------------- */

function seedData() {
  const t = todayISO();
  return [
    { id: "P-1001", name: "AMR Chassis Build", projectNumber: "ABC-001", department: "Production", team: "GT-Team 1", startDate: addDaysISO(t, -3), endDate: addDaysISO(t, 4), priority: "High", status: "In Progress", remarks: "First batch of 12 units.", progress: 55, createdDate: t, updatedDate: t },
    { id: "P-1002", name: "Arm Bracket Welding", projectNumber: "ABC-002", department: "Welding", team: "GT-Team 1", startDate: addDaysISO(t, 2), endDate: addDaysISO(t, 8), priority: "Critical", status: "Planned", remarks: "Requires jig JX-14.", progress: 0, createdDate: t, updatedDate: t },
    { id: "P-1003", name: "Base Plate Machining", projectNumber: "GTX-014", department: "Machining", team: "GTX-Team 2", startDate: addDaysISO(t, -5), endDate: addDaysISO(t, -1), priority: "Medium", status: "Completed", remarks: "", progress: 100, createdDate: t, updatedDate: t },
    { id: "P-1004", name: "Enclosure Sheet Cutting", projectNumber: "GTX-015", department: "Sheet Metal", team: "GTX-Team 2", startDate: addDaysISO(t, 1), endDate: addDaysISO(t, 6), priority: "Medium", status: "Planned", remarks: "", progress: 0, createdDate: t, updatedDate: t },
    { id: "P-1005", name: "Frame Powder Coating", projectNumber: "XP-021", department: "Coating", team: "GT-XP-Team 3", startDate: addDaysISO(t, -1), endDate: addDaysISO(t, 3), priority: "Low", status: "In Progress", remarks: "Colour RAL 7016.", progress: 40, createdDate: t, updatedDate: t },
    { id: "P-1006", name: "Final Robot Assembly", projectNumber: "XP-022", department: "Assembly", team: "GT-XP-Team 3", startDate: addDaysISO(t, -10), endDate: addDaysISO(t, -6), priority: "High", status: "Delayed", remarks: "Waiting on motor delivery.", progress: 70, createdDate: t, updatedDate: t },
  ];
}

/* ---------------------------- conflict logic ---------------------------- */

function getConflicts(projects) {
  const active = projects.filter((p) => p.status !== "Cancelled" && p.startDate && p.endDate);
  const byTeam = {};
  active.forEach((p) => {
    (byTeam[p.team] = byTeam[p.team] || []).push(p);
  });
  const conflicts = [];
  Object.values(byTeam).forEach((list) => {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const start = a.startDate > b.startDate ? a.startDate : b.startDate;
        const end = a.endDate < b.endDate ? a.endDate : b.endDate;
        if (start <= end) {
          conflicts.push({
            team: a.team, aId: a.id, bId: b.id, aName: a.name, bName: b.name,
            overlapStart: start, overlapEnd: end,
          });
        }
      }
    }
  });
  return conflicts;
}

/* ================================ APP =================================== */

export default function App() {
  const [theme, setTheme] = useState(() => loadTheme());
  // auth: "loading" | "out" | { user, profile }
  const [auth, setAuth] = useState("loading");

  useEffect(() => { applyTheme(theme); }, [theme]);
  const updateTheme = useCallback((next) => { setTheme(next); saveTheme(next); }, []);

  const resolve = useCallback(async (user) => {
    if (!user) { setAuth("out"); return; }
    try {
      const profile = await fetchMyProfile(user.id);
      setAuth({ user, profile });
    } catch (e) {
      setAuth({ user, profile: null, error: e.message });
    }
  }, []);

  useEffect(() => {
    // Local testing only: set VITE_DEV_BYPASS_AUTH=true in .env.local and run `npm run dev`.
    // import.meta.env.DEV is false in production builds, so this can never ship enabled.
    if (import.meta.env.DEV && import.meta.env.VITE_DEV_BYPASS_AUTH === "true") {
      setAuth({
        user: { id: "dev-user" },
        profile: { name: "Dev Tester", email: "dev@local", role: "Admin", status: "approved", enabled: true },
      });
      return;
    }
    if (!isDbConfigured) { setAuth("out"); return; }
    let alive = true;
    getSessionUser().then((u) => { if (alive) resolve(u); });
    const off = onAuthChange((u) => { if (alive) resolve(u); });
    return () => { alive = false; off(); };
  }, [resolve]);

  const handleLogout = async () => { await signOut(); setAuth("out"); };

  if (auth === "loading") {
    return <div className="w-full min-h-screen flex items-center justify-center text-slate-400 text-sm">Loading…</div>;
  }
  if (auth === "out") return <LoginPage />;

  const p = auth.profile;
  const blocked =
    !p ? { title: "Account not found", msg: auth.error || "No access record exists for this account. Contact the administrator." }
    : p.status === "pending" ? { title: "Awaiting approval", msg: "Your registration request has been received. An administrator must approve it before you can open the dashboard." }
    : p.status === "rejected" ? { title: "Request rejected", msg: "Your access request was not approved." }
    : p.enabled === false ? { title: "Account disabled", msg: "This account has been disabled by the administrator." }
    : null;
  if (blocked) return <BlockedScreen {...blocked} onLogout={handleLogout} />;

  const session = { id: auth.user.id, name: p.name || p.email, email: p.email, role: p.role };
  return <ProductionDashboard session={session} onLogout={handleLogout} theme={theme} updateTheme={updateTheme} />;
}

function BlockedScreen({ title, msg, onLogout }) {
  return (
    <div className="w-full min-h-screen flex items-center justify-center bg-[var(--gt-grey-050)] p-6" style={{ fontFamily: "var(--font-body)" }}>
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-8 max-w-md w-full text-center">
        <img src={logo} alt="GOAT Robotics" className="h-14 mx-auto mb-5" />
        <div className="text-[16px] font-semibold text-slate-800">{title}</div>
        <div className="text-[13px] text-slate-500 mt-2">{msg}</div>
        <div className="text-[12px] text-slate-400 mt-3">Contact: <a className="text-turkish-deep" href={`mailto:${ADMIN_CONTACT_EMAIL}`}>{ADMIN_CONTACT_EMAIL}</a></div>
        <button onClick={onLogout} className="mt-5 text-[13px] px-4 py-2 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer">Sign out</button>
      </div>
    </div>
  );
}

function ProductionDashboard({ session, onLogout, theme, updateTheme }) {
  const isAdmin = session?.role === "Admin";
  const [projects, setProjects] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [page, setPage] = useState("overview.counts");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [componentsFor, setComponentsFor] = useState(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ team: "", department: "", status: "", priority: "" });
  const [ganttView, setGanttView] = useState("Week");
  const [toast, setToast] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [menuConfig, setMenuConfig] = useState(() => loadMenuConfig());
  const [customMenu, setCustomMenu] = useState(() => loadCustomMenu());
  const [employees, setEmployees] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [teams, setTeams] = useState(() => loadTeams());
  const importInputRef = useRef(null);
  const projectsRef = useRef([]);
  useEffect(() => { projectsRef.current = projects; }, [projects]);

  const teamNames = useMemo(() => teams.map((t) => t.name), [teams]);
  const teamCodeOf = useCallback((name) => {
    const t = teams.find((tm) => tm.name === name);
    return t ? t.code : "GT";
  }, [teams]);

  const addTeam = useCallback((team) => {
    setTeams((prev) => {
      if (prev.some((t) => t.name === team.name)) return prev;
      const next = [...prev, team];
      saveTeams(next);
      return next;
    });
  }, []);

  const deleteTeam = useCallback((name) => {
    setTeams((prev) => {
      if (prev.length <= 1) return prev; // always keep at least one team
      const next = prev.filter((t) => t.name !== name);
      saveTeams(next);
      return next;
    });
  }, []);

  const updateMenuConfig = useCallback((next) => {
    setMenuConfig(next);
    saveMenuConfig(next);
  }, []);

  const updateCustomMenu = useCallback((next) => {
    setCustomMenu(next);
    saveCustomMenu(next);
  }, []);

  const navTree = useMemo(() => buildNavTree(customMenu), [customMenu]);
  const flatNav = useMemo(
    () => navTree.flatMap((g) => g.children.map((c) => ({ ...c, groupKey: g.key, groupLabel: g.label }))),
    [navTree]
  );

  const enabledDepartments = useMemo(() => DEPARTMENTS.filter((d) => menuConfig[d] !== false), [menuConfig]);

  const addNotification = useCallback((message, ref) => {
    setNotifications((prev) => {
      const next = [
        { id: "N-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), message, time: new Date().toISOString(), read: false, projectId: ref?.id || null, page: ref?.page || null },
        ...prev,
      ].slice(0, 30);
      saveNotifications(next);
      return next;
    });
  }, []);

  const markNotificationsRead = useCallback(() => {
    setNotifications((prev) => {
      const next = prev.map((n) => ({ ...n, read: true }));
      saveNotifications(next);
      return next;
    });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchProjects(seedData);
        setProjects(data);
      } catch (e) {
        console.error("project load failed", e);
        setLoadError(e.message || "Could not load projects from the database.");
      } finally {
        setLoaded(true);
      }
    })();
    fetchNotifications().then(setNotifications).catch(() => {});
    const loadMfg = () => {
      fetchEmployees().then(setEmployees).catch((e) => console.error("employees", e));
      fetchTasks().then(setTasks).catch((e) => console.error("tasks", e));
    };
    loadMfg();
    const unsubP = subscribeProjects(() => { fetchProjects(seedData).then(setProjects).catch(() => {}); });
    const unsubN = subscribeNotifications(() => { fetchNotifications().then(setNotifications); });
    const unsubE = subscribeTable("employees", () => fetchEmployees().then(setEmployees).catch(() => {}));
    const unsubT = subscribeTable("tasks", () => fetchTasks().then(setTasks).catch(() => {}));
    return () => { unsubP(); unsubN(); unsubE(); unsubT(); };
  }, []);

  const persist = useCallback(async (next) => {
    const prev = projectsRef.current;
    setProjects(next);
    try {
      await saveProjects(next);
    } catch (e) {
      console.error("storage save failed", e);
      setProjects(prev);
      showToast("Save failed: " + (e.message || "not permitted"));
    }
  }, []);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  };

  const mfgActions = useMemo(() => ({
    saveTask: async (data) => {
      const isNew = !data.id;
      const row = {
        ...data,
        id: data.id || "T-" + Math.random().toString(36).slice(2, 8).toUpperCase(),
        progress: data.status === "Completed" ? 100 : Number(data.progress) || 0,
        createdDate: data.createdDate || todayISO(), updatedDate: todayISO(),
      };
      try {
        const saved = await upsertTask(row);
        setTasks((prev) => (prev.some((t) => t.id === saved.id) ? prev.map((t) => (t.id === saved.id ? saved : t)) : [...prev, saved]));
        showToast(isNew ? "Task saved." : "Task updated.");
      } catch (e) { showToast("Task not saved: " + (e.message || "error")); throw e; }
    },
    deleteTask: async (t) => {
      try {
        await deleteTaskRemote(t.id);
        setTasks((prev) => prev.filter((x) => x.id !== t.id));
        showToast("Task deleted.");
      } catch (e) { showToast("Delete failed: " + (e.message || "error")); }
    },
    createEmployee: async (emp) => {
      const saved = await createEmployee(emp);
      setEmployees((prev) => [...prev, saved].sort((a, b) => a.name.localeCompare(b.name)));
      showToast(`Employee "${saved.name}" created.`);
      return saved;
    },
    deleteEmployee: async (emp) => {
      await deleteEmployeeRemote(emp.id); // DB trigger also refuses if active tasks exist
      setEmployees((prev) => prev.filter((e) => e.id !== emp.id));
      setTasks((prev) => prev.map((t) => (t.employeeId === emp.id ? { ...t, employeeId: null } : t)));
      showToast(`Employee "${emp.name}" deleted.`);
    },
  }), []); // eslint-disable-line

  const conflicts = useMemo(() => getConflicts(projects), [projects]);
  const conflictedIds = useMemo(() => {
    const s = new Set();
    conflicts.forEach((c) => { s.add(c.aId); s.add(c.bId); });
    return s;
  }, [conflicts]);

  const saveProject = (data) => {
    if (data.id) {
      const next = projects.map((p) => (p.id === data.id ? { ...p, ...data, updatedDate: todayISO() } : p));
      persist(next);
      showToast("Project updated.");
    } else {
      const id = "P-" + Math.random().toString(36).slice(2, 8).toUpperCase();
      const next = [...projects, { ...data, id, createdDate: todayISO(), updatedDate: todayISO() }];
      persist(next);
      showToast("Project added.");
      addNotification(`New project created: "${data.name}" (${data.department}, ${data.team}).`, { id, page: `manufacturing.${data.department}` });
    }
    setFormOpen(false);
    setEditing(null);
  };

  const saveProjectComponents = (projectId, payload) => {
    const next = projects.map((p) => (p.id === projectId ? { ...p, components: payload.components, scmEmail: payload.scmEmail, updatedDate: todayISO() } : p));
    persist(next);
    showToast("Dependencies / components list saved.");
  };

  const handleQuickCreate = (data) => {
    const projectNumber = `${teamCodeOf(data.team) || "GT"}-${Date.now().toString().slice(-5)}`;
    const department = data.mode === "manufacturing" && normalizeDept(data.manufacturing) ? normalizeDept(data.manufacturing) : "Production";
    const remarksParts = [];
    if (data.variants) remarksParts.push(`Variant: ${data.variants}`);
    if (data.payload) remarksParts.push(`Payload: ${data.payload} kg`);
    if (data.mode === "variant" && data.custom) remarksParts.push(`Custom: ${data.custom}`);
    if (data.manufacturing) remarksParts.push(`Manufacturing: ${data.manufacturing}`);
    const full = {
      name: data.name,
      mode: data.mode,
      variants: data.variants || "",
      payload: data.payload || "",
      custom: data.mode === "variant" ? data.custom : "",
      manufacturing: data.mode === "manufacturing" ? data.manufacturing : "",
      projectNumber,
      department,
      team: data.team,
      startDate: data.startDate,
      endDate: data.endDate,
      priority: "Medium",
      status: "Planned",
      remarks: remarksParts.join(" | "),
      progress: 0,
    };
    const id = "P-" + Math.random().toString(36).slice(2, 8).toUpperCase();
    const next = [...projects, { ...full, id, createdDate: todayISO(), updatedDate: todayISO() }];
    persist(next);
    setQuickOpen(false);
    showToast(`Project fed into ${data.team}.`);
    addNotification(`New project created: "${data.name}" (${data.team}).`, { id, page: "projectconfig.feeds" });
  };

  const exportToExcel = () => {
    const rows = projects.map((p) => ({
      "Project Name": p.name, "Project Number": p.projectNumber, "Variants": p.variants || "",
      "Department": p.department, "Team": p.team, "Start Date": p.startDate, "End Date": p.endDate,
      "Priority": p.priority, "Status": p.status, "Progress": p.progress, "Remarks": p.remarks || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Projects");
    XLSX.writeFile(wb, `production_projects_${todayISO()}.xlsx`);
    showToast("Exported to Excel.");
  };

  const importFromExcel = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: "array", cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
        const rowDateToISO = (v) => {
          if (v instanceof Date && !isNaN(v)) return toISO(v);
          if (typeof v === "string" && v.trim()) {
            const d = new Date(v);
            if (!isNaN(d)) return toISO(d);
          }
          return todayISO();
        };
        const newOnes = rows.map((r) => {
          const team = teamNames.includes(r["Team"]) ? r["Team"] : teamNames[0];
          const department = DEPARTMENTS.includes(r["Department"]) ? r["Department"] : "Production";
          const priority = PRIORITIES.includes(r["Priority"]) ? r["Priority"] : "Medium";
          const status = STATUSES.includes(r["Status"]) ? r["Status"] : "Planned";
          const id = "P-" + Math.random().toString(36).slice(2, 8).toUpperCase();
          return {
            id, name: r["Project Name"] || r["Name"] || "Untitled",
            projectNumber: r["Project Number"] || `IMP-${Date.now().toString().slice(-5)}-${id.slice(2, 4)}`,
            variants: r["Variants"] || "", department, team,
            startDate: rowDateToISO(r["Start Date"]), endDate: rowDateToISO(r["End Date"]),
            priority, status, remarks: r["Remarks"] || "", progress: Number(r["Progress"]) || 0,
            createdDate: todayISO(), updatedDate: todayISO(),
          };
        });
        persist([...projects, ...newOnes]);
        showToast(`${newOnes.length} project(s) imported from Excel.`);
      } catch (err) {
        showToast("Import failed — check the file format.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const confirmDelete = () => {
    const target = deleting;
    setDeleting(null);
    deleteProjectRemote(target.id)
      .then(() => {
        setProjects((prev) => prev.filter((p) => p.id !== target.id));
        setTasks((prev) => prev.filter((t) => t.projectId !== target.id)); // cascaded in DB
        showToast("Project deleted.");
      })
      .catch((e) => showToast("Delete failed: " + (e.message || "not permitted")));
  };

  const handleNotificationClick = (n) => {
    if (n.page && flatNav.some((s) => s.key === n.page)) setPage(n.page);
    else setPage("projectconfig.feeds");
    if (n.projectId) {
      const p = projects.find((pr) => pr.id === n.projectId);
      if (p) { setEditing(isAdmin ? p : null); if (isAdmin) setFormOpen(true); }
    }
    setSidebarOpen(false);
  };

  const exportTimelineWorkbook = () => exportTeamTimeline(projects, conflicts, teamNames);

  const activeItem = flatNav.find((s) => s.key === page) || flatNav[0];

  const scopedProjects = useMemo(() => {
    if (activeItem.key.startsWith("manufacturing.") && activeItem.key !== "manufacturing.taskfeeds") {
      const dept = activeItem.key.split("manufacturing.")[1];
      return projects.filter((p) => p.department === dept);
    }
    return projects;
  }, [projects, activeItem]);

  if (loaded && loadError) {
    return (
      <div className="w-full h-full min-h-[500px] flex items-center justify-center p-6">
        <div className="bg-white border border-red-200 rounded-lg p-6 max-w-md text-center">
          <div className="text-[14px] font-semibold text-red-600">Could not load data</div>
          <div className="text-[12.5px] text-slate-500 mt-1.5">{loadError}</div>
          <div className="text-[12px] text-slate-400 mt-2">Check that supabase/migration.sql has been run and your account is approved.</div>
        </div>
      </div>
    );
  }
  if (!loaded) {
    return (
      <div style={{ fontFamily: "var(--font-body)" }} className="w-full h-full min-h-[500px] flex items-center justify-center text-slate-400 text-sm bg-ink">
        Loading production data…
      </div>
    );
  }

  return (
    <div className="w-full h-screen flex bg-[var(--gt-grey-050)] text-slate-800 relative overflow-hidden" style={{ fontFamily: "var(--font-body)" }}>
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 transition-opacity" onClick={() => setSidebarOpen(false)} />
      )}
      <Sidebar page={page} setPage={setPage} conflictCount={conflicts.length} menuConfig={menuConfig} customMenu={customMenu} open={sidebarOpen} onClose={() => setSidebarOpen(false)} isAdmin={isAdmin} />
      <div className="flex-1 min-w-0 flex flex-col h-full">
        <TopBar
          activeItem={activeItem}
          search={search}
          setSearch={setSearch}
          projects={projects}
          onSelectResult={(p) => { setPage("projectconfig.feeds"); setSearch(""); setEditing(isAdmin ? p : null); if (isAdmin) setFormOpen(true); }}
          onQuickCreate={() => setQuickOpen(true)}
          onFullAdd={() => { setEditing(null); setFormOpen(true); }}
          onExport={exportToExcel}
          onExportTimeline={exportTimelineWorkbook}
          onImportClick={() => importInputRef.current && importInputRef.current.click()}
          session={session}
          isAdmin={isAdmin}
          onLogout={onLogout}
          notifications={notifications}
          onOpenNotifications={markNotificationsRead}
          onNotificationClick={handleNotificationClick}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
        />
        <input
          ref={importInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files && e.target.files[0];
            if (file) importFromExcel(file);
            e.target.value = "";
          }}
        />
        <div className="flex-1 overflow-auto p-5">
          <PageRouter
            page={page}
            setPage={setPage}
            projects={projects}
            scopedProjects={scopedProjects}
            conflicts={conflicts}
            conflictedIds={conflictedIds}
            ganttView={ganttView}
            setGanttView={setGanttView}
            search={search}
            filters={filters}
            setFilters={setFilters}
            isAdmin={isAdmin}
            menuConfig={menuConfig}
            updateMenuConfig={updateMenuConfig}
            customMenu={customMenu}
            updateCustomMenu={updateCustomMenu}
            employees={employees}
            tasks={tasks}
            mfgActions={mfgActions}
            session={session}
            notify={showToast}
            theme={theme}
            updateTheme={updateTheme}
            teams={teams}
            addTeam={addTeam}
            deleteTeam={deleteTeam}
            onCreateClick={() => setQuickOpen(true)}
            onEdit={(p) => { setEditing(p); setFormOpen(true); }}
            onDelete={(p) => setDeleting(p)}
            onComponents={(p) => setComponentsFor(p)}
            onExport={exportToExcel}
            onExportTimeline={exportTimelineWorkbook}
            onImportClick={() => importInputRef.current && importInputRef.current.click()}
          />
        </div>
      </div>

      {formOpen && (
        <ProjectFormModal
          initial={editing}
          enabledDepartments={enabledDepartments}
          teams={teams}
          addTeam={addTeam}
          deleteTeam={deleteTeam}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          onSave={saveProject}
        />
      )}
      {quickOpen && (
        <QuickCreateModal teams={teams} addTeam={addTeam} deleteTeam={deleteTeam} onClose={() => setQuickOpen(false)} onSave={handleQuickCreate} />
      )}
      {deleting && (
        <ConfirmModal
          title="Delete project?"
          message={`Are you sure you want to delete "${deleting.name}"? Its manufacturing tasks will be deleted too. This cannot be undone.`}
          onCancel={() => setDeleting(null)}
          onConfirm={confirmDelete}
        />
      )}
      {componentsFor && (
        <ComponentsModal
          project={componentsFor}
          onClose={() => setComponentsFor(null)}
          onSave={saveProjectComponents}
        />
      )}
      {toast && (
        <div className="fixed bottom-5 right-5 bg-ink text-white text-sm px-4 py-2.5 rounded-md shadow-xl z-50 flex items-center gap-2 border border-gline">
          <CheckCircle2 size={16} className="text-emerald-400" /> {toast}
        </div>
      )}
    </div>
  );
}

/* ------------------------------- PageRouter ------------------------------ */

function PageRouter(props) {
  const { page, setPage, projects, scopedProjects, conflicts, conflictedIds, ganttView, setGanttView,
    search, filters, setFilters, isAdmin, menuConfig, updateMenuConfig,
    customMenu, updateCustomMenu, employees, tasks, mfgActions, session, notify, theme, updateTheme,
    teams, addTeam, deleteTeam,
    onCreateClick, onEdit, onDelete, onComponents, onExport, onExportTimeline, onImportClick } = props;

  if (page === "overview.counts") {
    return (
      <OverviewPage
        projects={projects} conflicts={conflicts} conflictedIds={conflictedIds}
        ganttView={ganttView} setGanttView={setGanttView}
        onEdit={onEdit} onDelete={onDelete} onComponents={onComponents} setPage={setPage} isAdmin={isAdmin} teams={teams}
      />
    );
  }
  if (page === "overview.dependencies" || page === "configportal.dependencies") {
    return <DependenciesPage projects={projects} setPage={setPage} />;
  }
  if (page === "overview.menu" || page === "configportal.menu") {
    return (
      <MenuConfigPage
        menuConfig={menuConfig} updateMenuConfig={updateMenuConfig} isAdmin={isAdmin} projects={projects}
        customMenu={customMenu} updateCustomMenu={updateCustomMenu}
      />
    );
  }
  if (page.startsWith("custom-")) {
    const slug = page.split(".")[0].replace(/^custom-/, "");
    const item = (customMenu || []).find((m) => m.slug === slug);
    return <CustomMenuPage label={item ? item.label : "Custom Page"} />;
  }
  if (page === "projectconfig.teams") {
    return <TeamsPage projects={projects} setPage={setPage} teams={teams} addTeam={addTeam} deleteTeam={deleteTeam} isAdmin={isAdmin} />;
  }
  if (page === "projectconfig.feeds") {
    return (
      <FeedsPage
        projects={projects} onCreateClick={onCreateClick} onEdit={onEdit} onDelete={onDelete} onComponents={onComponents}
        conflictedIds={conflictedIds} onExport={onExport} onExportTimeline={onExportTimeline}
        onImportClick={onImportClick} isAdmin={isAdmin} teams={teams}
      />
    );
  }
  if (page === "projectconfig.timeline") {
    return <TimelineCalcPage />;
  }
  if (page === "manufacturing.taskfeeds") {
    return <TaskFeedsPage projects={projects} employees={employees} tasks={tasks} isAdmin={isAdmin} actions={mfgActions} />;
  }
  if (page.startsWith("manufacturing.")) {
    const dept = page.split("manufacturing.")[1];
    const Icon = DEPT_ICON[dept] || Factory;
    if (menuConfig[dept] === false) {
      return <DisabledModuleNotice dept={dept} setPage={setPage} />;
    }
    return (
      <div className="space-y-5">
      <EmployeeAllocationPage category={dept} employees={employees} tasks={tasks} projects={projects} />
      <ListPage
        title={dept} icon={Icon} projects={scopedProjects} allTeams
        search={search} filters={filters} setFilters={setFilters}
        conflicts={conflicts} conflictedIds={conflictedIds}
        ganttView={ganttView} setGanttView={setGanttView}
        onEdit={onEdit} onDelete={onDelete} onComponents={onComponents} isAdmin={isAdmin} teams={teams}
      />
      </div>
    );
  }
  if (page === "configportal.users") {
    return <AuthorizedUsersPage isAdmin={isAdmin} currentUserId={session?.id} notify={notify} />;
  }
  if (page === "configportal.approval") {
    return <ApprovalPage isAdmin={isAdmin} notify={notify} />;
  }
  if (page === "documents.rca") {
    return <RcaPage isAdmin={isAdmin} session={session} notify={notify} />;
  }
  if (page === "documents.costing") {
    return <CostingPage isAdmin={isAdmin} projects={projects} notify={notify} />;
  }
  if (page === "documents.materialprice") {
    return <MaterialPricePage isAdmin={isAdmin} notify={notify} />;
  }
  if (page === "documents.scrap") {
    return <ScrapPage isAdmin={isAdmin} projects={projects} notify={notify} />;
  }
  if (page === "documents.bottleneck") {
    return <BottleneckPage isAdmin={isAdmin} projects={projects} notify={notify} />;
  }
  if (page === "documents.timeline") {
    return (
      <TimelinePage
        projects={projects} conflictedIds={conflictedIds} conflicts={conflicts}
        ganttView={ganttView} setGanttView={setGanttView}
        onEdit={onEdit} onDelete={onDelete} onComponents={onComponents} isAdmin={isAdmin}
        tasks={tasks} employees={employees}
      />
    );
  }
  if (page === "settings.settings") {
    return <SettingsPage isAdmin={isAdmin} theme={theme} updateTheme={updateTheme} />;
  }
  if (page === "settings.contact") {
    return <ContactPage />;
  }
  return <OverviewPage projects={projects} conflicts={conflicts} conflictedIds={conflictedIds} ganttView={ganttView} setGanttView={setGanttView} onEdit={onEdit} onDelete={onDelete} onComponents={onComponents} setPage={setPage} isAdmin={isAdmin} teams={teams} />;
}

/* -------------------------------- Sidebar -------------------------------- */

function Sidebar({ page, setPage, conflictCount, menuConfig, customMenu, open, onClose, isAdmin }) {
  // Configuration Portal is admin-only (also enforced by the database).
  const navTree = useMemo(() => {
    const full = buildNavTree(customMenu);
    return isAdmin ? full : full.filter((g) => !g.adminOnly);
  }, [customMenu, isAdmin]);
  const activeGroupKey = page.split(".")[0];
  const [openGroups, setOpenGroups] = useState(() => new Set(navTree.map((g) => g.key)));

  useEffect(() => {
    setOpenGroups((prev) => {
      let changed = false;
      const next = new Set(prev);
      navTree.forEach((g) => { if (!next.has(g.key)) { next.add(g.key); changed = true; } });
      return changed ? next : prev;
    });
  }, [navTree]);

  const toggleGroup = (key) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const isChildDisabled = (childKey) => {
    if (!childKey.startsWith("manufacturing.") || childKey === "manufacturing.taskfeeds") return false;
    return menuConfig[childKey.split("manufacturing.")[1]] === false;
  };

  // White sidebar, black Arial text, normal weight (requirement 2).
  return (
    <div
      style={{ fontFamily: "Arial, Helvetica, sans-serif", fontWeight: 400 }}
      className={`fixed lg:static inset-y-0 left-0 z-50 w-72 shrink-0 bg-white text-black border-r border-slate-200 flex flex-col transition-transform duration-300 ease-out ${
        open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      }`}
    >
      <div className="px-5 py-5 border-b border-slate-200 flex items-center justify-center relative">
        <img src={logo} alt="GOAT Robotics" className="h-16 w-auto max-w-[80%] object-contain shrink-0" />
        <button onClick={onClose} className="lg:hidden absolute right-4 top-1/2 -translate-y-1/2 text-black cursor-pointer" aria-label="Close menu">
          <X size={18} />
        </button>
      </div>

      <nav className="flex-1 py-3 px-3 space-y-0.5 overflow-y-auto select-none">
        {navTree.map((group) => {
          const GIcon = group.icon;
          const groupActive = activeGroupKey === group.key;
          const rowCls = (active) => `w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-[14px] text-black cursor-pointer transition-colors ${active ? "bg-slate-100" : "hover:bg-slate-100"}`;

          if (group.direct) {
            return (
              <button key={group.key} onClick={() => { setPage(group.direct); onClose && onClose(); }} className={rowCls(page === group.direct)}>
                <GIcon size={16} className="text-black shrink-0" />
                <span className="flex-1 text-left">{group.label}</span>
                {group.key === "overview" && conflictCount > 0 && (
                  <span className="text-[10px] bg-red-500 text-white rounded-full min-w-[17px] h-[17px] px-1 flex items-center justify-center">{conflictCount}</span>
                )}
              </button>
            );
          }

          const expanded = openGroups.has(group.key);
          return (
            <div key={group.key} className="pt-1 mt-1 border-t border-slate-200 first:border-0 first:mt-0 first:pt-0">
              <button onClick={() => toggleGroup(group.key)} className={rowCls(false)}>
                <GIcon size={16} className="text-black shrink-0" />
                <span className="flex-1 text-left">{group.label}</span>
                {expanded ? <ChevronUp size={14} className="text-black" /> : <ChevronDown size={14} className="text-black" />}
              </button>
              {expanded && (
                <div className="ml-5 pl-3 border-l border-slate-200 mt-0.5 mb-1 space-y-0.5">
                  {group.children.map((child) => {
                    const CIcon = child.icon;
                    const active = page === child.key;
                    const disabled = isChildDisabled(child.key);
                    return (
                      <button
                        key={child.key}
                        onClick={() => { if (!disabled) { setPage(child.key); onClose && onClose(); } }}
                        disabled={disabled}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[13.5px] text-black transition-colors ${
                          disabled ? "opacity-40 cursor-not-allowed" : active ? "bg-slate-100 cursor-pointer" : "hover:bg-slate-100 cursor-pointer"
                        }`}
                      >
                        <CIcon size={15} className="text-black shrink-0" />
                        <span className="flex-1 text-left">{child.label}</span>
                        {disabled && <span className="text-[9px] uppercase border border-slate-300 rounded px-1">Off</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="px-4 py-3 border-t border-slate-200 text-[10px] text-slate-500 flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${isDbConfigured ? "bg-emerald-500" : "bg-slate-400"}`} />
        {isDbConfigured ? "Live shared data" : "Database not configured"}
      </div>
    </div>
  );
}

/* -------------------------------- TopBar -------------------------------- */

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function TopBar({ activeItem, search, setSearch, projects, onSelectResult, onQuickCreate, onFullAdd, onExport, onExportTimeline, onImportClick, session, isAdmin, onLogout, notifications, onOpenNotifications, onNotificationClick, onToggleSidebar }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const initials = (session?.name || "Guest").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  const searchMatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !projects) return [];
    return projects
      .filter((p) =>
        p.name.toLowerCase().includes(q) ||
        p.projectNumber.toLowerCase().includes(q) ||
        p.team.toLowerCase().includes(q) ||
        p.department.toLowerCase().includes(q) ||
        (p.status || "").toLowerCase().includes(q) ||
        (p.variants || "").toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [search, projects]);

  const runSearch = () => searchMatches[0] && onSelectResult && onSelectResult(searchMatches[0]);
  const unreadCount = (notifications || []).filter((n) => !n.read).length;

  return (
    <div className="bg-white/90 gt-glass border-b border-slate-200 sticky top-0 z-30">
      <div className="px-5 py-2.5 flex items-center justify-between gap-4 border-b border-slate-100">
        <div className="flex items-center gap-2 w-full max-w-[28rem]">
          <button
            onClick={onToggleSidebar}
            className="lg:hidden shrink-0 w-9 h-9 flex items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 cursor-pointer"
            title="Menu"
          >
            <Menu size={16} />
          </button>
          <div className="relative flex-1 min-w-0">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
              onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
              placeholder="Search Project / Task / Team / Variant..."
              className="pl-9 pr-8 py-2 text-[13px] bg-slate-50 border border-transparent rounded-md w-full focus:outline-none focus:ring-2 focus:ring-turkish/30 focus:bg-white focus:border-turkish"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" title="Clear search">
                <X size={13} />
              </button>
            )}
            {searchFocused && search.trim() && (
              <div className="absolute left-0 right-0 top-11 gt-menu-surface border border-slate-200 rounded-md shadow-lg z-40 max-h-80 overflow-auto">
                {searchMatches.length === 0 ? (
                  <div className="px-3.5 py-3 text-[12.5px] text-slate-400">No results match "{search.trim()}".</div>
                ) : (
                  searchMatches.map((p) => {
                    const st = STATUS_COLOR[p.status] || STATUS_COLOR["Planned"];
                    return (
                      <button
                        key={p.id}
                        onClick={() => onSelectResult && onSelectResult(p)}
                        className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-slate-50 border-b border-slate-50 last:border-0"
                      >
                        <div className="min-w-0">
                          <div className="text-[12.5px] font-medium text-slate-700 truncate">{p.name}</div>
                          <div className="text-[11px] text-slate-400 font-mono">{p.projectNumber} · {p.team} · {p.department}</div>
                        </div>
                        <span className="shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: st.bg, color: st.text }}>{p.status}</span>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
          <button
            onClick={runSearch}
            className="shrink-0 flex items-center gap-1.5 text-[12.5px] font-medium px-3 py-2 rounded-md bg-turkish hover:bg-turkish-deep text-white cursor-pointer transition-colors"
            title="Search"
          >
            <Search size={13} /> Search
          </button>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <div className="relative">
            <button
              onClick={() => { setNotifOpen((v) => { const next = !v; if (next) onOpenNotifications && onOpenNotifications(); return next; }); }}
              className="relative block"
              title="Notifications"
            >
              <Bell size={16} className="text-slate-400" />
              {unreadCount > 0 && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500" />}
            </button>
            {notifOpen && (
              <div className="absolute right-0 top-9 w-80 gt-menu-surface border border-slate-200 rounded-md shadow-lg z-40 max-h-96 overflow-auto">
                <div className="px-3.5 py-2.5 border-b border-slate-100 text-[12.5px] font-semibold text-slate-700">Notifications</div>
                {(!notifications || notifications.length === 0) ? (
                  <div className="px-3.5 py-4 text-[12px] text-slate-400 text-center">No notifications yet.</div>
                ) : (
                  notifications.map((n) => (
                    <button key={n.id} onClick={() => { setNotifOpen(false); onNotificationClick && onNotificationClick(n); }} className="w-full text-left px-3.5 py-2.5 border-b border-slate-50 last:border-0 flex items-start gap-2 hover:bg-slate-50 cursor-pointer">
                      <Bell size={13} className="text-turkish mt-0.5 shrink-0" />
                      <div>
                        <div className="text-[12px] text-slate-600 leading-snug">{n.message}</div>
                        <div className="text-[10.5px] text-slate-400 mt-0.5">{timeAgo(n.time)}</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <div className="relative">
            <button onClick={() => setMenuOpen((v) => !v)} className="flex items-center gap-2 pl-3 border-l border-slate-200 cursor-pointer">
              <div className="w-8 h-8 rounded-full bg-turkish text-white flex items-center justify-center text-[12px] font-semibold">{initials}</div>
              <div className="text-left">
                <div className="text-[12.5px] text-slate-700 font-medium leading-tight">{session?.name}</div>
                <div className="text-[10px] text-slate-400 flex items-center gap-1 leading-tight">
                  {isAdmin ? <ShieldCheck size={10} className="text-turkish" /> : <Eye size={10} />} {session?.role}
                </div>
              </div>
              <ChevronDown size={14} className="text-slate-400" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-11 w-44 gt-menu-surface border border-slate-200 rounded-md shadow-lg py-1 z-30">
                <button onClick={onLogout} className="w-full flex items-center gap-2 px-3 py-2 text-[12.5px] text-slate-600 hover:bg-slate-50 cursor-pointer">
                  <LogOut size={13} /> Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="px-5 py-3.5 flex items-center justify-between gap-4 flex-wrap">
        <SectionHeading title={activeItem.label} crumb={activeItem.groupLabel} size="lg" />
        {isAdmin && activeItem.key === "projectconfig.feeds" && (
          <div className="flex items-center gap-2">
            <button onClick={onImportClick} title="Import from Excel" className="w-9 h-9 flex items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 cursor-pointer">
              <Upload size={15} />
            </button>
            <button onClick={onExport} title="Export to Excel" className="w-9 h-9 flex items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 cursor-pointer">
              <Download size={15} />
            </button>
            <button onClick={onExportTimeline} title="Download team-wise timeline (Gantt with duration bars & GOAT logo)" className="flex items-center gap-1.5 w-9 h-9 lg:w-auto lg:px-3 justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 cursor-pointer">
              <CalendarDays size={15} /> <span className="hidden lg:inline text-[12.5px] font-medium">Timeline</span>
            </button>
            <button onClick={onFullAdd} title="Add project (full form)" className="w-9 h-9 flex items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 cursor-pointer">
              <Plus size={15} />
            </button>
            <button onClick={onQuickCreate} className="flex items-center gap-1.5 bg-turkish hover:bg-turkish-deep text-white text-[13px] font-medium px-4 py-2 rounded-md transition-colors cursor-pointer">
              <Plus size={15} /> Create
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------- SectionHeading ------------------------------ */

/* ------------------------------ Overview -------------------------------- */

function OverviewPage({ projects, conflicts, conflictedIds, ganttView, setGanttView, onEdit, onDelete, onComponents, setPage, isAdmin, teams }) {
  const teamNames = (teams || []).map((t) => t.name);
  const total = projects.length;
  const active = projects.filter((p) => p.status === "In Progress").length;
  const planned = projects.filter((p) => p.status === "Planned").length;
  const completed = projects.filter((p) => p.status === "Completed").length;
  const delayed = projects.filter((p) => p.status === "Delayed").length;
  const byTeam = (t) => projects.filter((p) => p.team === t).length;
  const byDept = (d) => projects.filter((p) => p.department === d).length;

  const t = todayISO();
  const upcoming = projects.filter((p) => p.startDate > t && p.status !== "Cancelled").sort((a, b) => (a.startDate < b.startDate ? -1 : 1)).slice(0, 6);
  const inProgress = projects.filter((p) => p.status === "In Progress").slice(0, 6);
  const startingTomorrow = projects.filter((p) => p.startDate === addDaysISO(t, 1)).length;

  const catCards = OVERVIEW_DEPTS.map((d) => ({ label: deptLabel(d), value: byDept(d), page: "projectconfig.feeds" }));
  const cards = [
    { label: "Total Projects", value: total, color: "#0EA5C4" },
    { label: "Active Projects", value: active, color: "#2E9464" },
    { label: "Pending Projects", value: planned, color: "#5B84A6" },
    { label: "Completed Projects", value: completed, color: "#3AA76D" },
    { label: "Delayed Projects", value: delayed, color: "#D8453A" },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {catCards.map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-slate-200 px-5 py-4">
            <div className="text-[11px] uppercase tracking-wide text-slate-400 font-medium">{c.label}</div>
            <div className="text-[30px] font-semibold mt-1 font-mono text-slate-800">{c.value}</div>
            <div className="text-[11px] text-slate-400">project{c.value !== 1 ? "s" : ""}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-slate-200 px-4 py-3.5 relative overflow-hidden">
            <div className="absolute -right-3 -top-3 w-14 h-14 rounded-full opacity-[0.08]" style={{ background: c.color }} />
            <div className="text-[10.5px] uppercase tracking-wide text-slate-400 font-medium">{c.label}</div>
            <div className="text-[26px] font-display font-semibold mt-1 font-mono" style={{ color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      <AlertsPanel conflicts={conflicts} delayed={delayed} startingTomorrow={startingTomorrow} completed={completed} setPage={setPage} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="mb-2.5"><SectionHeading title="By Manufacturing Type" /></div>
          <div className="space-y-2">
            {[...OVERVIEW_DEPTS, "Coating"].map((d) => (
              <div key={d} className="flex items-center justify-between text-[12.5px]">
                <span className="text-slate-600">{deptLabel(d)}</span>
                <span className="font-mono font-semibold text-slate-800">{byDept(d)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="mb-2.5"><SectionHeading title="By Team" /></div>
          <div className="space-y-2">
            {teamNames.map((tm) => (
              <div key={tm} className="flex items-center justify-between text-[12.5px]">
                <span className="text-slate-600">{tm}</span>
                <span className="font-mono font-semibold text-slate-800">{byTeam(tm)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="mb-2.5"><SectionHeading title="Overlap / Conflicts" /></div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-mono font-semibold" style={{ color: conflicts.length ? "#C0332B" : "#2E9464" }}>{conflicts.length}</span>
            <span className="text-[12px] text-slate-400">team schedule overlap{conflicts.length !== 1 ? "s" : ""}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="mb-2.5"><SectionHeading title="Currently In Progress" /></div>
          <div className="space-y-2.5">
            {inProgress.length === 0 && <div className="text-[12px] text-slate-400">Nothing in progress right now.</div>}
            {inProgress.map((p) => (
              <div key={p.id} className="border border-slate-100 rounded-md p-2.5">
                <div className="flex items-center justify-between">
                  <div className="text-[13px] font-medium text-slate-800">{p.name}</div>
                  <span className="text-[10px] text-slate-400 font-mono">{p.team}</span>
                </div>
                <div className="text-[11px] text-slate-400 font-mono mt-0.5">{fmtShort(p.startDate)} → {fmtShort(p.endDate)}</div>
                <div className="mt-1.5 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-turkish" style={{ width: `${p.progress || 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="mb-2.5"><SectionHeading title="Upcoming Projects" /></div>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-slate-400 text-left">
                <th className="font-medium pb-1.5">Project</th>
                <th className="font-medium pb-1.5">Team</th>
                <th className="font-medium pb-1.5">Start</th>
                <th className="font-medium pb-1.5">Priority</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.length === 0 && <tr><td colSpan={4} className="text-slate-400 py-2">No upcoming projects.</td></tr>}
              {upcoming.map((p) => (
                <tr key={p.id} className="border-t border-slate-50">
                  <td className="py-1.5 text-slate-700">{p.name}</td>
                  <td className="py-1.5 text-slate-500">{p.team}</td>
                  <td className="py-1.5 font-mono text-slate-500">{fmtShort(p.startDate)}</td>
                  <td className="py-1.5"><PriorityTag priority={p.priority} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <SectionHeading title="Overall Production Gantt" />
          <GanttViewToggle view={ganttView} setView={setGanttView} />
        </div>
        <GanttChart projects={projects} conflictedIds={conflictedIds} view={ganttView} />
      </div>

      <ProjectTable projects={projects} conflictedIds={conflictedIds} onEdit={onEdit} onDelete={onDelete} onComponents={onComponents} isAdmin={isAdmin} />
    </div>
  );
}

function AlertsPanel({ conflicts, delayed, startingTomorrow, completed, setPage }) {
  const items = [];
  if (conflicts.length > 0) items.push({ icon: TriangleAlert, color: "#C0332B", bg: "#FBEAEA", text: `${conflicts.length} team schedule conflict${conflicts.length > 1 ? "s" : ""} detected` });
  if (delayed > 0) items.push({ icon: CircleDot, color: "#D8453A", bg: "#FBEAEA", text: `${delayed} project${delayed > 1 ? "s" : ""} delayed` });
  if (startingTomorrow > 0) items.push({ icon: Clock, color: "#C7891E", bg: "#FBF3E4", text: `${startingTomorrow} project${startingTomorrow > 1 ? "s" : ""} starting tomorrow` });
  if (completed > 0) items.push({ icon: CheckCircle2, color: "#2E9464", bg: "#E7F1EC", text: `${completed} project${completed > 1 ? "s" : ""} completed` });
  if (items.length === 0) return null;
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="mb-2.5"><SectionHeading title="Dashboard Alerts" icon={Bell} /></div>
      <div className="flex flex-wrap gap-2">
        {items.map((it, i) => {
          const Icon = it.icon;
          return (
            <button key={i} onClick={() => setPage("projectconfig.feeds")} style={{ background: it.bg, color: it.color }} className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-md hover:opacity-80 transition-opacity">
              <Icon size={13} /> {it.text}
            </button>
          );
        })}
      </div>
      {conflicts.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {conflicts.map((c, i) => (
            <div key={i} className="text-[11.5px] bg-[#FBEAEA] border border-red-100 rounded-md px-3 py-1.5 text-[#A3312A] font-mono">
              ⚠ {c.team}: "{c.aName}" ({fmtShort(c.overlapStart)}–{fmtShort(c.overlapEnd)} overlaps) "{c.bName}"
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* --------------------------- Project Dependencies -------------------------- */

function DependenciesPage({ projects, setPage }) {
  const byStage = DEP_CHAIN.map((dept) => ({
    dept,
    items: projects.filter((p) => p.department === dept),
  }));

  const stageStatus = (items) => {
    if (items.length === 0) return "empty";
    if (items.some((p) => p.status === "Delayed")) return "delayed";
    if (items.every((p) => p.status === "Completed")) return "completed";
    if (items.some((p) => p.status === "In Progress")) return "in-progress";
    return "pending";
  };

  const stages = byStage.map((s, i) => ({ ...s, status: stageStatus(s.items) }));

  const STATUS_STYLE = {
    empty: { ring: "border-slate-200", dot: "bg-slate-300", label: "No tasks", text: "text-slate-400" },
    pending: { ring: "border-slate-300", dot: "bg-slate-400", label: "Pending", text: "text-slate-500" },
    "in-progress": { ring: "border-turkish", dot: "bg-turkish", label: "In Progress", text: "text-turkish-deep" },
    completed: { ring: "border-emerald-400", dot: "bg-emerald-500", label: "Completed", text: "text-emerald-600" },
    delayed: { ring: "border-red-400", dot: "bg-red-500", label: "Delayed", text: "text-red-600" },
  };

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-lg border border-slate-200 p-5">
        <SectionHeading title="Manufacturing Dependency Chain" icon={GitBranch} />
        <div className="text-[12px] text-slate-400 mt-2 mb-5">
          Parent task must clear before its child task can start. A delayed stage blocks everything downstream of it.
        </div>
        <div className="flex items-stretch gap-0 overflow-x-auto pb-2">
          {stages.map((s, i) => {
            const style = STATUS_STYLE[s.status];
            const blockedByPrev = i > 0 && (stages[i - 1].status === "delayed");
            return (
              <React.Fragment key={s.dept}>
                <button
                  onClick={() => setPage(`manufacturing.${s.dept}`)}
                  className={`shrink-0 w-44 rounded-lg border-2 ${style.ring} p-3.5 text-left hover:shadow-md transition-shadow bg-white relative ${blockedByPrev ? "ring-2 ring-red-200" : ""}`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                    <span className="text-[13px] font-display font-semibold text-slate-800">{s.dept}</span>
                  </div>
                  <div className={`text-[11px] mt-1 font-medium ${style.text}`}>{style.label}</div>
                  <div className="text-[10.5px] text-slate-400 font-mono mt-1.5">{s.items.length} task{s.items.length !== 1 ? "s" : ""}</div>
                  {blockedByPrev && (
                    <div className="text-[10px] text-red-600 font-medium mt-1.5 flex items-center gap-1"><TriangleAlert size={10} /> Blocked by {stages[i - 1].dept}</div>
                  )}
                </button>
                {i < stages.length - 1 && (
                  <div className="flex items-center px-2 shrink-0">
                    <ChevronRight size={18} className="text-slate-300" />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {stages.map((s) => (
          <div key={s.dept} className="bg-white rounded-lg border border-slate-200 p-4">
            <SectionHeading title={`${s.dept} — child / blocking tasks`} />
            <div className="mt-2.5 space-y-1.5">
              {s.items.length === 0 && <div className="text-[12px] text-slate-400">No tasks in this stage yet.</div>}
              {s.items.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-[12px] border-b border-slate-50 pb-1.5">
                  <span className="text-slate-700 truncate">{p.name}</span>
                  <StatusTag status={p.status} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* --------------------------- Menu Configuration --------------------------- */

function MenuConfigPage({ menuConfig, updateMenuConfig, isAdmin, projects, customMenu, updateCustomMenu }) {
  const toggle = (dept) => {
    if (!isAdmin) return;
    updateMenuConfig({ ...menuConfig, [dept]: menuConfig[dept] === false ? true : false });
  };

  // Show manufacturing-process modules first, in build order (Machining ->
  // Welding -> Coating -> Assembly), then everything else — instead of the
  // unordered list this used to be.
  const orderedDepartments = [
    ...DEP_CHAIN.filter((d) => DEPARTMENTS.includes(d)),
    ...DEPARTMENTS.filter((d) => !DEP_CHAIN.includes(d)),
  ];

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-lg border border-slate-200 p-5">
        <SectionHeading title="Menu / Module Configuration" icon={SlidersHorizontal} />
        <div className="text-[12px] text-slate-400 mt-2 mb-4">
          Enable or disable a manufacturing module without touching source code. Disabled modules disappear from the sidebar
          and from every project creation / timeline dropdown — historical data for them stays intact and searchable.
        </div>
        {!isAdmin && (
          <div className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-4">Sign in as Admin to change these toggles.</div>
        )}
        <div className="flex flex-col divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
          {orderedDepartments.map((d) => {
            const Icon = DEPT_ICON[d] || Factory;
            const enabled = menuConfig[d] !== false;
            const count = projects.filter((p) => p.department === d).length;
            return (
              <div key={d} className={`flex items-center justify-between gap-4 px-4 py-3 ${enabled ? "bg-white" : "bg-slate-50"}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 ${enabled ? "bg-turkish-tint text-turkish-deep" : "bg-slate-100 text-slate-400"}`}>
                    <Icon size={16} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-slate-800">{d}</div>
                    <div className="text-[11px] text-slate-400 font-mono">{count} project{count !== 1 ? "s" : ""} on record</div>
                  </div>
                </div>
                <button
                  onClick={() => toggle(d)}
                  disabled={!isAdmin}
                  className={`shrink-0 w-11 h-6 p-0 border-0 rounded-full relative overflow-hidden transition-colors ${enabled ? "bg-turkish" : "bg-slate-300"} ${!isAdmin ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
                  title={enabled ? "Enabled — click to disable" : "Disabled — click to enable"}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : "translate-x-0"}`} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <CustomMenuManager customMenu={customMenu || []} updateCustomMenu={updateCustomMenu} isAdmin={isAdmin} />
      <div className="bg-white rounded-lg border border-slate-200 p-5">
        <SectionHeading title="Other Master Data" />
        <div className="text-[12px] text-slate-400 mt-2">
          Project Variants, Task Types, Status Types, Priority Types and Menu Items are next to move here from fixed
          constants into fully editable configuration — tracked for the Data Model phase.
        </div>
      </div>
    </div>
  );
}

function CustomMenuManager({ customMenu, updateCustomMenu, isAdmin }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const addMenu = () => {
    const label = name.trim();
    if (!label) { setError("Menu name is required."); return; }
    let slug = slugify(label);
    if (customMenu.some((m) => m.slug === slug)) {
      let i = 2;
      while (customMenu.some((m) => m.slug === `${slugify(label)}-${i}`)) i++;
      slug = `${slugify(label)}-${i}`;
    }
    const maxOrder = customMenu.reduce((m, x) => Math.max(m, x.order || 0), 0);
    updateCustomMenu([...customMenu, { slug, label, enabled: true, order: maxOrder + 1 }]);
    setName("");
    setError("");
  };
  const renameMenu = (slug, label) => updateCustomMenu(customMenu.map((m) => (m.slug === slug ? { ...m, label } : m)));
  const toggleMenu = (slug) => updateCustomMenu(customMenu.map((m) => (m.slug === slug ? { ...m, enabled: m.enabled === false ? true : false } : m)));
  const deleteMenu = (slug) => updateCustomMenu(customMenu.filter((m) => m.slug !== slug));
  const moveMenu = (slug, dir) => {
    const sorted = [...customMenu].sort((a, b) => (a.order || 0) - (b.order || 0));
    const idx = sorted.findIndex((m) => m.slug === slug);
    const swapIdx = idx + dir;
    if (idx === -1 || swapIdx < 0 || swapIdx >= sorted.length) return;
    const a = sorted[idx], b = sorted[swapIdx];
    const orderA = a.order || 0, orderB = b.order || 0;
    updateCustomMenu(customMenu.map((m) => {
      if (m.slug === a.slug) return { ...m, order: orderB };
      if (m.slug === b.slug) return { ...m, order: orderA };
      return m;
    }));
  };

  const sorted = [...customMenu].sort((a, b) => (a.order || 0) - (b.order || 0));

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5">
      <SectionHeading title="Create / Manage Custom Side Menu" icon={SlidersHorizontal} />
      <div className="text-[12px] text-slate-400 mt-2 mb-4">
        Define a Menu Name and it appears in the sidebar automatically. Rename, reorder, enable/disable or delete any custom item below.
      </div>
      {!isAdmin ? (
        <div className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">Sign in as Admin to create or manage side menu items.</div>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-1">
            <input
              value={name}
              onChange={(e) => { setName(e.target.value); setError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") addMenu(); }}
              placeholder="Menu Name e.g. Quality Reports"
              className="input flex-1"
            />
            <button onClick={addMenu} className="shrink-0 flex items-center gap-1.5 bg-turkish hover:bg-turkish-deep text-white text-[12.5px] font-medium px-3.5 py-2 rounded-md cursor-pointer">
              <Plus size={14} /> Create
            </button>
          </div>
          {error && <div className="text-[11px] text-red-500 mb-2">{error}</div>}
          <div className="space-y-2 mt-3">
            {sorted.length === 0 && <div className="text-[12px] text-slate-400">No custom menu items yet.</div>}
            {sorted.map((m, i) => (
              <div key={m.slug} className="flex items-center gap-2 border border-slate-200 rounded-md px-3 py-2">
                <div className="flex flex-col shrink-0">
                  <button onClick={() => moveMenu(m.slug, -1)} disabled={i === 0} className="text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"><ChevronUp size={13} /></button>
                  <button onClick={() => moveMenu(m.slug, 1)} disabled={i === sorted.length - 1} className="text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"><ChevronDown size={13} /></button>
                </div>
                <input
                  value={m.label}
                  onChange={(e) => renameMenu(m.slug, e.target.value)}
                  className="flex-1 text-[13px] border-0 focus:outline-none focus:ring-1 focus:ring-turkish/40 rounded px-1.5 py-1 text-slate-700"
                />
                <button
                  onClick={() => toggleMenu(m.slug)}
                  className={`shrink-0 w-11 h-6 p-0 border-0 rounded-full relative overflow-hidden transition-colors cursor-pointer ${m.enabled !== false ? "bg-turkish" : "bg-slate-300"}`}
                  title={m.enabled !== false ? "Enabled — click to disable" : "Disabled — click to enable"}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${m.enabled !== false ? "translate-x-5" : "translate-x-0"}`} />
                </button>
                <button onClick={() => deleteMenu(m.slug)} className="shrink-0 p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 cursor-pointer"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CustomMenuPage({ label }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-10 text-center max-w-lg mx-auto mt-8">
      <div className="w-12 h-12 rounded-full bg-turkish-tint flex items-center justify-center mx-auto mb-3">
        <SlidersHorizontal size={22} className="text-turkish-deep" />
      </div>
      <div className="text-[15px] font-display font-semibold text-slate-800">{label}</div>
      <div className="text-[12.5px] text-slate-400 mt-2">
        This is a custom menu page created by the Admin. It's live in the sidebar now — configure its content next from
        Overview → Create / Menu Management.
      </div>
    </div>
  );
}

function DisabledModuleNotice({ dept, setPage }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-10 text-center max-w-lg mx-auto mt-8">
      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
        <ToggleLeft size={22} className="text-slate-400" />
      </div>
      <div className="text-[14px] font-display font-semibold text-slate-700">{dept} is currently disabled</div>
      <div className="text-[12.5px] text-slate-400 mt-1.5">An administrator turned this module off from the Configuration Portal. Historical {dept.toLowerCase()} data still exists, it's just hidden from active creation.</div>
      <button onClick={() => setPage("configportal.menu")} className="mt-4 text-[12.5px] font-medium text-turkish-deep border border-turkish rounded-md px-3.5 py-1.5 hover:bg-turkish-tint">Go to Menu Configuration</button>
    </div>
  );
}

/* -------------------------------- Teams page ------------------------------ */

function TeamsPage({ projects, setPage, teams, addTeam, deleteTeam, isAdmin }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [capacity, setCapacity] = useState("");
  const [nameErr, setNameErr] = useState("");

  const submitCreate = () => {
    const n = name.trim();
    if (!n) { setNameErr("Team name is required."); return; }
    if (teams.some((t) => t.name.toLowerCase() === n.toLowerCase())) { setNameErr("A team with this name already exists."); return; }
    addTeam({ name: n, code: (code.trim() || n.slice(0, 3).toUpperCase()), capacity: Number(capacity) || 0 });
    setName(""); setCode(""); setCapacity(""); setNameErr(""); setAdding(false);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {teams.map((team) => {
          const items = projects.filter((p) => p.team === team.name);
          const active = items.filter((p) => p.status === "In Progress").length;
          return (
            <div key={team.name} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <SectionHeading title={team.name} icon={Bot} />
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[11px] font-mono text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">{team.code}</span>
                  {isAdmin && teams.length > 1 && (
                    <button
                      onClick={() => deleteTeam(team.name)}
                      title="Delete this team"
                      className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
              <div className="p-4 space-y-2.5">
                <div className="flex items-center justify-between text-[12.5px]">
                  <span className="text-slate-500">Number of Persons</span>
                  <span className="font-mono font-semibold text-slate-800">{team.capacity}</span>
                </div>
                <div className="flex items-center justify-between text-[12.5px]">
                  <span className="text-slate-500">Active Allocation</span>
                  <span className="font-mono font-semibold text-slate-800">{active} / {items.length} projects</span>
                </div>
                <div className="flex items-center justify-between text-[12.5px]">
                  <span className="text-slate-500">Variant Categories</span>
                  <span className="font-mono text-[11px] text-slate-600 text-right">{VARIANTS.slice(0, 2).join(", ")}…</span>
                </div>
                <button onClick={() => setPage("projectconfig.feeds")} className="w-full mt-2 text-[12px] font-medium text-turkish-deep border border-turkish/60 rounded-md py-1.5 hover:bg-turkish-tint">View allocated projects</button>
              </div>
            </div>
          );
        })}
      </div>

      {isAdmin && (
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <SectionHeading title="Team Creation" />
            {!adding && (
              <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 bg-turkish hover:bg-turkish-deep text-white text-[12.5px] font-medium px-3.5 py-1.5 rounded-md transition-colors">
                <Plus size={14} /> Create
              </button>
            )}
          </div>
          {adding ? (
            <div className="mt-3.5 grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="Team Name" error={nameErr}>
                <input autoFocus value={name} onChange={(e) => { setName(e.target.value); setNameErr(""); }} className="input" placeholder="e.g. GT-Team 4" />
              </Field>
              <Field label="Code (optional)">
                <input value={code} onChange={(e) => setCode(e.target.value)} className="input" placeholder="e.g. GT4" />
              </Field>
              <Field label="Number of Persons">
                <input type="number" min="0" value={capacity} onChange={(e) => setCapacity(e.target.value)} className="input" placeholder="e.g. 5" />
              </Field>
              <div className="md:col-span-3 flex items-center justify-end gap-2 mt-1">
                <button onClick={() => { setAdding(false); setName(""); setCode(""); setCapacity(""); setNameErr(""); }} className="text-[13px] px-3.5 py-1.5 rounded-md text-slate-500 hover:bg-slate-100">Cancel</button>
                <button onClick={submitCreate} className="text-[13px] px-4 py-1.5 rounded-md bg-turkish hover:bg-turkish-deep text-white font-medium">Create Team</button>
              </div>
            </div>
          ) : (
            <div className="text-[12px] text-slate-400 mt-2">
              Create a new team here, or delete one using the trash icon on its card above. New teams are available immediately in every Assignee Team picker.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------------------- Timeline Calculation ------------------------- */

function TimelineCalcPage() {
  const [label, setLabel] = useState("");
  const [startDate, setStartDate] = useState(todayISO());
  const [manufacturingDays, setManufacturingDays] = useState("");
  const [assemblyDays, setAssemblyDays] = useState("");
  const [saved, setSaved] = useState(() => loadSavedTimelines());
  const [savedToast, setSavedToast] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  const mfgN = Number(manufacturingDays);
  const asmN = Number(assemblyDays);
  const valid = isValidISODate(startDate) && manufacturingDays !== "" && mfgN >= 0 && assemblyDays !== "" && asmN >= 0;

  const result = useMemo(() => {
    if (!valid) return null;
    const mfg = calcWorkingPhase(startDate, mfgN);
    const asmStartCandidate = mfg.counted > 0 ? addDaysISO(mfg.end, 1) : mfg.start;
    const asm = calcWorkingPhase(asmStartCandidate, asmN);
    const allSkipped = [...mfg.skipped, ...asm.skipped];
    const totalCalendarDays = durationDays(mfg.start, asm.end);
    return { mfg, asm, allSkipped, totalCalendarDays };
  }, [valid, startDate, mfgN, asmN]);

  useEffect(() => {
    if (!savedToast) return;
    const t = setTimeout(() => setSavedToast(""), 2200);
    return () => clearTimeout(t);
  }, [savedToast]);

  function handleSave() {
    if (!valid || !result) return;
    const entry = {
      id: `TL-${Date.now()}`,
      label: label || "Untitled",
      inputStartDate: startDate,
      manufacturingDays: mfgN,
      assemblyDays: asmN,
      mfgStart: result.mfg.start,
      mfgEnd: result.mfg.end,
      asmStart: result.asm.start,
      asmEnd: result.asm.end,
      totalWorkingDays: mfgN + asmN,
      totalCalendarDays: result.totalCalendarDays,
      savedAt: new Date().toISOString(),
    };
    const next = [entry, ...saved];
    setSaved(next);
    persistSavedTimelines(next);
    setSavedToast("Timeline saved.");
    setExpandedId(entry.id);
  }

  function handleLoadSaved(entry) {
    setLabel(entry.label === "Untitled" ? "" : entry.label);
    setStartDate(entry.inputStartDate);
    setManufacturingDays(String(entry.manufacturingDays));
    setAssemblyDays(String(entry.assemblyDays));
  }

  function handleDeleteSaved(id) {
    const next = saved.filter((s) => s.id !== id);
    setSaved(next);
    persistSavedTimelines(next);
  }

  const totalWorkingDays = (mfgN || 0) + (asmN || 0);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-white rounded-lg border border-slate-200 p-5">
        <SectionHeading title="Timeline Calculation" icon={CalendarDays} />
        <div className="text-[12px] text-slate-400 mt-2 mb-4 leading-relaxed">
          Give it a start date and how many working days Manufacturing and Assembly each need — it works out the
          real calendar start and end dates on the shared factory calendar, then hands Assembly the very next
          working day after Manufacturing finishes.
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Project / Reference (optional)">
            <input value={label} onChange={(e) => setLabel(e.target.value)} className="input" placeholder="e.g. ABC-001" />
          </Field>
          <Field label="Start Date">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input" />
          </Field>
          <Field label="Manufacturing — No. of Days">
            <input type="number" min="0" value={manufacturingDays} onChange={(e) => setManufacturingDays(e.target.value)} className="input" placeholder="e.g. 10" />
          </Field>
          <Field label="Assembly — No. of Days">
            <input type="number" min="0" value={assemblyDays} onChange={(e) => setAssemblyDays(e.target.value)} className="input" placeholder="e.g. 4" />
          </Field>
        </div>
        <div className="text-[11px] text-slate-400 mt-3 flex items-start gap-1.5">
          <Info size={12} className="mt-0.5 shrink-0" />
          <span>
            Working-day rule: every Sunday is off, and only the 1st &amp; 3rd Saturday of each month are off — the
            2nd, 4th (and 5th, when a month has one) Saturdays count as normal working days.
          </span>
        </div>
      </div>

      {!valid && (
        <div className="text-[12.5px] text-slate-400 bg-white border border-dashed border-slate-200 rounded-lg p-6 text-center">
          Enter a start date and both durations above to calculate the timeline.
        </div>
      )}

      {valid && result && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <TimelinePhaseCard title="Manufacturing" icon={Factory} phase={result.mfg} days={mfgN} />
            <TimelinePhaseCard title="Assembly" icon={Wrench} phase={result.asm} days={asmN} />
            <div className="bg-turkish-deep rounded-lg p-4 text-white flex flex-col justify-between">
              <div className="text-[11px] font-medium uppercase tracking-wide text-turkish-bright flex items-center gap-1.5">
                <Flag size={12} /> {label ? label : "Project"} Timeline
              </div>
              <div className="mt-2">
                <div className="text-[13px] font-mono">{fmtDisplay(result.mfg.start)}</div>
                <div className="text-[10px] text-white/60 my-0.5">to</div>
                <div className="text-[13px] font-mono">{fmtDisplay(result.asm.end)}</div>
              </div>
              <div className="text-[11px] text-white/70 mt-3">
                {totalWorkingDays} working days · {result.totalCalendarDays} calendar days total
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 text-[12px] font-medium text-white bg-turkish-deep hover:bg-turkish-deep/90 rounded-md px-3.5 py-2 transition-colors"
            >
              <Save size={14} /> Save This Timeline
            </button>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <SectionHeading title="At a Glance" icon={CalendarDays} />
            <div className="mt-3 h-6 rounded-full overflow-hidden flex text-[10px] font-medium text-white bg-slate-100">
              {mfgN > 0 && (
                <div
                  className="bg-turkish flex items-center justify-center truncate px-1"
                  style={{ width: `${(mfgN / Math.max(totalWorkingDays, 1)) * 100}%` }}
                  title={`Manufacturing: ${fmtDisplay(result.mfg.start)} → ${fmtDisplay(result.mfg.end)}`}
                >
                  Manufacturing
                </div>
              )}
              {asmN > 0 && (
                <div
                  className="bg-slate-700 flex items-center justify-center truncate px-1"
                  style={{ width: `${(asmN / Math.max(totalWorkingDays, 1)) * 100}%` }}
                  title={`Assembly: ${fmtDisplay(result.asm.start)} → ${fmtDisplay(result.asm.end)}`}
                >
                  Assembly
                </div>
              )}
            </div>
            <div className="flex justify-between text-[10.5px] text-slate-400 font-mono mt-1.5">
              <span>{fmtShort(result.mfg.start)}</span>
              <span>{fmtShort(result.asm.end)}</span>
            </div>
          </div>

          {result.allSkipped.length > 0 && (
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <SectionHeading title={`Off Days Within This Window (${result.allSkipped.length})`} icon={AlertTriangle} />
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {result.allSkipped.map((d) => (
                  <span key={d} className="text-[11px] font-mono bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1 text-slate-500">
                    {fmtShort(d)} · {offDayReason(d)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {saved.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <SectionHeading title={`Saved Timelines (${saved.length})`} icon={Bookmark} />
          <div className="mt-2.5 space-y-2">
            {saved.map((s) => {
              const isOpen = expandedId === s.id;
              return (
                <div key={s.id} className="border border-slate-100 rounded-md overflow-hidden">
                  <div className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-slate-50">
                    <button
                      onClick={() => setExpandedId(isOpen ? null : s.id)}
                      className="text-left flex-1 min-w-0 flex items-center gap-2"
                    >
                      {isOpen ? <ChevronUp size={14} className="text-slate-400 shrink-0" /> : <ChevronDown size={14} className="text-slate-400 shrink-0" />}
                      <div className="min-w-0">
                        <div className="text-[12.5px] font-medium text-slate-700 truncate">{s.label}</div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                          {fmtShort(s.mfgStart)} → {fmtShort(s.asmEnd)} · {s.totalWorkingDays} working days
                        </div>
                      </div>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleLoadSaved(s)}
                        className="text-[11px] font-medium text-turkish-deep hover:underline px-1.5"
                        title="Load into form"
                      >
                        Load
                      </button>
                      <button
                        onClick={() => handleDeleteSaved(s.id)}
                        className="text-slate-300 hover:text-red-500 p-1"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="border-t border-slate-100 bg-slate-50/60 p-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="bg-white rounded-md border border-slate-200 p-3">
                          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-700">
                            <Factory size={13} className="text-turkish-deep" /> Manufacturing
                          </div>
                          <div className="mt-2 space-y-1">
                            <div className="flex justify-between text-[11.5px]"><span className="text-slate-400">Start</span><span className="font-mono text-slate-700">{fmtDisplay(s.mfgStart)}</span></div>
                            <div className="flex justify-between text-[11.5px]"><span className="text-slate-400">End</span><span className="font-mono text-slate-700">{fmtDisplay(s.mfgEnd)}</span></div>
                            <div className="flex justify-between text-[11.5px]"><span className="text-slate-400">Working Days</span><span className="font-mono text-slate-700">{s.manufacturingDays}</span></div>
                          </div>
                        </div>
                        <div className="bg-white rounded-md border border-slate-200 p-3">
                          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-700">
                            <Wrench size={13} className="text-turkish-deep" /> Assembly
                          </div>
                          <div className="mt-2 space-y-1">
                            <div className="flex justify-between text-[11.5px]"><span className="text-slate-400">Start</span><span className="font-mono text-slate-700">{fmtDisplay(s.asmStart)}</span></div>
                            <div className="flex justify-between text-[11.5px]"><span className="text-slate-400">End</span><span className="font-mono text-slate-700">{fmtDisplay(s.asmEnd)}</span></div>
                            <div className="flex justify-between text-[11.5px]"><span className="text-slate-400">Working Days</span><span className="font-mono text-slate-700">{s.assemblyDays}</span></div>
                          </div>
                        </div>
                        <div className="bg-turkish-deep rounded-md p-3 text-white flex flex-col justify-between">
                          <div className="text-[10.5px] font-medium uppercase tracking-wide text-turkish-bright flex items-center gap-1.5">
                            <Flag size={11} /> {s.label} Timeline
                          </div>
                          <div className="mt-1.5">
                            <div className="text-[12.5px] font-mono">{fmtDisplay(s.mfgStart)}</div>
                            <div className="text-[10px] text-white/60 my-0.5">to</div>
                            <div className="text-[12.5px] font-mono">{fmtDisplay(s.asmEnd)}</div>
                          </div>
                          <div className="text-[10.5px] text-white/70 mt-2">
                            {s.totalWorkingDays} working days · {s.totalCalendarDays} calendar days total
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {savedToast && (
        <div className="fixed bottom-5 right-5 bg-ink text-white text-sm px-4 py-2.5 rounded-md shadow-xl z-50 flex items-center gap-2 border border-gline">
          <CheckCircle2 size={16} className="text-emerald-400" /> {savedToast}
        </div>
      )}
    </div>
  );
}

function TimelinePhaseCard({ title, icon: Icon, phase, days }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-700">
        <Icon size={14} className="text-turkish-deep" /> {title}
      </div>
      <div className="mt-2.5 space-y-1.5">
        <div className="flex justify-between text-[12px]"><span className="text-slate-400">Start</span><span className="font-mono text-slate-700">{fmtDisplay(phase.start)}</span></div>
        <div className="flex justify-between text-[12px]"><span className="text-slate-400">End</span><span className="font-mono text-slate-700">{fmtDisplay(phase.end)}</span></div>
        <div className="flex justify-between text-[12px]"><span className="text-slate-400">Working Days</span><span className="font-mono text-slate-700">{days}</span></div>
        {phase.skipped.length > 0 && (
          <div className="flex justify-between text-[12px]"><span className="text-slate-400">Off Days Skipped</span><span className="font-mono text-slate-700">{phase.skipped.length}</span></div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------- FeedsPage ------------------------------- */

function FeedsPage({ projects, onCreateClick, onEdit, onDelete, onComponents, conflictedIds, onExport, onExportTimeline, onImportClick, isAdmin, teams }) {
  const grouped = (teams || []).map((t) => ({
    team: t.name,
    items: projects.filter((p) => p.team === t.name).sort((a, b) => (a.startDate < b.startDate ? -1 : 1)),
  }));

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-slate-200 p-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-[14px] font-display font-semibold text-slate-800">Quick Feed a Project</div>
          <div className="text-[12px] text-slate-400 mt-0.5">
            Project Name, Variants, Team No, Start Date, End Date podunga — submit pannina udane andha Team-oda page-la automatic-ah varum.
          </div>
        </div>
        {isAdmin && (
          <button onClick={onCreateClick} className="flex items-center gap-1.5 bg-turkish hover:bg-turkish-deep text-white text-[13px] font-medium px-4 py-2 rounded-md transition-colors shrink-0">
            <Plus size={15} /> Create
          </button>
        )}
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-5 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-turkish-tint flex items-center justify-center shrink-0">
            <FileSpreadsheet size={18} className="text-turkish-deep" />
          </div>
          <div>
            <div className="text-[14px] font-display font-semibold text-slate-800">Excel Configuration</div>
            <div className="text-[12px] text-slate-400 mt-0.5">
              Bulk-ah projects Excel-la irundhu import pannalam, illa ippo irukura data-va Excel-ah export pannalam.
              Columns: Project Name, Project Number, Variants, Department, Team, Start Date, End Date, Priority, Status, Progress, Remarks.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isAdmin && (
            <button onClick={onImportClick} className="flex items-center gap-1.5 text-[12.5px] font-medium px-3.5 py-2 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer">
              <Upload size={14} /> Import Excel
            </button>
          )}
          <button onClick={onExport} className="flex items-center gap-1.5 text-[12.5px] font-medium px-3.5 py-2 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer">
            <Download size={14} /> Export Excel
          </button>
          <button onClick={onExportTimeline} title="Team-wise timeline with duration bars, overlap highlights & GOAT logo" className="flex items-center gap-1.5 text-[12.5px] font-medium px-3.5 py-2 rounded-md bg-turkish hover:bg-turkish-deep text-white cursor-pointer">
            <CalendarDays size={14} /> Download Timeline
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {grouped.map((g) => (
          <div key={g.team} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <SectionHeading title={g.team} />
              <span className="text-[11px] font-mono text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">{g.items.length} project{g.items.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="divide-y divide-slate-50 max-h-96 overflow-y-auto">
              {g.items.length === 0 && <div className="text-[12px] text-slate-400 px-4 py-6 text-center">No projects fed yet for this team.</div>}
              {g.items.map((p) => (
                <div key={p.id} className="px-4 py-2.5 hover:bg-slate-50/60">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-medium text-slate-700 truncate flex items-center gap-1">
                        {conflictedIds.has(p.id) && <TriangleAlert size={11} className="text-red-500 shrink-0" />}
                        {p.name}
                      </div>
                      {p.variants && (
                        <div className="text-[11px] text-slate-400 truncate">
                          Variant: {p.variants}
                          {p.payload && <> · Payload: {p.payload} kg</>}
                          {p.custom && <> · Custom: {p.custom}</>}
                        </div>
                      )}
                      {p.manufacturing && (
                        <div className="text-[11px] text-slate-400 truncate">Manufacturing: {p.manufacturing}</div>
                      )}
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">{fmtShort(p.startDate)} → {fmtShort(p.endDate)}</div>
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-1 shrink-0">
                        {onComponents && (
                          <button onClick={() => onComponents(p)} className="p-1 rounded hover:bg-slate-100 text-slate-400" title="Dependencies / Components list — send to SCM"><Boxes size={12} /></button>
                        )}
                        <button onClick={() => onEdit(p)} className="p-1 rounded hover:bg-slate-100 text-slate-400"><Pencil size={12} /></button>
                        <button onClick={() => onDelete(p)} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500"><Trash2 size={12} /></button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------- ListPage ------------------------------- */

function ListPage({ title, icon: Icon, projects, allTeams, search, filters, setFilters, conflicts, conflictedIds, ganttView, setGanttView, onEdit, onDelete, onComponents, isAdmin, teams }) {
  const filtered = useMemo(() => {
    return projects.filter((p) => {
      if (search && !(p.name.toLowerCase().includes(search.toLowerCase()) || p.projectNumber.toLowerCase().includes(search.toLowerCase()))) return false;
      if (filters.team && p.team !== filters.team) return false;
      if (filters.department && p.department !== filters.department) return false;
      if (filters.status && p.status !== filters.status) return false;
      if (filters.priority && p.priority !== filters.priority) return false;
      return true;
    });
  }, [projects, search, filters]);

  const teamConflicts = conflicts.filter((c) => filtered.some((p) => p.id === c.aId) && filtered.some((p) => p.id === c.bId));

  const total = filtered.length;
  const active = filtered.filter((p) => p.status === "In Progress").length;
  const pending = filtered.filter((p) => p.status === "Planned").length;
  const completed = filtered.filter((p) => p.status === "Completed").length;
  const delayedCt = filtered.filter((p) => p.status === "Delayed").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Total Tasks", value: total, color: "#0EA5C4" },
          { label: "Active", value: active, color: "#2E9464" },
          { label: "Pending", value: pending, color: "#5B84A6" },
          { label: "Completed", value: completed, color: "#3AA76D" },
          { label: "Delayed", value: delayedCt, color: "#D8453A" },
        ].map((c) => (
          <div key={c.label} className="bg-white rounded-lg border border-slate-200 px-3.5 py-3">
            <div className="text-[10.5px] uppercase tracking-wide text-slate-400 font-medium">{c.label}</div>
            <div className="text-[22px] font-mono font-semibold mt-0.5" style={{ color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      <FilterBar filters={filters} setFilters={setFilters} showTeam={allTeams} count={filtered.length} teams={teams} />

      {teamConflicts.length > 0 && (
        <div className="bg-[#FBEAEA] border border-red-200 rounded-lg p-3 space-y-1.5">
          <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[#A3312A]"><TriangleAlert size={14} /> Team Schedule Conflict</div>
          {teamConflicts.map((c, i) => (
            <div key={i} className="text-[11.5px] text-[#A3312A] font-mono pl-5">{c.team}: "{c.aName}" ↔ "{c.bName}" · overlap {fmtShort(c.overlapStart)} → {fmtShort(c.overlapEnd)}</div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <SectionHeading title="Gantt Timeline" icon={Icon} />
          <GanttViewToggle view={ganttView} setView={setGanttView} />
        </div>
        <GanttChart projects={filtered} conflictedIds={conflictedIds} view={ganttView} />
      </div>

      <ProjectTable projects={filtered} conflictedIds={conflictedIds} onEdit={onEdit} onDelete={onDelete} onComponents={onComponents} isAdmin={isAdmin} />
    </div>
  );
}

function FilterBar({ filters, setFilters, showTeam, count, teams }) {
  const set = (k, v) => setFilters({ ...filters, [k]: v });
  const clear = () => setFilters({ team: "", department: "", status: "", priority: "" });
  const active = Object.values(filters).some(Boolean);
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-3 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5 text-[12px] text-slate-400 font-medium mr-1"><Filter size={13} /> Filters</div>
      {showTeam && (
        <select value={filters.team} onChange={(e) => set("team", e.target.value)} className="text-[12px] border border-slate-200 rounded-md px-2 py-1.5 bg-white">
          <option value="">All Teams</option>
          {(teams || []).map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
        </select>
      )}
      <select value={filters.department} onChange={(e) => set("department", e.target.value)} className="text-[12px] border border-slate-200 rounded-md px-2 py-1.5 bg-white">
        <option value="">All Departments</option>
        {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
      </select>
      <select value={filters.status} onChange={(e) => set("status", e.target.value)} className="text-[12px] border border-slate-200 rounded-md px-2 py-1.5 bg-white">
        <option value="">All Status</option>
        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <select value={filters.priority} onChange={(e) => set("priority", e.target.value)} className="text-[12px] border border-slate-200 rounded-md px-2 py-1.5 bg-white">
        <option value="">All Priority</option>
        {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      {active && <button onClick={clear} className="text-[12px] text-slate-400 hover:text-slate-600 flex items-center gap-1"><X size={12} /> Clear</button>}
      <div className="ml-auto text-[12px] text-slate-400 font-mono">{count} project{count !== 1 ? "s" : ""}</div>
    </div>
  );
}

/* -------------------------------- Gantt ---------------------------------- */

function GanttViewToggle({ view, setView }) {
  return (
    <div className="flex bg-slate-100 rounded-md p-0.5">
      {["Day", "Week", "Month"].map((v) => (
        <button key={v} onClick={() => setView(v)} className={`text-[11.5px] px-2.5 py-1 rounded font-medium transition-colors ${view === v ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}>{v}</button>
      ))}
    </div>
  );
}

function GanttChart({ projects, conflictedIds, view, tasks, employees }) {
  if (projects.length === 0) {
    return <div className="text-[12.5px] text-slate-400 py-10 text-center border border-dashed border-slate-200 rounded-md">No projects to display.</div>;
  }
  const dayWidth = view === "Day" ? 34 : view === "Week" ? 12 : 4;
  const t = todayISO();
  const showTasks = Array.isArray(tasks) && tasks.length > 0;
  const empName = (id) => (employees || []).find((e) => e.id === id)?.name || "Unassigned";
  let minStart = projects[0].startDate, maxEnd = projects[0].endDate;
  [...projects, ...(showTasks ? tasks.filter((x) => x.startDate && x.endDate) : [])].forEach((p) => {
    if (p.startDate < minStart) minStart = p.startDate;
    if (p.endDate > maxEnd) maxEnd = p.endDate;
  });
  const rangeStart = addDaysISO(minStart < t ? minStart : t, -2);
  const rangeEnd = addDaysISO(maxEnd > t ? maxEnd : t, 2);
  const totalDays = daysBetween(rangeStart, rangeEnd) + 1;
  const chartWidth = totalDays * dayWidth;
  const todayOffset = daysBetween(rangeStart, t) * dayWidth;

  const ticks = [];
  for (let i = 0; i < totalDays; i++) {
    const dISO = addDaysISO(rangeStart, i);
    const d = toDate(dISO);
    let show = false, label = "";
    if (view === "Day") { show = true; label = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }); }
    else if (view === "Week") { show = d.getDay() === 1; label = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }); }
    else { show = d.getDate() === 1; label = d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }); }
    if (show) ticks.push({ offset: i * dayWidth, label });
  }

  return (
    <div className="overflow-x-auto border border-slate-100 rounded-md">
      <div style={{ minWidth: chartWidth + 240 }}>
        <div className="flex border-b border-slate-100 sticky top-0 bg-white z-10">
          <div className="w-60 shrink-0 px-3 py-2 text-[11px] font-semibold text-slate-400 border-r border-slate-100">Project</div>
          <div className="relative" style={{ width: chartWidth, height: 30 }}>
            {ticks.map((tk, i) => (
              <div key={i} className="absolute top-0 h-full text-[10px] text-slate-400 font-mono border-l border-slate-100 pl-1 pt-2" style={{ left: tk.offset }}>{tk.label}</div>
            ))}
          </div>
        </div>
        {projects.map((p) => {
          const left = daysBetween(rangeStart, p.startDate) * dayWidth;
          const width = Math.max(durationDays(p.startDate, p.endDate) * dayWidth - 2, 6);
          const sc = STATUS_COLOR[p.status] || STATUS_COLOR.Planned;
          const conflict = conflictedIds.has(p.id);
          const projTasks = showTasks ? tasks.filter((x) => x.projectId === p.id && x.startDate && x.endDate) : [];
          return (
            <React.Fragment key={p.id}>
            <div className="flex border-b border-slate-50 hover:bg-slate-50/60">
              <div className="w-60 shrink-0 px-3 py-2 border-r border-slate-100">
                <div className="text-[12px] font-medium text-slate-700 truncate flex items-center gap-1">
                  {conflict && <TriangleAlert size={11} className="text-red-500 shrink-0" />}
                  {p.name}
                </div>
                <div className="text-[10px] text-slate-400 font-mono truncate">{deptLabel(p.department)} · {p.team}</div>
                <div className="text-[10px] text-slate-400 font-mono">{fmtShort(p.startDate)} → {fmtShort(p.endDate)} · {durationDays(p.startDate, p.endDate)}d</div>
              </div>
              <div className="relative" style={{ width: chartWidth, height: 52 }}>
                <div className="absolute top-0 bottom-0 border-l border-dashed border-turkish/50" style={{ left: todayOffset }} />
                <div
                  title={`${p.name}: ${fmtDisplay(p.startDate)} → ${fmtDisplay(p.endDate)}`}
                  className="absolute rounded-[4px] flex items-center px-1.5 overflow-hidden"
                  style={{
                    left, width, top: 14, height: 22,
                    background: conflict ? "repeating-linear-gradient(45deg, #E7433B, #E7433B 6px, #C0332B 6px, #C0332B 12px)" : sc.dot,
                    boxShadow: conflict ? "0 0 0 1.5px #A3312A" : "none",
                  }}
                >
                  <span className="text-[10px] text-white font-medium truncate">{p.status}</span>
                </div>
              </div>
            </div>
            {projTasks.map((tk) => (
              <div key={tk.id} className="flex border-b border-slate-50 bg-slate-50/40">
                <div className="w-60 shrink-0 pl-7 pr-3 py-1.5 border-r border-slate-100">
                  <div className="text-[11px] text-slate-600 truncate">{tk.name}</div>
                  <div className="text-[10px] text-slate-400 truncate">{deptLabel(tk.category)} · {empName(tk.employeeId)}</div>
                </div>
                <div className="relative" style={{ width: chartWidth, height: 30 }}>
                  <div
                    title={`${tk.name} (${empName(tk.employeeId)}): ${fmtDisplay(tk.startDate)} → ${fmtDisplay(tk.endDate)}`}
                    className="absolute rounded-[3px] flex items-center px-1.5 overflow-hidden"
                    style={{ left: daysBetween(rangeStart, tk.startDate) * dayWidth, width: Math.max(durationDays(tk.startDate, tk.endDate) * dayWidth - 2, 6), top: 8, height: 14, background: (STATUS_COLOR[tk.status] || STATUS_COLOR.Planned).dot, opacity: 0.75 }}
                  ><span className="text-[9px] text-white truncate">{tk.status}</span></div>
                </div>
              </div>
            ))}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------- Timeline page ---------------------------- */

function TimelinePage({ projects, conflictedIds, conflicts, ganttView, setGanttView, onEdit, onDelete, onComponents, isAdmin, tasks, employees }) {
  const [withTasks, setWithTasks] = useState(false);
  const overlapDays = (c) => durationDays(c.overlapStart, c.overlapEnd);
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <SectionHeading title="Overall Project Timeline" icon={CalendarDays} />
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-[12px] text-slate-500 cursor-pointer">
              <input type="checkbox" checked={withTasks} onChange={(e) => setWithTasks(e.target.checked)} /> Show employee tasks
            </label>
            <GanttViewToggle view={ganttView} setView={setGanttView} />
          </div>
        </div>
        <div className="text-[12px] text-slate-400 mb-3">Every project across all categories and teams, drawn from the live project dates. Red striped bars overlap another project of the same team. Dashed line marks today.</div>
        <GanttChart projects={projects} conflictedIds={conflictedIds} view={ganttView} tasks={withTasks ? tasks : null} employees={employees} />
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="mb-2.5 flex items-center justify-between">
          <SectionHeading title="Overlapping Schedules" icon={TriangleAlert} />
          <span className="text-[12px] text-slate-400">{conflicts.length} overlap{conflicts.length !== 1 ? "s" : ""}</span>
        </div>
        {conflicts.length === 0 ? (
          <div className="text-[12.5px] text-slate-400">No overlapping schedules.</div>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead><tr className="text-left text-[11px] text-slate-400 uppercase tracking-wide">
              <th className="py-1.5 font-medium">Team</th><th className="py-1.5 font-medium">Projects</th><th className="py-1.5 font-medium">Overlap</th><th className="py-1.5 font-medium">Days</th>
            </tr></thead>
            <tbody>
              {conflicts.map((c, i) => (
                <tr key={i} className="border-t border-slate-50">
                  <td className="py-1.5 text-slate-600">{c.team}</td>
                  <td className="py-1.5 text-slate-700">{c.aName} <span className="text-slate-300">↔</span> {c.bName}</td>
                  <td className="py-1.5 font-mono text-slate-500">{fmtShort(c.overlapStart)} → {fmtShort(c.overlapEnd)}</td>
                  <td className="py-1.5 font-mono text-red-600">{overlapDays(c)}d</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <ProjectTable projects={projects} conflictedIds={conflictedIds} onEdit={onEdit} onDelete={onDelete} onComponents={onComponents} isAdmin={isAdmin} />
    </div>
  );
}

/* ------------------------------ ProjectTable ------------------------------ */

function ProjectTable({ projects, conflictedIds, onEdit, onDelete, onComponents, isAdmin }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="bg-slate-50 text-left text-[11px] text-slate-400 uppercase tracking-wide">
              <th className="px-3 py-2.5 font-medium">Project</th>
              <th className="px-3 py-2.5 font-medium">Number</th>
              <th className="px-3 py-2.5 font-medium">Department</th>
              <th className="px-3 py-2.5 font-medium">Team</th>
              <th className="px-3 py-2.5 font-medium">Start</th>
              <th className="px-3 py-2.5 font-medium">End</th>
              <th className="px-3 py-2.5 font-medium">Duration</th>
              <th className="px-3 py-2.5 font-medium">Priority</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              {isAdmin && <th className="px-3 py-2.5 font-medium text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {projects.length === 0 && (
              <tr><td colSpan={9} className="text-center text-slate-400 py-8">No projects found.</td></tr>
            )}
            {projects.map((p) => (
              <tr key={p.id} className={`border-t border-slate-50 hover:bg-slate-50/60 ${conflictedIds.has(p.id) ? "bg-red-50/40" : ""}`}>
                <td className="px-3 py-2.5 font-medium text-slate-700 flex items-center gap-1">
                  {conflictedIds.has(p.id) && <TriangleAlert size={11} className="text-red-500 shrink-0" />} {p.name}
                </td>
                <td className="px-3 py-2.5 font-mono text-slate-500">{p.projectNumber}</td>
                <td className="px-3 py-2.5 text-slate-500">{deptLabel(p.department)}</td>
                <td className="px-3 py-2.5 text-slate-500">{p.team}</td>
                <td className="px-3 py-2.5 font-mono text-slate-500">{fmtShort(p.startDate)}</td>
                <td className="px-3 py-2.5 font-mono text-slate-500">{fmtShort(p.endDate)}</td>
                <td className="px-3 py-2.5 font-mono text-slate-500">{durationDays(p.startDate, p.endDate)}d</td>
                <td className="px-3 py-2.5"><PriorityTag priority={p.priority} /></td>
                <td className="px-3 py-2.5"><StatusTag status={p.status} /></td>
                {isAdmin && (
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      {onComponents && (
                        <button onClick={() => onComponents(p)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="Dependencies / Components list — send to SCM"><Boxes size={13} /></button>
                      )}
                      <button onClick={() => onEdit(p)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500"><Pencil size={13} /></button>
                      <button onClick={() => onDelete(p)} className="p-1.5 rounded hover:bg-red-50 text-slate-500 hover:text-red-500"><Trash2 size={13} /></button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PriorityTag({ priority }) {
  const color = PRIORITY_COLOR[priority] || "#5B84A6";
  return <span className="text-[11px] font-semibold" style={{ color }}>{priority}</span>;
}

function ComingSoon({ icon: Icon, title, note }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-10 text-center max-w-xl mx-auto mt-6">
      <div className="w-12 h-12 rounded-full bg-turkish-tint flex items-center justify-center mx-auto mb-3">
        <Icon size={22} className="text-turkish-deep" />
      </div>
      <div className="text-[15px] font-display font-semibold text-slate-800">{title}</div>
      <div className="text-[12.5px] text-slate-400 mt-2 leading-relaxed">{note}</div>
      <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-turkish-deep bg-turkish-tint rounded-full px-3 py-1 mt-4">
        <Sparkles size={11} /> Coming in the next build phase
      </div>
    </div>
  );
}

/* -------------------------------- Settings -------------------------------- */

function SolidAppearanceRow({ label, brightness, onBrightness, color, onColor, disabled, brightnessMin = 60, brightnessMax = 130 }) {
  return (
    <div className={`rounded-lg border border-slate-200 p-4 ${disabled ? "bg-slate-50" : "bg-white"}`}>
      <div className="text-[12.5px] font-semibold text-slate-700 mb-3">{label}</div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1.5">
            <span>Brightness</span>
            <span className="font-mono">{brightness}%</span>
          </div>
          <input
            type="range"
            min={brightnessMin}
            max={brightnessMax}
            value={brightness}
            disabled={disabled}
            onChange={(e) => onBrightness(Number(e.target.value))}
            className={`w-full accent-turkish ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          />
        </div>
        <div>
          <div className="text-[11px] text-slate-500 mb-1.5">Solid Color</div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <input type="color" value={color} disabled={disabled} onChange={(e) => onColor(e.target.value)} className={`w-7 h-7 rounded border border-slate-200 p-0 ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`} />
              Color
            </label>
            <span className="flex-1 h-7 rounded border border-slate-200" style={{ background: color, filter: `brightness(${brightness / 100})` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function AppearanceRow({ label, brightness, onBrightness, from, onFrom, to, onTo, disabled, brightnessMin = 60, brightnessMax = 130 }) {
  return (
    <div className={`rounded-lg border border-slate-200 p-4 ${disabled ? "bg-slate-50" : "bg-white"}`}>
      <div className="text-[12.5px] font-semibold text-slate-700 mb-3">{label}</div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1.5">
            <span>Brightness</span>
            <span className="font-mono">{brightness}%</span>
          </div>
          <input
            type="range"
            min={brightnessMin}
            max={brightnessMax}
            value={brightness}
            disabled={disabled}
            onChange={(e) => onBrightness(Number(e.target.value))}
            className={`w-full accent-turkish ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          />
        </div>
        <div>
          <div className="text-[11px] text-slate-500 mb-1.5">Color Gradient</div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <input type="color" value={from} disabled={disabled} onChange={(e) => onFrom(e.target.value)} className={`w-7 h-7 rounded border border-slate-200 p-0 ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`} />
              From
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <input type="color" value={to} disabled={disabled} onChange={(e) => onTo(e.target.value)} className={`w-7 h-7 rounded border border-slate-200 p-0 ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`} />
              To
            </label>
            <span className="flex-1 h-7 rounded border border-slate-200" style={{ background: `linear-gradient(90deg, ${from}, ${to})`, filter: `brightness(${brightness / 100})` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsPage({ isAdmin, theme, updateTheme }) {
  const t = theme || DEFAULT_THEME;
  const patch = (fields) => updateTheme && updateTheme({ ...t, ...fields });
  const resetAppearance = () => updateTheme && updateTheme({ ...DEFAULT_THEME });

  return (
    <div className="space-y-4 max-w-xl">
      <div className="bg-white rounded-lg border border-slate-200 p-5">
        <SectionHeading title="User Profile" />
        <div className="text-[12.5px] text-slate-500 mt-2">Signed in as <span className="font-medium text-slate-700">{isAdmin ? "Admin" : "Viewer"}</span>.</div>
      </div>
      <div className="bg-white rounded-lg border border-slate-200 p-5">
        <SectionHeading title="Theme" />
        <div className="flex items-center gap-3 mt-2.5">
          <span className="w-8 h-8 rounded-md bg-ink border border-gline" title="Black" />
          <span className="w-8 h-8 rounded-md bg-turkish" title="Turkish Blue" />
          <span className="w-8 h-8 rounded-md bg-white border border-slate-200" title="White" />
          <span className="w-8 h-8 rounded-md bg-slate-300" title="Grey" />
          <span className="text-[12px] text-slate-400 ml-2">Locked to the GOAT Robotics brand palette.</span>
        </div>
      </div>
      <div className="bg-white rounded-lg border border-slate-200 p-5">
        <div className="flex items-center justify-between gap-3">
          <SectionHeading title="Appearance" icon={SlidersHorizontal} />
          <button
            onClick={resetAppearance}
            disabled={!isAdmin}
            className={`text-[11.5px] font-medium px-2.5 py-1 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 ${!isAdmin ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          >
            Reset to default
          </button>
        </div>
        <div className="text-[12px] text-slate-400 mt-2 mb-4">
          Adjust brightness and gradient for the option menus (profile, notifications, search). The side menu is fixed to the white GOAT Robotics style.
        </div>
        {!isAdmin && (
          <div className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-4">Sign in as Admin to change appearance settings.</div>
        )}
        <div className="space-y-3">
          <AppearanceRow
            label="Option Menus (profile / notifications / search)"
            brightness={t.menuBrightness}
            onBrightness={(v) => patch({ menuBrightness: v })}
            from={t.menuFrom}
            onFrom={(v) => patch({ menuFrom: v })}
            to={t.menuTo}
            onTo={(v) => patch({ menuTo: v })}
            disabled={!isAdmin}
            brightnessMin={70}
            brightnessMax={110}
          />
        </div>
      </div>
      <div className="bg-white rounded-lg border border-slate-200 p-5">
        <SectionHeading title="Notifications" />
        <div className="text-[12.5px] text-slate-500 mt-2">Task delayed, task completed, new task assigned, dependency blocked, and deadline-approaching alerts already populate the bell icon in the header.</div>
      </div>
      <div className="bg-white rounded-lg border border-slate-200 p-5">
        <SectionHeading title="Access Settings" />
        <div className="text-[12.5px] text-slate-500 mt-2">Managed from Configuration Portal → Authorized Users and Approval.</div>
      </div>
    </div>
  );
}

function ContactPage() {
  return (
    <div className="max-w-md">
      <div className="bg-white rounded-lg border border-slate-200 p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-turkish-tint flex items-center justify-center mx-auto mb-3">
          <Mail size={20} className="text-turkish-deep" />
        </div>
        <div className="text-[14px] font-display font-semibold text-slate-800">Admin Contact</div>
        <div className="text-[12px] text-slate-400 mt-1">Default contact for website support</div>
        <a href={`mailto:${ADMIN_CONTACT_EMAIL}`} className="text-[13px] font-mono text-turkish-deep mt-2 inline-block hover:underline">{ADMIN_CONTACT_EMAIL}</a>
      </div>
    </div>
  );
}

/* ---------------------------- ProjectFormModal ---------------------------- */

function ProjectFormModal({ initial, enabledDepartments, teams, addTeam, deleteTeam, onClose, onSave }) {
  const deptOptions = enabledDepartments && enabledDepartments.length ? enabledDepartments : DEPARTMENTS;
  const [form, setForm] = useState(() => initial || {
    name: "", projectNumber: "", variants: "", department: deptOptions[0], team: teams[0]?.name || "",
    startDate: todayISO(), endDate: todayISO(), priority: "Medium", status: "Planned",
    remarks: "", progress: 0,
  });
  const [errors, setErrors] = useState({});

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = "Project name is required.";
    if (!form.projectNumber.trim()) e.projectNumber = "Project / job number is required.";
    if (!form.team) e.team = "Team is required.";
    if (!form.startDate) e.startDate = "Start date is required.";
    if (!form.endDate) e.endDate = "End date is required.";
    if (form.startDate && form.endDate && form.endDate < form.startDate) e.endDate = "End date must be on or after start date.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    onSave(form);
  };

  const dur = form.startDate && form.endDate && form.endDate >= form.startDate ? durationDays(form.startDate, form.endDate) : null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="text-[15px] font-display font-semibold text-slate-800">{initial ? "Edit Project" : "Add Project"}</div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3.5">
          <Field label="Project Name" error={errors.name}>
            <input value={form.name} onChange={(e) => set("name", e.target.value)} className="input" placeholder="e.g. AMR Chassis Build" />
          </Field>
          <Field label="Project / Job Number" error={errors.projectNumber}>
            <input value={form.projectNumber} onChange={(e) => set("projectNumber", e.target.value)} className="input" placeholder="e.g. ABC-001" />
          </Field>
          <Field label="Variants">
            <select value={form.variants || ""} onChange={(e) => set("variants", e.target.value)} className="input">
              <option value="">Select variant</option>
              {VARIANTS.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Department">
              <select value={form.department} onChange={(e) => set("department", e.target.value)} className="input">
                {deptOptions.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </Field>
            <Field label="Team" error={errors.team}>
              <TeamPicker value={form.team} onChange={(v) => set("team", v)} teams={teams} onCreate={addTeam} onDelete={deleteTeam} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start Date" error={errors.startDate}>
              <input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} className="input" />
            </Field>
            <Field label="End Date" error={errors.endDate}>
              <input type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} className="input" />
            </Field>
          </div>
          {dur && <div className="text-[11.5px] text-slate-400 font-mono -mt-1.5">Duration: {dur} day{dur !== 1 ? "s" : ""}</div>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Priority">
              <select value={form.priority} onChange={(e) => set("priority", e.target.value)} className="input">
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select value={form.status} onChange={(e) => set("status", e.target.value)} className="input">
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>
          <Field label={`Progress (${form.progress || 0}%)`}>
            <input type="range" min="0" max="100" value={form.progress || 0} onChange={(e) => set("progress", Number(e.target.value))} className="w-full accent-[#0EA5C4]" />
          </Field>
          <Field label="Remarks">
            <textarea value={form.remarks} onChange={(e) => set("remarks", e.target.value)} className="input" rows={2} placeholder="Optional notes" />
          </Field>
        </div>
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-slate-100">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400"><Eye size={12} /> Preview before save coming next phase</div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="text-[13px] px-3.5 py-1.5 rounded-md text-slate-500 hover:bg-slate-100">Cancel</button>
            <button onClick={handleSave} className="text-[13px] px-4 py-1.5 rounded-md bg-turkish hover:bg-turkish-deep text-white font-medium">Save</button>
          </div>
        </div>
      </div>
      <style>{`.input{width:100%;font-size:12.5px;border:1px solid #E2E8F0;border-radius:6px;padding:7px 9px;outline:none;} .input:focus{border-color:#0EA5C4;box-shadow:0 0 0 2px rgba(14,165,196,0.18);}`}</style>
    </div>
  );
}

/* ---------------------------- ComponentsModal ---------------------------- */
// Per-project "Dependencies / Components List" (BOM-style) that can be
// emailed to the SCM (Supply Chain Management) department. There is no
// email-sending backend wired into this app (no SMTP/API key configured),
// so "Send to SCM" opens the user's own email app with the recipient,
// subject, and formatted component list pre-filled via a mailto: link —
// the user still clicks Send themselves. Wiring a fully silent/automatic
// send would require a real email service (e.g. Resend/SendGrid) and its
// API key.

const SCM_DEFAULT_EMAIL_KEY = "gt_scm_default_email";

function newComponentRow() {
  return { id: Math.random().toString(36).slice(2, 9), name: "", partNumber: "", qty: "", remarks: "" };
}

function ComponentsModal({ project, onClose, onSave }) {
  const [rows, setRows] = useState(() => {
    const existing = project.components && project.components.length ? project.components : null;
    return existing ? existing.map((r) => ({ ...r })) : [newComponentRow()];
  });
  const [scmEmail, setScmEmail] = useState(() => {
    if (project.scmEmail) return project.scmEmail;
    try { return localStorage.getItem(SCM_DEFAULT_EMAIL_KEY) || ""; } catch (e) { return ""; }
  });
  const [saved, setSaved] = useState(false);

  const setRow = (id, field, value) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  const addRow = () => setRows((rs) => [...rs, newComponentRow()]);
  const removeRow = (id) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.id !== id) : rs));

  const cleanRows = () => rows.filter((r) => r.name.trim() || r.partNumber.trim());

  const handleSave = () => {
    onSave(project.id, { components: cleanRows(), scmEmail: scmEmail.trim() });
    try { if (scmEmail.trim()) localStorage.setItem(SCM_DEFAULT_EMAIL_KEY, scmEmail.trim()); } catch (e) {}
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const emailValid = /\S+@\S+\.\S+/.test(scmEmail.trim());
  const list = cleanRows();

  const handleSendToScm = () => {
    if (!emailValid || list.length === 0) return;
    onSave(project.id, { components: list, scmEmail: scmEmail.trim() });
    try { localStorage.setItem(SCM_DEFAULT_EMAIL_KEY, scmEmail.trim()); } catch (e) {}

    const subject = `Dependencies / Components List – ${project.name} (${project.projectNumber})`;
    const lines = [
      `Project: ${project.name} (${project.projectNumber})`,
      `Department: ${project.department}   Team: ${project.team}`,
      "",
      "Component / Item Name | Part Number | Qty | Remarks",
      ...list.map((r) => `${r.name || "-"} | ${r.partNumber || "-"} | ${r.qty || "-"} | ${r.remarks || "-"}`),
      "",
      "— Sent from PRD-Tracker",
    ];
    const body = lines.join("\n");
    window.location.href = `mailto:${encodeURIComponent(scmEmail.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <div className="text-[15px] font-display font-semibold text-slate-800 flex items-center gap-2"><Boxes size={16} className="text-turkish-deep" /> Dependencies / Components List</div>
            <div className="text-[11.5px] text-slate-400 mt-0.5">{project.name} · {project.projectNumber}</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.id} className="grid grid-cols-[1fr_1fr_70px_1fr_28px] gap-1.5 items-center">
                <input value={r.name} onChange={(e) => setRow(r.id, "name", e.target.value)} className="input" placeholder="Component / item name" />
                <input value={r.partNumber} onChange={(e) => setRow(r.id, "partNumber", e.target.value)} className="input" placeholder="Part number" />
                <input value={r.qty} onChange={(e) => setRow(r.id, "qty", e.target.value)} className="input" placeholder="Qty" />
                <input value={r.remarks} onChange={(e) => setRow(r.id, "remarks", e.target.value)} className="input" placeholder="Remarks" />
                <button onClick={() => removeRow(r.id)} className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 justify-self-center" title="Remove row"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
          <button onClick={addRow} className="text-[12px] font-medium text-turkish-deep flex items-center gap-1 hover:underline cursor-pointer">
            <Plus size={13} /> Add component
          </button>

          <div className="border-t border-slate-100 pt-4">
            <Field label="SCM Department Email">
              <input
                type="email"
                value={scmEmail}
                onChange={(e) => setScmEmail(e.target.value)}
                className="input"
                placeholder="e.g. scm@goat-robotics.com"
              />
            </Field>
            <div className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
              "Send to SCM" opens your email app with this address, the project details, and the component list already filled in — review it and hit Send there.
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-slate-100">
          <div className="text-[11px] text-slate-400">{saved ? "Saved." : `${list.length} component${list.length !== 1 ? "s" : ""}`}</div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="text-[13px] px-3.5 py-1.5 rounded-md text-slate-500 hover:bg-slate-100">Close</button>
            <button onClick={handleSave} className="text-[13px] px-4 py-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium flex items-center gap-1.5"><Save size={13} /> Save list</button>
            <button
              onClick={handleSendToScm}
              disabled={!emailValid || list.length === 0}
              className={`text-[13px] px-4 py-1.5 rounded-md text-white font-medium flex items-center gap-1.5 ${!emailValid || list.length === 0 ? "bg-slate-300 cursor-not-allowed" : "bg-turkish hover:bg-turkish-deep cursor-pointer"}`}
              title={!emailValid ? "Enter a valid SCM email first" : list.length === 0 ? "Add at least one component" : "Open your email app to send"}
            >
              <Send size={13} /> Send to SCM
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- QuickCreateModal ---------------------------- */

// Chip-style option picker: click a chip to select it, click the little "x"
// to delete that option forever (from every future Feed Project form), and
// use "+ Add" to create a brand new option. This is what "Creating and
// Deleting Option" means throughout the Feed Project modal below.
function TagOptionSelect({ value, onSelect, options, onCreate, onDelete, emptyLabel }) {
  const [adding, setAdding] = useState(false);
  const [val, setVal] = useState("");

  const submit = () => {
    const v = val.trim();
    if (!v) { setAdding(false); return; }
    onCreate(v);
    onSelect(v);
    setVal("");
    setAdding(false);
  };

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {options.length === 0 && !adding && (
        <span className="text-[11.5px] text-slate-400 italic">{emptyLabel || "No options yet"}</span>
      )}
      {options.map((o) => {
        const active = value === o;
        return (
          <span
            key={o}
            onClick={() => onSelect(o)}
            className={`group inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-[11.5px] font-medium border cursor-pointer transition-colors ${
              active ? "bg-turkish text-white border-turkish" : "bg-slate-50 text-slate-600 border-slate-200 hover:border-turkish/50"
            }`}
          >
            {o}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(o); }}
              title="Delete this option"
              className={`w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 ${active ? "hover:bg-white/25" : "hover:bg-slate-200 text-slate-400"}`}
            >
              <X size={9} />
            </button>
          </span>
        );
      })}
      {adding ? (
        <span className="inline-flex items-center gap-1">
          <input
            autoFocus
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); submit(); }
              if (e.key === "Escape") setAdding(false);
            }}
            placeholder="New option"
            className="text-[11.5px] border border-slate-200 rounded-full px-2.5 py-1 w-28 outline-none focus:border-turkish"
          />
          <button type="button" onClick={submit} className="w-6 h-6 rounded-full flex items-center justify-center bg-turkish hover:bg-turkish-deep text-white cursor-pointer"><CheckCircle2 size={12} /></button>
          <button type="button" onClick={() => setAdding(false)} className="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer"><X size={12} /></button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 pl-2 pr-2.5 py-1 rounded-full text-[11.5px] font-medium border border-dashed border-slate-300 text-slate-400 hover:border-turkish hover:text-turkish cursor-pointer"
        >
          <Plus size={11} /> Add
        </button>
      )}
    </div>
  );
}

// Assignee Team picker used in both the Feed Project modal and the full
// Add/Edit Project modal. Lets an admin create a brand-new team on the spot
// (name + optional code + person count) or delete the currently selected
// team, without leaving the form.
function TeamPicker({ value, onChange, teams, onCreate, onDelete, error }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [capacity, setCapacity] = useState("");

  const submit = () => {
    const n = name.trim();
    if (!n) { setAdding(false); return; }
    onCreate({ name: n, code: (code.trim() || n.slice(0, 3).toUpperCase()), capacity: Number(capacity) || 0 });
    onChange(n);
    setName(""); setCode(""); setCapacity(""); setAdding(false);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <select value={value} onChange={(e) => onChange(e.target.value)} className="input flex-1">
          {teams.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
        </select>
        {value && teams.length > 1 && (
          <button
            type="button"
            title="Delete this team"
            onClick={() => onDelete(value)}
            className="w-[30px] h-[30px] shrink-0 rounded-md border border-slate-200 text-slate-400 hover:border-red-300 hover:text-red-500 flex items-center justify-center"
          >
            <Trash2 size={13} />
          </button>
        )}
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          title="Create a new team"
          className="w-[30px] h-[30px] shrink-0 rounded-md border border-dashed border-slate-300 text-slate-400 hover:border-turkish hover:text-turkish flex items-center justify-center"
        >
          <Plus size={13} />
        </button>
      </div>
      {adding && (
        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-md p-2">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Team name" className="text-[11.5px] border border-slate-200 rounded px-2 py-1 flex-1 min-w-0 outline-none focus:border-turkish" />
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code" className="text-[11.5px] border border-slate-200 rounded px-2 py-1 w-14 outline-none focus:border-turkish" />
          <input value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="Persons" type="number" className="text-[11.5px] border border-slate-200 rounded px-2 py-1 w-16 outline-none focus:border-turkish" />
          <button type="button" onClick={submit} className="w-6 h-6 rounded-full flex items-center justify-center bg-turkish hover:bg-turkish-deep text-white cursor-pointer shrink-0"><CheckCircle2 size={12} /></button>
          <button type="button" onClick={() => setAdding(false)} className="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer shrink-0"><X size={12} /></button>
        </div>
      )}
      {error && <div className="text-[11px] text-red-500 mt-1">{error}</div>}
    </div>
  );
}

// Small segmented toggle used for the Variant / Manufacturing switch.
function ModeToggle({ value, onChange, options }) {
  return (
    <div className="inline-flex bg-slate-100 rounded-lg p-1 gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[12.5px] font-medium transition-colors cursor-pointer ${
            value === o.value ? "bg-white text-turkish-deep shadow-sm" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          {o.icon && <o.icon size={13} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function QuickCreateModal({ onClose, onSave, teams, addTeam, deleteTeam }) {
  const [form, setForm] = useState({
    name: "", mode: "variant", variants: "", payload: "", custom: "", manufacturing: "",
    team: teams[0]?.name || "", startDate: todayISO(), endDate: todayISO(),
  });
  const [errors, setErrors] = useState({});
  const [variantOptions, setVariantOptions] = useState(() => loadOptionList(VARIANT_OPTIONS_KEY, DEFAULT_VARIANT_OPTIONS));
  const [manufacturingOptions, setManufacturingOptions] = useState(() => loadOptionList(MANUFACTURING_OPTIONS_KEY, DEFAULT_MANUFACTURING_OPTIONS));
  const [payloadOptions, setPayloadOptions] = useState(() => loadOptionList(PAYLOAD_OPTIONS_KEY, DEFAULT_PAYLOAD_OPTIONS));
  const [customOptions, setCustomOptions] = useState(() => loadOptionList(CUSTOM_VARIANT_OPTIONS_KEY, DEFAULT_CUSTOM_VARIANT_OPTIONS));
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Generic "add to a persisted option list" helper.
  const makeAdd = (setList, key) => (v) => setList((prev) => {
    if (prev.includes(v)) return prev;
    const next = [...prev, v]; saveOptionList(key, next); return next;
  });
  // Generic "delete from a persisted option list" helper — also clears the
  // field's current value if the deleted option was the one selected.
  const makeDelete = (setList, key, formKey) => (v) => {
    setList((prev) => { const next = prev.filter((o) => o !== v); saveOptionList(key, next); return next; });
    setForm((f) => (f[formKey] === v ? { ...f, [formKey]: "" } : f));
  };

  const addVariantOption = makeAdd(setVariantOptions, VARIANT_OPTIONS_KEY);
  const deleteVariantOption = makeDelete(setVariantOptions, VARIANT_OPTIONS_KEY, "variants");
  const addManufacturingOption = makeAdd(setManufacturingOptions, MANUFACTURING_OPTIONS_KEY);
  const deleteManufacturingOption = makeDelete(setManufacturingOptions, MANUFACTURING_OPTIONS_KEY, "manufacturing");
  const addPayloadOption = makeAdd(setPayloadOptions, PAYLOAD_OPTIONS_KEY);
  const deletePayloadOption = makeDelete(setPayloadOptions, PAYLOAD_OPTIONS_KEY, "payload");
  const addCustomOption = makeAdd(setCustomOptions, CUSTOM_VARIANT_OPTIONS_KEY);
  const deleteCustomOption = makeDelete(setCustomOptions, CUSTOM_VARIANT_OPTIONS_KEY, "custom");

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = "Project name is required.";
    if (!form.team) e.team = "Assignee team is required.";
    if (!form.startDate) e.startDate = "Start date is required.";
    if (!form.endDate) e.endDate = "End date is required.";
    if (form.startDate && form.endDate && form.endDate < form.startDate) e.endDate = "End date must be on or after start date.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    onSave(form);
  };

  const dur = form.startDate && form.endDate && form.endDate >= form.startDate ? durationDays(form.startDate, form.endDate) : null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="text-[15px] font-display font-semibold text-slate-800 flex items-center gap-1.5"><Database size={16} className="text-turkish" /> Feed Project</div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <Field label="Project Name" error={errors.name}>
            <input autoFocus value={form.name} onChange={(e) => set("name", e.target.value)} className="input" placeholder="e.g. AMR Chassis Build" />
          </Field>

          <div>
            <label className="text-[11.5px] font-medium text-slate-500 mb-1.5 block">Category</label>
            <ModeToggle
              value={form.mode}
              onChange={(m) => set("mode", m)}
              options={[
                { value: "variant", label: "Variant", icon: Bot },
                { value: "manufacturing", label: "Manufacturing", icon: Factory },
              ]}
            />
          </div>

          {form.mode === "manufacturing" ? (
            <>
              <Field label="Manufacturing">
                <TagOptionSelect
                  value={form.manufacturing}
                  onSelect={(v) => set("manufacturing", v)}
                  options={manufacturingOptions}
                  onCreate={addManufacturingOption}
                  onDelete={deleteManufacturingOption}
                />
              </Field>
              <Field label="Variant">
                <TagOptionSelect
                  value={form.variants}
                  onSelect={(v) => set("variants", v)}
                  options={variantOptions}
                  onCreate={addVariantOption}
                  onDelete={deleteVariantOption}
                />
              </Field>
              <Field label="Payload (kg)">
                <TagOptionSelect
                  value={form.payload}
                  onSelect={(v) => set("payload", v)}
                  options={payloadOptions}
                  onCreate={addPayloadOption}
                  onDelete={deletePayloadOption}
                />
              </Field>
            </>
          ) : (
            <>
              <Field label="Variant">
                <TagOptionSelect
                  value={form.variants}
                  onSelect={(v) => set("variants", v)}
                  options={variantOptions}
                  onCreate={addVariantOption}
                  onDelete={deleteVariantOption}
                />
              </Field>
              <Field label="Payload (kg)">
                <TagOptionSelect
                  value={form.payload}
                  onSelect={(v) => set("payload", v)}
                  options={payloadOptions}
                  onCreate={addPayloadOption}
                  onDelete={deletePayloadOption}
                />
              </Field>
              <Field label="Custom">
                <TagOptionSelect
                  value={form.custom}
                  onSelect={(v) => set("custom", v)}
                  options={customOptions}
                  onCreate={addCustomOption}
                  onDelete={deleteCustomOption}
                  emptyLabel="No custom entries yet — click Add"
                />
              </Field>
            </>
          )}

          <Field label="Assignee Team" error={errors.team}>
            <TeamPicker value={form.team} onChange={(v) => set("team", v)} teams={teams} onCreate={addTeam} onDelete={deleteTeam} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start Date" error={errors.startDate}>
              <input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} className="input" />
            </Field>
            <Field label="End Date" error={errors.endDate}>
              <input type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} className="input" />
            </Field>
          </div>
          {dur && <div className="text-[11.5px] text-slate-400 font-mono -mt-1.5">Duration: {dur} day{dur !== 1 ? "s" : ""}</div>}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button onClick={onClose} className="text-[13px] px-3.5 py-1.5 rounded-md text-slate-500 hover:bg-slate-100">Cancel</button>
          <button onClick={handleSave} className="text-[13px] px-4 py-1.5 rounded-md bg-turkish hover:bg-turkish-deep text-white font-medium">Submit</button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- LoginPage ------------------------------- */

function AuthShell({ children, embedded }) {
  const formPane = (
    <div className="w-full max-w-[380px] mx-auto">{children}</div>
  );

  if (embedded) return formPane;

  return (
    <div className="w-full min-h-screen flex items-stretch bg-ink" style={{ fontFamily: "var(--font-body)" }}>
      {/* ---- left: animated brand panel with logo mounted on paint-splash ---- */}
      <div className="hidden lg:flex relative w-[46%] shrink-0 items-center justify-center overflow-hidden gt-auth-aurora">
        <div className="relative w-[72%] max-w-[460px] aspect-[515/332]">
          <img
            src={loginSplash}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-contain gt-splash-bg"
            style={{ mixBlendMode: "screen" }}
          />
          <img
            src={logo}
            alt="GOAT Robotics"
            className="absolute left-1/2 top-1/2 w-[46%] object-contain gt-logo-mount"
          />
        </div>
        <div className="absolute bottom-8 left-0 right-0 text-center px-8">
          <div className="text-[11px] text-turkish-tint/70 font-display tracking-[0.2em] uppercase">Production Tracker</div>
        </div>
      </div>

      {/* ---- right: sign-in form ---- */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 bg-ink">
        {formPane}
      </div>

      <style>{`
        .gt-auth-aurora{
          background: linear-gradient(120deg, #06070a, #0d1017 35%, #0a2530 65%, #06070a);
          background-size: 260% 260%;
          animation: gtAuroraShift 16s ease-in-out infinite;
        }
        .gt-auth-aurora::before{
          content:"";
          position:absolute; inset:-20%;
          background: radial-gradient(circle at 30% 25%, rgba(14,165,196,0.28), transparent 55%),
                      radial-gradient(circle at 75% 70%, rgba(55,200,230,0.16), transparent 50%);
          animation: gtAuroraDrift 22s ease-in-out infinite alternate;
        }
        @keyframes gtAuroraShift{
          0%{background-position:0% 30%;}
          50%{background-position:100% 70%;}
          100%{background-position:0% 30%;}
        }
        @keyframes gtAuroraDrift{
          0%{transform:translate3d(-3%,-2%,0) scale(1);}
          100%{transform:translate3d(3%,2%,0) scale(1.08);}
        }
        .gt-splash-bg{ animation: gtSplashBreathe 6s ease-in-out infinite; transform-origin: center; }
        @keyframes gtSplashBreathe{
          0%,100%{ transform: translate3d(0,0,0) scale(1); }
          50%{ transform: translate3d(0,-1.5%,0) scale(1.015); }
        }
        .gt-logo-mount{
          transform: translate(-50%,-54%) scale(1);
          animation: gtLogoBreathe 6s ease-in-out infinite;
        }
        @keyframes gtLogoBreathe{
          0%,100%{ transform: translate(-50%,-54%) scale(1); }
          50%{ transform: translate(-50%,-55.5%) scale(1.015); }
        }
        @media (prefers-reduced-motion: reduce){
          .gt-auth-aurora, .gt-auth-aurora::before, .gt-splash-bg, .gt-logo-mount{ animation: none !important; }
        }
      `}</style>
    </div>
  );
}

function LoginPage({ embedded }) {
  const [mode, setMode] = useState("signin"); // signin | register
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setNotice("");
    if (!isDbConfigured) { setError("The database is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)."); return; }
    if (!email.trim() || !password) { setError("Please enter your email and password."); return; }
    if (mode === "register") {
      if (!name.trim()) { setError("Please enter your name."); return; }
      if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    }
    setBusy(true);
    try {
      if (mode === "signin") {
        await signIn(email.trim(), password); // App re-renders on the auth change
      } else {
        const res = await signUp(name.trim(), email.trim(), password);
        if (res.session) {
          // already signed in; App shows the "awaiting approval" screen
        } else {
          setNotice("Request submitted. Confirm your email using the link we sent, then wait for administrator approval before signing in.");
          setMode("signin"); setPassword("");
        }
      }
    } catch (err) {
      setError(mode === "signin" ? "Incorrect email or password." : (err.message || "Could not submit your request."));
    } finally { setBusy(false); }
  };

  return (
    <AuthShell embedded={embedded}>
      <img
        src={logo}
        alt="GOAT Robotics"
        className="h-11 w-auto max-w-[70%] object-contain mx-auto mb-8 lg:hidden"
      />
      <div className="flex flex-col items-center mb-5">
        <div className="w-11 h-11 rounded-full gt-nazar-ring flex items-center justify-center mb-3">
          <Lock size={18} className="text-white" />
        </div>
        <div className="text-[16px] font-display font-semibold text-white">{mode === "signin" ? "Sign in to your account" : "Request access"}</div>
        <div className="text-[12px] text-slate-400 mt-1 text-center">
          {mode === "signin" ? "Enter your email and password to access the dashboard." : "An administrator must approve your request before you can sign in."}
        </div>
      </div>
      <form onSubmit={submit} className="space-y-3.5">
        {mode === "register" && (
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} className="input-dark" placeholder="Your full name" />
          </Field>
        )}
        <Field label="Email">
          <div className="relative">
            <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-dark pl-10" placeholder="you@goat-robotics.com" autoComplete="email" />
          </div>
        </Field>
        <Field label="Password">
          <div className="relative">
            <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className="input-dark pl-10 pr-10" placeholder="••••••••" autoComplete={mode === "signin" ? "current-password" : "new-password"} />
            <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400">
              {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </Field>
        {error && <div className="text-[11.5px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">{error}</div>}
        {notice && <div className="text-[11.5px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-3 py-2">{notice}</div>}
        <button type="submit" disabled={busy} className="w-full bg-turkish hover:bg-turkish-deep disabled:opacity-60 text-white text-[13.5px] font-medium py-2.5 rounded-md transition-colors">
          {busy ? "Please wait…" : mode === "signin" ? "Sign In" : "Submit Request"}
        </button>
        <button type="button" onClick={() => { setMode(mode === "signin" ? "register" : "signin"); setError(""); setNotice(""); }} className="w-full text-[12.5px] text-slate-400 hover:text-white">
          {mode === "signin" ? "New user? Request access" : "Already approved? Sign in"}
        </button>
        <div className="text-[11px] text-slate-500 text-center">Need help? <a className="text-turkish-bright" href={`mailto:${ADMIN_CONTACT_EMAIL}`}>{ADMIN_CONTACT_EMAIL}</a></div>
      </form>
      <style>{`
        .input-dark{width:100%;font-size:12.5px;border:1px solid #262c38;background:#0d1017;color:#fff;border-radius:6px;padding:9px 9px;outline:none;}
        .input-dark::placeholder{color:#5b6472;}
        .input-dark:focus{border-color:#0EA5C4;box-shadow:0 0 0 2px rgba(14,165,196,0.25);}
        .input-dark[type="date"]::-webkit-calendar-picker-indicator{filter:invert(1);}
        label{color:#8993a1 !important;}
      `}</style>
    </AuthShell>
  );
}

