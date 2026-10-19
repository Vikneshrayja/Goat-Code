import React, { useState, useMemo } from "react";
import { Plus, X, Trash2, Pencil, ListChecks, Users, CheckCircle2, UserPlus, AlertTriangle } from "lucide-react";
import {
  todayISO, durationDays, fmtShort, deptLabel, TASK_CATEGORIES, TASK_STATUSES,
  Field, SectionHeading, StatusTag, ConfirmModal,
} from "../shared";

const isActiveTask = (t) => t.status !== "Completed" && t.status !== "Cancelled";
const newId = (prefix) => prefix + "-" + Math.random().toString(36).slice(2, 8).toUpperCase();

/* ------------------------------ Assignee picker ---------------------------- */
// A dropdown of employees with the two extra actions the spec asks for:
// "Create Employee" and "Delete Employee" (also available as icon buttons,
// matching the Assignee Team control in the Feed Project reference design).
const CREATE_OPT = "__create__";
const DELETE_OPT = "__delete__";

function AssigneePicker({ value, onChange, employees, category, isAdmin, onCreate, onRequestDelete, error }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const open = (which) => {
    if (!isAdmin) return;
    if (which === CREATE_OPT) setAdding(true);
    else onRequestDelete(value);
  };
  const submit = async () => {
    const n = name.trim();
    if (!n) { setErr("Enter an employee name."); return; }
    if (employees.some((e) => e.name.toLowerCase() === n.toLowerCase() && (e.category || "") === category)) {
      setErr("An employee with this name already exists in this category."); return;
    }
    setBusy(true);
    try {
      const emp = await onCreate({ id: newId("E"), name: n, category });
      onChange(emp.id);
      setName(""); setAdding(false); setErr("");
    } catch (e) {
      setErr(e.message || "Could not save the employee.");
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <select
          value={value || ""}
          onChange={(e) => {
            const v = e.target.value;
            if (v === CREATE_OPT || v === DELETE_OPT) open(v); else onChange(v);
          }}
          className="input flex-1"
        >
          <option value="">Select an employee…</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.name}{e.category ? ` (${deptLabel(e.category)})` : ""}</option>
          ))}
          {isAdmin && <option disabled>──────────</option>}
          {isAdmin && <option value={CREATE_OPT}>＋ Create Employee</option>}
          {isAdmin && <option value={DELETE_OPT}>－ Delete Employee</option>}
        </select>
        {isAdmin && (
          <>
            <button type="button" title="Delete Employee" onClick={() => onRequestDelete(value)}
              className="w-[30px] h-[30px] shrink-0 rounded-md border border-slate-200 text-slate-400 hover:border-red-300 hover:text-red-500 flex items-center justify-center cursor-pointer">
              <Trash2 size={13} />
            </button>
            <button type="button" title="Create Employee" onClick={() => setAdding((v) => !v)}
              className="w-[30px] h-[30px] shrink-0 rounded-md border border-dashed border-slate-300 text-slate-400 hover:border-turkish hover:text-turkish flex items-center justify-center cursor-pointer">
              <Plus size={13} />
            </button>
          </>
        )}
      </div>
      {adding && (
        <div className="bg-slate-50 border border-slate-200 rounded-md p-2 space-y-1.5">
          <div className="text-[11px] text-slate-500">New employee — will be listed under <b>{deptLabel(category)}</b></div>
          <div className="flex items-center gap-1.5">
            <input autoFocus value={name} onChange={(e) => { setName(e.target.value); setErr(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } if (e.key === "Escape") setAdding(false); }}
              placeholder="Employee name" className="text-[11.5px] border border-slate-200 rounded px-2 py-1 flex-1 min-w-0 outline-none focus:border-turkish" />
            <button type="button" disabled={busy} onClick={submit} title="Save employee" className="w-6 h-6 rounded-full flex items-center justify-center bg-turkish hover:bg-turkish-deep text-white cursor-pointer shrink-0 disabled:opacity-50"><CheckCircle2 size={12} /></button>
            <button type="button" onClick={() => { setAdding(false); setErr(""); }} className="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer shrink-0"><X size={12} /></button>
          </div>
          {err && <div className="text-[11px] text-red-500">{err}</div>}
        </div>
      )}
      {error && <div className="text-[11px] text-red-500">{error}</div>}
    </div>
  );
}

/* --------------------------- Delete Employee dialog ------------------------ */

