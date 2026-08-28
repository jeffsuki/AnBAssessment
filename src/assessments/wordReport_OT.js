import { Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType } from "docx";
import {
  BRAND, eyebrow, headline, accentBar, spacer, bodyText, infoTable,
  sectionScoreRow, PAGE_BREAK, buildLetterheadDoc,
} from "./wordBrand.js";

const FLAG_LABEL = { Typical: "Tipikal", Tipikal: "Tipikal", Kemungkinan: "Kemungkinan", Definitif: "Definitif" };
const FLAG_HEX = { Typical: "38A169", Tipikal: "38A169", Kemungkinan: "D69E2E", Definitif: "E53E3E" };

function coloredCell(text, hex) {
  return new TableCell({
    width: { size: 2000, type: WidthType.DXA },
    shading: { type: "solid", color: hex, fill: hex },
    margins: { top: 90, bottom: 90, left: 120, right: 120 },
    borders: { top: { style: BorderStyle.SINGLE, size: 2, color: hex }, bottom: { style: BorderStyle.SINGLE, size: 2, color: hex }, left: { style: BorderStyle.SINGLE, size: 2, color: hex }, right: { style: BorderStyle.SINGLE, size: 2, color: hex } },
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, bold: true, color: "FFFFFF", size: 18, font: BRAND.font })] })],
  });
}

// cfg: { client, testRound, sections:[{code,name,total,max,flagLabel,catatan,items:[{n,text,score,data}]}],
//        totalGot, totalMax, kesimpulan }
export async function buildOTWordBlob(cfg) {
  const dateLabel = cfg.client.tanggalAsesmen || new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
  const children = [];

  // ── PAGE 1: Executive summary ──
  children.push(eyebrow("Laporan Asesmen"));
  children.push(headline("ANB / OT Assessment"));
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
  ]));
  children.push(spacer(260));

  children.push(eyebrow("Ringkasan Skor"));
  const rows = [
    new TableRow({ children: [
      new TableCell({ width: { size: 3600, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Aspek", bold: true, color: BRAND.gray, size: 18, font: BRAND.font })] })] }),
      new TableCell({ width: { size: 1800, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Skor", bold: true, color: BRAND.gray, size: 18, font: BRAND.font })] })] }),
      new TableCell({ width: { size: 2000, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Kategori", bold: true, color: BRAND.gray, size: 18, font: BRAND.font })] })] }),
      new TableCell({ width: { size: 3200, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: "Catatan", bold: true, color: BRAND.gray, size: 18, font: BRAND.font })] })] }),
    ] }),
  ];
  cfg.sections.forEach(s => {
    const hex = FLAG_HEX[s.flagLabel] || "A0AEC0";
    const label = FLAG_LABEL[s.flagLabel] || "-";
    rows.push(new TableRow({ children: [
      new TableCell({ margins: { top: 90, bottom: 90, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: `${s.code} — ${s.name}`, bold: true, size: 20, color: BRAND.navy, font: BRAND.font })] })] }),
      new TableCell({ margins: { top: 90, bottom: 90, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: `${s.total} / ${s.max}`, size: 20, color: BRAND.navy, font: BRAND.font })] })] }),
      coloredCell(label, hex),
      new TableCell({ margins: { top: 90, bottom: 90, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: s.catatan || "-", italics: true, size: 18, color: BRAND.gray, font: BRAND.font })] })] }),
    ] }));
  });
  children.push(new Table({ width: { size: 10600, type: WidthType.DXA }, rows }));
  children.push(spacer(200));

  children.push(new Paragraph({
    children: [
      new TextRun({ text: "Total Skor: ", bold: true, size: 24, color: BRAND.navy, font: BRAND.font }),
      new TextRun({ text: `${cfg.totalGot} / ${cfg.totalMax}`, bold: true, size: 24, color: BRAND.blue, font: BRAND.font }),
    ],
    spacing: { after: 260 },
  }));

  children.push(eyebrow("Kesimpulan & Rekomendasi Klinis"));
  children.push(bodyText(cfg.kesimpulan || "(Belum diisi)"));

  // ── PAGE 2+: Full detail ──
  children.push(PAGE_BREAK);
  children.push(eyebrow("Lampiran"));
  children.push(headline("Detail Skor per Aspek", 26));
  children.push(accentBar());
  children.push(spacer(220));

  cfg.sections.forEach(s => {
    children.push(new Paragraph({ spacing: { before: 200, after: 100 }, children: [new TextRun({ text: `${s.code} — ${s.name}  (${s.total}/${s.max})`, bold: true, size: 22, color: BRAND.blue, font: BRAND.font })] }));
    const detailRows = [];
    s.items.forEach(it => {
      detailRows.push(sectionScoreRow(it.text || `Item ${it.n}`, String(it.score), null, it.data));
    });
    if (detailRows.length) children.push(new Table({ width: { size: 10600, type: WidthType.DXA }, rows: detailRows }));
    if (s.catatan) children.push(bodyText(`Catatan: ${s.catatan}`, { italics: true, size: 19, color: BRAND.gray, after: 80 }));
    children.push(spacer(160));
  });

  const doc = await buildLetterheadDoc({ dateLabel, sections: children });
  return Packer.toBlob(doc);
}
