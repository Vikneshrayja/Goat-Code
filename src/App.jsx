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
} from "lucide-react";
import logo from "./assets/logo.png";
import loginSplash from "./assets/login-splash.png";
import { exportTeamTimeline } from "./lib/exportTimeline";
import {
  isDbConfigured, fetchProjects, saveProjects, deleteProjectRemote, subscribeProjects,
  fetchNotifications, saveNotifications, subscribeNotifications,
} from "./lib/db";

/* ----------------------------- constants ----------------------------- */

const TEAMS = ["GT-Team 1", "GTX-Team 2", "GT-XP-Team 3"];
const TEAM_NO_LABEL = { "GT-Team 1": "Team No 1 — GT-Team 1", "GTX-Team 2": "Team No 2 — GTX-Team 2", "GT-XP-Team 3": "Team No 3 — GT-XP-Team 3" };
const TEAM_CODE = { "GT-Team 1": "GT1", "GTX-Team 2": "GTX2", "GT-XP-Team 3": "GXP3" };
const TEAM_CAPACITY = { "GT-Team 1": 5, "GTX-Team 2": 6, "GT-XP-Team 3": 4 };
const DEPARTMENTS = ["Production", "Assembly", "Welding", "Machining", "Sheet Metal", "Coating"];
const MANUFACTURING_DEPTS = ["Welding", "Sheet Metal", "Coating", "Machining"];
const DEP_CHAIN = ["Machining", "Welding", "Coating", "Assembly"];
const STATUSES = ["Planned", "In Progress", "Completed", "Delayed", "On Hold", "Cancelled"];
const PRIORITIES = ["Low", "Medium", "High", "Critical"];
const VARIANTS = ["GT-Series", "GTX-Series", "GTXP", "GT-Custom", "GTX-Customs", "GTXP-Customs"];

const STATUS_COLOR = {
  "Planned": { bg: "#EEF2F7", text: "#3D5A73", dot: "#5B84A6" },
  "In Progress": { bg: "#E7F1EC", text: "#1F6B4A", dot: "#2E9464" },
  "Completed": { bg: "#EAF3EE", text: "#2A6B4A", dot: "#3AA76D" },
  "Delayed": { bg: "#FBEAEA", text: "#A3312A", dot: "#D8453A" },
  "On Hold": { bg: "#FBF3E4", text: "#8A5A17", dot: "#C7891E" },
  "Cancelled": { bg: "#EFEFEF", text: "#6B6B6B", dot: "#9A9A9A" },
};

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
  {
    key: "overview", label: "Overview", icon: LayoutGrid,
    children: [
      { key: "overview.counts", label: "Project Counts", icon: LayoutGrid },
      { key: "overview.dependencies", label: "Project Dependencies", icon: GitBranch },
      { key: "overview.menu", label: "Create / Menu Management", icon: SlidersHorizontal },
    ],
  },
  {
    key: "projectconfig", label: "Project Configuration", icon: Database,
    children: [
      { key: "projectconfig.teams", label: "Project Teams", icon: Users },
      { key: "projectconfig.feeds", label: "Project Feeds", icon: Database },
      { key: "projectconfig.timeline", label: "Timeline Calculation", icon: CalendarDays },
    ],
  },
  {
    key: "manufacturing", label: "Manufacturing", icon: Factory,
    children: [
      { key: "manufacturing.Welding", label: "Welding", icon: Flame },
      { key: "manufacturing.Sheet Metal", label: "Sheet Metal", icon: Layers },
      { key: "manufacturing.Coating", label: "Coating", icon: Paintbrush },
      { key: "manufacturing.Machining", label: "Machining", icon: Settings },
    ],
  },
  {
    key: "configportal", label: "Configuration Portal", icon: PanelsTopLeft,
    children: [
      { key: "configportal.menu", label: "All Menu Configuration", icon: SlidersHorizontal },
    ],
  },
  {
    key: "useraccess", label: "User Access Portal", icon: ShieldCheck,
    children: [
      { key: "useraccess.users", label: "Authorized Users", icon: Users },
      { key: "useraccess.add", label: "Add User", icon: UserPlus },
      { key: "useraccess.enable", label: "Enable / Disable User", icon: ToggleLeft },
      { key: "useraccess.password", label: "Password Management", icon: KeyRound },
    ],
  },
  {
    key: "timeline", label: "Timeline", icon: CalendarDays,
    children: [
      { key: "timeline.gantt", label: "Project Timeline / Gantt Chart", icon: CalendarDays },
    ],
  },
  {
    key: "settings", label: "Settings", icon: Settings,
    children: [
      { key: "settings.settings", label: "Settings", icon: Settings },
      { key: "settings.contact", label: "Contact Details", icon: Phone },
    ],
  },
];

const STORAGE_KEY = "gt_dashboard_projects_v1";
const USERS_KEY = "gt_dashboard_users_v2";
const SESSION_KEY = "gt_dashboard_session_v1";
const NOTIFS_KEY = "gt_dashboard_notifications_v1";
const MENU_CONFIG_KEY = "gt_menu_config_v1";
const ADMIN_EMAIL = "vikneshraja@goat-robotics.com";
const VIEWER_EMAIL = "view@goat-robotics.com";

/* ------------------------------- auth utils ------------------------------ */
// Fixed-credential login only: no self sign-up. Exactly two accounts exist —
// one Admin (full access) and one Viewer (read-only, no create/edit/delete).

