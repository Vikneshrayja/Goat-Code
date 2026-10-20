/* -------------------------------------------------------------------------
 * Word (.docx) and PDF downloads for every Document type
 * -------------------------------------------------------------------------
 * 1. A document is first turned into a small neutral "model" (title, ref and
 *    a list of blocks: key/value rows, headings, text boxes, tables,
 *    signatures).
 * 2. The Word renderer opens YOUR template (assets/Goat_Robotics.dotx), keeps
 *    its teal bar / watermark / header / footer and replaces the body with the
 *    model.
 * 3. The PDF renderer draws the same model onto A4 pages over the template
 *    artwork (assets/letterhead.png).
 * Libraries are loaded on demand, so they cost nothing until a download.
 * ---------------------------------------------------------------------- */

import templateUrl from "../assets/Goat_Robotics.dotx?url";
import letterheadUrl from "../assets/letterhead.png";
import {
  RCA_SIGNERS, fmtDate, fmtDateTime, money, costSaving, costSavingPct,
  weightText, downtimeText, hoursText, scrapTotals,
  esc, para as htmlPara, row as htmlRow, page as htmlPage,
  priceText, annotatePrices, changeText, scrapGroups, costGroups, amountsText,
} from "./docHtml";

const TEAL = "378B8D";
const val = (v) => (v == null || String(v).trim() === "" ? "—" : String(v));
const safePng = (raw) => (/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(raw || "") ? raw : "");

/* ================================ models ================================= */

export function rcaModel(r) {
  return {
    title: "Root Cause Analysis (RCA)", subtitle: "Incident report", ref: r.ref, file: r.ref || "RCA",
    blocks: [
      { t: "kv", rows: [
        ["Date & Time of Incident", fmtDateTime(r.incident_at)],
        ["Reported Person", val(r.reported_by)],
        ["Witness Name", val(r.witness_name)],
        ["Location", val(r.location)],
        ["Temp Fix Date", fmtDate(r.fix_date)],
        ["Expected Solution Date", fmtDate(r.expected_date)],
      ] },
      { t: "h", text: "Description" }, { t: "box", text: val(r.description) },
      { t: "h", text: "Explanation" }, { t: "box", text: val(r.explanation) },
      { t: "h", text: "Corrective Action" }, { t: "box", text: val(r.corrective_action) },
      { t: "h", text: "Preventive Action" }, { t: "box", text: val(r.preventive_action) },
      { t: "h", text: "Approvals" },
      { t: "sigs", items: RCA_SIGNERS.map((s) => ({
        role: s.role, name: r[`${s.key}_name`] || "",
        img: safePng(r[`${s.key}_sig`]),
      })) },
    ],
  };
}

export function costingModel(r) {
  const qty = Number(r.quantity) || 0;
  const pct = costSavingPct(r);
  return {
    title: "Costing — Vendor Change", subtitle: "Savings report", ref: r.ref, file: r.ref || "Costing",
    blocks: [
      { t: "kv", rows: [
        ["Item / Part", val(r.item)],
        ["Project", val(r.project_name)],
        ["Date of Vendor Change", fmtDate(r.change_date)],
        ["Previous Vendor", val(r.previous_vendor)],
        ["New Vendor", val(r.new_vendor)],
      ] },
      { t: "h", text: "Cost comparison" },
      { t: "table",
        cols: [{ label: "", w: 0.43 }, { label: "Unit cost", w: 0.19, a: "r" }, { label: "Quantity", w: 0.14, a: "r" }, { label: "Total", w: 0.24, a: "r" }],
        rows: [
          ["Previous vendor — " + (r.previous_vendor || ""), money(r.previous_cost, r.currency), String(qty), money(Number(r.previous_cost) * qty, r.currency)],
          ["New vendor — " + (r.new_vendor || ""), money(r.new_cost, r.currency), String(qty), money(Number(r.new_cost) * qty, r.currency)],
        ],
        foot: [{ label: `Amount saved by changing vendor (${pct.toFixed(1)}%)`, value: money(costSaving(r), r.currency) }],
      },
      { t: "h", text: "Remarks" }, { t: "box", text: val(r.remarks) },
    ],
  };
}

