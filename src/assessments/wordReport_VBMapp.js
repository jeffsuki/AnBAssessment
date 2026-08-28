import { Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType, ShadingType } from "docx";
import { Packer } from "docx";
import {
  BRAND, eyebrow, headline, accentBar, spacer, bodyText, infoTable,
  PAGE_BREAK, buildLetterheadDoc,
} from "./wordBrand.js";

function tint(hex) { return { type: ShadingType.SOLID, color: hex, fill: hex }; }
function cellBorder() { const b = { style: BorderStyle.SINGLE, size: 2, color: BRAND.lightBorder }; return { top: b, bottom: b, left: b, right: b }; }
function gridCellBorder(hex) { const b = { style: BorderStyle.SINGLE, size: 2, color: hex }; return { top: b, bottom: b, left: b, right: b }; }

// Renders the VB-MAPP pyramid grid as an actual docx table (not a data table):
// domain codes across the top, HORIZONTAL and WIDE (no rotation, generous
// column width), milestone numbers 15→1 down the side, cells colored to match
// the on-screen Rekap and the Excel export.
// Requires cfg.GRID_COLS, cfg.GRID_ROWS, cfg.levelOf, cfg.BAND_TINT, cfg.cell,
// cfg.roundColor, cfg.roundHalf (all present in the cfg built by buildXlsxCfg()).
function buildGridTable(cfg) {
  const LABEL_W = 460;
  const COL_W = 570; // wide enough for horizontal 2-line domain names, no rotation
  const header = new TableRow({
    height: { value: 620, rule: "atLeast" },
    children: [
      new TableCell({ width: { size: LABEL_W, type: WidthType.DXA }, shading: tint(BRAND.navy), children: [new Paragraph("")] }),
      ...cfg.GRID_COLS.map(code => new TableCell({
        width: { size: COL_W, type: WidthType.DXA },
        shading: tint("EDF2F7"),
        margins: { top: 60, bottom: 60, left: 40, right: 40 },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: code, bold: true, size: 14, color: BRAND.navy, font: BRAND.font })] })],
      })),
    ],
  });

  const rows = [header];
  cfg.GRID_ROWS.forEach(n => {
    const bandHex = cfg.BAND_TINT[cfg.levelOf(n)].replace("#", "");
    const numberCell = new TableCell({
      width: { size: LABEL_W, type: WidthType.DXA },
      shading: tint(bandHex),
      margins: { top: 50, bottom: 50, left: 60, right: 60 },
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(n), bold: true, size: 16, color: BRAND.navy, font: BRAND.font })] })],
    });
    const domainCells = cfg.GRID_COLS.map(code => {
      const c = cfg.cell(code, n);
      let fillHex = "FFFFFF";
      if (!c.exists) fillHex = "E2E8F0";
      else if (c.disabled) fillHex = "CBD5E0";
      else if (c.answered && c.score >= 1) fillHex = cfg.roundColor.replace("#", "");
      else if (c.answered && c.score >= 0.5) fillHex = cfg.roundHalf.replace("#", "");
      return new TableCell({
        width: { size: COL_W, type: WidthType.DXA },
        shading: tint(fillHex),
        borders: gridCellBorder("FFFFFF"),
        children: [new Paragraph("")],
      });
    });
    rows.push(new TableRow({ height: { value: 300, rule: "atLeast" }, children: [numberCell, ...domainCells] }));
  });

  return new Table({ width: { size: LABEL_W + COL_W * cfg.GRID_COLS.length, type: WidthType.DXA }, rows });
}

function gridLegend(cfg) {
  const items = [
    [`Tes ke-${cfg.testRound} — tercapai (1)`, cfg.roundColor],
    ["parsial (½)", cfg.roundHalf],
    ["belum dinilai (0)", "FFFFFF"],
    ["tidak dinilai di level ini", "E2E8F0"],
    ["dikecualikan / tidak dapat diuji", "CBD5E0"],
  ];
  const runs = [];
  items.forEach(([label], i) => {
    if (i > 0) runs.push(new TextRun({ text: "    ", font: BRAND.font }));
    runs.push(new TextRun({ text: "■ ", color: items[i][1], bold: true, font: BRAND.font, size: 18 }));
    runs.push(new TextRun({ text: label, size: 16, color: BRAND.gray, font: BRAND.font }));
  });
  return new Paragraph({ spacing: { before: 120, after: 0 }, children: runs });
}

