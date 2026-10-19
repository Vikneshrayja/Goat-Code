import React, { useState, useEffect, useCallback } from "react";
import { Users, UserPlus, ShieldCheck, Eye, Trash2, CheckCircle2, XCircle, Mail, ClipboardCheck } from "lucide-react";
import { Field, SectionHeading, ConfirmModal } from "../shared";
import {
  fetchProfiles, updateProfile, adminDeleteUser, fetchInvites, addInvite, deleteInvite, subscribeTable,
} from "../lib/db";

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—");

function useProfiles() {
  const [profiles, setProfiles] = useState([]);
  const [invites, setInvites] = useState([]);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    try {
      const [p, i] = await Promise.all([fetchProfiles(), fetchInvites()]);
      setProfiles(p); setInvites(i); setError("");
    } catch (e) { setError(e.message || "Could not load users."); }
  }, []);
  useEffect(() => {
    reload();
    const off = subscribeTable("profiles", reload);
    return off;
  }, [reload]);
  return { profiles, invites, error, reload };
}

function AdminOnly() {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-10 text-center max-w-lg mx-auto mt-8">
      <div className="text-[14px] font-display font-semibold text-slate-700">Administrator access required</div>
      <div className="text-[12.5px] text-slate-400 mt-1.5">Only an administrator can manage user accounts.</div>
    </div>
  );
}

const statusChip = (p) => {
  if (p.status === "pending") return ["Pending", "bg-amber-50 text-amber-700"];
  if (p.status === "rejected") return ["Rejected", "bg-red-50 text-red-600"];
  if (p.enabled === false) return ["Disabled", "bg-slate-100 text-slate-500"];
  return ["Active", "bg-emerald-50 text-emerald-700"];
};

function Toggle({ on, onClick, disabled, title }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      className={`shrink-0 w-11 h-6 p-0 border-0 rounded-full relative overflow-hidden transition-colors ${on ? "bg-turkish" : "bg-slate-300"} ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : "translate-x-0"}`} />
    </button>
  );
}

/* ------------------------------ Authorized Users ---------------------------- */