export function costingSummaryModel(rows) {
  const byCur = {};
  rows.forEach((r) => { const c = r.currency || "INR"; byCur[c] = (byCur[c] || 0) + costSaving(r); });
  return {
    title: "Costing — Vendor Change Summary", subtitle: "All recorded vendor changes",
    ref: `${rows.length} change${rows.length === 1 ? "" : "s"}`, file: "Costing-summary",
    blocks: [
      { t: "table",
        cols: [{ label: "#", w: 0.06 }, { label: "Item / Part", w: 0.27 }, { label: "Vendor change", w: 0.31 }, { label: "Date", w: 0.14 }, { label: "Saved", w: 0.22, a: "r" }],
        rows: rows.length
          ? rows.map((r, i) => [String(i + 1), val(r.item), `${r.previous_vendor || ""} → ${r.new_vendor || ""}`, fmtDate(r.change_date), money(costSaving(r), r.currency)])
          : [["", "No vendor changes recorded.", "", "", ""]],
        foot: Object.entries(byCur).map(([c, v]) => ({ label: `Total saved (${c})`, value: money(v, c) })),
      },
    ],
  };
}

export function scrapModel(r) {
  return {
    title: "Scrap / Wastage Report", subtitle: "Scrap & wastage record", ref: r.ref, file: r.ref || "Scrap",
    blocks: [
      { t: "kv", rows: [
        ["Date", fmtDate(r.scrap_date)],
        ["Project Name", val(r.project_name)],
        ["Material Name", val(r.material_name)],
        ["Designer Name", val(r.designer_name)],
        ["Weight", weightText(r)],
        ["Amount Loss", money(r.amount_loss, r.currency)],
        ["Downtime Duration", downtimeText(r)],
      ] },
    ],
  };
}

export function scrapSummaryModel(rows) {
  const t = scrapTotals(rows);
  const foot = [{ label: "Total weight  |  total downtime", value: `${Number(t.kg.toFixed(3))} kg  |  ${hoursText(t.hrs)}` }]
    .concat(Object.entries(t.loss).map(([c, v]) => ({ label: `Total amount loss (${c})`, value: money(v, c) })));
  return {
    title: "Scrap / Wastage Summary", subtitle: "All scrap & wastage records",
    ref: `${rows.length} record${rows.length === 1 ? "" : "s"}`, file: "Scrap-summary",
    blocks: [
      { t: "table",
        cols: [{ label: "#", w: 0.05 }, { label: "Date", w: 0.13 }, { label: "Project / Material", w: 0.25 }, { label: "Designer", w: 0.14 }, { label: "Weight", w: 0.12, a: "r" }, { label: "Downtime", w: 0.14, a: "r" }, { label: "Amount loss", w: 0.17, a: "r" }],
        rows: rows.length
          ? rows.map((r, i) => [String(i + 1), fmtDate(r.scrap_date), `${r.project_name || ""}\n${r.material_name || ""}`, val(r.designer_name), weightText(r), downtimeText(r), money(r.amount_loss, r.currency)])
          : [["", "", "No scrap records.", "", "", "", ""]],
        foot: rows.length ? foot : [],
      },
    ],
  };
}

/* ---------------------------- overall reports ---------------------------- */
const nf = (v) => Number(Number(v).toFixed(3)).toLocaleString("en-IN");

export function periodLabel(from, to) {
  if (!from && !to) return "All dates";
  if (from && to) return `${fmtDate(from)} to ${fmtDate(to)}`;
  return from ? `From ${fmtDate(from)}` : `Up to ${fmtDate(to)}`;
}