// cfg: everything buildXlsxCfg() in VBMapp_Assessment.jsx produces —
//   { client, testRound, roundColor, roundHalf, GRID_COLS, GRID_ROWS, levelOf,
//     BAND_TINT, cell, eesaGroups, eesaTotal, levels:[{id,label,range,total,max,
//     domains:[{code,name,disabled,items:[{n,text,score,invalid,data}]}]}],
//     grandTotal, grandMax, kesimpulan }
export async function buildVbmappWordBlob(cfg) {
  const dateLabel = cfg.client.tanggalAsesmen || new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
  const children = [];

  // ── PAGE 1: Executive summary ──
  children.push(eyebrow("Laporan Asesmen"));
  children.push(headline("VB-MAPP Milestones Assessment"));
  children.push(accentBar());
  children.push(spacer(220));

  children.push(infoTable([
    ["Nama Anak", cfg.client.nama],
    ["No. Client", cfg.client.noClient],
    ["Usia", cfg.client.usia],
    ["Jenis Kelamin", cfg.client.jenisKelamin],
    ["Diagnosis", cfg.client.diagnosis],
    ["Asesor", cfg.client.asesor],
    ["Tanggal Asesmen", cfg.client.tanggalAsesmen],
    ["Tes ke-", String(cfg.testRound)],
  ]));
  children.push(spacer(260));

  children.push(eyebrow("Rekap — Grafik VB-MAPP"));
  children.push(buildGridTable(cfg));
  children.push(gridLegend(cfg));
  children.push(spacer(220));

  children.push(new Paragraph({
    children: [
      new TextRun({ text: "Total Milestones: ", bold: true, size: 24, color: BRAND.navy, font: BRAND.font }),
      new TextRun({ text: `${cfg.grandTotal} / ${cfg.grandMax}`, bold: true, size: 24, color: BRAND.blue, font: BRAND.font }),
    ],
    spacing: { after: 120 },
  }));
  children.push(bodyText(`Skor EESA (Early Echoic Skills Assessment): ${cfg.eesaTotal}`, { after: 260 }));

  children.push(eyebrow("Kesimpulan & Rekomendasi Klinis"));
  children.push(bodyText(cfg.kesimpulan || "(Belum diisi)"));

  // ── PAGE 2+: Full detail per level/domain ──
  children.push(PAGE_BREAK);
  children.push(eyebrow("Lampiran"));
  children.push(headline("Detail Milestone per Level & Domain", 26));
  children.push(accentBar());
  children.push(spacer(220));

  cfg.levels.forEach(lv => {
    children.push(new Paragraph({ spacing: { before: 260, after: 100 }, children: [new TextRun({ text: `${lv.label} — ${lv.range}  (${lv.total}/${lv.max})`, bold: true, size: 23, color: BRAND.blue, font: BRAND.font })] }));
    lv.domains.forEach(d => {
      if (d.disabled) {
        children.push(bodyText(`${d.code} — ${d.name}: dikecualikan dari penilaian`, { italics: true, color: BRAND.gray, size: 19, after: 100 }));
        return;
      }
      const domainRows = [
        new TableRow({ children: [
          new TableCell({ shading: tint(BRAND.tint), margins:{top:70,bottom:70,left:100,right:100}, children: [new Paragraph({ children: [new TextRun({ text: "No.", bold: true, size: 17, color: BRAND.gray, font: BRAND.font })] })] }),
          new TableCell({ shading: tint(BRAND.tint), margins:{top:70,bottom:70,left:100,right:100}, children: [new Paragraph({ children: [new TextRun({ text: "Milestone", bold: true, size: 17, color: BRAND.gray, font: BRAND.font })] })] }),
          new TableCell({ shading: tint(BRAND.tint), margins:{top:70,bottom:70,left:100,right:100}, children: [new Paragraph({ children: [new TextRun({ text: "Skor", bold: true, size: 17, color: BRAND.gray, font: BRAND.font })] })] }),
        ]}),
      ];
      d.items.forEach(it => {
        const scoreText = it.invalid ? "—" : String(it.score);
        domainRows.push(new TableRow({ children: [
          new TableCell({ borders: cellBorder(), margins:{top:70,bottom:70,left:100,right:100}, children: [new Paragraph({ children: [new TextRun({ text: String(it.n), size: 18, color: BRAND.navy, font: BRAND.font })] })] }),
          new TableCell({ borders: cellBorder(), margins:{top:70,bottom:70,left:100,right:100}, children: [new Paragraph({ children: [new TextRun({ text: it.text, size: 18, color: BRAND.navy, font: BRAND.font })] })] }),
          new TableCell({ borders: cellBorder(), margins:{top:70,bottom:70,left:100,right:100}, children: [new Paragraph({ children: [new TextRun({ text: scoreText, bold: true, size: 18, color: it.invalid ? BRAND.gray : BRAND.blue, font: BRAND.font })] })] }),
        ]}));
      });
      children.push(new Paragraph({ spacing: { before: 140, after: 60 }, children: [new TextRun({ text: `${d.code} — ${d.name}`, bold: true, size: 20, color: BRAND.navy, font: BRAND.font })] }));
      children.push(new Table({ width: { size: 9600, type: WidthType.DXA }, rows: domainRows }));
    });
  });

  const doc = await buildLetterheadDoc({ dateLabel, sections: children });
  return Packer.toBlob(doc);
}