export function AuthorizedUsersPage({ isAdmin, currentUserId, notify }) {
  const { profiles, invites, error, reload } = useProfiles();
  const [form, setForm] = useState({ name: "", email: "", role: "Viewer" });
  const [formErr, setFormErr] = useState("");
  const [deleting, setDeleting] = useState(null);
  if (!isAdmin) return <AdminOnly />;

  const registered = profiles.filter((p) => p.status === "approved");

  const add = async () => {
    const email = form.email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) { setFormErr("Enter a valid email address."); return; }
    if (profiles.some((p) => p.email.toLowerCase() === email) || invites.some((i) => i.email.toLowerCase() === email)) {
      setFormErr("This email is already registered or invited."); return;
    }
    try {
      await addInvite({ email, name: form.name.trim() || null, role: form.role });
      setForm({ name: "", email: "", role: "Viewer" }); setFormErr("");
      notify(`${email} added. They are approved automatically when they register with this email.`);
      reload();
    } catch (e) { setFormErr(e.message || "Could not add the user."); }
  };

  const toggle = async (p) => {
    try {
      await updateProfile(p.id, { enabled: !p.enabled });
      notify(`${p.email} ${p.enabled ? "disabled" : "enabled"}.`); reload();
    } catch (e) { notify(e.message || "Update failed."); }
  };
  const setRole = async (p, role) => {
    try { await updateProfile(p.id, { role }); notify(`${p.email} is now ${role}.`); reload(); }
    catch (e) { notify(e.message || "Update failed."); }
  };
  const remove = async () => {
    const u = deleting; setDeleting(null);
    try {
      if (u.invite) await deleteInvite(u.email); else await adminDeleteUser(u.id);
      notify(`${u.email} deleted.`); reload();
    } catch (e) { notify(e.message || "Delete failed."); }
  };

  return (
    <div className="space-y-4">
      {error && <div className="text-[12px] text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}

      <div className="bg-white rounded-lg border border-slate-200 p-5 max-w-xl">
        <SectionHeading title="Add User" icon={UserPlus} />
        <div className="text-[12px] text-slate-400 mt-2 mb-4">
          Pre-approve an email address. The person sets their own password by registering on the sign-in page; their access is granted automatically.
        </div>
        <div className="space-y-3">
          <Field label="Name (optional)"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" placeholder="e.g. Priya Sundaram" /></Field>
          <Field label="Email"><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" placeholder="priya@goat-robotics.com" /></Field>
          <Field label="Role">
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="input">
              <option value="Viewer">Viewer — read-only</option>
              <option value="Admin">Admin — full access</option>
            </select>
          </Field>
          {formErr && <div className="text-[11.5px] text-red-500">{formErr}</div>}
          <button onClick={add} className="w-full flex items-center justify-center gap-1.5 bg-turkish hover:bg-turkish-deep text-white text-[13px] font-medium py-2.5 rounded-md cursor-pointer">
            <UserPlus size={14} /> Add User
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100"><SectionHeading title="Registered Users" icon={Users} /></div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="bg-slate-50 text-left text-[11px] text-slate-400 uppercase tracking-wide">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Email</th>
                <th className="px-4 py-2.5 font-medium">Role</th>
                <th className="px-4 py-2.5 font-medium">Account Status</th>
                <th className="px-4 py-2.5 font-medium">Enable / Disable</th>
                <th className="px-4 py-2.5 font-medium text-right">Delete</th>
              </tr>
            </thead>
            <tbody>
              {registered.length === 0 && invites.length === 0 && <tr><td colSpan={6} className="text-center text-slate-400 py-6">No users yet.</td></tr>}
              {registered.map((p) => {
                const [label, cls] = statusChip(p);
                const self = p.id === currentUserId;
                return (
                  <tr key={p.id} className="border-t border-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-700">{p.name || "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-500">{p.email}</td>
                    <td className="px-4 py-2.5">
                      <select value={p.role} disabled={self} onChange={(e) => setRole(p, e.target.value)} className="input !w-auto !py-1 disabled:opacity-60">
                        <option>Admin</option><option>Viewer</option>
                      </select>
                    </td>
                    <td className="px-4 py-2.5"><span className={`inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full ${cls}`}>{label}</span></td>
                    <td className="px-4 py-2.5"><Toggle on={p.enabled} disabled={self} onClick={() => toggle(p)} title={self ? "You cannot disable yourself" : p.enabled ? "Click to disable" : "Click to enable"} /></td>
                    <td className="px-4 py-2.5 text-right">
                      <button disabled={self} onClick={() => setDeleting(p)} title={self ? "You cannot delete yourself" : "Delete user"} className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"><Trash2 size={13} /></button>
                    </td>
                  </tr>
                );
              })}
              {invites.map((i) => (
                <tr key={i.email} className="border-t border-slate-50 bg-slate-50/40">
                  <td className="px-4 py-2.5 text-slate-500">{i.name || "—"}</td>
                  <td className="px-4 py-2.5 font-mono text-slate-500">{i.email}</td>
                  <td className="px-4 py-2.5 text-slate-500">{i.role}</td>
                  <td className="px-4 py-2.5"><span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-sky-50 text-sky-700"><Mail size={10} /> Invited — not registered yet</span></td>
                  <td className="px-4 py-2.5 text-slate-300">—</td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => setDeleting({ ...i, invite: true })} title="Cancel invite" className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 cursor-pointer"><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {deleting && (
        <ConfirmModal
          title={deleting.invite ? "Cancel invite?" : "Delete user?"}
          message={deleting.invite ? `Remove the invite for ${deleting.email}?` : `Permanently delete ${deleting.email}? They will lose all access and must register again.`}
          confirmLabel="Delete" onCancel={() => setDeleting(null)} onConfirm={remove}
        />
      )}
    </div>
  );
}

/* ---------------------------------- Approval -------------------------------- */

export function ApprovalPage({ isAdmin, notify }) {
  const { profiles, error, reload } = useProfiles();
  const [rejecting, setRejecting] = useState(null);
  if (!isAdmin) return <AdminOnly />;

  const requests = profiles.filter((p) => p.status !== "approved" || false);
  const pendingCount = profiles.filter((p) => p.status === "pending").length;

  const decide = async (p, status) => {
    try {
      await updateProfile(p.id, { status, enabled: true });
      notify(status === "approved" ? `Request approved — ${p.email} can now sign in.` : `Request rejected — ${p.email} will not get access.`);
      reload();
    } catch (e) { notify(e.message || "Could not update the request."); }
  };

  const chip = { pending: "bg-amber-50 text-amber-700", rejected: "bg-red-50 text-red-600" };

  return (
    <div className="space-y-4">
      {error && <div className="text-[12px] text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <SectionHeading title="User Requests" icon={ClipboardCheck} />
          <span className="text-[12px] text-slate-400">{pendingCount} pending</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="bg-slate-50 text-left text-[11px] text-slate-400 uppercase tracking-wide">
                <th className="px-4 py-2.5 font-medium">User Name</th>
                <th className="px-4 py-2.5 font-medium">Registered Email</th>
                <th className="px-4 py-2.5 font-medium">Registration Date</th>
                <th className="px-4 py-2.5 font-medium">Request Status</th>
                <th className="px-4 py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 && <tr><td colSpan={5} className="text-center text-slate-400 py-8">No pending or rejected requests.</td></tr>}
              {requests.map((p) => (
                <tr key={p.id} className="border-t border-slate-50">
                  <td className="px-4 py-2.5 font-medium text-slate-700">{p.name || "—"}</td>
                  <td className="px-4 py-2.5 font-mono text-slate-500">{p.email}</td>
                  <td className="px-4 py-2.5 text-slate-500">{fmtDate(p.created_at)}</td>
                  <td className="px-4 py-2.5"><span className={`inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full capitalize ${chip[p.status]}`}>{p.status}</span></td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={() => decide(p, "approved")} className="inline-flex items-center gap-1 text-[12px] font-medium px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"><CheckCircle2 size={12} /> Approve</button>
                      {p.status === "pending" && (
                        <button onClick={() => setRejecting(p)} className="inline-flex items-center gap-1 text-[12px] font-medium px-2.5 py-1 rounded-md border border-red-200 text-red-600 hover:bg-red-50 cursor-pointer"><XCircle size={12} /> Reject</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {rejecting && (
        <ConfirmModal title="Reject request?" message={`Reject the access request from ${rejecting.email}? They will not be able to open the dashboard.`}
          confirmLabel="Reject" onCancel={() => setRejecting(null)}
          onConfirm={() => { const p = rejecting; setRejecting(null); decide(p, "rejected"); }} />
      )}
    </div>
  );
}