export function scrapOverallModel(rows, period) {
  const t = scrapTotals(rows);
  const grp = (title, keyFn, label) => {
    const g = scrapGroups(rows, keyFn);
    return [
      { t: "h", text: title },
      { t: "table",
        cols: [{ label, w: 0.32 }, { label: "Records", w: 0.11, a: "r" }, { label: "Weight", w: 0.17, a: "r" }, { label: "Downtime", w: 0.17, a: "r" }, { label: "Amount loss", w: 0.23, a: "r" }],
        rows: g.length ? g.map((x) => [x.name, String(x.count), `${nf(x.kg)} kg`, hoursText(x.hrs), amountsText(x.loss)]) : [["No records", "", "", "", ""]] },
    ];
  };
  return {
    title: "Scrap / Wastage — Overall Report", subtitle: "All scrap & wastage records", ref: period || "All dates", file: "Scrap-overall-report",
    blocks: [
      { t: "kv", rows: [
        ["Period", period || "All dates"],
        ["Records", String(rows.length)],
        ["Total scrap weight", `${nf(t.kg)} kg`],
        ["Total downtime", hoursText(t.hrs)],
        ["Total amount loss", amountsText(t.loss)],
      ] },
      ...grp("By material", (r) => r.material_name, "Material"),
      ...grp("By project", (r) => r.project_name, "Project"),
      ...grp("By designer", (r) => r.designer_name, "Designer"),
      { t: "h", text: "All records" },
      { t: "table",
        cols: [{ label: "#", w: 0.05 }, { label: "Date", w: 0.13 }, { label: "Project / Material", w: 0.25 }, { label: "Designer", w: 0.14 }, { label: "Weight", w: 0.12, a: "r" }, { label: "Downtime", w: 0.14, a: "r" }, { label: "Amount loss", w: 0.17, a: "r" }],
        rows: rows.length
          ? rows.map((r, i) => [String(i + 1), fmtDate(r.scrap_date), `${r.project_name || ""}\n${r.material_name || ""}`, val(r.designer_name), weightText(r), downtimeText(r), money(r.amount_loss, r.currency)])
          : [["", "", "No scrap records.", "", "", "", ""]] },
    ],
  };
}

export function costingOverallModel(rows, period) {
  const saved = {}, before = {}, after = {};
  rows.forEach((r) => {
    const c = r.currency || "INR", q = Number(r.quantity) || 0;
    saved[c] = (saved[c] || 0) + costSaving(r);
    before[c] = (before[c] || 0) + Number(r.previous_cost) * q;
    after[c] = (after[c] || 0) + Number(r.new_cost) * q;
  });
  const grp = (title, keyFn, label) => {
    const g = costGroups(rows, keyFn);
    return [
      { t: "h", text: title },
      { t: "table",
        cols: [{ label, w: 0.5 }, { label: "Changes", w: 0.18, a: "r" }, { label: "Amount saved", w: 0.32, a: "r" }],
        rows: g.length ? g.map((x) => [x.name, String(x.count), amountsText(x.saved)]) : [["No records", "", ""]] },
    ];
  };
  return {
    title: "Costing — Overall Cost Saving Report", subtitle: "All recorded vendor changes", ref: period || "All dates", file: "Costing-overall-report",
    blocks: [
      { t: "kv", rows: [
        ["Period", period || "All dates"],
        ["Vendor changes", String(rows.length)],
        ["Cost with previous vendors", amountsText(before)],
        ["Cost with new vendors", amountsText(after)],
        ["Total amount saved", amountsText(saved)],
      ] },
      ...grp("By project", (r) => r.project_name, "Project"),
      ...grp("By item / part", (r) => r.item, "Item / Part"),
      ...grp("By new vendor", (r) => r.new_vendor, "New vendor"),
      { t: "h", text: "All vendor changes" },
      { t: "table",
        cols: [{ label: "#", w: 0.05 }, { label: "Item / Part", w: 0.27 }, { label: "Vendor change", w: 0.31 }, { label: "Date", w: 0.14 }, { label: "Saved", w: 0.23, a: "r" }],
        rows: rows.length
          ? rows.map((r, i) => [String(i + 1), val(r.item), `${r.previous_vendor || ""} -> ${r.new_vendor || ""}`, fmtDate(r.change_date), money(costSaving(r), r.currency)])
          : [["", "No vendor changes recorded.", "", "", ""]] },
    ],
  };
}