function fixedUsers() {
  return [
    { name: "Vikneshraja", email: ADMIN_EMAIL, password: "Goat@Production", role: "Admin", status: "approved" },
    { name: "Viewer", email: VIEWER_EMAIL, password: "Goat@view2026", role: "Viewer", status: "approved" },
  ];
}
function loadUsers() {
  const seedUsers = fixedUsers();
  try { localStorage.setItem(USERS_KEY, JSON.stringify(seedUsers)); } catch (e) {}
  return [...seedUsers, ...loadCustomUsers()];
}
function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
}

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
  sidebarFrom: "#24614a",
  sidebarTo: "#0e2c21",
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
  root.setProperty("--gt-sidebar-from", t.sidebarFrom);
  root.setProperty("--gt-sidebar-to", t.sidebarTo);
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

/* ------------------------------ custom users ------------------------------ */
// Admin -> User Access Portal -> User Approval & Create. Layered on top of the
// two fixed accounts; login checks both lists.

const CUSTOM_USERS_KEY = "gt_dashboard_custom_users_v1";

function loadCustomUsers() {
  try {
    const raw = localStorage.getItem(CUSTOM_USERS_KEY);
    if (raw) { const arr = JSON.parse(raw); if (Array.isArray(arr)) return arr; }
  } catch (e) {}
  return [];
}
function saveCustomUsers(list) {
  try { localStorage.setItem(CUSTOM_USERS_KEY, JSON.stringify(list)); } catch (e) {}
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
const DEFAULT_MANUFACTURING_OPTIONS = ["Machining", "Welding", "Coating", "Sheet Metal"];
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

/* ------------------------------ date utils ----------------------------- */

const toDate = (s) => new Date(s + "T00:00:00");
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / 86400000);
const durationDays = (start, end) => daysBetween(start, end) + 1;
const addDaysISO = (s, n) => {
  const d = toDate(s);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const fmtDisplay = (s) =>
  toDate(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const fmtShort = (s) =>
  toDate(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

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
  const [session, setSession] = useState(() => loadSession());
  const [theme, setTheme] = useState(() => loadTheme());

  useEffect(() => { applyTheme(theme); }, [theme]);

  const updateTheme = useCallback((next) => {
    setTheme(next);
    saveTheme(next);
  }, []);

  const handleLogin = (user) => {
    const sessionData = { name: user.name, email: user.email, role: user.role };
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
    setSession(sessionData);
  };

  const handleLogout = () => {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
  };

  // Login is required before anything else is shown -- no read-only preview
  // of the dashboard for signed-out visitors.
  if (!session) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <ProductionDashboard
      session={session}
      onLogout={handleLogout}
      theme={theme}
      updateTheme={updateTheme}
    />
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
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ team: "", department: "", status: "", priority: "" });
  const [ganttView, setGanttView] = useState("Week");
  const [toast, setToast] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [menuConfig, setMenuConfig] = useState(() => loadMenuConfig());
  const [customMenu, setCustomMenu] = useState(() => loadCustomMenu());
  const [customUsers, setCustomUsers] = useState(() => loadCustomUsers());
  const importInputRef = useRef(null);

  const updateMenuConfig = useCallback((next) => {
    setMenuConfig(next);
    saveMenuConfig(next);
  }, []);

  const updateCustomMenu = useCallback((next) => {
    setCustomMenu(next);
    saveCustomMenu(next);
  }, []);

  const updateCustomUsers = useCallback((next) => {
    setCustomUsers(next);
    saveCustomUsers(next);
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
        setProjects(seedData());
      } finally {
        setLoaded(true);
      }
    })();
    fetchNotifications().then(setNotifications).catch(() => {});
    const unsubP = subscribeProjects(() => { fetchProjects(seedData).then(setProjects); });
    const unsubN = subscribeNotifications(() => { fetchNotifications().then(setNotifications); });
    return () => { unsubP(); unsubN(); };
  }, []);

  const persist = useCallback(async (next) => {
    setProjects(next);
    try {
      await saveProjects(next);
    } catch (e) {
      console.error("storage save failed", e);
    }
  }, []);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  };

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

  const handleQuickCreate = (data) => {
    const projectNumber = `${TEAM_CODE[data.team] || "GT"}-${Date.now().toString().slice(-5)}`;
    const department = data.mode === "manufacturing" && MANUFACTURING_DEPTS.includes(data.manufacturing) ? data.manufacturing : "Production";
    const remarksParts = [];
    if (data.mode === "variant") {
      if (data.variants) remarksParts.push(`Variant: ${data.variants}`);
      if (data.payload) remarksParts.push(`Payload: ${data.payload} kg`);
      if (data.custom) remarksParts.push(`Custom: ${data.custom}`);
    } else {
      if (data.manufacturing) remarksParts.push(`Manufacturing: ${data.manufacturing}`);
    }
    const full = {
      name: data.name,
      mode: data.mode,
      variants: data.mode === "variant" ? data.variants : "",
      payload: data.mode === "variant" ? data.payload : "",
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
        const toISO = (v) => {
          if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
          if (typeof v === "string" && v.trim()) {
            const d = new Date(v);
            if (!isNaN(d)) return d.toISOString().slice(0, 10);
          }
          return todayISO();
        };
        const newOnes = rows.map((r) => {
          const team = TEAMS.includes(r["Team"]) ? r["Team"] : TEAMS[0];
          const department = DEPARTMENTS.includes(r["Department"]) ? r["Department"] : "Production";
          const priority = PRIORITIES.includes(r["Priority"]) ? r["Priority"] : "Medium";
          const status = STATUSES.includes(r["Status"]) ? r["Status"] : "Planned";
          const id = "P-" + Math.random().toString(36).slice(2, 8).toUpperCase();
          return {
            id, name: r["Project Name"] || r["Name"] || "Untitled",
            projectNumber: r["Project Number"] || `IMP-${Date.now().toString().slice(-5)}-${id.slice(2, 4)}`,
            variants: r["Variants"] || "", department, team,
            startDate: toISO(r["Start Date"]), endDate: toISO(r["End Date"]),
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
    const next = projects.filter((p) => p.id !== deleting.id);
    persist(next);
    deleteProjectRemote(deleting.id);
    setDeleting(null);
    showToast("Project deleted.");
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

  const exportTimelineWorkbook = () => exportTeamTimeline(projects, conflicts, TEAMS);

  const activeItem = flatNav.find((s) => s.key === page) || flatNav[0];

  const scopedProjects = useMemo(() => {
    if (activeItem.key.startsWith("manufacturing.")) {
      const dept = activeItem.key.split("manufacturing.")[1];
      return projects.filter((p) => p.department === dept);
    }
    return projects;
  }, [projects, activeItem]);

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
        <div className="fixed inset-0 bg-black/70 z-40 transition-opacity" onClick={() => setSidebarOpen(false)} />
      )}
      <Sidebar page={page} setPage={setPage} conflictCount={conflicts.length} menuConfig={menuConfig} customMenu={customMenu} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
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
            customUsers={customUsers}
            updateCustomUsers={updateCustomUsers}
            theme={theme}
            updateTheme={updateTheme}
            onCreateClick={() => setQuickOpen(true)}
            onEdit={(p) => { setEditing(p); setFormOpen(true); }}
            onDelete={(p) => setDeleting(p)}
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
          onClose={() => { setFormOpen(false); setEditing(null); }}
          onSave={saveProject}
        />
      )}
      {quickOpen && (
        <QuickCreateModal onClose={() => setQuickOpen(false)} onSave={handleQuickCreate} />
      )}
      {deleting && (
        <ConfirmModal
          title="Delete project?"
          message={`Are you sure you want to delete "${deleting.name}"? This cannot be undone.`}
          onCancel={() => setDeleting(null)}
          onConfirm={confirmDelete}
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
    customMenu, updateCustomMenu, customUsers, updateCustomUsers, theme, updateTheme,
    onCreateClick, onEdit, onDelete, onExport, onExportTimeline, onImportClick } = props;

  if (page === "overview.counts") {
    return (
      <OverviewPage
        projects={projects} conflicts={conflicts} conflictedIds={conflictedIds}
        ganttView={ganttView} setGanttView={setGanttView}
        onEdit={onEdit} onDelete={onDelete} setPage={setPage} isAdmin={isAdmin}
      />
    );
  }
  if (page === "overview.dependencies") {
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
    return <TeamsPage projects={projects} setPage={setPage} />;
  }
  if (page === "projectconfig.feeds") {
    return (
      <FeedsPage
        projects={projects} onCreateClick={onCreateClick} onEdit={onEdit} onDelete={onDelete}
        conflictedIds={conflictedIds} onExport={onExport} onExportTimeline={onExportTimeline}
        onImportClick={onImportClick} isAdmin={isAdmin}
      />
    );
  }
  if (page === "projectconfig.timeline") {
    return <TimelineCalcPage />;
  }
  if (page.startsWith("manufacturing.")) {
    const dept = page.split("manufacturing.")[1];
    const Icon = DEPT_ICON[dept] || Factory;
    if (menuConfig[dept] === false) {
      return <DisabledModuleNotice dept={dept} setPage={setPage} />;
    }
    return (
      <ListPage
        title={dept} icon={Icon} projects={scopedProjects} allTeams
        search={search} filters={filters} setFilters={setFilters}
        conflicts={conflicts} conflictedIds={conflictedIds}
        ganttView={ganttView} setGanttView={setGanttView}
        onEdit={onEdit} onDelete={onDelete} isAdmin={isAdmin}
      />
    );
  }
  if (page === "useraccess.users") {
    return <AuthorizedUsersPage customUsers={customUsers} />;
  }
  if (page === "useraccess.add") {
    return <UserApprovalPage isAdmin={isAdmin} customUsers={customUsers} updateCustomUsers={updateCustomUsers} />;
  }
  if (page === "useraccess.enable") {
    return <EnableDisableUsersPage isAdmin={isAdmin} customUsers={customUsers} updateCustomUsers={updateCustomUsers} />;
  }
  if (page === "useraccess.password") {
    return <ComingSoon icon={KeyRound} title="Password Management" note="Hashed password reset / change flow ships alongside the full User Access Portal backend." />;
  }
  if (page === "timeline.gantt") {
    return (
      <TimelinePage
        projects={projects} conflictedIds={conflictedIds} conflicts={conflicts}
        ganttView={ganttView} setGanttView={setGanttView}
        onEdit={onEdit} onDelete={onDelete} isAdmin={isAdmin}
      />
    );
  }
  if (page === "settings.settings") {
    return <SettingsPage isAdmin={isAdmin} theme={theme} updateTheme={updateTheme} />;
  }
  if (page === "settings.contact") {
    return <ContactPage />;
  }
  return <OverviewPage projects={projects} conflicts={conflicts} conflictedIds={conflictedIds} ganttView={ganttView} setGanttView={setGanttView} onEdit={onEdit} onDelete={onDelete} setPage={setPage} isAdmin={isAdmin} />;
}

/* -------------------------------- Sidebar -------------------------------- */

function Sidebar({ page, setPage, conflictCount, menuConfig, customMenu, open, onClose }) {
  const navTree = useMemo(() => buildNavTree(customMenu), [customMenu]);
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
    if (!childKey.startsWith("manufacturing.")) return false;
    const dept = childKey.split("manufacturing.")[1];
    return menuConfig[dept] === false;
  };

  return (
    <div
      className={`fixed lg:static inset-y-0 left-0 z-50 w-72 shrink-0 gt-sidebar-glossy border-r border-gline flex flex-col transition-transform duration-300 ease-out dark-scroll ${
        open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      }`}
    >
      <div className="px-5 py-6 border-b border-gline flex items-center justify-center relative z-10">
        <div className="flex flex-col items-center">
          <img
            src={logo}
            alt="GOAT Robotics"
            className="h-14 w-auto max-w-[80%] object-contain shrink-0"
          />
          <div className="text-[10px] text-turkish-bright font-display font-semibold tracking-[0.14em] mt-2.5 uppercase">PRD-Tracker</div>
        </div>
        <button onClick={onClose} className="lg:hidden absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-white cursor-pointer">
          <X size={18} />
        </button>
      </div>

      <nav className="flex-1 py-3 px-3 space-y-1 overflow-y-auto dark-scroll select-none relative z-10">
        {navTree.map((group) => {
          const GIcon = group.icon;
          const groupActive = activeGroupKey === group.key;
          const expanded = openGroups.has(group.key);
          return (
            <div key={group.key}>
              <button
                onClick={() => toggleGroup(group.key)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[12.5px] font-display font-medium tracking-wide cursor-pointer transition-colors ${
                  groupActive ? "text-white" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <span className={`relative flex items-center justify-center w-7 h-7 rounded-md shrink-0 ${groupActive ? "gt-nazar-ring" : "bg-white/[0.04]"}`}>
                  <GIcon size={14} className={groupActive ? "text-white" : "text-slate-400"} />
                </span>
                <span className="flex-1 text-left uppercase text-[11px] tracking-[0.08em]">{group.label}</span>
                {group.key === "overview" && conflictCount > 0 && (
                  <span className="text-[10px] bg-red-500 text-white rounded-full min-w-[17px] h-[17px] px-1 flex items-center justify-center font-semibold">{conflictCount}</span>
                )}
                {expanded ? <ChevronUp size={13} className="text-slate-500" /> : <ChevronDown size={13} className="text-slate-500" />}
              </button>

              {expanded && (
                <div className="ml-4 pl-3.5 border-l border-gline mt-0.5 mb-1.5 space-y-0.5">
                  {group.children.map((child) => {
                    const CIcon = child.icon;
                    const active = page === child.key;
                    const disabled = isChildDisabled(child.key);
                    return (
                      <button
                        key={child.key}
                        onClick={() => { if (!disabled) { setPage(child.key); onClose && onClose(); } }}
                        disabled={disabled}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12.5px] transition-all duration-150 ${
                          disabled
                            ? "text-slate-600 cursor-not-allowed"
                            : active
                            ? "text-white font-semibold bg-gradient-to-r from-turkish/25 to-transparent border-l-2 border-turkish-bright shadow-[0_0_18px_-4px_var(--gt-blue-glow)]"
                            : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-200 cursor-pointer"
                        }`}
                      >
                        <CIcon size={14} className={active ? "text-turkish-bright" : disabled ? "text-slate-700" : "text-slate-500"} />
                        <span className="flex-1 text-left">{child.label}</span>
                        {disabled && <span className="text-[9px] uppercase tracking-wide text-slate-600 border border-slate-700 rounded px-1 py-[1px]">Off</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="px-4 py-3 border-t border-gline text-[10px] text-slate-500 flex items-center gap-1.5 font-mono relative z-10">
        <span className={`w-1.5 h-1.5 rounded-full ${isDbConfigured ? "bg-emerald-400" : "bg-slate-600"}`} />
        {isDbConfigured ? "Live shared data" : "Local browser storage"}
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

function SectionHeading({ title, crumb, size = "sm", icon: Icon }) {
  if (size === "lg") {
    return (
      <div>
        <div className="inline-flex items-center gap-2 bg-turkish-tint rounded-md px-3 py-1.5">
          {Icon && <Icon size={16} className="text-turkish-deep" />}
          <span className="text-[19px] font-display font-semibold text-turkish-deep leading-tight">{title}</span>
        </div>
        {crumb && (
          <div className="text-[11.5px] text-slate-400 mt-1 ml-0.5">
            <span className="text-slate-400">{crumb}</span> / <span className="text-turkish font-medium">{title}</span>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="inline-flex items-center gap-2 border-l-4 border-turkish bg-turkish-tint rounded-r-md pl-2.5 pr-3 py-1">
      {Icon && <Icon size={14} className="text-turkish-deep" />}
      <span className="text-[13px] font-display font-semibold text-turkish-deep">{title}</span>
    </div>
  );
}

/* ------------------------------ Overview -------------------------------- */

function OverviewPage({ projects, conflicts, conflictedIds, ganttView, setGanttView, onEdit, onDelete, setPage, isAdmin }) {
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

  const cards = [
    { label: "Total Projects", value: total, color: "#0EA5C4" },
    { label: "Active Projects", value: active, color: "#2E9464" },
    { label: "Pending Projects", value: planned, color: "#5B84A6" },
    { label: "Completed Projects", value: completed, color: "#3AA76D" },
    { label: "Delayed Projects", value: delayed, color: "#D8453A" },
  ];

  return (
    <div className="space-y-5">
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
            {MANUFACTURING_DEPTS.map((d) => (
              <div key={d} className="flex items-center justify-between text-[12.5px]">
                <span className="text-slate-600">{d}</span>
                <span className="font-mono font-semibold text-slate-800">{byDept(d)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="mb-2.5"><SectionHeading title="By Team" /></div>
          <div className="space-y-2">
            {TEAMS.map((tm) => (
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

      <ProjectTable projects={projects} conflictedIds={conflictedIds} onEdit={onEdit} onDelete={onDelete} isAdmin={isAdmin} />
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

function TeamsPage({ projects, setPage }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {TEAMS.map((team) => {
          const items = projects.filter((p) => p.team === team);
          const active = items.filter((p) => p.status === "In Progress").length;
          const capacity = TEAM_CAPACITY[team];
          return (
            <div key={team} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <SectionHeading title={team} icon={Bot} />
                <span className="text-[11px] font-mono text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">{TEAM_CODE[team]}</span>
              </div>
              <div className="p-4 space-y-2.5">
                <div className="flex items-center justify-between text-[12.5px]">
                  <span className="text-slate-500">Number of Persons</span>
                  <span className="font-mono font-semibold text-slate-800">{capacity}</span>
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
      <div className="bg-white rounded-lg border border-slate-200 p-5">
        <SectionHeading title="Team Creation" />
        <div className="text-[12px] text-slate-400 mt-2">
          Create / Edit / Delete team, and assigning variant categories per team, moves teams from the fixed <span className="font-mono">TEAMS</span> constant into a proper <span className="font-mono">Teams</span> table — planned for the Data Model phase.
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- Timeline Calculation ------------------------- */

function TimelineCalcPage() {
  return (
    <ComingSoon
      icon={CalendarDays}
      title="Timeline Calculation"
      note="Entering expected duration per manufacturing activity and having the system auto-calculate start/end dates, sequential vs parallel tasks, and total project duration is the next build phase — it feeds directly into the consolidated Gantt Chart you can already see under Timeline."
    />
  );
}

/* -------------------------------- FeedsPage ------------------------------- */

function FeedsPage({ projects, onCreateClick, onEdit, onDelete, conflictedIds, onExport, onExportTimeline, onImportClick, isAdmin }) {
  const grouped = TEAMS.map((team) => ({
    team,
    items: projects.filter((p) => p.team === team).sort((a, b) => (a.startDate < b.startDate ? -1 : 1)),
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

function ListPage({ title, icon: Icon, projects, allTeams, search, filters, setFilters, conflicts, conflictedIds, ganttView, setGanttView, onEdit, onDelete, isAdmin }) {
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

      <FilterBar filters={filters} setFilters={setFilters} showTeam={allTeams} count={filtered.length} />

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

      <ProjectTable projects={filtered} conflictedIds={conflictedIds} onEdit={onEdit} onDelete={onDelete} isAdmin={isAdmin} />
    </div>
  );
}

function FilterBar({ filters, setFilters, showTeam, count }) {
  const set = (k, v) => setFilters({ ...filters, [k]: v });
  const clear = () => setFilters({ team: "", department: "", status: "", priority: "" });
  const active = Object.values(filters).some(Boolean);
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-3 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5 text-[12px] text-slate-400 font-medium mr-1"><Filter size={13} /> Filters</div>
      {showTeam && (
        <select value={filters.team} onChange={(e) => set("team", e.target.value)} className="text-[12px] border border-slate-200 rounded-md px-2 py-1.5 bg-white">
          <option value="">All Teams</option>
          {TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
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

function GanttChart({ projects, conflictedIds, view }) {
  if (projects.length === 0) {
    return <div className="text-[12.5px] text-slate-400 py-10 text-center border border-dashed border-slate-200 rounded-md">No projects to display.</div>;
  }
  const dayWidth = view === "Day" ? 34 : view === "Week" ? 12 : 4;
  const t = todayISO();
  let minStart = projects[0].startDate, maxEnd = projects[0].endDate;
  projects.forEach((p) => {
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
      <div style={{ minWidth: chartWidth + 200 }}>
        <div className="flex border-b border-slate-100 sticky top-0 bg-white z-10">
          <div className="w-52 shrink-0 px-3 py-2 text-[11px] font-semibold text-slate-400 border-r border-slate-100">Project</div>
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
          return (
            <div key={p.id} className="flex border-b border-slate-50 hover:bg-slate-50/60">
              <div className="w-52 shrink-0 px-3 py-2.5 border-r border-slate-100">
                <div className="text-[12px] font-medium text-slate-700 truncate flex items-center gap-1">
                  {conflict && <TriangleAlert size={11} className="text-red-500 shrink-0" />}
                  {p.name}
                </div>
                <div className="text-[10px] text-slate-400 font-mono">{p.team}</div>
              </div>
              <div className="relative" style={{ width: chartWidth, height: 40 }}>
                <div className="absolute top-0 bottom-0 border-l border-dashed border-turkish/50" style={{ left: todayOffset }} />
                <div
                  title={`${p.name}: ${fmtDisplay(p.startDate)} → ${fmtDisplay(p.endDate)}`}
                  className="absolute rounded-[4px] flex items-center px-1.5 overflow-hidden"
                  style={{
                    left, width, top: 8, height: 22,
                    background: conflict ? "repeating-linear-gradient(45deg, #E7433B, #E7433B 6px, #C0332B 6px, #C0332B 12px)" : sc.dot,
                    boxShadow: conflict ? "0 0 0 1.5px #A3312A" : "none",
                  }}
                >
                  <span className="text-[10px] text-white font-medium truncate">{p.status}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------- Timeline page ---------------------------- */

function TimelinePage({ projects, conflictedIds, conflicts, ganttView, setGanttView, onEdit, onDelete, isAdmin }) {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <SectionHeading title="Consolidated Project Timeline / Gantt Chart" icon={CalendarDays} />
          <GanttViewToggle view={ganttView} setView={setGanttView} />
        </div>
        <div className="text-[12px] text-slate-400 mb-3">All projects across every team and manufacturing stage, in one view. Dashed line marks today.</div>
        <GanttChart projects={projects} conflictedIds={conflictedIds} view={ganttView} />
      </div>
      <ProjectTable projects={projects} conflictedIds={conflictedIds} onEdit={onEdit} onDelete={onDelete} isAdmin={isAdmin} />
    </div>
  );
}

/* ------------------------------ ProjectTable ------------------------------ */

function ProjectTable({ projects, conflictedIds, onEdit, onDelete, isAdmin }) {
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
                <td className="px-3 py-2.5 text-slate-500">{p.department}</td>
                <td className="px-3 py-2.5 text-slate-500">{p.team}</td>
                <td className="px-3 py-2.5 font-mono text-slate-500">{fmtShort(p.startDate)}</td>
                <td className="px-3 py-2.5 font-mono text-slate-500">{fmtShort(p.endDate)}</td>
                <td className="px-3 py-2.5 font-mono text-slate-500">{durationDays(p.startDate, p.endDate)}d</td>
                <td className="px-3 py-2.5"><PriorityTag priority={p.priority} /></td>
                <td className="px-3 py-2.5"><StatusTag status={p.status} /></td>
                {isAdmin && (
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1">
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

function StatusTag({ status }) {
  const c = STATUS_COLOR[status] || STATUS_COLOR.Planned;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: c.bg, color: c.text }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.dot }} /> {status}
    </span>
  );
}
function PriorityTag({ priority }) {
  const color = PRIORITY_COLOR[priority] || "#5B84A6";
  return <span className="text-[11px] font-semibold" style={{ color }}>{priority}</span>;
}

/* ------------------------------ User Access -------------------------------- */

function AuthorizedUsersPage({ customUsers }) {
  const users = [...fixedUsers(), ...(customUsers || [])];
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100"><SectionHeading title="Authorized Users" icon={Users} /></div>
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="bg-slate-50 text-left text-[11px] text-slate-400 uppercase tracking-wide">
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Email</th>
              <th className="px-4 py-2.5 font-medium">Role</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.email} className="border-t border-slate-50">
                <td className="px-4 py-2.5 font-medium text-slate-700">{u.name}</td>
                <td className="px-4 py-2.5 font-mono text-slate-500">{u.email}</td>
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-turkish-tint text-turkish-deep">
                    {u.role === "Admin" ? <ShieldCheck size={11} /> : <Eye size={11} />} {u.role}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  {u.enabled === false ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Disabled</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">Active</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-[12px] text-slate-400 px-1">Passwords are never shown here. Manage creation and access from User Approval & Create and Enable / Disable User.</div>
    </div>
  );
}

function UserApprovalPage({ isAdmin, customUsers, updateCustomUsers }) {
  const [form, setForm] = useState({ name: "", userId: "", password: "", role: "Viewer" });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const createUser = () => {
    const name = form.name.trim();
    const userId = form.userId.trim().toLowerCase();
    if (!name || !userId || !form.password) { setError("User Name, User ID and Password are all required."); return; }
    const taken = [...fixedUsers().map((u) => u.email.toLowerCase()), ...customUsers.map((u) => u.email.toLowerCase())];
    if (taken.includes(userId)) { setError("This User ID is already assigned to another account."); return; }
    const next = [...customUsers, { name, email: userId, password: form.password, role: form.role, status: "approved", enabled: true }];
    updateCustomUsers(next);
    setForm({ name: "", userId: "", password: "", role: "Viewer" });
    setError("");
  };
  const toggleEnabled = (email) => updateCustomUsers(customUsers.map((u) => (u.email === email ? { ...u, enabled: u.enabled === false ? true : false } : u)));
  const removeUser = (email) => updateCustomUsers(customUsers.filter((u) => u.email !== email));

  if (!isAdmin) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-10 text-center max-w-lg mx-auto mt-8">
        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
          <UserPlus size={22} className="text-slate-400" />
        </div>
        <div className="text-[14px] font-display font-semibold text-slate-700">Admin access required</div>
        <div className="text-[12.5px] text-slate-400 mt-1.5">Only the Admin can create and approve new users.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-slate-200 p-5 max-w-xl">
        <SectionHeading title="User Approval & Create" icon={UserPlus} />
        <div className="text-[12px] text-slate-400 mt-2 mb-4">Only Admin can register new users. Users created here are approved immediately and can be disabled at any time.</div>
        <div className="space-y-3">
          <Field label="User Name"><input value={form.name} onChange={(e) => set("name", e.target.value)} className="input" placeholder="e.g. Priya Sundaram" /></Field>
          <Field label="User ID"><input value={form.userId} onChange={(e) => set("userId", e.target.value)} className="input" placeholder="e.g. priya@goat-robotics.com" /></Field>
          <Field label="Password">
            <div className="relative">
              <input type={showPw ? "text" : "password"} value={form.password} onChange={(e) => set("password", e.target.value)} className="input pr-9" placeholder="Set a password" />
              <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </Field>
          <Field label="Role / Permission">
            <select value={form.role} onChange={(e) => set("role", e.target.value)} className="input">
              <option value="Admin">Admin — full access</option>
              <option value="Viewer">Viewer — read-only</option>
            </select>
          </Field>
          {error && <div className="text-[11.5px] text-red-500">{error}</div>}
          <button onClick={createUser} className="w-full flex items-center justify-center gap-1.5 bg-turkish hover:bg-turkish-deep text-white text-[13px] font-medium py-2.5 rounded-md cursor-pointer">
            <UserPlus size={14} /> Create User
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100"><SectionHeading title="Created Users" icon={Users} /></div>
        {customUsers.length === 0 ? (
          <div className="text-[12px] text-slate-400 px-4 py-6 text-center">No users created yet.</div>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="bg-slate-50 text-left text-[11px] text-slate-400 uppercase tracking-wide">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">User ID</th>
                <th className="px-4 py-2.5 font-medium">Role</th>
                <th className="px-4 py-2.5 font-medium">Approved</th>
                <th className="px-4 py-2.5 font-medium text-right">Delete</th>
              </tr>
            </thead>
            <tbody>
              {customUsers.map((u) => (
                <tr key={u.email} className="border-t border-slate-50">
                  <td className="px-4 py-2.5 font-medium text-slate-700">{u.name}</td>
                  <td className="px-4 py-2.5 font-mono text-slate-500">{u.email}</td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-turkish-tint text-turkish-deep">
                      {u.role === "Admin" ? <ShieldCheck size={11} /> : <Eye size={11} />} {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => toggleEnabled(u.email)}
                      className={`shrink-0 w-11 h-6 p-0 border-0 rounded-full relative overflow-hidden transition-colors cursor-pointer ${u.enabled !== false ? "bg-turkish" : "bg-slate-300"}`}
                      title={u.enabled !== false ? "Approved — click to disable" : "Disabled — click to approve"}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${u.enabled !== false ? "translate-x-5" : "translate-x-0"}`} />
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => removeUser(u.email)} className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 cursor-pointer"><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function EnableDisableUsersPage({ isAdmin, customUsers, updateCustomUsers }) {
  const toggleEnabled = (email) => updateCustomUsers(customUsers.map((u) => (u.email === email ? { ...u, enabled: u.enabled === false ? true : false } : u)));
  const all = [
    ...fixedUsers().map((u) => ({ ...u, fixed: true, enabled: true })),
    ...customUsers.map((u) => ({ ...u, fixed: false })),
  ];
  return (
    <div className="space-y-4">
      {!isAdmin && (
        <div className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">Sign in as Admin to enable or disable users.</div>
      )}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100"><SectionHeading title="Enable / Disable User" icon={ToggleLeft} /></div>
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="bg-slate-50 text-left text-[11px] text-slate-400 uppercase tracking-wide">
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">User ID</th>
              <th className="px-4 py-2.5 font-medium">Role</th>
              <th className="px-4 py-2.5 font-medium">Access</th>
            </tr>
          </thead>
          <tbody>
            {all.map((u) => (
              <tr key={u.email} className="border-t border-slate-50">
                <td className="px-4 py-2.5 font-medium text-slate-700">{u.name}</td>
                <td className="px-4 py-2.5 font-mono text-slate-500">{u.email}</td>
                <td className="px-4 py-2.5 text-slate-500">{u.role}</td>
                <td className="px-4 py-2.5">
                  {u.fixed ? (
                    <span className="text-[11px] text-slate-400">Always enabled</span>
                  ) : (
                    <button
                      onClick={() => isAdmin && toggleEnabled(u.email)}
                      disabled={!isAdmin}
                      className={`shrink-0 w-11 h-6 p-0 border-0 rounded-full relative overflow-hidden transition-colors ${u.enabled !== false ? "bg-turkish" : "bg-slate-300"} ${!isAdmin ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
                      title={u.enabled !== false ? "Enabled — click to disable" : "Disabled — click to enable"}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${u.enabled !== false ? "translate-x-5" : "translate-x-0"}`} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
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
        <div className="text-[12.5px] text-slate-500 mt-2">Signed in as <span className="font-medium text-slate-700">{isAdmin ? "Admin" : "Viewer"}</span>. Profile editing (name, avatar) will connect to the Authorized Users table.</div>
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
          Adjust brightness and gradient colors for the side menu and the option menus (profile, notifications,
          search) shown across the whole dashboard. Changes apply live for every visitor.
        </div>
        {!isAdmin && (
          <div className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-4">Sign in as Admin to change appearance settings.</div>
        )}
        <div className="space-y-3">
          <AppearanceRow
            label="Side Menu (Sidebar)"
            brightness={t.sidebarBrightness}
            onBrightness={(v) => patch({ sidebarBrightness: v })}
            from={t.sidebarFrom}
            onFrom={(v) => patch({ sidebarFrom: v })}
            to={t.sidebarTo}
            onTo={(v) => patch({ sidebarTo: v })}
            disabled={!isAdmin}
          />
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
        <div className="text-[12.5px] text-slate-500 mt-2">Managed from User Access Portal → Authorized Users.</div>
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
        <div className="text-[14px] font-display font-semibold text-slate-800">Contact</div>
        <a href={`mailto:${ADMIN_EMAIL}`} className="text-[13px] font-mono text-turkish-deep mt-2 inline-block hover:underline">{ADMIN_EMAIL}</a>
      </div>
    </div>
  );
}

/* ---------------------------- ProjectFormModal ---------------------------- */

function ProjectFormModal({ initial, enabledDepartments, onClose, onSave }) {
  const deptOptions = enabledDepartments && enabledDepartments.length ? enabledDepartments : DEPARTMENTS;
  const [form, setForm] = useState(() => initial || {
    name: "", projectNumber: "", variants: "", department: deptOptions[0], team: TEAMS[0],
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
              <select value={form.team} onChange={(e) => set("team", e.target.value)} className="input">
                {TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
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

function Field({ label, error, children }) {
  return (
    <div>
      <label className="text-[11.5px] font-medium text-slate-500 mb-1 block">{label}</label>
      {children}
      {error && <div className="text-[11px] text-red-500 mt-1">{error}</div>}
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

function QuickCreateModal({ onClose, onSave }) {
  const [form, setForm] = useState({
    name: "", mode: "variant", variants: "", payload: "", custom: "", manufacturing: "",
    team: TEAMS[0], startDate: todayISO(), endDate: todayISO(),
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
            <Field label="Manufacturing">
              <TagOptionSelect
                value={form.manufacturing}
                onSelect={(v) => set("manufacturing", v)}
                options={manufacturingOptions}
                onCreate={addManufacturingOption}
                onDelete={deleteManufacturingOption}
              />
            </Field>
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
            <select value={form.team} onChange={(e) => set("team", e.target.value)} className="input">
              {TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
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
  if (embedded) {
    return <div className="w-full max-w-[380px] mx-auto">{children}</div>;
  }

  return (
    <div className="w-full min-h-screen flex items-stretch relative overflow-hidden gt-auth-aurora" style={{ fontFamily: "var(--font-body)" }}>
      {/* ---- left: logo mounted on paint-splash, over the shared animated backdrop ---- */}
      <div className="hidden lg:flex relative z-10 w-[46%] shrink-0 items-center justify-center">
        <div className="relative w-[72%] max-w-[460px] aspect-[515/332]">
          <img
            src={loginSplash}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-contain gt-splash-bg"
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

      {/* ---- right: sign-in form, floating over the same animated backdrop ---- */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 relative z-10">
        <div className="w-full max-w-[380px] mx-auto bg-panel/70 gt-glass backdrop-blur-xl border border-gline rounded-2xl shadow-2xl p-7">
          {children}
        </div>
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
          background: radial-gradient(circle at 20% 20%, rgba(14,165,196,0.26), transparent 50%),
                      radial-gradient(circle at 80% 30%, rgba(55,200,230,0.14), transparent 48%),
                      radial-gradient(circle at 60% 85%, rgba(14,165,196,0.18), transparent 50%);
          animation: gtAuroraDrift 22s ease-in-out infinite alternate;
          pointer-events: none;
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

function LoginPage({ onLogin, embedded }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");

  const submit = (e) => {
    e.preventDefault();
    if (!email.trim() || !password) { setError("Please enter your email and password."); return; }
    const users = loadUsers();
    const user = users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.password === password);
    if (!user) { setError("Incorrect email or password."); return; }
    if (user.enabled === false) { setError("This account has been disabled by the administrator."); return; }
    if (user.status && user.status !== "approved") { setError("This account is pending admin approval."); return; }
    setError("");
    onLogin(user);
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
        <div className="text-[16px] font-display font-semibold text-white">Sign in to your account</div>
        <div className="text-[12px] text-slate-400 mt-1 text-center">Enter your email and password to access the dashboard.</div>
      </div>
      <form onSubmit={submit} className="space-y-3.5">
        <Field label="Email">
          <div className="relative">
            <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-dark pl-10" placeholder="you@goat-robotics.com" />
          </div>
        </Field>
        <Field label="Password">
          <div className="relative">
            <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className="input-dark pl-10 pr-10" placeholder="••••••••" />
            <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400">
              {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </Field>
        {error && <div className="text-[11.5px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">{error}</div>}
        <button type="submit" className="w-full bg-turkish hover:bg-turkish-deep text-white text-[13.5px] font-medium py-2.5 rounded-md transition-colors">Sign In</button>
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

/* ------------------------------ ConfirmModal ------------------------------ */

function ConfirmModal({ title, message, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-sm shadow-2xl p-5">
        <div className="flex items-center gap-2 text-red-500 mb-2">
          <AlertTriangle size={18} />
          <div className="text-[14px] font-display font-semibold text-slate-800">{title}</div>
        </div>
        <div className="text-[12.5px] text-slate-500 mb-4">{message}</div>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="text-[13px] px-3.5 py-1.5 rounded-md text-slate-500 hover:bg-slate-100">Cancel</button>
          <button onClick={onConfirm} className="text-[13px] px-4 py-1.5 rounded-md bg-red-500 hover:bg-red-600 text-white font-medium">Delete</button>
        </div>
      </div>
    </div>
  );
}
