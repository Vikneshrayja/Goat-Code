/* -------------------------------------------------------------------------
 * Printable documents
 * -------------------------------------------------------------------------
 * One generator per document type returns a complete, self-contained HTML
 * page. The SAME html is used for the on-screen preview (sandboxed iframe)
 * and for printing / "Save as PDF" (opened in its own window), so what you
 * see is exactly what is printed. Every user-entered value is HTML-escaped.
 * ---------------------------------------------------------------------- */

export const esc = (v) =>
  String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// Multi-line text -> escaped paragraphs / line breaks.
const para = (v) => {
  const t = String(v == null ? "" : v).trim();
  return t ? esc(t).replace(/\n/g, "<br>") : '<span class="empty">—</span>';
};

export const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(String(iso).length <= 10 ? iso + "T00:00:00" : iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};
export const fmtDateTime = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) +
    ", " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
};

export const CURRENCIES = {
  INR: { symbol: "₹", locale: "en-IN" },
  USD: { symbol: "$", locale: "en-US" },
  EUR: { symbol: "€", locale: "de-DE" },
};
export const money = (n, cur = "INR") => {
  const c = CURRENCIES[cur] || CURRENCIES.INR;
  const v = Number(n);
  if (!isFinite(v)) return "—";
  const body = Math.abs(v).toLocaleString(c.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (v < 0 ? "-" : "") + c.symbol + body;
};

// Costing maths (also used by the page): saving = (old - new) x quantity.
export const costSaving = (r) => (Number(r.previous_cost) - Number(r.new_cost)) * (Number(r.quantity) || 0);
export const costSavingPct = (r) => {
  const prev = Number(r.previous_cost);
  return prev > 0 ? ((prev - Number(r.new_cost)) / prev) * 100 : 0;
};

const CSS = `
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 12px; line-height: 1.5; margin: 0; padding: 18px; background: #fff; }
  .head { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #0ea5c4; padding-bottom: 10px; margin-bottom: 14px; }
  .head img { height: 46px; }
  .head .meta { text-align: right; font-size: 11px; color: #444; }
  h1 { font-size: 18px; margin: 0 0 2px; letter-spacing: .02em; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: #075e73; margin: 16px 0 5px; border-bottom: 1px solid #ddd; padding-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; margin: 4px 0; }
  th, td { border: 1px solid #bbb; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f1f5f9; font-weight: 700; font-size: 11px; }
  td.k { width: 28%; background: #f8fafc; font-weight: 700; }
  .box { border: 1px solid #bbb; padding: 8px 10px; min-height: 44px; }
  .empty { color: #999; }
  .num { text-align: right; white-space: nowrap; }
  .sigs { display: flex; gap: 14px; margin-top: 8px; }
  .sig { flex: 1; border: 1px solid #bbb; padding: 8px; text-align: center; page-break-inside: avoid; }
  .sig .pad { height: 62px; display: flex; align-items: center; justify-content: center; border-bottom: 1px solid #333; margin-bottom: 4px; }
  .sig img { max-height: 58px; max-width: 100%; }
  .sig .role { font-weight: 700; font-size: 11px; }
  .sig .nm { font-size: 11px; color: #333; min-height: 15px; }
  .sig .dt { font-size: 10px; color: #666; }
  .total { background: #ecfdf5; font-weight: 700; }
  .foot { margin-top: 18px; font-size: 10px; color: #777; text-align: center; }
  ol { margin: 4px 0 4px 20px; padding: 0; }
  li { margin: 2px 0; }
`;

const page = (title, logoUrl, ref, subtitle, body) => `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}</style></head><body>
<div class="head"><div>${logoUrl ? `<img src="${esc(logoUrl)}" alt="GOAT Robotics">` : "<strong>GOAT Robotics</strong>"}</div>
<div class="meta"><h1>${esc(title)}</h1><div>${esc(subtitle || "")}</div><div>Ref: <strong>${esc(ref || "—")}</strong></div></div></div>
${body}
<div class="foot">GOAT Robotics · PRD-Tracker · Generated ${esc(new Date().toLocaleString("en-GB"))}</div>
</body></html>`;

const row = (k, v) => `<tr><td class="k">${esc(k)}</td><td>${v}</td></tr>`;

/* --------------------------------- RCA ---------------------------------- */
export const RCA_SIGNERS = [
  { key: "dept_head", role: "Department Head" },
  { key: "team_manager", role: "Team Manager" },
  { key: "employee", role: "Employee Signature" },
];

export function rcaHtml(r, logoUrl) {
  const sigs = RCA_SIGNERS.map((s) => {
    const raw = r[`${s.key}_sig`];
    const img = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(raw || "") ? raw : "";
    return `<div class="sig"><div class="pad">${img ? `<img src="${esc(img)}" alt="signature">` : ""}</div>
      <div class="role">${esc(s.role)}</div><div class="nm">${esc(r[`${s.key}_name`] || "")}</div>
      <div class="dt">${r[`${s.key}_signed_at`] ? "Signed " + esc(fmtDateTime(r[`${s.key}_signed_at`])) : "Not signed"}</div></div>`;
  }).join("");
  const body = `
  <table>
    ${row("Date & Time of Incident", esc(fmtDateTime(r.incident_at)))}
    ${row("Reported Person", para(r.reported_by))}
    ${row("Location", para(r.location))}
    ${row("Fix Date", esc(fmtDate(r.fix_date)))}
    ${row("Expected Date", esc(fmtDate(r.expected_date)))}
  </table>
  <h2>Description</h2><div class="box">${para(r.description)}</div>
  <h2>Explanation</h2><div class="box">${para(r.explanation)}</div>
  <h2>Corrective Action</h2><div class="box">${para(r.corrective_action)}</div>
  <h2>Preventive Action</h2><div class="box">${para(r.preventive_action)}</div>
  <h2>Approvals</h2><div class="sigs">${sigs}</div>`;
  return page("Root Cause Analysis (RCA)", logoUrl, r.ref, "Incident report", body);
}

/* ------------------------------- Costing -------------------------------- */
export function costingHtml(r, logoUrl) {
  const saved = costSaving(r);
  const pct = costSavingPct(r);
  const body = `
  <table>
    ${row("Item / Part", para(r.item))}
    ${row("Project", para(r.project_name))}
    ${row("Date of Vendor Change", esc(fmtDate(r.change_date)))}
    ${row("Previous Vendor", para(r.previous_vendor))}
    ${row("New Vendor", para(r.new_vendor))}
  </table>
  <h2>Cost comparison</h2>
  <table>
    <tr><th></th><th class="num">Unit cost</th><th class="num">Quantity</th><th class="num">Total</th></tr>
    <tr><td>Previous vendor — ${esc(r.previous_vendor || "")}</td><td class="num">${esc(money(r.previous_cost, r.currency))}</td><td class="num">${esc(r.quantity || 0)}</td><td class="num">${esc(money(Number(r.previous_cost) * (Number(r.quantity) || 0), r.currency))}</td></tr>
    <tr><td>New vendor — ${esc(r.new_vendor || "")}</td><td class="num">${esc(money(r.new_cost, r.currency))}</td><td class="num">${esc(r.quantity || 0)}</td><td class="num">${esc(money(Number(r.new_cost) * (Number(r.quantity) || 0), r.currency))}</td></tr>
    <tr class="total"><td colspan="3">Amount saved by changing vendor (${esc(pct.toFixed(1))}%)</td><td class="num">${esc(money(saved, r.currency))}</td></tr>
  </table>
  <h2>Remarks</h2><div class="box">${para(r.remarks)}</div>`;
  return page("Costing — Vendor Change", logoUrl, r.ref, "Savings report", body);
}

export function costingSummaryHtml(rows, logoUrl) {
  const byCur = {};
  rows.forEach((r) => { byCur[r.currency || "INR"] = (byCur[r.currency || "INR"] || 0) + costSaving(r); });
  const lines = rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.item)}</td><td>${esc(r.previous_vendor)} → ${esc(r.new_vendor)}</td><td>${esc(fmtDate(r.change_date))}</td><td class="num">${esc(money(costSaving(r), r.currency))}</td></tr>`).join("");
  const totals = Object.entries(byCur).map(([c, v]) => `<tr class="total"><td colspan="4">Total saved (${esc(c)})</td><td class="num">${esc(money(v, c))}</td></tr>`).join("");
  const body = `<table><tr><th>#</th><th>Item / Part</th><th>Vendor change</th><th>Date</th><th class="num">Saved</th></tr>${lines || '<tr><td colspan="5" class="empty">No vendor changes recorded.</td></tr>'}${totals}</table>`;
  return page("Costing — Vendor Change Summary", logoUrl, `${rows.length} change${rows.length === 1 ? "" : "s"}`, "All recorded vendor changes", body);
}

