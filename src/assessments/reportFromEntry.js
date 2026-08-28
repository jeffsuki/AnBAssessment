// Regenerate the branded Word report (.docx) from a saved `assessments` row.
// -----------------------------------------------------------------------------
// Every assessment row stores its full item-level payload in the JSONB `data`
// column, so a report can always be rebuilt client-side — even when the upload
// to Storage failed at save time and `report_docx_path` is null. The Dashboard
// uses this so the download button is never missing.
//
// Static imports: App.jsx already loads all three assessment modules, so
// dynamic import here would buy nothing but build warnings.

import { vbmappCfgFromEntry } from "./VBMapp_Assessment.jsx";
import { otCfgFromEntry } from "./OT_Assessment.jsx";
import { abllsCfgFromEntry } from "./ABLLS_Assessment.jsx";
import { buildVbmappWordBlob } from "./wordReport_VBMapp.js";
import { buildOTWordBlob } from "./wordReport_OT.js";
import { buildABLLSWordBlob } from "./wordReport_ABLLS.js";

const TYPE_LABEL = { VBMAPP: "VBMapp", OT: "ANB_OT", ABLLS: "ABLLSR" };

export function reportFilenameFor(entry) {
  const label = TYPE_LABEL[entry.type] || entry.type || "Asesmen";
  const name = (entry.client_name || (entry.data && entry.data.nama) || "klien").replace(/\s+/g, "_");
  const round = entry.test_round ? `_Tes${entry.test_round}` : "";
  const date = entry.assessment_date || (entry.data && entry.data.tanggalAsesmen)
    || new Date().toISOString().slice(0, 10);
  return `${label}_Laporan_${name}${round}_${date}.docx`;
}

export async function buildWordBlobFromEntry(entry) {
  switch (entry.type) {
    case "VBMAPP": return buildVbmappWordBlob(vbmappCfgFromEntry(entry));
    case "OT":     return buildOTWordBlob(otCfgFromEntry(entry));
    case "ABLLS":  return buildABLLSWordBlob(abllsCfgFromEntry(entry));
    default: throw new Error(`Jenis asesmen tidak dikenal: ${entry.type}`);
  }
}

// Build + trigger a browser download in one call.
export async function downloadWordFromEntry(entry) {
  const blob = await buildWordBlobFromEntry(entry);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = reportFilenameFor(entry);
  a.click();
  URL.revokeObjectURL(url);
}

// ── PLAIN-TEXT REPORT ────────────────────────────────────────────────────────
// Same source of truth as the Word report (the rebuilt cfg), rendered as a
// monospaced .txt — useful for quick review, email, and archiving.
const pad = (s, n) => String(s).padEnd(n);
const RULE = "============================================================";
const THIN = "------------------------------------------------------------";

function header(L, title, cfg) {
  const printed = new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
  L.push(`ABOVE & BEYOND — ${title}`);
  L.push(RULE);
  L.push(`Tanggal Cetak : ${printed}`);
  if (cfg.testRound) L.push(`Tes ke-       : ${cfg.testRound}`);
  L.push("");
  L.push("DATA KLIEN");
  L.push(`Nama          : ${cfg.client.nama || "-"}`);
  L.push(`No. Client    : ${cfg.client.noClient || "-"}`);
  L.push(`Usia          : ${cfg.client.usia || "-"}`);
  L.push(`Jenis Kelamin : ${cfg.client.jenisKelamin || "-"}`);
  L.push(`Diagnosis     : ${cfg.client.diagnosis || "-"}`);
  L.push(`Asesor        : ${cfg.client.asesor || "-"}`);
  L.push(`Tgl. Asesmen  : ${cfg.client.tanggalAsesmen || "-"}`);
  L.push("");
}

function footer(L, cfg, kesimpulan, rekomendasi) {
  L.push("");
  L.push(RULE);
  L.push("KESIMPULAN & REKOMENDASI KLINIS");
  L.push(RULE);
  L.push(kesimpulan || "(Belum diisi)");
  if (rekomendasi !== undefined) {
    L.push("");
    L.push("REKOMENDASI PROGRAM");
    L.push(rekomendasi || "(Belum diisi)");
  }
  L.push("");
  L.push(`Dicetak oleh: ${cfg.client.asesor || "-"}`);
  L.push("Above & Beyond Child Development Center — Medan");
}

