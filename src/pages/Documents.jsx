import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Plus, X, Trash2, Pencil, Eye, Printer, FileText, ClipboardCheck, Wallet, Gauge, CalendarDays,
} from "lucide-react";
import logo from "../assets/logo.png";
import { Field, SectionHeading, ConfirmModal, todayISO, durationDays } from "../shared";
import { fetchDocs, upsertDoc, deleteDoc, subscribeTable } from "../lib/db";
import {
  RCA_SIGNERS, rcaHtml, costingHtml, costingSummaryHtml, bottleneckHtml, printHtml,
  fmtDateTime, money, costSaving, costSavingPct, CURRENCIES,
} from "../lib/docHtml";

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

function Modal({ title, icon: Icon, onClose, children, footer, wide }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div role="dialog" aria-label={title} className={`bg-white rounded-lg w-full ${wide ? "max-w-3xl" : "max-w-lg"} max-h-[92vh] overflow-y-auto shadow-2xl`}>
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

// On-screen preview of the exact document that gets printed.
function PreviewModal({ title, html, onClose, notify }) {
  const doPrint = () => {
    if (!printHtml(html)) notify && notify("Pop-up blocked — allow pop-ups for this site to print or save as PDF.");
  };
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div role="dialog" aria-label={`${title} preview`} className="bg-white rounded-lg w-full max-w-4xl h-[92vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <div className="text-[14px] font-display font-semibold text-slate-800 flex items-center gap-1.5"><FileText size={16} className="text-turkish" /> {title}</div>
          <div className="flex items-center gap-2">
            <button data-testid="doc-print" onClick={doPrint} className="flex items-center gap-1.5 text-[12.5px] px-3.5 py-1.5 rounded-md bg-turkish hover:bg-turkish-deep text-white cursor-pointer">
              <Printer size={14} /> Print / Save as PDF
            </button>
            <button onClick={onClose} aria-label="Close preview" className="text-slate-400 hover:text-slate-600 cursor-pointer"><X size={18} /></button>
          </div>
        </div>
        <iframe data-testid="doc-frame" title={title} sandbox="" srcDoc={html} className="flex-1 w-full bg-slate-100 rounded-b-lg" />
      </div>
    </div>
  );
}

