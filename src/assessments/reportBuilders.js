// Report workbook builders (ExcelJS) for VB-MAPP and ABLLS-R.
// Built from scratch (not template round-trip) so we fully control layout —
// notably VB-MAPP's pyramid grid at the FRONT with wide columns and the
// domain names written HORIZONTALLY across the top (not rotated vertical).

const argb = hex => "FF" + String(hex).replace("#", "").toUpperCase();
const thin = { style: "thin", color: { argb: "FFCBD5E0" } };
const borderAll = { top: thin, bottom: thin, left: thin, right: thin };

async function loadExcelJS() {
  return (await import("exceljs")).default;
}

// ── VB-MAPP ──────────────────────────────────────────────────────────────────
// cfg: {
//   client, testRound, roundColor, roundHalf,
//   GRID_COLS, GRID_ROWS, levelOf, BAND_TINT,
//   cell(code,n) -> { exists, disabled, answered, score },  // resolves a grid cell
//   levels: [{ id,label,range, domains:[{code,name,disabled, items:[{n,score,answered,invalid,data,text}]}] }],
//   eesaGroups: [{ name, score, max }], eesaTotal,
//   grandTotal, grandMax, kesimpulan,
// }
export async function buildVbmappXlsxBlob(cfg) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = "Above & Beyond Child Development Center";
  wb.created = new Date();

  // ── Sheet 1: PYRAMID GRID (the graph), at the front ──
  const ws = wb.addWorksheet("Grafik VB-MAPP", {
    views: [{ state: "frozen", xSplit: 2, ySplit: 4 }],
  });

  // Column widths: label column narrow, each domain column WIDE enough that the
  // horizontal domain name fits on one line without rotation.
  ws.getColumn(1).width = 4;   // milestone # (left)
  const COL0 = 2;              // first domain column index (B)
  cfg.GRID_COLS.forEach((_, i) => { ws.getColumn(COL0 + i).width = 12; });

  // Title
  const titleRow = ws.addRow(["VB-MAPP — Master Scoring Grid"]);
  titleRow.font = { bold: true, size: 14, color: { argb: "FF1A202C" } };
  ws.mergeCells(1, 1, 1, COL0 + cfg.GRID_COLS.length - 1);
  const sub = ws.addRow([`${cfg.client.nama || "-"}  ·  Tes ke-${cfg.testRound}  ·  ${cfg.client.tanggalAsesmen || ""}`]);
  sub.font = { size: 10, color: { argb: "FF718096" } };
  ws.mergeCells(2, 1, 2, COL0 + cfg.GRID_COLS.length - 1);
  ws.addRow([]); // spacer (row 3)

  // Header row (row 4): domain names, HORIZONTAL, wrapped, tall row.
  const headerCells = ["#", ...cfg.GRID_COLS];
  const hRow = ws.addRow(headerCells);
  hRow.height = 40;
  hRow.eachCell((cell, col) => {
    cell.font = { bold: true, size: 9, color: { argb: "FF2D3748" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; // wrapText keeps it horizontal + multiline
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDF2F7" } };
    cell.border = borderAll;
  });

  // Grid body — milestone rows 15..1
  cfg.GRID_ROWS.forEach(n => {
    const rowVals = [n, ...cfg.GRID_COLS.map(() => "")];
    const r = ws.addRow(rowVals);
    r.height = 18;
    // milestone number cell, tinted by level band
    const numCell = r.getCell(1);
    numCell.value = n;
    numCell.font = { bold: true, size: 10 };
    numCell.alignment = { horizontal: "center", vertical: "middle" };
    numCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(cfg.BAND_TINT[cfg.levelOf(n)]) } };
    numCell.border = borderAll;

    cfg.GRID_COLS.forEach((code, i) => {
      const cell = r.getCell(COL0 + i);
      cell.border = borderAll;
      const c = cfg.cell(code, n);
      if (!c.exists) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
      } else if (c.disabled) {
        cell.fill = { type: "pattern", pattern: "gray125", fgColor: { argb: "FFCBD5E0" }, bgColor: { argb: "FFFFFFFF" } };
      } else if (c.answered && c.score >= 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(cfg.roundColor) } };
      } else if (c.answered && c.score >= 0.5) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(cfg.roundHalf) } };
      }
    });
  });

  // Legend
  ws.addRow([]);
  const legendPairs = [
    [`Tes ke-${cfg.testRound} — 1 (tercapai)`, cfg.roundColor],
    ["½ (parsial)", cfg.roundHalf],
    ["0 / belum dinilai", "#FFFFFF"],
    ["tidak dinilai di level ini", "#E2E8F0"],
    ["dikecualikan / tidak dapat diuji", "#CBD5E0"],
  ];
  legendPairs.forEach(([label, hex]) => {
    const lr = ws.addRow(["", label]);
    const sw = lr.getCell(1);
    sw.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(hex) } };
    sw.border = borderAll;
    lr.getCell(2).font = { size: 10, color: { argb: "FF4A5568" } };
  });

  // ── Sheet 2: Data Klien ──
  const wc = wb.addWorksheet("Data Klien");
  wc.columns = [{ width: 20 }, { width: 36 }];
  wc.addRow(["VB-MAPP MILESTONES — Above & Beyond"]).font = { bold: true, size: 13 };
  wc.addRow([]);
  [
    ["Nama", cfg.client.nama], ["No. Client", cfg.client.noClient], ["Usia", cfg.client.usia],
    ["Tanggal Lahir", cfg.client.tanggalLahir], ["Jenis Kelamin", cfg.client.jenisKelamin],
    ["Diagnosis", cfg.client.diagnosis], ["Asesor", cfg.client.asesor],
    ["Tanggal Asesmen", cfg.client.tanggalAsesmen], ["Tes ke-", cfg.testRound],
  ].forEach(([k, v]) => { const r = wc.addRow([k, v ?? ""]); r.getCell(1).font = { bold: true }; });

  // ── Sheet 3: EESA ──
  const we = wb.addWorksheet("EESA");
  we.columns = [{ width: 42 }, { width: 10 }];
  we.addRow(["Early Echoic Skills Assessment (EESA)"]).font = { bold: true, size: 13 };
  we.addRow([]);
  cfg.eesaGroups.forEach(g => { const r = we.addRow([g.name, g.score]); r.getCell(1).font = { bold: true }; });
  const et = we.addRow(["TOTAL RAW SCORE (Groups 1–5)", cfg.eesaTotal]);
  et.font = { bold: true, size: 12 };

  // ── Sheet 4: Detail per milestone ──
  const wd = wb.addWorksheet("Detail Milestone");
  wd.columns = [{ width: 8 }, { width: 12 }, { width: 6 }, { width: 56 }, { width: 8 }, { width: 40 }];
  wd.addRow(["Level", "Domain", "No.", "Milestone", "Skor", "Respon"]).font = { bold: true };
  cfg.levels.forEach(lv => {
    lv.domains.forEach(d => {
      d.items.forEach(it => {
        const sc = d.disabled ? "—" : it.invalid ? "—" : it.score;
        const data = d.disabled ? "dikecualikan" : it.invalid ? "tidak dapat diuji" : (it.data || "");
        wd.addRow([lv.label, d.name, it.n, it.text, sc, data]);
      });
    });
  });

  // ── Sheet 5: Ringkasan ──
  const wr = wb.addWorksheet("Ringkasan");
  wr.columns = [{ width: 30 }, { width: 16 }];
  wr.addRow(["Level", "Skor"]).font = { bold: true };
  cfg.levels.forEach(lv => wr.addRow([`${lv.label} (${lv.range})`, `${lv.total} / ${lv.max}`]));
  wr.addRow([]);
  wr.addRow(["TOTAL MILESTONES", `${cfg.grandTotal} / ${cfg.grandMax}`]).font = { bold: true, size: 12 };
  wr.addRow([]);
  wr.addRow(["Kesimpulan & Rekomendasi"]).font = { bold: true };
  wr.addRow([cfg.kesimpulan || "(Belum diisi)"]);

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