export function buildTxtFromEntry(entry) {
  const L = [];
  if (entry.type === "VBMAPP") {
    const cfg = vbmappCfgFromEntry(entry);
    header(L, "VB-MAPP MILESTONES ASSESSMENT", cfg);
    L.push("REKAP SKOR PER LEVEL");
    L.push(THIN);
    cfg.levels.forEach(lv => {
      L.push(`${lv.label} (${lv.range})  ${lv.total} / ${lv.max}`);
      lv.domains.forEach(d => {
        if (d.disabled) { L.push(`   ${pad(d.name, 26)} dikecualikan`); return; }
        const got = d.items.reduce((s, it) => s + (it.invalid ? 0 : it.score), 0);
        const max = d.items.filter(it => !it.invalid).length;
        L.push(`   ${pad(d.name, 26)} ${String(got).padStart(4)} / ${max}`);
      });
    });
    L.push(THIN);
    L.push(`TOTAL MILESTONES : ${cfg.grandTotal} / ${cfg.grandMax}`);
    L.push(`SKOR EESA        : ${cfg.eesaTotal}`);
    L.push("");
    L.push("DETAIL PER MILESTONE");
    L.push(RULE);
    cfg.levels.forEach(lv => {
      L.push("");
      L.push(`### ${lv.label} — ${lv.range}`);
      lv.domains.forEach(d => {
        if (d.disabled) return;
        L.push("");
        L.push(`${d.code} — ${d.name}`);
        d.items.forEach(it => {
          L.push(`  ${String(it.n).padStart(2)}. (${it.invalid ? "—" : it.score})  ${it.text}`);
        });
      });
    });
    footer(L, cfg, cfg.kesimpulan);
  } else if (entry.type === "OT") {
    const cfg = otCfgFromEntry(entry);
    header(L, "CLINICAL ASSESSMENT REPORT (OT / ANB)", cfg);
    L.push("RINGKASAN SKOR PER ASPEK");
    L.push(THIN);
    cfg.sections.forEach(s => {
      L.push(`${pad(`${s.code} — ${s.name}`, 40)} ${String(s.total).padStart(3)} / ${s.max}   ${s.flagLabel || "-"}`);
      if (s.catatan) L.push(`   Catatan: ${s.catatan}`);
    });
    L.push(THIN);
    L.push(`TOTAL SKOR : ${cfg.totalGot} / ${cfg.totalMax}`);
    L.push("");
    L.push("DETAIL PER BUTIR");
    L.push(RULE);
    cfg.sections.forEach(s => {
      L.push("");
      L.push(`${s.code} — ${s.name}  (${s.total}/${s.max})`);
      s.items.forEach(it => L.push(`  ${String(it.n).padStart(2)}. [${it.score}] ${pad(it.data, 13)} ${it.text}`));
    });
    footer(L, cfg, cfg.kesimpulan);
  } else if (entry.type === "ABLLS") {
    const cfg = abllsCfgFromEntry(entry);
    header(L, "ABLLS-R SECTION H — INTRAVERBAL", cfg);
    L.push("RINGKASAN SKOR PER KELOMPOK");
    L.push(THIN);
    cfg.groups.forEach(g => {
      L.push(`${pad(`${g.code} — ${g.name}`, 40)} ${String(g.total).padStart(3)} / ${g.max}`);
      if (g.catatan) L.push(`   Catatan: ${g.catatan}`);
    });
    L.push(THIN);
    L.push(`TOTAL SKOR : ${cfg.totalGot} / ${cfg.totalMax}`);
    L.push("");
    L.push("DETAIL PER BUTIR");
    L.push(RULE);
    cfg.groups.forEach(g => {
      L.push("");
      L.push(`${g.code} — ${g.name}  (${g.total}/${g.max})`);
      g.tasks.forEach(t => {
        L.push(`  ${pad(t.id, 5)} [${t.na ? "NA" : `${t.score ?? "-"}/${t.max}`}] ${t.nameId}`);
        if (t.answer) L.push(`        Jawaban: ${t.answer.replace(/\n/g, " / ")}`);
      });
    });
    footer(L, cfg, cfg.kesimpulan, cfg.rekomendasi);
  } else {
    throw new Error(`Jenis asesmen tidak dikenal: ${entry.type}`);
  }
  return L.join("\n");
}

export function downloadTxtFromEntry(entry) {
  const blob = new Blob([buildTxtFromEntry(entry)], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = reportFilenameFor(entry).replace(/\.docx$/, ".txt");
  a.click();
  URL.revokeObjectURL(url);
}
