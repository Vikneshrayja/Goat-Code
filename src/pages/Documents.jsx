import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Plus, X, Trash2, Pencil, Eye, Printer, Download, Boxes, TrendingUp, ArrowUp, ArrowDown, FileText, ClipboardCheck, Wallet, Gauge, CalendarDays, Users,
} from "lucide-react";
import logo from "../assets/logo.png";
import { Field, SectionHeading, ConfirmModal, todayISO, durationDays } from "../shared";
import { fetchDocs, upsertDoc, deleteDoc, subscribeTable } from "../lib/db";
import {
  RCA_SIGNERS, rcaHtml, costingHtml, bottleneckHtml, printHtml,
  WEIGHT_UNITS, DOWNTIME_UNITS, scrapTotals, weightText, downtimeText, hoursText,
  norm, scrapItems, itemKg, componentsText,
  fmtDateTime, money, costSaving, costSavingPct, CURRENCIES,
} from "../lib/docHtml";
import { momModel, MOM_MAX_ATTENDEES, rcaModel, costingModel, bottleneckModel, scrapModel, scrapOverallModel, costingOverallModel, periodLabel, modelHtml, downloadWord, downloadPdf } from "../lib/docExport";

/* ============================ shared plumbing ============================ */

const newId = (p) => p + "-" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
const nowISO = () => new Date().toISOString();
const logoUrl = () => { try { return new URL(logo, window.location.href).href; } catch (e) { return logo; } };

// Next reference like RCA-2026-003 (continues the highest existing number this year).
function nextRef(prefix, rows) {
  const year = new Date().getFullYear();
  let max = 0;
  rows.forEach((r) => {
    const m = String(r.ref || "").match(new RegExp(`^${prefix}-${year}-(\\d+)$`));
    if (m) max = Math.max(max, Number(m[1]));
  });
  return `${prefix}-${year}-${String(max + 1).padStart(3, "0")}`;
}

function useDocs(table, notify) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  const load = useCallback(async () => {
    try {
      setRows(await fetchDocs(table));
    } catch (e) {
      notifyRef.current && notifyRef.current("Could not load records: " + (e.message || e));
    } finally {
      setLoading(false);
    }
  }, [table]);

  useEffect(() => {
    load();
    return subscribeTable(table, load);
  }, [load, table]);

  const save = async (row) => {
    try {
      const saved = await upsertDoc(table, row);
      setRows((cur) => [saved, ...cur.filter((r) => r.id !== saved.id)]);
      return {};
    } catch (e) {
      return { error: e.message || String(e) };
    }
  };
  const remove = async (id) => {
    try {
      await deleteDoc(table, id);
      setRows((cur) => cur.filter((r) => r.id !== id));
      return {};
    } catch (e) {
      return { error: e.message || String(e) };
    }
  };
  return { rows, loading, save, remove };
}

function Modal({ title, icon: Icon, onClose, children, footer, wide, xl }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div role="dialog" aria-label={title} className={`bg-white rounded-lg w-full ${xl ? "max-w-5xl" : wide ? "max-w-3xl" : "max-w-lg"} max-h-[92vh] overflow-y-auto shadow-2xl`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div className="text-[15px] font-display font-semibold text-slate-800 flex items-center gap-1.5">
            {Icon && <Icon size={16} className="text-turkish" />} {title}
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600 cursor-pointer"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">{footer}</div>}
      </div>
    </div>
  );
}

// Word / PDF download in the Goat Robotics template (see lib/docExport.js).
async function runDownload(kind, model, notify, setBusy) {
  setBusy && setBusy(kind);
  try {
    await (kind === "docx" ? downloadWord(model) : downloadPdf(model));
  } catch (e) {
    notify && notify("Could not create the " + (kind === "docx" ? "Word" : "PDF") + " file: " + (e.message || e));
  } finally {
    setBusy && setBusy("");
  }
}

// On-screen preview of the exact document that gets printed.
function PreviewModal({ title, html, model, onClose, notify, toolbar }) {
  const [busy, setBusy] = useState("");
  const doPrint = () => {
    if (!printHtml(html)) notify && notify("Pop-up blocked — allow pop-ups for this site to print or save as PDF.");
  };
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div role="dialog" aria-label={`${title} preview`} className="bg-white rounded-lg w-full max-w-4xl h-[92vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <div className="text-[14px] font-display font-semibold text-slate-800 flex items-center gap-1.5"><FileText size={16} className="text-turkish" /> {title}</div>
          <div className="flex flex-wrap items-center gap-2">
            {toolbar}
            {model && <>
              <button data-testid="doc-word" disabled={!!busy} onClick={() => runDownload("docx", model, notify, setBusy)} className="flex items-center gap-1.5 text-[12.5px] px-3.5 py-1.5 rounded-md border border-slate-200 hover:border-turkish text-slate-700 cursor-pointer disabled:opacity-60">
                <Download size={14} /> {busy === "docx" ? "Preparing…" : "Word"}
              </button>
              <button data-testid="doc-pdf" disabled={!!busy} onClick={() => runDownload("pdf", model, notify, setBusy)} className="flex items-center gap-1.5 text-[12.5px] px-3.5 py-1.5 rounded-md border border-slate-200 hover:border-turkish text-slate-700 cursor-pointer disabled:opacity-60">
                <Download size={14} /> {busy === "pdf" ? "Preparing…" : "PDF"}
              </button>
            </>}
            <button data-testid="doc-print" onClick={doPrint} className="flex items-center gap-1.5 text-[12.5px] px-3.5 py-1.5 rounded-md bg-turkish hover:bg-turkish-deep text-white cursor-pointer">
              <Printer size={14} /> Print
            </button>
            <button onClick={onClose} aria-label="Close preview" className="text-slate-400 hover:text-slate-600 cursor-pointer"><X size={18} /></button>
          </div>
        </div>
        <iframe data-testid="doc-frame" title={title} sandbox="" srcDoc={html} className="flex-1 w-full bg-slate-100 rounded-b-lg" />
      </div>
    </div>
  );
}

function RowActions({ isAdmin, onView, onEdit, onDelete, label, model, notify }) {
  const [busy, setBusy] = useState("");
  return (
    <div className="flex items-center justify-end gap-1">
      {model && <>
        <button disabled={!!busy} onClick={() => runDownload("docx", model, notify, setBusy)} aria-label={`Download ${label} as Word`} title="Download Word (.docx)" className="px-1.5 py-1 rounded hover:bg-slate-100 text-[10.5px] font-semibold text-slate-500 cursor-pointer disabled:opacity-50">{busy === "docx" ? "…" : "DOC"}</button>
        <button disabled={!!busy} onClick={() => runDownload("pdf", model, notify, setBusy)} aria-label={`Download ${label} as PDF`} title="Download PDF" className="px-1.5 py-1 rounded hover:bg-slate-100 text-[10.5px] font-semibold text-slate-500 cursor-pointer disabled:opacity-50">{busy === "pdf" ? "…" : "PDF"}</button>
      </>}
      <button onClick={onView} aria-label={`View ${label}`} title="View document" className="p-1.5 rounded hover:bg-slate-100 text-slate-500 cursor-pointer"><Eye size={13} /></button>
      {isAdmin && <button onClick={onEdit} aria-label={`Edit ${label}`} title="Edit" className="p-1.5 rounded hover:bg-slate-100 text-slate-500 cursor-pointer"><Pencil size={13} /></button>}
      {isAdmin && <button onClick={onDelete} aria-label={`Delete ${label}`} title="Delete" className="p-1.5 rounded hover:bg-red-50 text-slate-500 hover:text-red-500 cursor-pointer"><Trash2 size={13} /></button>}
    </div>
  );
}

function PageHeader({ title, icon, hint, isAdmin, createLabel, onCreate, extra }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeading title={title} icon={icon} />
        <div className="flex items-center gap-2">
          {extra}
          {isAdmin && (
            <button data-testid="doc-create" onClick={onCreate} className="flex items-center gap-1.5 text-[12.5px] font-medium text-white bg-turkish hover:bg-turkish-deep rounded-md px-3.5 py-2 cursor-pointer">
              <Plus size={14} /> {createLabel}
            </button>
          )}
        </div>
      </div>
      <div className="text-[12px] text-slate-400 mt-2">{hint}</div>
    </div>
  );
}

const Th = ({ children, right }) => <th className={`px-3 py-2.5 font-medium ${right ? "text-right" : ""}`}>{children}</th>;
const Empty = ({ cols, loading, text }) => (
  <tr><td colSpan={cols} className="text-center text-slate-400 py-8">{loading ? "Loading…" : text}</td></tr>
);

/* ============================ signature pad ============================== */