export function priceHistoryModel(prices) {
  const ann = annotatePrices(prices);
  const sorted = [...prices].sort((a, b) => String(a.material_name).toLowerCase().localeCompare(String(b.material_name).toLowerCase()) || String(b.effective_date).localeCompare(String(a.effective_date)));
  return {
    title: "Material Price History", subtitle: "Price changes over time", ref: `${prices.length} price entr${prices.length === 1 ? "y" : "ies"}`, file: "Material-price-history",
    blocks: [
      { t: "table",
        cols: [{ label: "Material", w: 0.3 }, { label: "Effective date", w: 0.18 }, { label: "Price", w: 0.2, a: "r" }, { label: "Change", w: 0.32, a: "r" }],
        rows: sorted.length ? sorted.map((r) => [val(r.material_name), fmtDate(r.effective_date), priceText(r), changeText(ann[r.id])]) : [["No prices recorded.", "", "", ""]] },
    ],
  };
}

// Same models drawn as HTML (used for the on-screen preview and Print).
export function modelHtml(model, logoUrl) {
  const body = model.blocks.map((b) => {
    if (b.t === "h") return `<h2>${esc(b.text)}</h2>`;
    if (b.t === "kv") return `<table>${b.rows.map(([k, v]) => htmlRow(k, htmlPara(v))).join("")}</table>`;
    if (b.t === "box") return `<div class="box">${htmlPara(b.text)}</div>`;
    if (b.t === "list") return `<ol>${b.items.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>`;
    if (b.t === "table") {
      const cls = (c) => (c.a === "r" ? ' class="num"' : "");
      return `<table><tr>${b.cols.map((c) => `<th${cls(c)}>${esc(c.label)}</th>`).join("")}</tr>` +
        b.rows.map((r) => `<tr>${r.map((v, i) => `<td${cls(b.cols[i])}>${htmlPara(v)}</td>`).join("")}</tr>`).join("") +
        (b.foot || []).map((f) => `<tr class="total"><td colspan="${b.cols.length - 1}">${esc(f.label)}</td><td class="num">${esc(f.value)}</td></tr>`).join("") + `</table>`;
    }
    return "";
  }).join("");
  return htmlPage(model.title, logoUrl, model.ref, model.subtitle, body);
}

export function bottleneckModel(r) {
  const improvements = (r.improvements || []).filter((x) => String(x).trim());
  const points = (r.points || []).filter((p) => String(p.bottleneck || "").trim() || String(p.solution || "").trim());
  return {
    title: "Project Study — Bottleneck Analysis", subtitle: "Project studies", ref: r.ref, file: r.ref || "Bottleneck",
    blocks: [
      { t: "kv", rows: [["Project Name", val(r.project_name)], ["Duration", val(r.duration)]] },
      { t: "h", text: "Improvements" },
      improvements.length ? { t: "list", items: improvements.map(String) } : { t: "box", text: "—" },
      { t: "h", text: "Bottleneck points & solutions" },
      { t: "table",
        cols: [{ label: "No.", w: 0.08 }, { label: "Bottleneck point", w: 0.46 }, { label: "Solution", w: 0.46 }],
        rows: points.length ? points.map((p, i) => [String(i + 1), val(p.bottleneck), val(p.solution)]) : [["", "—", "—"]],
      },
    ],
  };
}

/* ================================ download =============================== */

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
const fileName = (model, ext) => (String(model.file || "document").replace(/[^A-Za-z0-9._-]+/g, "_")) + "." + ext;

export async function downloadWord(model) {
  saveBlob(await buildDocx(model), fileName(model, "docx"));
}
export async function downloadPdf(model) {
  saveBlob(await buildPdf(model), fileName(model, "pdf"));
}

/* ================================== WORD ================================= */