function RowActions({ isAdmin, onView, onEdit, onDelete, label }) {
  return (
    <div className="flex items-center justify-end gap-1">
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

/* ================================== RCA ================================== */

const localDT = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

function RcaForm({ initial, rows, defaultReporter, onClose, onSave }) {
  const [f, setF] = useState(() => initial ? { ...initial } : {
    incident_at: localDT(), reported_by: defaultReporter || "", location: "", description: "", explanation: "",
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

  const setSig = (key, data) => setF((x) => ({ ...x, [`${key}_sig`]: data, [`${key}_signed_at`]: data ? (x[`${key}_signed_at`] || nowISO()) : "" }));

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
        <div className="sm:col-span-2">
          <Field label="Location" error={errors.location}>
            <input data-testid="rca-location" value={f.location} onChange={(e) => set("location", e.target.value)} className="input" placeholder="e.g. Welding bay 2" />
          </Field>
        </div>
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
        <Field label="Fix Date"><input type="date" value={f.fix_date} onChange={(e) => set("fix_date", e.target.value)} className="input" /></Field>
        <Field label="Expected Date"><input type="date" value={f.expected_date} onChange={(e) => set("expected_date", e.target.value)} className="input" /></Field>
      </div>

      <div>
        <div className="text-[11.5px] font-medium text-slate-500 mb-2">Signatures</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {RCA_SIGNERS.map((s) => (
            <div key={s.key} className="border border-slate-200 rounded-md p-2.5 space-y-2">
              <div className="text-[12px] font-medium text-slate-700">{s.role}</div>
              <input value={f[`${s.key}_name`]} onChange={(e) => set(`${s.key}_name`, e.target.value)} className="input" placeholder="Name" aria-label={`${s.role} name`} />
              <SignaturePad label={s.role} value={f[`${s.key}_sig`]} onChange={(d) => setSig(s.key, d)} />
              {f[`${s.key}_signed_at`] && <div className="text-[10.5px] text-slate-400">Signed {fmtDateTime(f[`${s.key}_signed_at`])}</div>}
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
        hint="Record an incident, its explanation, corrective and preventive action, then collect the three sign-offs. Open any record to print it or save it as a PDF." />
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]" data-testid="rca-table">
            <thead><tr className="bg-slate-50 text-left text-[11px] text-slate-400 uppercase tracking-wide">
              <Th>Ref</Th><Th>Date &amp; Time</Th><Th>Reported By</Th><Th>Location</Th><Th>Description</Th><Th>Fix Date</Th><Th>Signed</Th><Th right>Actions</Th>
            </tr></thead>
            <tbody>
              {rows.length === 0 && <Empty cols={8} loading={loading} text={"No RCA records yet." + (isAdmin ? " Use New RCA to create the first one." : "")} />}
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-50 hover:bg-slate-50/60">
                  <td className="px-3 py-2.5 font-mono text-slate-500">{r.ref}</td>
                  <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{fmtDateTime(r.incident_at)}</td>
                  <td className="px-3 py-2.5 text-slate-700">{r.reported_by}</td>
                  <td className="px-3 py-2.5 text-slate-500">{r.location}</td>
                  <td className="px-3 py-2.5 text-slate-500 max-w-[240px] truncate" title={r.description}>{r.description}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-500">{r.fix_date || "—"}</td>
                  <td className="px-3 py-2.5"><span className={`text-[11px] px-2 py-0.5 rounded-full ${signedCount(r) === 3 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{signedCount(r)}/3</span></td>
                  <td className="px-3 py-2.5"><RowActions isAdmin={isAdmin} label={r.ref} onView={() => setView(r)} onEdit={() => setForm({ record: r })} onDelete={() => setDel(r)} /></td>
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
      {view && <PreviewModal title={`RCA ${view.ref || ""}`} html={rcaHtml(view, logoUrl())} onClose={() => setView(null)} notify={notify} />}
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
          <button data-testid="cst-summary" onClick={() => setSummary(true)} className="flex items-center gap-1.5 text-[12.5px] text-slate-600 border border-slate-200 hover:border-turkish rounded-md px-3 py-2 cursor-pointer"><FileText size={14} /> Summary report</button>
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
                    <td className="px-3 py-2.5"><RowActions isAdmin={isAdmin} label={r.ref} onView={() => setView(r)} onEdit={() => setForm({ record: r })} onDelete={() => setDel(r)} /></td>
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
      {view && <PreviewModal title={`Costing ${view.ref || ""}`} html={costingHtml(view, logoUrl())} onClose={() => setView(null)} notify={notify} />}
      {summary && <PreviewModal title="Costing summary" html={costingSummaryHtml(rows, logoUrl())} onClose={() => setSummary(false)} notify={notify} />}
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
        hint="Enter the project, its duration, the improvements made and each bottleneck with its solution — the study is laid out as a document you can print or save as a PDF." />
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
                  <td className="px-3 py-2.5"><RowActions isAdmin={isAdmin} label={r.ref} onView={() => setView(r)} onEdit={() => setForm({ record: r })} onDelete={() => setDel(r)} /></td>
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
      {view && <PreviewModal title={`Project study ${view.ref || ""}`} html={bottleneckHtml(view, logoUrl())} onClose={() => setView(null)} notify={notify} />}
      {del && (
        <ConfirmModal title="Delete project study?" message={`Delete ${del.ref} (${del.project_name})? This cannot be undone.`} onCancel={() => setDel(null)}
          onConfirm={async () => { const r = del; setDel(null); const res = await remove(r.id); notify && notify(res.error ? "Could not delete: " + res.error : "Project study deleted."); }} />
      )}
    </div>
  );
}
