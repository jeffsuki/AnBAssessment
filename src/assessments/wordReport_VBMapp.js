import { Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType, ShadingType } from "docx";
import { Packer } from "docx";
import {
  BRAND, eyebrow, headline, accentBar, spacer, bodyText, infoTable,
  PAGE_BREAK, buildLetterheadDoc,
} from "./wordBrand.js";

function tint(hex) { return { type: ShadingType.SOLID, color: hex, fill: hex }; }
function cellBorder() { const b = { style: BorderStyle.SINGLE, size: 2, color: BRAND.lightBorder }; return { top: b, bottom: b, left: b, right: b }; }

// cfg: { client, testRound, roundColor, eesaTotal, eesaGroups:[{name,score}],
//        levels:[{id,label,range,total,max,domains:[{code,name,disabled,items:[{n,text,score,invalid,data}]}]}],
//        grandTotal, grandMax, kesimpulan }
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

  children.push(eyebrow("Ringkasan Skor per Level"));
  const rows = [
    new TableRow({ children: [
      new TableCell({ margins: { top:80,bottom:80,left:120,right:120 }, children: [new Paragraph({ children: [new TextRun({ text: "Level", bold: true, color: BRAND.gray, size: 18, font: BRAND.font })] })] }),
      new TableCell({ margins: { top:80,bottom:80,left:120,right:120 }, children: [new Paragraph({ children: [new TextRun({ text: "Rentang Usia", bold: true, color: BRAND.gray, size: 18, font: BRAND.font })] })] }),
      new TableCell({ margins: { top:80,bottom:80,left:120,right:120 }, children: [new Paragraph({ children: [new TextRun({ text: "Skor", bold: true, color: BRAND.gray, size: 18, font: BRAND.font })] })] }),
    ]}),
  ];
  cfg.levels.forEach(lv => {
    rows.push(new TableRow({ children: [
      new TableCell({ borders: cellBorder(), margins: { top:90,bottom:90,left:120,right:120 }, children: [new Paragraph({ children: [new TextRun({ text: lv.label, bold: true, size: 20, color: BRAND.navy, font: BRAND.font })] })] }),
      new TableCell({ borders: cellBorder(), margins: { top:90,bottom:90,left:120,right:120 }, children: [new Paragraph({ children: [new TextRun({ text: lv.range, size: 20, color: BRAND.navy, font: BRAND.font })] })] }),
      new TableCell({ borders: cellBorder(), margins: { top:90,bottom:90,left:120,right:120 }, children: [new Paragraph({ children: [new TextRun({ text: `${lv.total} / ${lv.max}`, bold: true, size: 20, color: BRAND.blue, font: BRAND.font })] })] }),
    ]}));
  });
  children.push(new Table({ width: { size: 9000, type: WidthType.DXA }, rows }));
  children.push(spacer(200));

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