const x = (v) => String(v == null ? "" : v)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Runs for text that may contain line breaks.
const runs = (text, o = {}) => {
  const rpr = `<w:rPr>${o.b ? "<w:b/>" : ""}${o.color ? `<w:color w:val="${o.color}"/>` : ""}<w:sz w:val="${o.sz || 20}"/><w:szCs w:val="${o.sz || 20}"/></w:rPr>`;
  return String(text == null ? "" : text).split("\n")
    .map((line, i) => `<w:r>${rpr}${i ? "<w:br/>" : ""}<w:t xml:space="preserve">${x(line)}</w:t></w:r>`).join("");
};
const para = (text, o = {}) => {
  const ppr = `<w:pPr>${o.keep ? "<w:keepNext/>" : ""}${o.border ? `<w:pBdr><w:bottom w:val="single" w:sz="${o.border}" w:space="2" w:color="${o.borderColor || TEAL}"/></w:pBdr>` : ""}<w:spacing w:before="${o.before || 0}" w:after="${o.after == null ? 60 : o.after}"/>${o.jc ? `<w:jc w:val="${o.jc}"/>` : ""}${o.ind ? `<w:ind w:left="${o.ind}" w:hanging="${o.hang || 0}"/>` : ""}</w:pPr>`;
  return `<w:p>${ppr}${runs(text, o)}</w:p>`;
};

const BORDERS = ["top", "left", "bottom", "right", "insideH", "insideV"]
  .map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="BBBBBB"/>`).join("");
const CELL_MAR = `<w:tblCellMar><w:top w:w="70" w:type="dxa"/><w:left w:w="110" w:type="dxa"/><w:bottom w:w="70" w:type="dxa"/><w:right w:w="110" w:type="dxa"/></w:tblCellMar>`;
const W = 9026; // text width in twips (A4 minus the template's 2.54 cm margins)

const tbl = (grid, rowsXml) =>
  `<w:tbl><w:tblPr><w:tblW w:w="${W}" w:type="dxa"/><w:tblBorders>${BORDERS}</w:tblBorders><w:tblLayout w:type="fixed"/>${CELL_MAR}</w:tblPr>` +
  `<w:tblGrid>${grid.map((g) => `<w:gridCol w:w="${g}"/>`).join("")}</w:tblGrid>${rowsXml}</w:tbl>`;
const cell = (w, inner, o = {}) =>
  `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${o.span ? `<w:gridSpan w:val="${o.span}"/>` : ""}${o.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.fill}"/>` : ""}${o.vc ? `<w:vAlign w:val="${o.vc}"/>` : ""}</w:tcPr>${inner}</w:tc>`;
const row = (cells, o = {}) =>
  `<w:tr><w:trPr><w:cantSplit/>${o.header ? "<w:tblHeader/>" : ""}${o.h ? `<w:trHeight w:val="${o.h}" w:hRule="atLeast"/>` : ""}</w:trPr>${cells}</w:tr>`;
const spacer = () => `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="120" w:lineRule="exact"/></w:pPr></w:p>`;

