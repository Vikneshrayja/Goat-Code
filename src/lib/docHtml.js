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
export const para = (v) => {
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

export const page = (title, logoUrl, ref, subtitle, body) => `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}</style></head><body>
<div class="head"><div>${logoUrl ? `<img src="${esc(logoUrl)}" alt="GOAT Robotics">` : "<strong>GOAT Robotics</strong>"}</div>
<div class="meta"><h1>${esc(title)}</h1><div>${esc(subtitle || "")}</div><div>Ref: <strong>${esc(ref || "—")}</strong></div></div></div>
${body}
<div class="foot">GOAT Robotics · PRD-Tracker · Generated ${esc(new Date().toLocaleString("en-GB"))}</div>
</body></html>`;

export const row = (k, v) => `<tr><td class="k">${esc(k)}</td><td>${v}</td></tr>`;

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
      <div class="role">${esc(s.role)}</div><div class="nm">${esc(r[`${s.key}_name`] || "")}</div></div>`;
  }).join("");
  const body = `
  <table>
    ${row("Date & Time of Incident", esc(fmtDateTime(r.incident_at)))}
    ${row("Reported Person", para(r.reported_by))}
    ${row("Witness Name", para(r.witness_name))}
    ${row("Location", para(r.location))}
    ${row("Temp Fix Date", esc(fmtDate(r.fix_date)))}
    ${row("Expected Solution Date", esc(fmtDate(r.expected_date)))}
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

/* ----------------------------- Scrap / Wastage --------------------------- */
export const WEIGHT_UNITS = { kg: 1, g: 0.001, ton: 1000 };
export const DOWNTIME_UNITS = { Minutes: 1 / 60, Hours: 1, Days: 24 };
const numFmt = (v) => (isFinite(Number(v)) ? Number(v).toLocaleString("en-IN", { maximumFractionDigits: 3 }) : "—");
// A scrap record holds one or more components (each with its own material and
// weight). Records saved before components existed are read as one component.
export const itemKg = (it) => (Number(it.weight) || 0) * (WEIGHT_UNITS[it.weight_unit || "kg"] ?? 1);
export const scrapItems = (r) => (Array.isArray(r.components) && r.components.length
  ? r.components
  : [{ component: "", material_name: r.material_name, weight: r.weight, weight_unit: r.weight_unit, amount: r.amount_loss, currency: r.currency }]);
export const weightKg = (r) => scrapItems(r).reduce((a, it) => a + itemKg(it), 0);
export const scrapLoss = (r) => {
  const loss = {};
  scrapItems(r).forEach((it) => { const c = it.currency || r.currency || "INR"; loss[c] = (loss[c] || 0) + (Number(it.amount) || 0); });
  return loss;
};
export const downtimeHours = (r) => (Number(r.downtime_value) || 0) * (DOWNTIME_UNITS[r.downtime_unit || "Hours"] ?? 1);
export const weightText = (r) => {
  const items = scrapItems(r);
  return items.length === 1 ? `${numFmt(items[0].weight)} ${items[0].weight_unit || "kg"}` : `${numFmt(weightKg(r))} kg`;
};
export const componentsText = (r) => scrapItems(r).map((it) => [it.component, it.material_name].filter(Boolean).join(" — ")).filter(Boolean).join("\n");
export const downtimeText = (r) => `${numFmt(r.downtime_value)} ${r.downtime_unit || "Hours"}`;
export const hoursText = (h) => `${numFmt(h)} hrs`;
export const scrapTotals = (rows) => {
  const loss = {};
  let kg = 0, hrs = 0;
  rows.forEach((r) => {
    Object.entries(scrapLoss(r)).forEach(([c, v]) => { loss[c] = (loss[c] || 0) + v; });
    kg += weightKg(r); hrs += downtimeHours(r);
  });
  return { loss, kg, hrs };
};

export function scrapHtml(r, logoUrl) {
  const body = `
  <table>
    ${row("Date", esc(fmtDate(r.scrap_date)))}
    ${row("Project Name", para(r.project_name))}
    ${row("Material Name", para(r.material_name))}
    ${row("Designer Name", para(r.designer_name))}
    ${row("Weight", esc(weightText(r)))}
    ${row("Amount Loss", esc(money(r.amount_loss, r.currency)))}
    ${row("Downtime Duration", esc(downtimeText(r)))}
  </table>`;
  return page("Scrap / Wastage Report", logoUrl, r.ref, "Scrap & wastage record", body);
}

export function scrapSummaryHtml(rows, logoUrl) {
  const t = scrapTotals(rows);
  const lines = rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(fmtDate(r.scrap_date))}</td><td>${esc(r.project_name)}<br>${esc(r.material_name)}</td><td>${esc(r.designer_name)}</td><td class="num">${esc(weightText(r))}</td><td class="num">${esc(downtimeText(r))}</td><td class="num">${esc(money(r.amount_loss, r.currency))}</td></tr>`).join("");
  const totals = `<tr class="total"><td colspan="4">Total weight / downtime</td><td class="num">${esc(numFmt(t.kg))} kg</td><td class="num">${esc(hoursText(t.hrs))}</td><td></td></tr>` +
    Object.entries(t.loss).map(([c, v]) => `<tr class="total"><td colspan="6">Total amount loss (${esc(c)})</td><td class="num">${esc(money(v, c))}</td></tr>`).join("");
  const bodyHtml = `<table><tr><th>#</th><th>Date</th><th>Project / Material</th><th>Designer</th><th class="num">Weight</th><th class="num">Downtime</th><th class="num">Amount loss</th></tr>${lines || '<tr><td colspan="7" class="empty">No scrap records.</td></tr>'}${rows.length ? totals : ""}</table>`;
  return page("Scrap / Wastage Summary", logoUrl, `${rows.length} record${rows.length === 1 ? "" : "s"}`, "All scrap & wastage records", bodyHtml);
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


/* ------------------------- material prices & reports ------------------------ */
// A material's price changes over time. Every entry has an effective date; the
// price that applies to a scrap record is the latest entry on or before the
// scrap date. Each entry is compared with the previous one for the same
// material, so "Increase" / "Decrease" is worked out automatically.
export const norm = (v) => String(v == null ? "" : v).trim().toLowerCase();
export const pricePerKg = (r) => (Number(r.price) || 0) / (WEIGHT_UNITS[r.price_unit || "kg"] ?? 1);
export const priceText = (r) => `${money(r.price, r.currency)} / ${r.price_unit || "kg"}`;

export function priceAt(prices, material, dateISO) {
  const m = norm(material), d = String(dateISO || "");
  const c = (prices || []).filter((r) => norm(r.material_name) === m && String(r.effective_date || "") <= d);
  c.sort((a, b) => String(b.effective_date).localeCompare(String(a.effective_date)) || String(b.created_at).localeCompare(String(a.created_at)));
  return c[0] || null;
}

export function annotatePrices(prices) {
  const by = {};
  (prices || []).forEach((r) => { (by[norm(r.material_name)] = by[norm(r.material_name)] || []).push(r); });
  const out = {};
  Object.values(by).forEach((list) => {
    list.sort((a, b) => String(a.effective_date).localeCompare(String(b.effective_date)) || String(a.created_at).localeCompare(String(b.created_at)));
    list.forEach((r, i) => {
      if (i === 0) { out[r.id] = { dir: "Initial", pct: null }; return; }
      const prev = pricePerKg(list[i - 1]), cur = pricePerKg(r);
      out[r.id] = {
        dir: cur > prev ? "Increase" : cur < prev ? "Decrease" : "No change",
        pct: prev > 0 ? ((cur - prev) / prev) * 100 : null,
      };
    });
  });
  return out;
}
export const changeText = (a) => {
  if (!a) return "";
  if (a.dir === "Initial" || a.dir === "No change") return a.dir === "Initial" ? "Initial price" : "No change";
  return a.pct == null ? a.dir : `${a.dir} ${a.pct >= 0 ? "+" : ""}${a.pct.toFixed(1)}%`;
};

const sumLoss = (o) => Object.values(o).reduce((a, v) => a + v, 0);
export const amountsText = (o) => {
  const e = Object.entries(o || {});
  return e.length ? e.map(([c, v]) => money(v, c)).join("\n") : "—";
};

// Group scrap records (by material / project / designer).
export function scrapGroups(rows, keyFn) {
  const g = {};
  rows.forEach((r) => {
    const k = String(keyFn(r) || "").trim() || "(not set)";
    const o = g[k] || (g[k] = { name: k, count: 0, kg: 0, hrs: 0, loss: {} });
    o.count++; o.kg += weightKg(r); o.hrs += downtimeHours(r);
    Object.entries(scrapLoss(r)).forEach(([c, v]) => { o.loss[c] = (o.loss[c] || 0) + v; });
  });
  return Object.values(g).sort((a, b) => sumLoss(b.loss) - sumLoss(a.loss) || a.name.localeCompare(b.name));
}
// Scrap grouped by material: every component line counts under its own material.
export function scrapMaterialGroups(rows) {
  const g = {};
  rows.forEach((r) => {
    scrapItems(r).forEach((it) => {
      const k = String(it.material_name || "").trim() || "(not set)";
      const o = g[k] || (g[k] = { name: k, count: 0, kg: 0, hrs: 0, loss: {} });
      const c = it.currency || r.currency || "INR";
      o.count++; o.kg += itemKg(it);
      o.loss[c] = (o.loss[c] || 0) + (Number(it.amount) || 0);
    });
  });
  return Object.values(g).sort((a, b) => sumLoss(b.loss) - sumLoss(a.loss) || a.name.localeCompare(b.name));
}
// Group vendor changes (by project / item / new vendor).
export function costGroups(rows, keyFn) {
  const g = {};
  rows.forEach((r) => {
    const k = String(keyFn(r) || "").trim() || "(not set)";
    const o = g[k] || (g[k] = { name: k, count: 0, saved: {} });
    const c = r.currency || "INR";
    o.count++; o.saved[c] = (o.saved[c] || 0) + costSaving(r);
  });
  return Object.values(g).sort((a, b) => sumLoss(b.saved) - sumLoss(a.saved) || a.name.localeCompare(b.name));
}
