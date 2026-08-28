import { Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType } from "docx";
import { Packer } from "docx";
import {
  BRAND, eyebrow, headline, accentBar, spacer, bodyText, infoTable,
  PAGE_BREAK, buildLetterheadDoc,
} from "./wordBrand.js";

function tint(hex) { return { type: ShadingType.SOLID, color: hex, fill: hex }; }
function cellBorder() { const b = { style: BorderStyle.SINGLE, size: 2, color: BRAND.lightBorder }; return { top: b, bottom: b, left: b, right: b }; }

// cfg: { client, testRound, groups:[{code,name,total,max,tasks:[{id,nameId,max,score,answer,na}]}],
//        totalGot, totalMax, kesimpulan, rekomendasi }
export async function buildABLLSWordBlob(cfg) {
  const dateLabel = cfg.client.tanggalAsesmen || new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
  const children = [];

  // ── PAGE 1: Executive summary ──
  children.push(eyebrow("Laporan Asesmen"));
  children.push(headline("ABLLS-R — Section H: Intraverbal"));
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

  children.push(eyebrow("Ringkasan Skor per Kelompok"));
  const rows = [
    new TableRow({ children: [
      new TableCell({ margins:{top:80,bottom:80,left:120,right:120}, children: [new Paragraph({ children: [new TextRun({ text: "Kelompok", bold: true, color: BRAND.gray, size: 18, font: BRAND.font })] })] }),
      new TableCell({ margins:{top:80,bottom:80,left:120,right:120}, children: [new Paragraph({ children: [new TextRun({ text: "Skor", bold: true, color: BRAND.gray, size: 18, font: BRAND.font })] })] }),
    ]}),
  ];
  cfg.groups.forEach(g => {
    rows.push(new TableRow({ children: [
      new TableCell({ borders: cellBorder(), margins:{top:90,bottom:90,left:120,right:120}, children: [new Paragraph({ children: [new TextRun({ text: `${g.code} — ${g.name}`, bold: true, size: 20, color: BRAND.navy, font: BRAND.font })] })] }),
      new TableCell({ borders: cellBorder(), margins:{top:90,bottom:90,left:120,right:120}, children: [new Paragraph({ children: [new TextRun({ text: `${g.total} / ${g.max}`, bold: true, size: 20, color: BRAND.blue, font: BRAND.font })] })] }),
    ]}));
  });
  children.push(new Table({ width: { size: 9000, type: WidthType.DXA }, rows }));
  children.push(spacer(200));

  children.push(new Paragraph({
    children: [
      new TextRun({ text: "Total Skor: ", bold: true, size: 24, color: BRAND.navy, font: BRAND.font }),
      new TextRun({ text: `${cfg.totalGot} / ${cfg.totalMax}`, bold: true, size: 24, color: BRAND.blue, font: BRAND.font }),
    ],
    spacing: { after: 260 },
  }));

  children.push(eyebrow("Kesimpulan & Interpretasi"));
  children.push(bodyText(cfg.kesimpulan || "(Belum diisi)", { after: 220 }));
  children.push(eyebrow("Rekomendasi Program"));
  children.push(bodyText(cfg.rekomendasi || "(Belum diisi)"));

  // ── PAGE 2+: Full detail per group/task ──
  children.push(PAGE_BREAK);
  children.push(eyebrow("Lampiran"));
  children.push(headline("Detail Skor per Butir", 26));
  children.push(accentBar());
  children.push(spacer(220));

  cfg.groups.forEach(g => {
    children.push(new Paragraph({ spacing: { before: 260, after: 100 }, children: [new TextRun({ text: `${g.code} — ${g.name}  (${g.total}/${g.max})`, bold: true, size: 22, color: BRAND.blue, font: BRAND.font })] }));
    const taskRows = [
      new TableRow({ children: [
        new TableCell({ shading: tint(BRAND.tint), margins:{top:70,bottom:70,left:100,right:100}, children: [new Paragraph({ children: [new TextRun({ text: "Butir", bold: true, size: 17, color: BRAND.gray, font: BRAND.font })] })] }),
        new TableCell({ shading: tint(BRAND.tint), margins:{top:70,bottom:70,left:100,right:100}, children: [new Paragraph({ children: [new TextRun({ text: "Deskripsi", bold: true, size: 17, color: BRAND.gray, font: BRAND.font })] })] }),
        new TableCell({ shading: tint(BRAND.tint), margins:{top:70,bottom:70,left:100,right:100}, children: [new Paragraph({ children: [new TextRun({ text: "Skor", bold: true, size: 17, color: BRAND.gray, font: BRAND.font })] })] }),
        new TableCell({ shading: tint(BRAND.tint), margins:{top:70,bottom:70,left:100,right:100}, children: [new Paragraph({ children: [new TextRun({ text: "Jawaban Anak", bold: true, size: 17, color: BRAND.gray, font: BRAND.font })] })] }),
      ]}),
    ];
    g.tasks.forEach(t => {
      const scoreText = t.na ? "NA" : (t.score != null ? `${t.score}/${t.max}` : "-");
      taskRows.push(new TableRow({ children: [
        new TableCell({ borders: cellBorder(), margins:{top:70,bottom:70,left:100,right:100}, children: [new Paragraph({ children: [new TextRun({ text: t.id, bold: true, size: 18, color: BRAND.navy, font: BRAND.font })] })] }),
        new TableCell({ borders: cellBorder(), margins:{top:70,bottom:70,left:100,right:100}, children: [new Paragraph({ children: [new TextRun({ text: t.nameId, size: 18, color: BRAND.navy, font: BRAND.font })] })] }),
        new TableCell({ borders: cellBorder(), margins:{top:70,bottom:70,left:100,right:100}, children: [new Paragraph({ children: [new TextRun({ text: scoreText, bold: true, size: 18, color: t.na ? BRAND.gray : BRAND.blue, font: BRAND.font })] })] }),
        new TableCell({ borders: cellBorder(), margins:{top:70,bottom:70,left:100,right:100}, children: [new Paragraph({ children: [new TextRun({ text: t.answer || "-", italics: true, size: 17, color: BRAND.gray, font: BRAND.font })] })] }),
      ]}));
    });
    children.push(new Table({ width: { size: 9600, type: WidthType.DXA }, rows: taskRows }));
    children.push(spacer(160));
  });

  const doc = await buildLetterheadDoc({ dateLabel, sections: children });
  return Packer.toBlob(doc);
}