function SignaturePad({ value, onChange, disabled, label }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !value) return;
    const img = new Image();
    img.onload = () => c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    img.src = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pos = (e) => {
    const c = canvasRef.current;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * c.width) / r.width, y: ((e.clientY - r.top) * c.height) / r.height };
  };
  const down = (e) => {
    if (disabled) return;
    const c = canvasRef.current;
    c.setPointerCapture && c.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#111";
    ctx.beginPath(); ctx.arc(last.current.x, last.current.y, 1.2, 0, Math.PI * 2); ctx.fill();
  };
  const move = (e) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current.getContext("2d");
    const p = pos(e);
    ctx.strokeStyle = "#111"; ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last.current = p;
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(canvasRef.current.toDataURL("image/png"));
  };
  const clear = () => {
    const c = canvasRef.current;
    c.getContext("2d").clearRect(0, 0, c.width, c.height);
    onChange("");
  };

  return (
    <div>
      <canvas
        ref={canvasRef} width={360} height={110} aria-label={`${label} signature pad`} data-testid={`sig-${label}`}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
        className="w-full h-[88px] border border-dashed border-slate-300 rounded-md bg-white"
        style={{ touchAction: "none", cursor: disabled ? "not-allowed" : "crosshair" }}
      />
      <div className="flex items-center justify-between mt-1">
        <span className="text-[10.5px] text-slate-400">Sign inside the box with mouse, finger or stylus</span>
        {!disabled && <button type="button" onClick={clear} className="text-[11px] text-slate-500 hover:text-red-500 cursor-pointer">Clear</button>}
      </div>
    </div>
  );
}

/* ============================ overall reports ============================ */
// Whole-list report with an optional date range; opens as a preview that can be
// downloaded as Word / PDF or printed. kind: "scrap" | "cost".
function OverallReport({ kind, rows, onClose, notify }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const dateKey = kind === "scrap" ? "scrap_date" : "change_date";
  const filtered = useMemo(() => rows
    .filter((r) => (!from || String(r[dateKey] || "") >= from) && (!to || String(r[dateKey] || "") <= to))
    .sort((a, b) => String(a[dateKey] || "").localeCompare(String(b[dateKey] || ""))), [rows, from, to, dateKey]);
  const period = periodLabel(from, to);
  const model = useMemo(() => (kind === "scrap" ? scrapOverallModel(filtered, period) : costingOverallModel(filtered, period)), [kind, filtered, period]);
  const html = useMemo(() => modelHtml(model, logoUrl()), [model]);
  const toolbar = (
    <div className="flex items-center gap-1.5 text-[12px] text-slate-500 mr-1">
      <span>From</span>
      <input data-testid="rep-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input !py-1 !text-[12px] w-[132px]" />
      <span>To</span>
      <input data-testid="rep-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input !py-1 !text-[12px] w-[132px]" />
      <span className="text-slate-400 hidden sm:inline">{filtered.length} record{filtered.length === 1 ? "" : "s"}</span>
    </div>
  );
  return <PreviewModal title={kind === "scrap" ? "Overall scrap report" : "Overall cost saving report"} html={html} model={model} toolbar={toolbar} onClose={onClose} notify={notify} />;
}

/* ================================== RCA ================================== */

const localDT = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

function RcaForm({ initial, rows, defaultReporter, onClose, onSave }) {
  const [f, setF] = useState(() => initial ? { witness_name: "", ...initial } : {
    incident_at: localDT(), reported_by: defaultReporter || "", witness_name: "", location: "", description: "", explanation: "",
    corrective_action: "", preventive_action: "", fix_date: "", expected_date: "",
    dept_head_name: "", dept_head_sig: "", dept_head_signed_at: "",
    team_manager_name: "", team_manager_sig: "", team_manager_signed_at: "",
    employee_name: "", employee_sig: "", employee_signed_at: "",
  });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const submit = async () => {
    const e = {};
    if (!f.incident_at) e.incident_at = "Date and time are required.";
    if (!f.reported_by.trim()) e.reported_by = "Reported person is required.";
    if (!f.location.trim()) e.location = "Location is required.";
    if (!f.description.trim()) e.description = "Description is required.";
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const now = nowISO();
    const row = {
      ...f,
      id: f.id || newId("RCA"),
      ref: f.ref || nextRef("RCA", rows),
      created_at: f.created_at || now,
      updated_at: now,
    };
    const res = await onSave(row);
    setBusy(false);
    if (res.error) setErrors({ _form: res.error });
  };

  const setSig = (key, data) => setF((x) => ({ ...x, [`${key}_sig`]: data }));

  return (
    <Modal
      title={initial ? `Edit RCA ${initial.ref || ""}` : "New RCA"} icon={ClipboardCheck} wide onClose={onClose}
      footer={<>
        <button onClick={onClose} className="text-[13px] px-3.5 py-1.5 rounded-md text-slate-500 hover:bg-slate-100 cursor-pointer">Cancel</button>
        <button data-testid="doc-save" disabled={busy} onClick={submit} className="text-[13px] px-4 py-1.5 rounded-md bg-turkish hover:bg-turkish-deep text-white font-medium cursor-pointer disabled:opacity-60">Save RCA</button>
      </>}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Date & Time" error={errors.incident_at}>
          <input data-testid="rca-datetime" type="datetime-local" value={f.incident_at} onChange={(e) => set("incident_at", e.target.value)} className="input" />
        </Field>
        <Field label="Reported Person" error={errors.reported_by}>
          <input data-testid="rca-reporter" value={f.reported_by} onChange={(e) => set("reported_by", e.target.value)} className="input" placeholder="Name of the person reporting" />
        </Field>
        <Field label="Witness Name">
          <input data-testid="rca-witness" value={f.witness_name || ""} onChange={(e) => set("witness_name", e.target.value)} className="input" placeholder="Name of the witness" />
        </Field>
        <Field label="Location" error={errors.location}>
          <input data-testid="rca-location" value={f.location} onChange={(e) => set("location", e.target.value)} className="input" placeholder="e.g. Welding bay 2" />
        </Field>
      </div>
      <Field label="Description" error={errors.description}>
        <textarea data-testid="rca-description" rows={3} value={f.description} onChange={(e) => set("description", e.target.value)} className="input" placeholder="What happened?" />
      </Field>
      <Field label="Explanation">
        <textarea rows={3} value={f.explanation} onChange={(e) => set("explanation", e.target.value)} className="input" placeholder="Why did it happen? (root cause)" />
      </Field>
      <Field label="Corrective Action">
        <textarea rows={2} value={f.corrective_action} onChange={(e) => set("corrective_action", e.target.value)} className="input" placeholder="What was done to fix it?" />
      </Field>
      <Field label="Preventive Action">
        <textarea rows={2} value={f.preventive_action} onChange={(e) => set("preventive_action", e.target.value)} className="input" placeholder="What will stop it happening again?" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Temp Fix Date"><input type="date" value={f.fix_date} onChange={(e) => set("fix_date", e.target.value)} className="input" /></Field>
        <Field label="Expected Solution Date"><input type="date" value={f.expected_date} onChange={(e) => set("expected_date", e.target.value)} className="input" /></Field>
      </div>

      <div>
        <div className="text-[11.5px] font-medium text-slate-500 mb-2">Signatures</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {RCA_SIGNERS.map((s) => (
            <div key={s.key} className="border border-slate-200 rounded-md p-2.5 space-y-2">
              <div className="text-[12px] font-medium text-slate-700">{s.role}</div>
              <input value={f[`${s.key}_name`]} onChange={(e) => set(`${s.key}_name`, e.target.value)} className="input" placeholder="Name" aria-label={`${s.role} name`} />
              <SignaturePad label={s.role} value={f[`${s.key}_sig`]} onChange={(d) => setSig(s.key, d)} />
            </div>
          ))}
        </div>
      </div>
      {errors._form && <div className="text-[12px] text-red-500">{errors._form}</div>}
    </Modal>
  );
}

