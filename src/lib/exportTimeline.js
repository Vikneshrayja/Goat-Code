import ExcelJS from "exceljs";
import logo from "../assets/logo.png";

const STATUS_FILL = {
  "Planned": "FF5B84A6",
  "In Progress": "FF2E9464",
  "Completed": "FF3AA76D",
  "Delayed": "FFD8453A",
  "On Hold": "FFC7891E",
  "Cancelled": "FF9A9A9A",
};
const CONFLICT_FILL = "FFE7433B";
const TEAM_HEADER_FILL = "FF00537A";
const TODAY_COL_FILL = "FFEAF3FB";

const toDate = (s) => new Date(s + "T00:00:00");
const todayISO = () => new Date().toISOString().slice(0, 10);
const addDaysISO = (s, n) => {
  const d = toDate(s);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / 86400000);
const durationDays = (start, end) => daysBetween(start, end) + 1;

/**
 * Builds and downloads an .xlsx file: one sheet per team, each row a
 * project, with a day-by-day colour bar showing its planned duration so
 * overlapping / conflicting schedules are visible at a glance. Includes
 * the GOAT Robotics logo in the top-left corner of every sheet.
 */
export async function exportTeamTimeline(projects, conflicts, teams) {
  const conflictedIds = new Set();
  conflicts.forEach((c) => { conflictedIds.add(c.aId); conflictedIds.add(c.bId); });

  const wb = new ExcelJS.Workbook();
  wb.creator = "GOAT Robotics Production Dashboard";
  wb.created = new Date();

  // logo, loaded once and reused on every sheet
  const logoBuffer = await fetch(logo).then((r) => r.arrayBuffer());
  const logoImageId = wb.addImage({ buffer: logoBuffer, extension: "png" });

  const t = todayISO();
  const withDates = projects.filter((p) => p.startDate && p.endDate);
  let minStart = withDates.length ? withDates[0].startDate : t;
  let maxEnd = withDates.length ? withDates[0].endDate : t;
  withDates.forEach((p) => {
    if (p.startDate < minStart) minStart = p.startDate;
    if (p.endDate > maxEnd) maxEnd = p.endDate;
  });
  let rangeStart = addDaysISO(minStart < t ? minStart : t, -3);
  let rangeEnd = addDaysISO(maxEnd > t ? maxEnd : t, 3);
  // cap the sheet width so the file stays a reasonable size
  if (daysBetween(rangeStart, rangeEnd) > 120) {
    rangeStart = addDaysISO(t, -14);
    rangeEnd = addDaysISO(t, 90);
  }
  const totalDays = daysBetween(rangeStart, rangeEnd) + 1;
  const FIXED_COLS = 6; // logo col + Project, Number, Start, End, Duration
  const LABEL_COLS = 5; // Project, Number, Start, End, Duration

  const buildSheet = (title, list) => {
    const ws = wb.addWorksheet(title, { views: [{ state: "frozen", xSplit: FIXED_COLS, ySplit: 5 }] });

    ws.addImage(logoImageId, { tl: { col: 0.1, row: 0.1 }, ext: { width: 120, height: 48 } });
    ws.mergeCells(1, 2, 2, LABEL_COLS);
    const titleCell = ws.getCell(1, 2);
    titleCell.value = "GOAT Robotics — Production Timeline";
    titleCell.font = { bold: true, size: 14, color: { argb: "FF00537A" } };
    ws.mergeCells(3, 2, 3, LABEL_COLS);
    const subCell = ws.getCell(3, 2);
    subCell.value = `${title}  ·  Generated ${t}  ·  Duration bars show planned start → end; red = overlapping schedule`;
    subCell.font = { italic: true, size: 9, color: { argb: "FF6B6B6B" } };
    ws.getRow(1).height = 18;
    ws.getRow(2).height = 18;
    ws.getRow(4).height = 6;

    // column headers (row 5)
    const headerRow = 5;
    ["", "Project", "Number", "Start", "End", "Duration"].forEach((h, i) => {
      const cell = ws.getCell(headerRow, i + 1);
      cell.value = h;
      cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAM_HEADER_FILL } };
      cell.alignment = { vertical: "middle", horizontal: i === 0 ? "left" : "center" };
    });
    for (let d = 0; d < totalDays; d++) {
      const dISO = addDaysISO(rangeStart, d);
      const cell = ws.getCell(headerRow, FIXED_COLS + d);
      cell.value = toDate(dISO).getDate() === 1 || d === 0
        ? toDate(dISO).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
        : String(toDate(dISO).getDate());
      cell.font = { size: 7, color: { argb: dISO === t ? "FF0072BC" : "FF9A9A9A" }, bold: dISO === t };
      cell.alignment = { textRotation: dISO === t ? 0 : 0, horizontal: "center" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: dISO === t ? TODAY_COL_FILL : "FFFFFFFF" } };
    }

    ws.getColumn(1).width = 3;
    ws.getColumn(2).width = 30;
    ws.getColumn(3).width = 14;
    ws.getColumn(4).width = 11;
    ws.getColumn(5).width = 11;
    ws.getColumn(6).width = 9;
    for (let d = 0; d < totalDays; d++) ws.getColumn(FIXED_COLS + d).width = 2.4;

    const sorted = [...list].sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
    sorted.forEach((p, idx) => {
      const r = headerRow + 1 + idx;
      ws.getCell(r, 2).value = p.name;
      ws.getCell(r, 2).font = { size: 10, bold: conflictedIds.has(p.id) };
      ws.getCell(r, 3).value = p.projectNumber;
      ws.getCell(r, 4).value = p.startDate;
      ws.getCell(r, 5).value = p.endDate;
      ws.getCell(r, 6).value = `${durationDays(p.startDate, p.endDate)}d`;
      [3, 4, 5, 6].forEach((c) => { ws.getCell(r, c).font = { size: 9, color: { argb: "FF5B6B7A" } }; ws.getCell(r, c).alignment = { horizontal: "center" }; });

      const barStart = Math.max(0, daysBetween(rangeStart, p.startDate));
      const barEnd = Math.min(totalDays - 1, daysBetween(rangeStart, p.endDate));
      const fill = conflictedIds.has(p.id) ? CONFLICT_FILL : (STATUS_FILL[p.status] || STATUS_FILL.Planned);
      for (let d = barStart; d <= barEnd; d++) {
        const cell = ws.getCell(r, FIXED_COLS + d);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
        if (d === barStart) cell.value = p.status;
        if (d === barStart) cell.font = { size: 6, color: { argb: "FFFFFFFF" }, bold: true };
      }
      ws.getRow(r).height = 15;
    });

    ws.getCell(headerRow + sorted.length + 2, 2).value = "Legend:";
    ws.getCell(headerRow + sorted.length + 2, 2).font = { bold: true, size: 9 };
    let lc = 3;
    Object.entries(STATUS_FILL).forEach(([label, argb]) => {
      const cell = ws.getCell(headerRow + sorted.length + 2, lc);
      cell.value = label;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
      cell.font = { size: 8, color: { argb: "FFFFFFFF" } };
      lc++;
    });
    const conflictCell = ws.getCell(headerRow + sorted.length + 2, lc);
    conflictCell.value = "Overlap Conflict";
    conflictCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CONFLICT_FILL } };
    conflictCell.font = { size: 8, color: { argb: "FFFFFFFF" } };
  };

  buildSheet("All Teams", projects);
  (teams || []).forEach((team) => buildSheet(team, projects.filter((p) => p.team === team)));

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `production_timeline_${t}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
