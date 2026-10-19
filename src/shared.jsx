import React from "react";
import { AlertTriangle } from "lucide-react";

/* ------------------------------ date utils ----------------------------- */
// Local-calendar based (never toISOString) so UTC+ timezones don't roll back a day.
export const toISO = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
export const toDate = (s) => new Date(s + "T00:00:00");
export const todayISO = () => toISO(new Date());
export const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / 86400000);
export const durationDays = (start, end) => daysBetween(start, end) + 1;
export const addDaysISO = (s, n) => {
  const d = toDate(s);
  if (isNaN(d.getTime())) return s;
  d.setDate(d.getDate() + n);
  return toISO(d);
};
export const fmtDisplay = (s) => {
  const d = toDate(s);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};
export const fmtShort = (s) => {
  const d = toDate(s);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
};

/* ------------------------------ categories ----------------------------- */
// Stored department value stays "Sheet Metal" (existing records); it is shown
// as "Sheetmetal" everywhere per the revised navigation.
export const deptLabel = (d) => (d === "Sheet Metal" ? "Sheetmetal" : d);
export const normalizeDept = (s) => {
  const k = String(s || "").toLowerCase().replace(/[\s_-]+/g, "");
  const map = { machining: "Machining", welding: "Welding", sheetmetal: "Sheet Metal", coating: "Coating", assembly: "Assembly", production: "Production" };
  return map[k] || null;
};
export const OVERVIEW_DEPTS = ["Assembly", "Machining", "Sheet Metal", "Welding"];
export const TASK_CATEGORIES = ["Machining", "Sheet Metal", "Welding"];
export const TASK_STATUSES = ["Planned", "In Progress", "Completed", "Delayed", "On Hold"];
export const ADMIN_CONTACT_EMAIL = "vikneshraja@goat-robotics.com";

export const STATUS_COLOR = {
  "Planned": { bg: "#EEF2F7", text: "#3D5A73", dot: "#5B84A6" },
  "In Progress": { bg: "#E7F1EC", text: "#1F6B4A", dot: "#2E9464" },
  "Completed": { bg: "#EAF3EE", text: "#2A6B4A", dot: "#3AA76D" },
  "Delayed": { bg: "#FBEAEA", text: "#A3312A", dot: "#D8453A" },
  "On Hold": { bg: "#FBF3E4", text: "#8A5A17", dot: "#C7891E" },
  "Cancelled": { bg: "#EFEFEF", text: "#6B6B6B", dot: "#9A9A9A" },
};

/* -------------------------------- UI bits ------------------------------ */
export function Field({ label, error, children }) {
  return (
    <div>
      <label className="text-[11.5px] font-medium text-slate-500 mb-1 block">{label}</label>
      {children}
      {error && <div className="text-[11px] text-red-500 mt-1">{error}</div>}
    </div>
  );
}

export function SectionHeading({ title, crumb, size = "sm", icon: Icon }) {
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

export function StatusTag({ status }) {
  const c = STATUS_COLOR[status] || STATUS_COLOR.Planned;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: c.bg, color: c.text }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.dot }} /> {status}
    </span>
  );
}

export function ConfirmModal({ title, message, onCancel, onConfirm, confirmLabel = "Delete", tone = "danger" }) {
  const btn = tone === "danger" ? "bg-red-500 hover:bg-red-600" : "bg-turkish hover:bg-turkish-deep";
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-lg w-full max-w-sm shadow-2xl p-5">
        <div className={`flex items-center gap-2 mb-2 ${tone === "danger" ? "text-red-500" : "text-turkish"}`}>
          <AlertTriangle size={18} />
          <div className="text-[14px] font-display font-semibold text-slate-800">{title}</div>
        </div>
        <div className="text-[12.5px] text-slate-500 mb-4">{message}</div>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="text-[13px] px-3.5 py-1.5 rounded-md text-slate-500 hover:bg-slate-100 cursor-pointer">Cancel</button>
          <button onClick={onConfirm} className={`text-[13px] px-4 py-1.5 rounded-md text-white font-medium cursor-pointer ${btn}`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