// ── ABLLS-R ──────────────────────────────────────────────────────────────────
// cfg: { client, testRound, groups:[{code,name,tasks:[{id,nameId,max,score,answer,manual,na}], total, max}],
//        totalGot, totalMax, kesimpulan, rekomendasi }
export async function buildABLLSXlsxBlob(cfg) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = "Above & Beyond Child Development Center";
  wb.created = new Date();

  // Sheet 1: Data Klien + group summary bar
  const wc = wb.addWorksheet("Ringkasan");
  wc.columns = [{ width: 22 }, { width: 40 }];
  wc.addRow(["ABLLS-R — Section H: Intraverbal"]).font = { bold: true, size: 13 };
  wc.addRow([]);
  [
    ["Nama", cfg.client.nama], ["No. Client", cfg.client.noClient], ["Usia", cfg.client.usia],
    ["Tanggal Lahir", cfg.client.tanggalLahir], ["Jenis Kelamin", cfg.client.jenisKelamin],
    ["Diagnosis", cfg.client.diagnosis], ["Asesor", cfg.client.asesor],
    ["Tanggal Asesmen", cfg.client.tanggalAsesmen], ["Tes ke-", cfg.testRound],
  ].forEach(([k, v]) => { const r = wc.addRow([k, v ?? ""]); r.getCell(1).font = { bold: true }; });
  wc.addRow([]);
  wc.addRow(["Kelompok", "Skor"]).font = { bold: true };
  cfg.groups.forEach(g => wc.addRow([`${g.code} — ${g.name}`, `${g.total} / ${g.max}`]));
  wc.addRow(["TOTAL", `${cfg.totalGot} / ${cfg.totalMax}`]).font = { bold: true, size: 12 };

  // Sheet 2: Detail per butir
  const wd = wb.addWorksheet("Detail Butir");
  wd.columns = [{ width: 8 }, { width: 52 }, { width: 8 }, { width: 8 }, { width: 46 }];
  wd.addRow(["Butir", "Deskripsi", "Skor", "Maks", "Jawaban anak"]).font = { bold: true };
  cfg.groups.forEach(g => {
    const gh = wd.addRow([g.code, g.name, "", "", ""]);
    gh.font = { bold: true, color: { argb: "FF2B6CB0" } };
    g.tasks.forEach(t => {
      const skor = t.na ? "NA" : (t.score != null ? t.score : "");
      wd.addRow([t.id, t.nameId, skor, t.max, t.answer || ""]);
    });
  });

  // Sheet 3: Kesimpulan & Rekomendasi
  const wk = wb.addWorksheet("Kesimpulan");
  wk.columns = [{ width: 90 }];
  wk.addRow(["KESIMPULAN & INTERPRETASI"]).font = { bold: true, size: 12 };
  wk.addRow([cfg.kesimpulan || "(Belum diisi)"]);
  wk.addRow([]);
  wk.addRow(["REKOMENDASI PROGRAM"]).font = { bold: true, size: 12 };
  wk.addRow([cfg.rekomendasi || "(Belum diisi)"]);
  wk.getColumn(1).alignment = { wrapText: true, vertical: "top" };

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