export function RcaPage({ isAdmin, session, notify }) {
  const { rows, loading, save, remove } = useDocs("rca_reports", notify);
  const [form, setForm] = useState(null);      // null | { record }
  const [view, setView] = useState(null);
  const [del, setDel] = useState(null);

  const signedCount = (r) => RCA_SIGNERS.filter((s) => r[`${s.key}_sig`]).length;

  return (
    <div className="space-y-4">
      <PageHeader title="RCA — Root Cause Analysis" icon={ClipboardCheck} isAdmin={isAdmin} createLabel="New RCA" onCreate={() => setForm({ record: null })}
        hint="Record an incident, its explanation, corrective and preventive action, then collect the three sign-offs. Open any record to download it as Word or PDF, or print it." />
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]" data-testid="rca-table">
            <thead><tr className="bg-slate-50 text-left text-[11px] text-slate-400 uppercase tracking-wide">
              <Th>Ref</Th><Th>Date &amp; Time</Th><Th>Reported By</Th><Th>Witness</Th><Th>Location</Th><Th>Description</Th><Th>Temp Fix Date</Th><Th>Signed</Th><Th right>Actions</Th>
            </tr></thead>
            <tbody>
              {rows.length === 0 && <Empty cols={9} loading={loading} text={"No RCA records yet." + (isAdmin ? " Use New RCA to create the first one." : "")} />}
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-50 hover:bg-slate-50/60">
                  <td className="px-3 py-2.5 font-mono text-slate-500">{r.ref}</td>
                  <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{fmtDateTime(r.incident_at)}</td>
                  <td className="px-3 py-2.5 text-slate-700">{r.reported_by}</td>
                  <td className="px-3 py-2.5 text-slate-500">{r.witness_name || "—"}</td>
                  <td className="px-3 py-2.5 text-slate-500">{r.location}</td>
                  <td className="px-3 py-2.5 text-slate-500 max-w-[240px] truncate" title={r.description}>{r.description}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-500">{r.fix_date || "—"}</td>
                  <td className="px-3 py-2.5"><span className={`text-[11px] px-2 py-0.5 rounded-full ${signedCount(r) === 3 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{signedCount(r)}/3</span></td>
                  <td className="px-3 py-2.5"><RowActions isAdmin={isAdmin} label={r.ref} notify={notify} model={rcaModel(r)} onView={() => setView(r)} onEdit={() => setForm({ record: r })} onDelete={() => setDel(r)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {form && (
        <RcaForm
          initial={form.record} rows={rows} defaultReporter={session?.name} onClose={() => setForm(null)}
          onSave={async (row) => { const res = await save(row); if (!res.error) { notify && notify(form.record ? "RCA updated." : "RCA saved."); setForm(null); } return res; }}
        />
      )}
      {view && <PreviewModal title={`RCA ${view.ref || ""}`} html={rcaHtml(view, logoUrl())} model={rcaModel(view)} onClose={() => setView(null)} notify={notify} />}
      {del && (
        <ConfirmModal title="Delete RCA?" message={`Delete ${del.ref}? This cannot be undone.`} onCancel={() => setDel(null)}
          onConfirm={async () => { const r = del; setDel(null); const res = await remove(r.id); notify && notify(res.error ? "Could not delete: " + res.error : "RCA deleted."); }} />
      )}
    </div>
  );
}

/* ================================ Costing ================================ */

function CostingForm({ initial, rows, projects, onClose, onSave }) {
  const [f, setF] = useState(() => initial ? { ...initial } : {
    item: "", project_name: "", previous_vendor: "", new_vendor: "", previous_cost: "", new_cost: "",
    quantity: "1", currency: "INR", change_date: todayISO(), remarks: "",
  });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const live = {
    previous_cost: Number(f.previous_cost), new_cost: Number(f.new_cost), quantity: Number(f.quantity),
  };
  const ready = f.previous_cost !== "" && f.new_cost !== "" && live.quantity > 0;
  const saved = ready ? costSaving(live) : null;
  const pct = ready ? costSavingPct(live) : null;

  const submit = async () => {
    const e = {};
    if (!f.item.trim()) e.item = "Item / part is required.";
    if (!f.previous_vendor.trim()) e.previous_vendor = "Previous vendor is required.";
    if (!f.new_vendor.trim()) e.new_vendor = "New vendor is required.";
    if (f.previous_cost === "" || !(Number(f.previous_cost) >= 0)) e.previous_cost = "Enter the previous unit cost.";
    if (f.new_cost === "" || !(Number(f.new_cost) >= 0)) e.new_cost = "Enter the new unit cost.";
    if (!(Number(f.quantity) > 0)) e.quantity = "Quantity must be more than 0.";
    if (!f.change_date) e.change_date = "Date is required.";
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const now = nowISO();
    const row = {
      ...f,
      item: f.item.trim(), previous_vendor: f.previous_vendor.trim(), new_vendor: f.new_vendor.trim(),
      previous_cost: Number(f.previous_cost), new_cost: Number(f.new_cost), quantity: Number(f.quantity),
      id: f.id || newId("CST"), ref: f.ref || nextRef("CST", rows),
      created_at: f.created_at || now, updated_at: now,
    };
    const res = await onSave(row);
    setBusy(false);
    if (res.error) setErrors({ _form: res.error });
  };

  return (
    <Modal
      title={initial ? `Edit ${initial.ref || "vendor change"}` : "New Vendor Change"} icon={Wallet} onClose={onClose}
      footer={<>
        <button onClick={onClose} className="text-[13px] px-3.5 py-1.5 rounded-md text-slate-500 hover:bg-slate-100 cursor-pointer">Cancel</button>
        <button data-testid="doc-save" disabled={busy} onClick={submit} className="text-[13px] px-4 py-1.5 rounded-md bg-turkish hover:bg-turkish-deep text-white font-medium cursor-pointer disabled:opacity-60">Save</button>
      </>}
    >
      <Field label="Item / Part" error={errors.item}>
        <input data-testid="cst-item" value={f.item} onChange={(e) => set("item", e.target.value)} className="input" placeholder="e.g. Base plate – 10 mm MS" />
      </Field>
      <Field label="Project (optional)">
        <input value={f.project_name} list="cst-projects" onChange={(e) => set("project_name", e.target.value)} className="input" placeholder="Choose or type" />
        <datalist id="cst-projects">{(projects || []).map((p) => <option key={p.id} value={p.name} />)}</datalist>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Previous Vendor" error={errors.previous_vendor}><input data-testid="cst-prev-vendor" value={f.previous_vendor} onChange={(e) => set("previous_vendor", e.target.value)} className="input" /></Field>
        <Field label="New Vendor" error={errors.new_vendor}><input data-testid="cst-new-vendor" value={f.new_vendor} onChange={(e) => set("new_vendor", e.target.value)} className="input" /></Field>
        <Field label="Previous Unit Cost" error={errors.previous_cost}><input data-testid="cst-prev-cost" type="number" min="0" step="any" value={f.previous_cost} onChange={(e) => set("previous_cost", e.target.value)} className="input" /></Field>
        <Field label="New Unit Cost" error={errors.new_cost}><input data-testid="cst-new-cost" type="number" min="0" step="any" value={f.new_cost} onChange={(e) => set("new_cost", e.target.value)} className="input" /></Field>
        <Field label="Quantity" error={errors.quantity}><input data-testid="cst-qty" type="number" min="0" step="any" value={f.quantity} onChange={(e) => set("quantity", e.target.value)} className="input" /></Field>
        <Field label="Currency">
          <select value={f.currency} onChange={(e) => set("currency", e.target.value)} className="input">
            {Object.keys(CURRENCIES).map((c) => <option key={c} value={c}>{c} ({CURRENCIES[c].symbol})</option>)}
          </select>
        </Field>
        <Field label="Date of Vendor Change" error={errors.change_date}><input type="date" value={f.change_date} onChange={(e) => set("change_date", e.target.value)} className="input" /></Field>
      </div>
      <div data-testid="cst-live" className={`rounded-md px-3 py-2.5 text-[12.5px] ${saved === null ? "bg-slate-50 text-slate-400" : saved >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
        {saved === null ? "Enter both costs and the quantity to see the saving." : saved >= 0
          ? <>Saved by changing vendor: <strong>{money(saved, f.currency)}</strong> ({pct.toFixed(1)}%)</>
          : <>Costs <strong>{money(-saved, f.currency)}</strong> more than before ({Math.abs(pct).toFixed(1)}% increase)</>}
      </div>
      <Field label="Remarks"><textarea rows={2} value={f.remarks} onChange={(e) => set("remarks", e.target.value)} className="input" placeholder="Reason for the change, quality notes…" /></Field>
      {errors._form && <div className="text-[12px] text-red-500">{errors._form}</div>}
    </Modal>
  );
}

export function CostingPage({ isAdmin, projects, notify }) {
  const { rows, loading, save, remove } = useDocs("costing_records", notify);
  const [form, setForm] = useState(null);
  const [view, setView] = useState(null);
  const [del, setDel] = useState(null);
  const [summary, setSummary] = useState(false);

  const totals = useMemo(() => {
    const t = {};
    rows.forEach((r) => { const c = r.currency || "INR"; t[c] = (t[c] || 0) + costSaving(r); });
    return t;
  }, [rows]);

  return (
    <div className="space-y-4">
      <PageHeader title="Costing — Vendor Change" icon={Wallet} isAdmin={isAdmin} createLabel="New Vendor Change" onCreate={() => setForm({ record: null })}
        hint="Log each vendor change with old and new unit cost; the amount saved is worked out for you and totalled below."
        extra={rows.length > 0 && (
          <button data-testid="cst-summary" onClick={() => setSummary(true)} className="flex items-center gap-1.5 text-[12.5px] text-slate-600 border border-slate-200 hover:border-turkish rounded-md px-3 py-2 cursor-pointer"><FileText size={14} /> Overall report</button>
        )} />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-3.5">
          <div className="text-[10.5px] uppercase tracking-wide text-slate-400">Vendor changes</div>
          <div className="text-[26px] font-mono font-semibold text-slate-800 mt-1" data-testid="cst-count">{rows.length}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-3.5 col-span-1 lg:col-span-2">
          <div className="text-[10.5px] uppercase tracking-wide text-slate-400">Total saved</div>
          <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1" data-testid="cst-total">
            {Object.keys(totals).length === 0 && <span className="text-[26px] font-mono font-semibold text-slate-300">—</span>}
            {Object.entries(totals).map(([c, v]) => (
              <span key={c} className={`text-[26px] font-mono font-semibold ${v >= 0 ? "text-emerald-600" : "text-red-600"}`}>{money(v, c)}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]" data-testid="cst-table">
            <thead><tr className="bg-slate-50 text-left text-[11px] text-slate-400 uppercase tracking-wide">
              <Th>Ref</Th><Th>Item / Part</Th><Th>Vendor Change</Th><Th>Date</Th><Th right>Unit Cost (old → new)</Th><Th right>Qty</Th><Th right>Saved</Th><Th right>Actions</Th>
            </tr></thead>
            <tbody>
              {rows.length === 0 && <Empty cols={8} loading={loading} text={"No vendor changes recorded yet." + (isAdmin ? " Use New Vendor Change to add one." : "")} />}
              {rows.map((r) => {
                const s = costSaving(r);
                return (
                  <tr key={r.id} className="border-t border-slate-50 hover:bg-slate-50/60">
                    <td className="px-3 py-2.5 font-mono text-slate-500">{r.ref}</td>
                    <td className="px-3 py-2.5 text-slate-700">{r.item}{r.project_name && <div className="text-[11px] text-slate-400">{r.project_name}</div>}</td>
                    <td className="px-3 py-2.5 text-slate-500">{r.previous_vendor} → {r.new_vendor}</td>
                    <td className="px-3 py-2.5 font-mono text-slate-500">{r.change_date}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-500 whitespace-nowrap">{money(r.previous_cost, r.currency)} → {money(r.new_cost, r.currency)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-500">{r.quantity}</td>
                    <td className={`px-3 py-2.5 text-right font-mono font-semibold whitespace-nowrap ${s >= 0 ? "text-emerald-600" : "text-red-600"}`}>{money(s, r.currency)}</td>
                    <td className="px-3 py-2.5"><RowActions isAdmin={isAdmin} label={r.ref} notify={notify} model={costingModel(r)} onView={() => setView(r)} onEdit={() => setForm({ record: r })} onDelete={() => setDel(r)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {form && (
        <CostingForm initial={form.record} rows={rows} projects={projects} onClose={() => setForm(null)}
          onSave={async (row) => { const res = await save(row); if (!res.error) { notify && notify(form.record ? "Vendor change updated." : "Vendor change saved."); setForm(null); } return res; }} />
      )}
      {view && <PreviewModal title={`Costing ${view.ref || ""}`} html={costingHtml(view, logoUrl())} model={costingModel(view)} onClose={() => setView(null)} notify={notify} />}
      {summary && <OverallReport kind="cost" rows={rows} onClose={() => setSummary(false)} notify={notify} />}
      {del && (
        <ConfirmModal title="Delete vendor change?" message={`Delete ${del.ref} (${del.item})? This cannot be undone.`} onCancel={() => setDel(null)}
          onConfirm={async () => { const r = del; setDel(null); const res = await remove(r.id); notify && notify(res.error ? "Could not delete: " + res.error : "Vendor change deleted."); }} />
      )}
    </div>
  );
}

/* =============================== Bottleneck ============================== */

function BottleneckForm({ initial, rows, projects, onClose, onSave }) {
  const [f, setF] = useState(() => initial
    ? { ...initial, improvements: [...(initial.improvements || [])], points: (initial.points || []).map((p) => ({ ...p })) }
    : { project_name: "", duration: "", improvements: [""], points: [{ bottleneck: "", solution: "" }] });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  // Picking an existing project fills its name and duration (still editable).
  const pickProject = (id) => {
    const p = (projects || []).find((x) => x.id === id);
    if (!p) return;
    setF((x) => ({ ...x, project_name: p.name, duration: p.startDate && p.endDate ? `${durationDays(p.startDate, p.endDate)} days` : x.duration }));
  };
  const setImp = (i, v) => setF((x) => ({ ...x, improvements: x.improvements.map((t, j) => (j === i ? v : t)) }));
  const setPoint = (i, k, v) => setF((x) => ({ ...x, points: x.points.map((p, j) => (j === i ? { ...p, [k]: v } : p)) }));

  const submit = async () => {
    const e = {};
    if (!f.project_name.trim()) e.project_name = "Project name is required.";
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const now = nowISO();
    const row = {
      ...f,
      project_name: f.project_name.trim(), duration: (f.duration || "").trim(),
      improvements: f.improvements.map((t) => t.trim()).filter(Boolean),
      points: f.points.map((p) => ({ bottleneck: p.bottleneck.trim(), solution: p.solution.trim() })).filter((p) => p.bottleneck || p.solution),
      id: f.id || newId("BN"), ref: f.ref || nextRef("BN", rows),
      created_at: f.created_at || now, updated_at: now,
    };
    const res = await onSave(row);
    setBusy(false);
    if (res.error) setErrors({ _form: res.error });
  };

  return (
    <Modal
      title={initial ? `Edit ${initial.ref || "study"}` : "New Project Study"} icon={Gauge} wide onClose={onClose}
      footer={<>
        <button onClick={onClose} className="text-[13px] px-3.5 py-1.5 rounded-md text-slate-500 hover:bg-slate-100 cursor-pointer">Cancel</button>
        <button data-testid="doc-save" disabled={busy} onClick={submit} className="text-[13px] px-4 py-1.5 rounded-md bg-turkish hover:bg-turkish-deep text-white font-medium cursor-pointer disabled:opacity-60">Save</button>
      </>}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <Field label="Fill from an existing project (optional)">
            <select data-testid="bn-pick" defaultValue="" onChange={(e) => pickProject(e.target.value)} className="input">
              <option value="">— Choose a project to pre-fill name and duration —</option>
              {(projects || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Project Name" error={errors.project_name}>
          <input data-testid="bn-project" value={f.project_name} onChange={(e) => set("project_name", e.target.value)} className="input" placeholder="e.g. AMR Chassis Build" />
        </Field>
        <Field label="Duration">
          <input data-testid="bn-duration" value={f.duration} onChange={(e) => set("duration", e.target.value)} className="input" placeholder="e.g. 6 weeks" />
        </Field>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[11.5px] font-medium text-slate-500">Improvements</label>
          <button type="button" data-testid="bn-add-imp" onClick={() => set("improvements", [...f.improvements, ""])} className="text-[11.5px] text-turkish-deep hover:underline cursor-pointer flex items-center gap-1"><Plus size={12} /> Add improvement</button>
        </div>
        <div className="space-y-2">
          {f.improvements.map((t, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400 w-5 text-right">{i + 1}.</span>
              <input data-testid={`bn-imp-${i}`} value={t} onChange={(e) => setImp(i, e.target.value)} className="input flex-1" placeholder="Describe the improvement" />
              {f.improvements.length > 1 && <button type="button" aria-label="Remove improvement" onClick={() => set("improvements", f.improvements.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500 cursor-pointer"><X size={14} /></button>}
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[11.5px] font-medium text-slate-500">Bottleneck points &amp; solutions</label>
          <button type="button" data-testid="bn-add-point" onClick={() => set("points", [...f.points, { bottleneck: "", solution: "" }])} className="text-[11.5px] text-turkish-deep hover:underline cursor-pointer flex items-center gap-1"><Plus size={12} /> Add bottleneck</button>
        </div>
        <div className="space-y-2">
          {f.points.map((p, i) => (
            <div key={i} className="grid grid-cols-[20px_1fr_1fr_16px] gap-2 items-start">
              <span className="text-[11px] text-slate-400 pt-2 text-right">{i + 1}.</span>
              <textarea data-testid={`bn-point-${i}`} rows={2} value={p.bottleneck} onChange={(e) => setPoint(i, "bottleneck", e.target.value)} className="input" placeholder="Bottleneck point" />
              <textarea data-testid={`bn-solution-${i}`} rows={2} value={p.solution} onChange={(e) => setPoint(i, "solution", e.target.value)} className="input" placeholder="Solution" />
              {f.points.length > 1 ? <button type="button" aria-label="Remove bottleneck" onClick={() => set("points", f.points.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500 pt-2 cursor-pointer"><X size={14} /></button> : <span />}
            </div>
          ))}
        </div>
      </div>
      {errors._form && <div className="text-[12px] text-red-500">{errors._form}</div>}
    </Modal>
  );
}

export function BottleneckPage({ isAdmin, projects, notify }) {
  const { rows, loading, save, remove } = useDocs("bottleneck_studies", notify);
  const [form, setForm] = useState(null);
  const [view, setView] = useState(null);
  const [del, setDel] = useState(null);

  return (
    <div className="space-y-4">
      <PageHeader title="Bottleneck — Project Studies" icon={Gauge} isAdmin={isAdmin} createLabel="New Project Study" onCreate={() => setForm({ record: null })}
        hint="Enter the project, its duration, the improvements made and each bottleneck with its solution — the study is laid out as a document you can download as Word or PDF." />
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]" data-testid="bn-table">
            <thead><tr className="bg-slate-50 text-left text-[11px] text-slate-400 uppercase tracking-wide">
              <Th>Ref</Th><Th>Project Name</Th><Th>Duration</Th><Th>Improvements</Th><Th>Bottlenecks</Th><Th right>Actions</Th>
            </tr></thead>
            <tbody>
              {rows.length === 0 && <Empty cols={6} loading={loading} text={"No project studies yet." + (isAdmin ? " Use New Project Study to add one." : "")} />}
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-50 hover:bg-slate-50/60">
                  <td className="px-3 py-2.5 font-mono text-slate-500">{r.ref}</td>
                  <td className="px-3 py-2.5 text-slate-700">{r.project_name}</td>
                  <td className="px-3 py-2.5 text-slate-500">{r.duration || "—"}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-500">{(r.improvements || []).length}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-500">{(r.points || []).length}</td>
                  <td className="px-3 py-2.5"><RowActions isAdmin={isAdmin} label={r.ref} notify={notify} model={bottleneckModel(r)} onView={() => setView(r)} onEdit={() => setForm({ record: r })} onDelete={() => setDel(r)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {form && (
        <BottleneckForm initial={form.record} rows={rows} projects={projects} onClose={() => setForm(null)}
          onSave={async (row) => { const res = await save(row); if (!res.error) { notify && notify(form.record ? "Project study updated." : "Project study saved."); setForm(null); } return res; }} />
      )}
      {view && <PreviewModal title={`Project study ${view.ref || ""}`} html={bottleneckHtml(view, logoUrl())} model={bottleneckModel(view)} onClose={() => setView(null)} notify={notify} />}
      {del && (
        <ConfirmModal title="Delete project study?" message={`Delete ${del.ref} (${del.project_name})? This cannot be undone.`} onCancel={() => setDel(null)}
          onConfirm={async () => { const r = del; setDel(null); const res = await remove(r.id); notify && notify(res.error ? "Could not delete: " + res.error : "Project study deleted."); }} />
      )}
    </div>
  );
}


/* ============================ Scrap / Wastage ============================ */
// One scrap record = one project with one or more components. Each component
// has a material and a weight; its loss = weight (in kg) x the material's
// current market cost per kg (set in "Materials & market cost" on this page).

const r2 = (n) => Math.round(n * 100) / 100;
const newKey = () => Math.random().toString(36).slice(2, 9);
const blankItem = () => ({ _k: newKey(), component: "", material_name: "", weight: "", weight_unit: "kg", price_per_kg: 0, amount: "", currency: "INR" });

// Price one component line from the material list.
function priceItem(it, materials) {
  const m = (materials || []).find((x) => norm(x.name) === norm(it.material_name));
  const pk = m ? Number(m.price_per_kg) || 0 : 0;
  if (!m || pk <= 0) return { ...it, price_per_kg: 0 };
  return { ...it, price_per_kg: pk, currency: m.currency || "INR", amount: r2(itemKg(it) * pk) };
}

function histChange(hist) {
  const h = Array.isArray(hist) ? hist : [];
  if (h.length < 2) return null;
  const prev = Number(h[h.length - 2].price), cur = Number(h[h.length - 1].price);
  if (cur === prev) return { dir: "No change", pct: 0 };
  return { dir: cur > prev ? "Increase" : "Decrease", pct: prev > 0 ? ((cur - prev) / prev) * 100 : null };
}
function ChangeBadge({ a }) {
  if (!a) return <span className="text-[11px] text-slate-300">—</span>;
  const pct = a.pct == null ? "" : ` ${a.pct >= 0 ? "+" : ""}${a.pct.toFixed(1)}%`;
  if (a.dir === "Increase") return <span className="inline-flex items-center gap-0.5 text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-600 whitespace-nowrap"><ArrowUp size={11} />Increase{pct}</span>;
  if (a.dir === "Decrease") return <span className="inline-flex items-center gap-0.5 text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 whitespace-nowrap"><ArrowDown size={11} />Decrease{pct}</span>;
  return <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 whitespace-nowrap">No change</span>;
}

function MaterialForm({ initial, materials, presetName, onClose, onSave }) {
  const [f, setF] = useState(() => initial
    ? { name: initial.name, price_per_kg: initial.price_per_kg, currency: initial.currency || "INR" }
    : { name: presetName || "", price_per_kg: "", currency: "INR" });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const submit = async () => {
    const e = {};
    const name = String(f.name || "").trim();
    if (!name) e.name = "Material name is required.";
    else if ((materials || []).some((m) => norm(m.name) === norm(name) && (!initial || m.id !== initial.id))) e.name = "This material already exists.";
    if (f.price_per_kg === "" || !(Number(f.price_per_kg) >= 0)) e.price = "Enter the cost per kg.";
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const now = nowISO(), price = Number(f.price_per_kg);
    const hist = Array.isArray(initial?.history) ? initial.history : [];
    const row = initial
      ? { ...initial, name, price_per_kg: price, currency: f.currency, updated_at: now,
          history: price !== Number(initial.price_per_kg) ? [...hist, { date: todayISO(), price }] : hist }
      : { id: newId("MAT"), name, price_per_kg: price, currency: f.currency, history: [{ date: todayISO(), price }], created_at: now, updated_at: now };
    const res = await onSave(row);
    setBusy(false);
    if (res.error) setErrors({ _form: res.error });
  };

  return (
    <Modal title={initial ? "Edit material" : "New material"} icon={Boxes} onClose={onClose}
      footer={<>
        <button onClick={onClose} className="text-[13px] px-3.5 py-1.5 rounded-md text-slate-500 hover:bg-slate-100 cursor-pointer">Cancel</button>
        <button data-testid="mat-save" disabled={busy} onClick={submit} className="text-[13px] px-4 py-1.5 rounded-md bg-turkish hover:bg-turkish-deep text-white font-medium cursor-pointer disabled:opacity-60">Save</button>
      </>}>
      <Field label="Material Name" error={errors.name}>
        <input data-testid="mat-name" value={f.name} onChange={(e) => set("name", e.target.value)} className="input" placeholder="e.g. MS, SS, Aluminium, Copper" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Current market cost per kg" error={errors.price}>
          <input data-testid="mat-price" type="number" min="0" step="any" value={f.price_per_kg} onChange={(e) => set("price_per_kg", e.target.value)} className="input" />
        </Field>
        <Field label="Currency">
          <select value={f.currency} onChange={(e) => set("currency", e.target.value)} className="input">
            {Object.keys(CURRENCIES).map((c) => <option key={c} value={c}>{c} ({CURRENCIES[c].symbol})</option>)}
          </select>
        </Field>
      </div>
      <div className="text-[11.5px] text-slate-400">Changing the cost later keeps a history and shows Increase / Decrease. Scrap records already saved keep the cost they were calculated with.</div>
      {errors._form && <div className="text-[12px] text-red-500">{errors._form}</div>}
    </Modal>
  );
}

function MaterialsPanel({ isAdmin, store, notify }) {
  const [form, setForm] = useState(null);   // { record, preset }
  const [del, setDel] = useState(null);
  const list = useMemo(() => [...store.rows].sort((a, b) => String(a.name).toLowerCase().localeCompare(String(b.name).toLowerCase())), [store.rows]);
  return (
    <div className="bg-white rounded-lg border border-slate-200" data-testid="materials-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
        <div>
          <div className="text-[13px] font-display font-semibold text-slate-800">Materials &amp; current market cost</div>
          <div className="text-[11.5px] text-slate-400">Set each material's cost per kg. Scrap loss = weight (in kg) × this cost, worked out automatically.</div>
        </div>
        {isAdmin && (
          <button data-testid="mat-add" onClick={() => setForm({ record: null, preset: "" })} className="flex items-center gap-1.5 text-[12.5px] text-slate-600 border border-slate-200 hover:border-turkish rounded-md px-3 py-1.5 cursor-pointer"><Plus size={13} /> Add material</button>
        )}
      </div>
      {list.length === 0 ? (
        <div className="px-4 py-5 text-[12.5px] text-slate-400">
          {store.loading ? "Loading…" : "No materials yet."}
          {!store.loading && isAdmin && (
            <span> Quick add:{" "}
              {["MS", "SS", "Aluminium", "Copper"].map((n) => (
                <button key={n} onClick={() => setForm({ record: null, preset: n })} className="mx-1 px-2 py-0.5 rounded-full border border-slate-200 text-slate-600 hover:border-turkish cursor-pointer">{n}</button>
              ))}
            </span>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]" data-testid="mat-table">
            <thead><tr className="bg-slate-50 text-left text-[11px] text-slate-400 uppercase tracking-wide">
              <Th>Material</Th><Th right>Cost per kg</Th><Th>Last change</Th><Th>Updated</Th><Th right>Actions</Th>
            </tr></thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.id} className="border-t border-slate-50 hover:bg-slate-50/60">
                  <td className="px-3 py-2.5 text-slate-700 font-medium">{m.name}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-700 whitespace-nowrap">{money(m.price_per_kg, m.currency)} / kg</td>
                  <td className="px-3 py-2.5"><ChangeBadge a={histChange(m.history)} /></td>
                  <td className="px-3 py-2.5 font-mono text-slate-400">{(m.updated_at || "").slice(0, 10)}</td>
                  <td className="px-3 py-2.5">
                    {isAdmin && (
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setForm({ record: m })} aria-label={`Edit ${m.name}`} title="Edit cost" className="p-1.5 rounded hover:bg-slate-100 text-slate-500 cursor-pointer"><Pencil size={13} /></button>
                        <button onClick={() => setDel(m)} aria-label={`Delete ${m.name}`} title="Delete" className="p-1.5 rounded hover:bg-red-50 text-slate-500 hover:text-red-500 cursor-pointer"><Trash2 size={13} /></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {form && (
        <MaterialForm initial={form.record} presetName={form.preset} materials={store.rows} onClose={() => setForm(null)}
          onSave={async (row) => { const res = await store.save(row); if (!res.error) { notify && notify(form.record ? "Material updated." : "Material added."); setForm(null); } return res; }} />
      )}
      {del && (
        <ConfirmModal title="Delete material?" message={`Delete ${del.name}? Scrap records already saved keep their figures.`} onCancel={() => setDel(null)}
          onConfirm={async () => { const m = del; setDel(null); const res = await store.remove(m.id); notify && notify(res.error ? "Could not delete: " + res.error : "Material deleted."); }} />
      )}
    </div>
  );
}

function ScrapForm({ initial, rows, projects, materials, onClose, onSave }) {
  const [f, setF] = useState(() => initial ? { ...initial } : {
    scrap_date: todayISO(), project_name: "", designer_name: "", downtime_value: "", downtime_unit: "Hours",
  });
  const [items, setItems] = useState(() => (initial ? scrapItems(initial).map((it) => ({ ...it, _k: newKey() })) : [blankItem()]));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  // reprice = true when material / weight / unit changed: amount is recalculated
  const change = (k, patch, reprice) => setItems((list) => list.map((it) => (it._k !== k ? it : (reprice ? priceItem({ ...it, ...patch }, materials) : { ...it, ...patch }))));
  const matNames = (materials || []).map((m) => m.name);

  const kgTotal = items.reduce((a, it) => a + itemKg(it), 0);
  const lossTotals = {};
  items.forEach((it) => { const c = it.currency || "INR"; lossTotals[c] = (lossTotals[c] || 0) + (Number(it.amount) || 0); });

  const submit = async () => {
    const e = {};
    if (!f.scrap_date) e.scrap_date = "Date is required.";
    if (!String(f.project_name || "").trim()) e.project_name = "Project name is required.";
    if (!String(f.designer_name || "").trim()) e.designer_name = "Designer name is required.";
    if (f.downtime_value === "" || !(Number(f.downtime_value) >= 0)) e.downtime_value = "Enter the downtime (0 if none).";
    const bad = items.findIndex((it) => !String(it.material_name || "").trim() || it.weight === "" || !(Number(it.weight) >= 0) || it.amount === "" || !(Number(it.amount) >= 0));
    if (bad >= 0) e.items = `Component ${bad + 1}: choose a material, enter the weight${items[bad].price_per_kg > 0 ? "" : " and the amount loss"}.`;
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const now = nowISO();
    const comps = items.map((it) => ({
      component: String(it.component || "").trim(), material_name: it.material_name.trim(), weight: Number(it.weight), weight_unit: it.weight_unit,
      price_per_kg: Number(it.price_per_kg) || 0, amount: Number(it.amount), currency: it.currency || "INR",
    }));
    const row = {
      ...f,
      project_name: f.project_name.trim(), designer_name: f.designer_name.trim(), downtime_value: Number(f.downtime_value),
      components: comps,
      // totals kept on the record for lists and older reports
      material_name: [...new Set(comps.map((c) => c.material_name))].join(", "),
      weight: Number(kgTotal.toFixed(3)), weight_unit: "kg",
      amount_loss: r2(comps.reduce((a, c) => a + c.amount, 0)), currency: comps[0].currency,
      id: f.id || newId("SCR"), ref: f.ref || nextRef("SCR", rows),
      created_at: f.created_at || now, updated_at: now,
    };
    const res = await onSave(row);
    setBusy(false);
    if (res.error) setErrors({ _form: res.error });
  };

  return (
    <Modal wide
      title={initial ? `Edit ${initial.ref || "scrap record"}` : "New Scrap / Wastage"} icon={Boxes} onClose={onClose}
      footer={<>
        <button onClick={onClose} className="text-[13px] px-3.5 py-1.5 rounded-md text-slate-500 hover:bg-slate-100 cursor-pointer">Cancel</button>
        <button data-testid="doc-save" disabled={busy} onClick={submit} className="text-[13px] px-4 py-1.5 rounded-md bg-turkish hover:bg-turkish-deep text-white font-medium cursor-pointer disabled:opacity-60">Save</button>
      </>}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Date" error={errors.scrap_date}><input type="date" value={f.scrap_date} onChange={(e) => set("scrap_date", e.target.value)} className="input" /></Field>
        <Field label="Project Name" error={errors.project_name}>
          <input data-testid="scr-project" value={f.project_name} list="scr-projects" onChange={(e) => set("project_name", e.target.value)} className="input" placeholder="Choose or type" />
          <datalist id="scr-projects">{(projects || []).map((p) => <option key={p.id} value={p.name} />)}</datalist>
        </Field>
        <Field label="Designer Name" error={errors.designer_name}><input data-testid="scr-designer" value={f.designer_name} onChange={(e) => set("designer_name", e.target.value)} className="input" /></Field>
        <Field label="Downtime Duration" error={errors.downtime_value}>
          <div className="flex gap-2">
            <input data-testid="scr-downtime" type="number" min="0" step="any" value={f.downtime_value} onChange={(e) => set("downtime_value", e.target.value)} className="input flex-1" />
            <select value={f.downtime_unit} onChange={(e) => set("downtime_unit", e.target.value)} className="input w-28">
              {Object.keys(DOWNTIME_UNITS).map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </Field>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11.5px] font-medium text-slate-500">Components</div>
          <button type="button" data-testid="scr-add-component" onClick={() => setItems((l) => [...l, blankItem()])} className="flex items-center gap-1 text-[12px] text-turkish-deep hover:underline cursor-pointer"><Plus size={13} /> Add component</button>
        </div>
        {matNames.length === 0 && <div className="text-[11.5px] text-amber-600 mb-2">No materials yet — add them first under “Materials &amp; market cost” on this page so the loss can be calculated.</div>}
        <div className="space-y-2.5">
          {items.map((it, i) => {
            const priced = Number(it.price_per_kg) > 0;
            return (
              <div key={it._k} className="border border-slate-200 rounded-md p-2.5" data-testid={`scr-comp-${i}`}>
                <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                  <div className="md:col-span-3">
                    <label className="text-[10.5px] text-slate-400 block mb-0.5">Component</label>
                    <input value={it.component || ""} onChange={(e) => change(it._k, { component: e.target.value }, false)} className="input" placeholder="e.g. Bracket" aria-label={`Component ${i + 1} name`} />
                  </div>
                  <div className="md:col-span-3">
                    <label className="text-[10.5px] text-slate-400 block mb-0.5">Material</label>
                    <select data-testid={`scr-mat-${i}`} value={it.material_name} onChange={(e) => change(it._k, { material_name: e.target.value }, true)} className="input" aria-label={`Component ${i + 1} material`}>
                      <option value="">Select…</option>
                      {it.material_name && !matNames.some((n) => norm(n) === norm(it.material_name)) && <option value={it.material_name}>{it.material_name}</option>}
                      {matNames.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div className="md:col-span-3">
                    <label className="text-[10.5px] text-slate-400 block mb-0.5">Weight</label>
                    <div className="flex gap-1.5">
                      <input data-testid={`scr-w-${i}`} type="number" min="0" step="any" value={it.weight} onChange={(e) => change(it._k, { weight: e.target.value }, true)} className="input flex-1 min-w-0" aria-label={`Component ${i + 1} weight`} />
                      <select value={it.weight_unit} onChange={(e) => change(it._k, { weight_unit: e.target.value }, true)} className="input w-[68px]" aria-label="Weight unit">
                        {Object.keys(WEIGHT_UNITS).map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="md:col-span-3 flex items-end gap-1.5">
                    <div className="flex-1 min-w-0">
                      <label className="text-[10.5px] text-slate-400 block mb-0.5">Amount loss{priced ? ` (${money(it.price_per_kg, it.currency)}/kg)` : ""}</label>
                      <input data-testid={`scr-amt-${i}`} type="number" min="0" step="any" value={it.amount} readOnly={priced}
                        onChange={(e) => change(it._k, { amount: e.target.value }, false)}
                        className={`input w-full ${priced ? "bg-slate-50 font-semibold text-red-600" : ""}`} aria-label={`Component ${i + 1} amount loss`} />
                    </div>
                    {items.length > 1 && (
                      <button type="button" onClick={() => setItems((l) => l.filter((x) => x._k !== it._k))} aria-label={`Remove component ${i + 1}`} title="Remove component" className="p-2 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 cursor-pointer"><Trash2 size={14} /></button>
                    )}
                  </div>
                </div>
                {it.material_name && !priced && <div className="text-[11px] text-slate-400 mt-1.5">No cost per kg set for this material — enter the amount manually, or set the cost under Materials &amp; market cost.</div>}
              </div>
            );
          })}
        </div>
        {errors.items && <div className="text-[11px] text-red-500 mt-1.5">{errors.items}</div>}
        <div className="flex flex-wrap items-center justify-between gap-2 mt-3 px-3 py-2 rounded-md bg-slate-50 text-[12.5px]" data-testid="scr-total">
          <span className="text-slate-500">Total weight <span className="font-mono font-semibold text-slate-700">{Number(kgTotal.toFixed(3)).toLocaleString("en-IN")} kg</span></span>
          <span className="text-slate-500">Total loss{" "}
            {Object.keys(lossTotals).length === 0 ? "—" : Object.entries(lossTotals).map(([c, v]) => <span key={c} className="font-mono font-semibold text-red-600 ml-1">{money(v, c)}</span>)}
          </span>
        </div>
      </div>
      {errors._form && <div className="text-[12px] text-red-500">{errors._form}</div>}
    </Modal>
  );
}

export function ScrapPage({ isAdmin, projects, notify }) {
  const { rows, loading, save, remove } = useDocs("scrap_wastage", notify);
  const mats = useDocs("scrap_materials", notify);
  const [form, setForm] = useState(null);
  const [view, setView] = useState(null);
  const [del, setDel] = useState(null);
  const [summary, setSummary] = useState(false);
  const totals = useMemo(() => scrapTotals(rows), [rows]);

  return (
    <div className="space-y-4">
      <PageHeader title="Scrap / Wastage" icon={Boxes} isAdmin={isAdmin} createLabel="New Scrap Record" onCreate={() => setForm({ record: null })}
        hint="Add the components scrapped on a project with their material and weight. The loss is worked out from each material's current market cost per kg. Open any record to download it as Word or PDF, or print it."
        extra={rows.length > 0 && (
          <button onClick={() => setSummary(true)} className="flex items-center gap-1.5 text-[12.5px] text-slate-600 border border-slate-200 hover:border-turkish rounded-md px-3 py-2 cursor-pointer"><FileText size={14} /> Overall report</button>
        )} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-3.5">
          <div className="text-[10.5px] uppercase tracking-wide text-slate-400">Records</div>
          <div className="text-[26px] font-mono font-semibold text-slate-800 mt-1">{rows.length}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-3.5">
          <div className="text-[10.5px] uppercase tracking-wide text-slate-400">Total scrap</div>
          <div className="text-[26px] font-mono font-semibold text-slate-800 mt-1">{rows.length ? `${Number(totals.kg.toFixed(2)).toLocaleString("en-IN")} kg` : "—"}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-3.5">
          <div className="text-[10.5px] uppercase tracking-wide text-slate-400">Total downtime</div>
          <div className="text-[26px] font-mono font-semibold text-slate-800 mt-1">{rows.length ? hoursText(totals.hrs) : "—"}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-3.5">
          <div className="text-[10.5px] uppercase tracking-wide text-slate-400">Total loss</div>
          <div className="mt-1 flex flex-wrap gap-x-4">
            {Object.keys(totals.loss).length === 0 && <span className="text-[26px] font-mono font-semibold text-slate-300">—</span>}
            {Object.entries(totals.loss).map(([c, v]) => <span key={c} className="text-[22px] font-mono font-semibold text-red-600">{money(v, c)}</span>)}
          </div>
        </div>
      </div>

      <MaterialsPanel isAdmin={isAdmin} store={mats} notify={notify} />

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]" data-testid="scr-table">
            <thead><tr className="bg-slate-50 text-left text-[11px] text-slate-400 uppercase tracking-wide">
              <Th>Ref</Th><Th>Date</Th><Th>Project</Th><Th>Components</Th><Th>Designer</Th><Th right>Weight</Th><Th right>Downtime</Th><Th right>Amount Loss</Th><Th right>Actions</Th>
            </tr></thead>
            <tbody>
              {rows.length === 0 && <Empty cols={9} loading={loading} text={"No scrap records yet." + (isAdmin ? " Use New Scrap Record to add one." : "")} />}
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-50 hover:bg-slate-50/60">
                  <td className="px-3 py-2.5 font-mono text-slate-500">{r.ref}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-500">{r.scrap_date}</td>
                  <td className="px-3 py-2.5 text-slate-700">{r.project_name}</td>
                  <td className="px-3 py-2.5 text-slate-500 whitespace-pre-line">{componentsText(r) || r.material_name}</td>
                  <td className="px-3 py-2.5 text-slate-500">{r.designer_name}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-500 whitespace-nowrap">{weightText(r)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-500 whitespace-nowrap">{downtimeText(r)}</td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold text-red-600 whitespace-pre-line">{Object.entries(scrapTotals([r]).loss).map(([c, v]) => money(v, c)).join("\n")}</td>
                  <td className="px-3 py-2.5"><RowActions isAdmin={isAdmin} label={r.ref} notify={notify} model={scrapModel(r)} onView={() => setView(r)} onEdit={() => setForm({ record: r })} onDelete={() => setDel(r)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {form && (
        <ScrapForm initial={form.record} rows={rows} projects={projects} materials={mats.rows} onClose={() => setForm(null)}
          onSave={async (row) => { const res = await save(row); if (!res.error) { notify && notify(form.record ? "Scrap record updated." : "Scrap record saved."); setForm(null); } return res; }} />
      )}
      {view && (() => { const m = scrapModel(view); return <PreviewModal title={`Scrap ${view.ref || ""}`} html={modelHtml(m, logoUrl())} model={m} onClose={() => setView(null)} notify={notify} />; })()}
      {summary && <OverallReport kind="scrap" rows={rows} onClose={() => setSummary(false)} notify={notify} />}
      {del && (
        <ConfirmModal title="Delete scrap record?" message={`Delete ${del.ref} (${del.project_name})? This cannot be undone.`} onCancel={() => setDel(null)}
          onConfirm={async () => { const r = del; setDel(null); const res = await remove(r.id); notify && notify(res.error ? "Could not delete: " + res.error : "Scrap record deleted."); }} />
      )}
    </div>
  );
}

/* ========================== Minutes of Meeting =========================== */
// One record = one meeting: attendees (1-15, Goat / External), project, date &
// time, points with summary / expected date / task owner, scope of work
// (Goat / Client) and a signature box for every attendee.

const blankAttendee = (org = "Goat") => ({ _k: newKey(), name: "", org, company: "", sig: "" });
const blankPoint = () => ({ _k: newKey(), point: "", summary: "", expected_date: "", owner: "" });
const blankScope = (party = "Goat") => ({ _k: newKey(), party, item: "" });
const stripKeys = (list) => list.map(({ _k, ...rest }) => rest);
const updater = (setter) => (k, patch) => setter((l) => l.map((x) => (x._k === k ? { ...x, ...patch } : x)));
const attendeeCounts = (r) => {
  const named = (r.attendees || []).filter((a) => String(a.name || "").trim());
  return { total: named.length, signed: named.filter((a) => a.sig).length, goat: named.filter((a) => a.org !== "External").length };
};

function MomForm({ initial, rows, projects, onClose, onSave }) {
  const [f, setF] = useState(() => (initial ? { ...initial } : { project_name: "", meeting_at: localDT() }));
  const [attendees, setAttendees] = useState(() => (initial && initial.attendees && initial.attendees.length ? initial.attendees.map((a) => ({ sig: "", company: "", ...a, _k: newKey() })) : [blankAttendee()]));
  const [points, setPoints] = useState(() => (initial && initial.points && initial.points.length ? initial.points.map((p) => ({ ...p, _k: newKey() })) : [blankPoint()]));
  const [scope, setScope] = useState(() => (initial ? (initial.scope || []).map((x) => ({ ...x, _k: newKey() })) : [blankScope()]));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const updA = updater(setAttendees), updP = updater(setPoints), updS = updater(setScope);

  const named = attendees.filter((a) => a.name.trim());
  const atMax = attendees.length >= MOM_MAX_ATTENDEES;

  const submit = async () => {
    const e = {};
    if (!String(f.project_name || "").trim()) e.project_name = "Project name is required.";
    if (!f.meeting_at) e.meeting_at = "Date and time are required.";
    if (named.length < 1) e.attendees = "Add at least one attendee with a name.";
    const pts = points.filter((p) => p.point.trim() || p.summary.trim());
    if (pts.length < 1) e.points = "Add at least one point to cover.";
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const now = nowISO();
    const row = {
      ...f,
      project_name: f.project_name.trim(),
      attendees: stripKeys(named).map((a) => ({ ...a, name: a.name.trim(), company: (a.company || "").trim() })),
      points: stripKeys(pts),
      scope: stripKeys(scope.filter((x) => x.item.trim())),
      id: f.id || newId("MOM"), ref: f.ref || nextRef("MOM", rows),
      created_at: f.created_at || now, updated_at: now,
    };
    const res = await onSave(row);
    setBusy(false);
    if (res.error) setErrors({ _form: res.error });
  };

  const iconBtn = "p-2 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 cursor-pointer";
  const addBtn = "flex items-center gap-1 text-[12px] text-turkish-deep hover:underline cursor-pointer disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed";

  return (
    <Modal
      title={initial ? `Edit ${initial.ref || "minutes"}` : "New Minutes of Meeting"} icon={Users} xl onClose={onClose}
      footer={<>
        <button onClick={onClose} className="text-[13px] px-3.5 py-1.5 rounded-md text-slate-500 hover:bg-slate-100 cursor-pointer">Cancel</button>
        <button data-testid="doc-save" disabled={busy} onClick={submit} className="text-[13px] px-4 py-1.5 rounded-md bg-turkish hover:bg-turkish-deep text-white font-medium cursor-pointer disabled:opacity-60">Save Minutes</button>
      </>}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Project Name" error={errors.project_name}>
          <input data-testid="mom-project" value={f.project_name || ""} list="mom-projects" onChange={(e) => set("project_name", e.target.value)} className="input" placeholder="Choose or type" />
          <datalist id="mom-projects">{(projects || []).map((p) => <option key={p.id} value={p.name} />)}</datalist>
        </Field>
        <Field label="Date & Time" error={errors.meeting_at}>
          <input data-testid="mom-datetime" type="datetime-local" value={f.meeting_at || ""} onChange={(e) => set("meeting_at", e.target.value)} className="input" />
        </Field>
      </div>

      {/* ------------------------------ attendees ------------------------------ */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11.5px] font-medium text-slate-500">Attendees <span className="text-slate-400">({attendees.length}/{MOM_MAX_ATTENDEES})</span></div>
          <button type="button" data-testid="mom-add-attendee" disabled={atMax} onClick={() => setAttendees((l) => [...l, blankAttendee()])} className={addBtn}><Plus size={13} /> Add attendee</button>
        </div>
        <div className="hidden md:grid grid-cols-12 gap-2 px-1 mb-1 text-[10.5px] text-slate-400">
          <div className="col-span-1">#</div><div className="col-span-4">Name</div><div className="col-span-2">Goat / External</div><div className="col-span-4">Company / Role (optional)</div>
        </div>
        <div className="space-y-2">
          {attendees.map((a, i) => (
            <div key={a._k} className="grid grid-cols-12 gap-2 items-center" data-testid={`mom-att-${i}`}>
              <div className="hidden md:block col-span-1 text-[12px] font-mono text-slate-400 pl-1">{i + 1}</div>
              <div className="col-span-12 md:col-span-4"><input value={a.name} onChange={(e) => updA(a._k, { name: e.target.value })} className="input" placeholder="Full name" aria-label={`Attendee ${i + 1} name`} /></div>
              <div className="col-span-5 md:col-span-2">
                <select value={a.org} onChange={(e) => updA(a._k, { org: e.target.value })} className="input" aria-label={`Attendee ${i + 1} Goat or External`}>
                  <option value="Goat">Goat</option><option value="External">External</option>
                </select>
              </div>
              <div className="col-span-6 md:col-span-4"><input value={a.company || ""} onChange={(e) => updA(a._k, { company: e.target.value })} className="input" placeholder={a.org === "External" ? "Company / designation" : "Designation"} aria-label={`Attendee ${i + 1} company or role`} /></div>
              <div className="col-span-1 flex justify-end">
                {attendees.length > 1 && <button type="button" onClick={() => setAttendees((l) => l.filter((x) => x._k !== a._k))} aria-label={`Remove attendee ${i + 1}`} title="Remove attendee" className={iconBtn}><Trash2 size={14} /></button>}
              </div>
            </div>
          ))}
        </div>
        {atMax && <div className="text-[11px] text-slate-400 mt-1.5">Maximum of {MOM_MAX_ATTENDEES} attendees reached.</div>}
        {errors.attendees && <div className="text-[11px] text-red-500 mt-1.5">{errors.attendees}</div>}
      </div>

      {/* ------------------------------- points -------------------------------- */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11.5px] font-medium text-slate-500">Points to cover &amp; meeting summary</div>
          <button type="button" data-testid="mom-add-point" onClick={() => setPoints((l) => [...l, blankPoint()])} className={addBtn}><Plus size={13} /> Add point</button>
        </div>
        <datalist id="mom-owners">{named.map((a) => <option key={a._k} value={a.name} />)}</datalist>
        <div className="space-y-2.5">
          {points.map((p, i) => (
            <div key={p._k} className="border border-slate-200 rounded-md p-2.5" data-testid={`mom-pt-${i}`}>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-start">
                <div className="md:col-span-3">
                  <label className="text-[10.5px] text-slate-400 block mb-0.5">Point {i + 1} to cover</label>
                  <textarea rows={2} value={p.point} onChange={(e) => updP(p._k, { point: e.target.value })} className="input" placeholder="Topic / agenda item" />
                </div>
                <div className="md:col-span-4">
                  <label className="text-[10.5px] text-slate-400 block mb-0.5">Meeting summary</label>
                  <textarea rows={2} value={p.summary} onChange={(e) => updP(p._k, { summary: e.target.value })} className="input" placeholder="What was discussed / decided" />
                </div>
                <div className="md:col-span-2">
                  <label className="text-[10.5px] text-slate-400 block mb-0.5">Expected date</label>
                  <input type="date" value={p.expected_date || ""} onChange={(e) => updP(p._k, { expected_date: e.target.value })} className="input" aria-label={`Point ${i + 1} expected date`} />
                </div>
                <div className="md:col-span-2">
                  <label className="text-[10.5px] text-slate-400 block mb-0.5">Task owner</label>
                  <input value={p.owner || ""} list="mom-owners" onChange={(e) => updP(p._k, { owner: e.target.value })} className="input" placeholder="Pick or type" aria-label={`Point ${i + 1} task owner`} />
                </div>
                <div className="md:col-span-1 flex md:justify-end md:pt-5">
                  {points.length > 1 && <button type="button" onClick={() => setPoints((l) => l.filter((x) => x._k !== p._k))} aria-label={`Remove point ${i + 1}`} title="Remove point" className={iconBtn}><Trash2 size={14} /></button>}
                </div>
              </div>
            </div>
          ))}
        </div>
        {errors.points && <div className="text-[11px] text-red-500 mt-1.5">{errors.points}</div>}
      </div>

      {/* --------------------------- scope of work ----------------------------- */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11.5px] font-medium text-slate-500">Scope of work</div>
          <div className="flex items-center gap-3">
            <button type="button" data-testid="mom-add-scope-goat" onClick={() => setScope((l) => [...l, blankScope("Goat")])} className={addBtn}><Plus size={13} /> Goat scope</button>
            <button type="button" data-testid="mom-add-scope-client" onClick={() => setScope((l) => [...l, blankScope("Client")])} className={addBtn}><Plus size={13} /> Client scope</button>
          </div>
        </div>
        {scope.length === 0 && <div className="text-[11.5px] text-slate-400">No scope items. Use “Goat scope” or “Client scope” to add one.</div>}
        <div className="space-y-2">
          {scope.map((x, i) => (
            <div key={x._k} className="flex items-center gap-2" data-testid={`mom-scope-${i}`}>
              <select value={x.party} onChange={(e) => updS(x._k, { party: e.target.value })} className="input w-28 shrink-0" aria-label={`Scope ${i + 1} responsibility`}>
                <option value="Goat">Goat</option><option value="Client">Client</option>
              </select>
              <input value={x.item} onChange={(e) => updS(x._k, { item: e.target.value })} className="input flex-1 min-w-0" placeholder="Scope of work item" aria-label={`Scope ${i + 1} item`} />
              <button type="button" onClick={() => setScope((l) => l.filter((y) => y._k !== x._k))} aria-label={`Delete scope item ${i + 1}`} title="Delete scope item" className={iconBtn}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      </div>

      {/* ----------------------------- signatures ------------------------------ */}
      <div>
        <div className="text-[11.5px] font-medium text-slate-500 mb-2">Attendee signatures</div>
        {named.length === 0
          ? <div className="text-[11.5px] text-slate-400">Enter attendee names above — a signature box appears here for each one.</div>
          : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {named.map((a) => (
                <div key={a._k} className="border border-slate-200 rounded-md p-2.5 space-y-2">
                  <div>
                    <div className="text-[12px] font-medium text-slate-700 truncate" title={a.name}>{a.name}</div>
                    <div className="text-[10.5px] text-slate-400 truncate">{a.org}{a.company ? ` · ${a.company}` : ""}</div>
                  </div>
                  <SignaturePad label={a.name} value={a.sig} onChange={(d) => updA(a._k, { sig: d })} />
                </div>
              ))}
            </div>
          )}
      </div>
      {errors._form && <div className="text-[12px] text-red-500">{errors._form}</div>}
    </Modal>
  );
}

export function MomPage({ isAdmin, projects, notify }) {
  const { rows, loading, save, remove } = useDocs("meeting_minutes", notify);
  const [form, setForm] = useState(null);
  const [view, setView] = useState(null);
  const [del, setDel] = useState(null);

  return (
    <div className="space-y-4">
      <PageHeader title="Minutes of Meeting" icon={Users} isAdmin={isAdmin} createLabel="New Minutes" onCreate={() => setForm({ record: null })}
        hint="Record who attended (Goat / External), the points covered with their summary, expected date and task owner, the scope of work, and collect each attendee's signature. Open any record to download it as Word or PDF, or print it." />
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]" data-testid="mom-table">
            <thead><tr className="bg-slate-50 text-left text-[11px] text-slate-400 uppercase tracking-wide">
              <Th>Ref</Th><Th>Date &amp; Time</Th><Th>Project</Th><Th>Attendees</Th><Th>Points</Th><Th>Signed</Th><Th right>Actions</Th>
            </tr></thead>
            <tbody>
              {rows.length === 0 && <Empty cols={7} loading={loading} text={"No meeting minutes yet." + (isAdmin ? " Use New Minutes to add one." : "")} />}
              {rows.map((r) => {
                const c = attendeeCounts(r);
                const done = c.total > 0 && c.signed === c.total;
                return (
                  <tr key={r.id} className="border-t border-slate-50 hover:bg-slate-50/60">
                    <td className="px-3 py-2.5 font-mono text-slate-500">{r.ref}</td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{fmtDateTime(r.meeting_at)}</td>
                    <td className="px-3 py-2.5 text-slate-700">{r.project_name}</td>
                    <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{c.total} <span className="text-slate-400">({c.goat} Goat, {c.total - c.goat} Ext)</span></td>
                    <td className="px-3 py-2.5 text-slate-500">{(r.points || []).length}</td>
                    <td className="px-3 py-2.5"><span className={`text-[11px] px-2 py-0.5 rounded-full ${done ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{c.signed}/{c.total}</span></td>
                    <td className="px-3 py-2.5"><RowActions isAdmin={isAdmin} label={r.ref} notify={notify} model={momModel(r)} onView={() => setView(r)} onEdit={() => setForm({ record: r })} onDelete={() => setDel(r)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {form && (
        <MomForm
          initial={form.record} rows={rows} projects={projects} onClose={() => setForm(null)}
          onSave={async (row) => { const res = await save(row); if (!res.error) { notify && notify(form.record ? "Minutes updated." : "Minutes saved."); setForm(null); } return res; }}
        />
      )}
      {view && (() => { const m = momModel(view); return <PreviewModal title={`Minutes ${view.ref || ""}`} html={modelHtml(m, logoUrl())} model={m} onClose={() => setView(null)} notify={notify} />; })()}
      {del && (
        <ConfirmModal title="Delete minutes?" message={`Delete ${del.ref} (${del.project_name})? This cannot be undone.`} onCancel={() => setDel(null)}
          onConfirm={async () => { const r = del; setDel(null); const res = await remove(r.id); notify && notify(res.error ? "Could not delete: " + res.error : "Minutes deleted."); }} />
      )}
    </div>
  );
}