function DeleteEmployeeModal({ employees, tasks, projectsById, initialId, onClose, onDelete }) {
  const [id, setId] = useState(initialId || "");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const emp = employees.find((e) => e.id === id);
  const active = useMemo(() => tasks.filter((t) => t.employeeId === id && isActiveTask(t)), [tasks, id]);

  const run = async () => {
    try { await onDelete(emp); onClose(); }
    catch (e) { setConfirming(false); setError(e.message || "Could not delete the employee."); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[55] p-4">
      <div className="bg-white rounded-lg w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="text-[15px] font-display font-semibold text-slate-800 flex items-center gap-1.5"><Trash2 size={16} className="text-red-500" /> Delete Employee</div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <Field label="Select employee to remove">
            <select value={id} onChange={(e) => { setId(e.target.value); setError(""); }} className="input">
              <option value="">Select an employee…</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}{e.category ? ` (${deptLabel(e.category)})` : ""}</option>)}
            </select>
          </Field>
          {emp && active.length > 0 && (
            <div className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3">
              <div className="flex items-center gap-1.5 font-medium mb-1"><AlertTriangle size={13} /> {emp.name} has {active.length} active allocation{active.length > 1 ? "s" : ""}</div>
              <ul className="list-disc ml-5 space-y-0.5">
                {active.slice(0, 6).map((t) => <li key={t.id}>{t.name} — {projectsById[t.projectId]?.name || "No project"}</li>)}
              </ul>
              <div className="mt-1.5">Reassign these tasks to another employee (or mark them Completed) before deleting.</div>
            </div>
          )}
          {error && <div className="text-[11.5px] text-red-500">{error}</div>}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button onClick={onClose} className="text-[13px] px-3.5 py-1.5 rounded-md text-slate-500 hover:bg-slate-100 cursor-pointer">Cancel</button>
          <button
            disabled={!emp || active.length > 0}
            onClick={() => setConfirming(true)}
            className="text-[13px] px-4 py-1.5 rounded-md bg-red-500 hover:bg-red-600 text-white font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >Delete Employee</button>
        </div>
      </div>
      {confirming && emp && (
        <ConfirmModal title="Delete employee?" message={`Remove "${emp.name}" permanently? This cannot be undone.`} onCancel={() => setConfirming(false)} onConfirm={run} />
      )}
    </div>
  );
}

/* --------------------------------- Task form -------------------------------- */
// Layout follows the Feed Project reference modal.