function docxBody(model, images) {
  let out = "";
  out += para(model.title, { sz: 40, b: true, color: TEAL, after: 40, before: 0 });
  out += para(model.subtitle || "", { sz: 20, color: "666666", after: 20 });
  out += para("Ref: " + (model.ref || "—"), { sz: 20, b: true, after: 160, border: 12 });

  model.blocks.forEach((b) => {
    if (b.t === "h") {
      out += para(b.t === "h" ? b.text.toUpperCase() : "", { sz: 21, b: true, color: TEAL, before: 240, after: 80, border: 4, borderColor: "CCCCCC", keep: true });
    } else if (b.t === "kv") {
      const kw = 2700;
      out += tbl([kw, W - kw], b.rows.map(([k, v]) =>
        row(cell(kw, para(k, { b: true, after: 0 }), { fill: "F1F5F9" }) + cell(W - kw, para(v, { after: 0 })))).join(""));
    } else if (b.t === "box") {
      out += tbl([W], row(cell(W, para(b.text, { after: 0 })), { h: 520 }));
    } else if (b.t === "list") {
      out += b.items.map((it, i) => para(`${i + 1}.  ${it}`, { ind: 360, hang: 360, after: 40 })).join("");
    } else if (b.t === "table") {
      const grid = b.cols.map((c) => Math.round(c.w * W));
      grid[grid.length - 1] += W - grid.reduce((a, c) => a + c, 0);
      const jc = (c) => (c.a === "r" ? "right" : "left");
      let rows = row(b.cols.map((c, i) => cell(grid[i], para(c.label, { b: true, sz: 19, after: 0, jc: jc(c) }), { fill: "F1F5F9" })).join(""), { header: true });
      rows += b.rows.map((r) => row(r.map((v, i) => cell(grid[i], para(v, { after: 0, jc: jc(b.cols[i]) }))).join(""))).join("");
      (b.foot || []).forEach((f) => {
        const lw = grid.slice(0, -1).reduce((a, c) => a + c, 0);
        rows += row(cell(lw, para(f.label, { b: true, after: 0 }), { span: grid.length - 1, fill: "ECFDF5" }) + cell(grid[grid.length - 1], para(f.value, { b: true, after: 0, jc: "right" }), { fill: "ECFDF5" }));
      });
      out += tbl(grid, rows);
    } else if (b.t === "sigs") {
      const n = b.items.length, cw = Math.floor(W / n);
      const grid = b.items.map((_, i) => (i === n - 1 ? W - cw * (n - 1) : cw));
      out += tbl(grid, row(b.items.map((s, i) => {
        let pic = para("", { before: 560, after: 0, border: 6, borderColor: "333333" });
        if (s.img) {
          const id = images.length + 1;
          images.push({ id, data: s.img.split(",")[1] });
          const cx = 1371600, cy = Math.round((cx * 110) / 360);
          pic = `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="2" w:color="333333"/></w:pBdr><w:spacing w:before="120" w:after="0"/><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${9000 + id}" name="Signature ${id}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${9000 + id}" name="sig${id}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdSig${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
        }
        return cell(grid[i], pic + para(s.role, { b: true, sz: 19, jc: "center", before: 60, after: 0 }) + para(s.name || " ", { sz: 19, jc: "center", after: 0 }) + (s.signed ? para(s.signed, { sz: 17, color: "666666", jc: "center", after: 0 }) : ""));
      }).join("")));
    }
    if (b.t !== "h") out += spacer();
  });
  return out;
}

async function buildDocx(model) {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await (await fetch(templateUrl)).arrayBuffer());

  // 1. body: keep the template's first paragraph (it holds the teal bar), replace the rest.
  let doc = await zip.file("word/document.xml").async("string");
  const bodyStart = doc.indexOf("<w:body>") + "<w:body>".length;
  const barEnd = doc.indexOf("</w:p>", bodyStart) + "</w:p>".length;
  const sect = doc.lastIndexOf("<w:sectPr");
  if (bodyStart < 8 || barEnd < bodyStart || sect < barEnd) throw new Error("Unexpected template structure.");
  const images = [];
  const body = docxBody(model, images);
  doc = doc.slice(0, barEnd) + body + doc.slice(sect);
  // namespaces used by the signature pictures (declared in the template root already: wp, r)
  if (!/xmlns:wp=/.test(doc.slice(0, 4000)) || !/xmlns:r=/.test(doc.slice(0, 4000))) throw new Error("Template is missing Word namespaces.");
  zip.file("word/document.xml", doc);

  // 2. signature images + relationships
  if (images.length) {
    let rels = await zip.file("word/_rels/document.xml.rels").async("string");
    const add = images.map((im) => {
      zip.file(`word/media/sig${im.id}.png`, im.data, { base64: true });
      return `<Relationship Id="rIdSig${im.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/sig${im.id}.png"/>`;
    }).join("");
    zip.file("word/_rels/document.xml.rels", rels.replace("</Relationships>", add + "</Relationships>"));
  }

  // 3. template (.dotx) -> normal document (.docx)
  let ct = await zip.file("[Content_Types].xml").async("string");
  ct = ct.replace("wordprocessingml.template.main+xml", "wordprocessingml.document.main+xml");
  zip.file("[Content_Types].xml", ct);

  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    compression: "DEFLATE",
  });
}

/* ================================== PDF ================================== */

// Built-in PDF fonts only cover Latin-1; swap the few symbols we use.
const WIN = /[^\x09\x0A\x20-\x7E\xA0-\xFF–—‘’“”•…€™]/g;
const clean = (s) => String(s == null ? "" : s)
  .replace(/₹/g, "Rs. ").replace(/→/g, "->").replace(/ /g, " ").replace(/\r/g, "")
  .replace(WIN, "?");

async function buildPdf(model) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  pdf.setTitle(clean(model.title));
  pdf.setCreator("GOAT Robotics");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const bg = await pdf.embedPng(await (await fetch(letterheadUrl)).arrayBuffer());

  const PW = 595.28, PH = 841.89, ML = 56, MR = 56, TOP = 58, BOTTOM = 70;
  const CW = PW - ML - MR;
  const teal = rgb(0.216, 0.545, 0.553), ink = rgb(0.07, 0.07, 0.07), grey = rgb(0.4, 0.4, 0.4);
  const line = rgb(0.73, 0.73, 0.73), head = rgb(0.945, 0.961, 0.976), green = rgb(0.925, 0.992, 0.961);

  let page, y;
  const newPage = () => {
    page = pdf.addPage([PW, PH]);
    page.drawImage(bg, { x: 0, y: 0, width: PW, height: PH });
    y = PH - TOP;
  };
  const need = (h) => { if (y - h < BOTTOM) { newPage(); return true; } return false; };

  const wrap = (text, f, size, width) => {
    const out = [];
    String(clean(text)).split("\n").forEach((para) => {
      const words = para.split(" ");
      let cur = "";
      const push = () => { out.push(cur); cur = ""; };
      words.forEach((w) => {
        // break words wider than the cell
        while (f.widthOfTextAtSize(w, size) > width) {
          let k = w.length;
          while (k > 1 && f.widthOfTextAtSize(w.slice(0, k), size) > width) k--;
          if (cur) push();
          out.push(w.slice(0, k)); w = w.slice(k);
        }
        const t = cur ? cur + " " + w : w;
        if (f.widthOfTextAtSize(t, size) <= width) cur = t; else { push(); cur = w; }
      });
      push();
    });
    return out.length ? out : [""];
  };
  const LH = 1.35;
  const drawLines = (lines, f, size, x0, yTop, color, align = "l", width = 0) => {
    lines.forEach((l, i) => {
      const tw = f.widthOfTextAtSize(l, size);
      const xx = align === "r" ? x0 + width - tw : align === "c" ? x0 + (width - tw) / 2 : x0;
      page.drawText(l, { x: xx, y: yTop - size * 0.95 - i * size * LH, size, font: f, color });
    });
  };
  const rect = (x0, yTop, w, h, o = {}) =>
    page.drawRectangle({ x: x0, y: yTop - h, width: w, height: h, color: o.fill, borderColor: line, borderWidth: o.noBorder ? 0 : 0.6 });

  // ---- title block
  newPage();
  const tl = wrap(model.title, bold, 20, CW);
  drawLines(tl, bold, 20, ML, y, teal); y -= tl.length * 20 * LH + 2;
  if (model.subtitle) { drawLines([clean(model.subtitle)], font, 10, ML, y, grey); y -= 15; }
  drawLines([clean("Ref: " + (model.ref || "—"))], bold, 10, ML, y, ink); y -= 15;
  page.drawLine({ start: { x: ML, y }, end: { x: PW - MR, y }, thickness: 1.2, color: teal }); y -= 12;

  const PAD = 6, FS = 10;

  // A row of cells; draws as one unit (moves to a new page if it doesn't fit).
  // cells: [{ text, w, f, fill, a, color, span }]
  const drawRow = (cells, minH = 0) => {
    const lay = cells.map((c) => {
      const f = c.f || font, size = c.size || FS;
      const lines = wrap(c.text, f, size, c.w - PAD * 2);
      return { ...c, f, size, lines, h: lines.length * size * LH + PAD * 2 - 2 };
    });
    const h = Math.max(minH, ...lay.map((c) => c.h));
    need(h);
    let xx = ML;
    lay.forEach((c) => {
      rect(xx, y, c.w, h, { fill: c.fill });
      drawLines(c.lines, c.f, c.size, xx + PAD, y - PAD + 1, c.color || ink, c.a || "l", c.w - PAD * 2);
      xx += c.w;
    });
    y -= h;
  };

  for (const b of model.blocks) {
    if (b.t === "h") {
      need(40);
      y -= 12;
      drawLines([clean(b.text).toUpperCase()], bold, 10.5, ML, y, teal); y -= 16;
      page.drawLine({ start: { x: ML, y: y + 2 }, end: { x: PW - MR, y: y + 2 }, thickness: 0.6, color: line });
      y -= 4;
    } else if (b.t === "kv") {
      const kw = CW * 0.3;
      b.rows.forEach(([k, v]) => drawRow([{ text: k, w: kw, f: bold, fill: head }, { text: v, w: CW - kw }]));
    } else if (b.t === "box") {
      // a long text box may continue on the next page
      let lines = wrap(b.text, font, FS, CW - PAD * 2);
      const lh = FS * LH;
      let first = true;
      while (lines.length || first) {
        const room = Math.max(1, Math.floor((y - BOTTOM - PAD * 2) / lh));
        if (room < 2 && lines.length > 1) { newPage(); continue; }
        const take = lines.slice(0, room); lines = lines.slice(take.length);
        const h = Math.max(take.length * lh + PAD * 2 - 2, first ? 34 : 0);
        need(h);
        rect(ML, y, CW, h);
        drawLines(take, font, FS, ML + PAD, y - PAD + 1, ink);
        y -= h; first = false;
        if (lines.length) newPage();
      }
    } else if (b.t === "list") {
      b.items.forEach((it, i) => {
        const lines = wrap(it, font, FS, CW - 22);
        need(lines.length * FS * LH + 4);
        drawLines([`${i + 1}.`], font, FS, ML + 4, y, ink);
        drawLines(lines, font, FS, ML + 22, y, ink);
        y -= lines.length * FS * LH + 3;
      });
    } else if (b.t === "table") {
      const ws = b.cols.map((c) => c.w * CW);
      const header = () => drawRow(b.cols.map((c, i) => ({ text: c.label, w: ws[i], f: bold, fill: head, a: c.a, size: 9.5 })));
      header();
      b.rows.forEach((r) => {
        if (y - 26 < BOTTOM) { newPage(); header(); }
        drawRow(r.map((t, i) => ({ text: t, w: ws[i], a: b.cols[i].a })));
      });
      (b.foot || []).forEach((f) => {
        const lw = ws.slice(0, -1).reduce((a, c) => a + c, 0);
        drawRow([{ text: f.label, w: lw, f: bold, fill: green }, { text: f.value, w: ws[ws.length - 1], f: bold, fill: green, a: "r" }]);
      });
    } else if (b.t === "sigs") {
      const n = b.items.length, gap = 10, cw = (CW - gap * (n - 1)) / n, h = 112;
      need(h + 4);
      for (let i = 0; i < n; i++) {
        const s = b.items[i], x0 = ML + i * (cw + gap);
        rect(x0, y, cw, h);
        if (s.img) {
          try {
            const im = await pdf.embedPng(s.img);
            const sc = Math.min((cw - 24) / im.width, 50 / im.height);
            page.drawImage(im, { x: x0 + (cw - im.width * sc) / 2, y: y - 8 - im.height * sc, width: im.width * sc, height: im.height * sc });
          } catch (e) { /* unreadable signature image: leave the box blank */ }
        }
        page.drawLine({ start: { x: x0 + 10, y: y - 64 }, end: { x: x0 + cw - 10, y: y - 64 }, thickness: 0.8, color: ink });
        drawLines([clean(s.role)], bold, 9.5, x0, y - 68, ink, "c", cw);
        drawLines([clean(s.name || "")], font, 9.5, x0, y - 82, ink, "c", cw);
        if (s.signed) drawLines([clean(s.signed)], font, 8.5, x0, y - 95, grey, "c", cw);
      }
      y -= h;
    }
    y -= 4;
  }

  // footer on every page: page number (where the template has it) + generated stamp
  const pages = pdf.getPages();
  const stamp = "GOAT Robotics · " + new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  pages.forEach((p, i) => {
    p.drawText(`${i + 1} / ${pages.length}`, { x: 69, y: 36, size: 9, font, color: ink });
    p.drawText(clean(stamp), { x: PW - MR - font.widthOfTextAtSize(clean(stamp), 8), y: 36, size: 8, font, color: grey });
  });

  const bytes = await pdf.save();
  return new Blob([bytes], { type: "application/pdf" });
}