/* ------------------------------ Bottleneck ------------------------------ */
export function bottleneckHtml(r, logoUrl) {
  const improvements = (r.improvements || []).filter((x) => String(x).trim());
  const points = (r.points || []).filter((p) => String(p.bottleneck || "").trim() || String(p.solution || "").trim());
  const body = `
  <table>
    ${row("Project Name", para(r.project_name))}
    ${row("Duration", para(r.duration))}
  </table>
  <h2>Improvements</h2>
  ${improvements.length ? `<ol>${improvements.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>` : '<div class="box empty">—</div>'}
  <h2>Bottleneck points &amp; solutions</h2>
  <table><tr><th style="width:40px">No.</th><th>Bottleneck point</th><th>Solution</th></tr>
  ${points.length ? points.map((p, i) => `<tr><td>${i + 1}</td><td>${para(p.bottleneck)}</td><td>${para(p.solution)}</td></tr>`).join("") : '<tr><td colspan="3" class="empty">—</td></tr>'}</table>`;
  return page("Project Study — Bottleneck Analysis", logoUrl, r.ref, "Project studies", body);
}

/* -------------------------------- printing ------------------------------- */
// Opens the document in its own window and triggers the print dialog
// ("Save as PDF" is available there). Must be called from a click handler.
export function printHtml(html) {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.open();
  w.document.write(html + "<script>window.addEventListener('load',function(){setTimeout(function(){window.print();},250);});</script>");
  w.document.close();
  return true;
}