export function TaskFormModal({ initial, projects, employees, isAdmin, defaultCategory, onClose, onSave, onCreateEmployee, onRequestDeleteEmployee }) {
  const [form, setForm] = useState(() => initial || {
    name: "", projectId: "", category: defaultCategory || TASK_CATEGORIES[0], employeeId: "",
    startDate: todayISO(), endDate: todayISO(), status: "Planned", remarks: "", progress: 0,
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const dur = form.startDate && form.endDate && form.endDate >= form.startDate ? durationDays(form.startDate, form.endDate) : null;

  const submit = async () => {
    const e = {};
    if (!form.name.trim()) e.name = "Task name is required.";
    if (!form.projectId) e.projectId = "Select a project.";
    if (!form.employeeId) e.employeeId = "Select an assignee.";
    if (!form.startDate) e.startDate = "Start date is required.";
    if (!form.endDate) e.endDate = "End date is required.";
    if (form.startDate && form.endDate && form.endDate < form.startDate) e.endDate = "End date must be on or after start date.";
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try { await onSave({ ...form, name: form.name.trim() }); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="text-[15px] font-display font-semibold text-slate-800 flex items-center gap-1.5">
            <ListChecks size={16} className="text-turkish" /> {initial ? "Edit Task" : "Feed Task"}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <Field label="Task Name" error={errors.name}>
            <input autoFocus value={form.name} onChange={(e) => set("name", e.target.value)} className="input" placeholder="e.g. Chassis plate milling" />
          </Field>
          <Field label="Project Name" error={errors.projectId}>
            <select value={form.projectId} onChange={(e) => set("projectId", e.target.value)} className="input">
              <option value="">Select a project…</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.projectNumber})</option>)}
            </select>
          </Field>
          <Field label="Manufacturing Category">
            <select value={form.category} onChange={(e) => set("category", e.target.value)} className="input">
              {TASK_CATEGORIES.map((c) => <option key={c} value={c}>{deptLabel(c)}</option>)}
            </select>
          </Field>
          <Field label="Assignee" error={errors.employeeId}>
            <AssigneePicker
              value={form.employeeId} onChange={(v) => set("employeeId", v)}
              employees={employees} category={form.category} isAdmin={isAdmin}
              onCreate={onCreateEmployee} onRequestDelete={onRequestDeleteEmployee}
            />
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
          <div className="grid grid-cols-2 gap-3">
            <Field label="Task Status">
              <select value={form.status} onChange={(e) => set("status", e.target.value)} className="input">
                {TASK_STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label={`Progress (${form.status === "Completed" ? 100 : form.progress || 0}%)`}>
              <input type="range" min="0" max="100" step="5" value={form.status === "Completed" ? 100 : form.progress || 0}
                onChange={(e) => set("progress", Number(e.target.value))} className="w-full accent-[#0ea5c4]" />
            </Field>
          </div>
          <Field label="Remarks">
            <textarea rows={2} value={form.remarks || ""} onChange={(e) => set("remarks", e.target.value)} className="input" placeholder="Optional notes" />
          </Field>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
          <button onClick={onClose} className="text-[13px] px-3.5 py-1.5 rounded-md text-slate-500 hover:bg-slate-100 cursor-pointer">Cancel</button>
          <button onClick={submit} disabled={saving} className="text-[13px] px-4 py-1.5 rounded-md bg-turkish hover:bg-turkish-deep text-white font-medium cursor-pointer disabled:opacity-60">Submit</button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- Task Feeds page ------------------------------ */

export function TaskFeedsPage({ projects, employees, tasks, isAdmin, actions }) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [delEmp, setDelEmp] = useState(null); // {id} when dialog open
  const [filter, setFilter] = useState("");

  const projectsById = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p])), [projects]);
  const empById = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e])), [employees]);
  const rows = useMemo(
    () => tasks.filter((t) => !filter || t.category === filter)
      .slice().sort((a, b) => (a.startDate || "").localeCompare(b.startDate || "")),
    [tasks, filter]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="input !w-auto">
            <option value="">All categories</option>
            {TASK_CATEGORIES.map((c) => <option key={c} value={c}>{deptLabel(c)}</option>)}
          </select>
          <span className="text-[12px] text-slate-400">{rows.length} task{rows.length !== 1 ? "s" : ""}</span>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <button onClick={() => setDelEmp({ id: "" })} className="flex items-center gap-1.5 text-[13px] font-medium px-3 py-2 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer">
              <Users size={14} /> Manage Employees
            </button>
            <button onClick={() => { setEditing(null); setFormOpen(true); }} className="flex items-center gap-1.5 bg-turkish hover:bg-turkish-deep text-white text-[13px] font-medium px-4 py-2 rounded-md cursor-pointer">
              <Plus size={15} /> Feed Task
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="bg-slate-50 text-left text-[11px] text-slate-400 uppercase tracking-wide">
                <th className="px-3 py-2.5 font-medium">Task</th>
                <th className="px-3 py-2.5 font-medium">Project</th>
                <th className="px-3 py-2.5 font-medium">Category</th>
                <th className="px-3 py-2.5 font-medium">Assignee</th>
                <th className="px-3 py-2.5 font-medium">Start</th>
                <th className="px-3 py-2.5 font-medium">End</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">Remarks</th>
                {isAdmin && <th className="px-3 py-2.5 font-medium text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={9} className="text-center text-slate-400 py-8">No tasks yet.{isAdmin ? " Use Feed Task to create one." : ""}</td></tr>}
              {rows.map((t) => (
                <tr key={t.id} className="border-t border-slate-50 hover:bg-slate-50/60">
                  <td className="px-3 py-2.5 font-medium text-slate-700">{t.name}</td>
                  <td className="px-3 py-2.5 text-slate-500">{projectsById[t.projectId]?.name || "—"}</td>
                  <td className="px-3 py-2.5 text-slate-500">{deptLabel(t.category)}</td>
                  <td className="px-3 py-2.5 text-slate-500">{empById[t.employeeId]?.name || <span className="text-slate-300">Unassigned</span>}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-500">{fmtShort(t.startDate)}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-500">{fmtShort(t.endDate)}</td>
                  <td className="px-3 py-2.5"><StatusTag status={t.status} /></td>
                  <td className="px-3 py-2.5 text-slate-400 max-w-[200px] truncate" title={t.remarks || ""}>{t.remarks || "—"}</td>
                  {isAdmin && (
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => { setEditing(t); setFormOpen(true); }} title="Edit / reassign" className="p-1.5 rounded hover:bg-slate-100 text-slate-500 cursor-pointer"><Pencil size={13} /></button>
                        <button onClick={() => setDeleting(t)} title="Delete" className="p-1.5 rounded hover:bg-red-50 text-slate-500 hover:text-red-500 cursor-pointer"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen && (
        <TaskFormModal
          initial={editing} projects={projects} employees={employees} isAdmin={isAdmin}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          onSave={async (data) => { await actions.saveTask(data); setFormOpen(false); setEditing(null); }}
          onCreateEmployee={actions.createEmployee}
          onRequestDeleteEmployee={(id) => setDelEmp({ id })}
        />
      )}
      {delEmp && (
        <DeleteEmployeeModal
          employees={employees} tasks={tasks} projectsById={projectsById} initialId={delEmp.id}
          onClose={() => setDelEmp(null)} onDelete={actions.deleteEmployee}
        />
      )}
      {deleting && (
        <ConfirmModal title="Delete task?" message={`Delete "${deleting.name}"? It will also disappear from the employee's allocation list.`}
          onCancel={() => setDeleting(null)}
          onConfirm={async () => { const t = deleting; setDeleting(null); await actions.deleteTask(t); }} />
      )}
    </div>
  );
}

/* --------------------- Machining / Sheetmetal / Welding --------------------- */
// Pure view over the same employees + tasks records that Task Feeds writes,
// so a task created there appears here immediately with no second entry.

export function EmployeeAllocationPage({ category, employees, tasks, projects }) {
  const projectsById = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p])), [projects]);
  const catTasks = useMemo(() => tasks.filter((t) => t.category === category), [tasks, category]);

  const people = useMemo(() => {
    const withTask = new Set(catTasks.map((t) => t.employeeId));
    return employees
      .filter((e) => e.category === category || withTask.has(e.id))
      .map((e) => ({
        emp: e,
        tasks: catTasks.filter((t) => t.employeeId === e.id).sort((a, b) => (a.startDate || "").localeCompare(b.startDate || "")),
      }));
  }, [employees, catTasks, category]);

  const unassigned = catTasks.filter((t) => !t.employeeId || !employees.some((e) => e.id === t.employeeId));

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <SectionHeading title={`${deptLabel(category)} — Employee Allocation`} icon={Users} />
          <span className="text-[12px] text-slate-400">{people.length} employee{people.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="bg-slate-50 text-left text-[11px] text-slate-400 uppercase tracking-wide">
                <th className="px-4 py-2.5 font-medium">Employee Name</th>
                <th className="px-3 py-2.5 font-medium">Allocated Project</th>
                <th className="px-3 py-2.5 font-medium">Task Name</th>
                <th className="px-3 py-2.5 font-medium">Start Date</th>
                <th className="px-3 py-2.5 font-medium">End Date</th>
                <th className="px-3 py-2.5 font-medium">Task Status</th>
                <th className="px-3 py-2.5 font-medium">Progress</th>
              </tr>
            </thead>
            <tbody>
              {people.length === 0 && (
                <tr><td colSpan={7} className="text-center text-slate-400 py-8">No {deptLabel(category)} employees yet. Add them from Manufacturing → Task Feeds.</td></tr>
              )}
              {people.map(({ emp, tasks: ts }) =>
                ts.length === 0 ? (
                  <tr key={emp.id} className="border-t border-slate-100">
                    <td className="px-4 py-2.5 font-medium text-slate-700">{emp.name}</td>
                    <td colSpan={6} className="px-3 py-2.5 text-slate-400 italic">No Projects Allocated</td>
                  </tr>
                ) : (
                  ts.map((t, i) => (
                    <tr key={t.id} className={i === 0 ? "border-t border-slate-100" : ""}>
                      <td className="px-4 py-2.5 font-medium text-slate-700">{i === 0 ? emp.name : ""}</td>
                      <td className="px-3 py-2.5 text-slate-600">{projectsById[t.projectId]?.name || "—"}</td>
                      <td className="px-3 py-2.5 text-slate-600">{t.name}</td>
                      <td className="px-3 py-2.5 font-mono text-slate-500">{fmtShort(t.startDate)}</td>
                      <td className="px-3 py-2.5 font-mono text-slate-500">{fmtShort(t.endDate)}</td>
                      <td className="px-3 py-2.5"><StatusTag status={t.status} /></td>
                      <td className="px-3 py-2.5">
                        {typeof t.progress === "number" || t.status === "Completed" ? (
                          <div className="flex items-center gap-2 min-w-[90px]">
                            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-turkish" style={{ width: `${t.status === "Completed" ? 100 : t.progress}%` }} /></div>
                            <span className="font-mono text-[11px] text-slate-500">{t.status === "Completed" ? 100 : t.progress}%</span>
                          </div>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                    </tr>
                  ))
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
      {unassigned.length > 0 && (
        <div className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          {unassigned.length} {deptLabel(category)} task{unassigned.length > 1 ? "s have" : " has"} no assignee: {unassigned.slice(0, 4).map((t) => t.name).join(", ")}{unassigned.length > 4 ? "…" : ""}
        </div>
      )}
    </div>
  );
}
