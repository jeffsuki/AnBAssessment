import { useState, useCallback } from "react";
import JSZip from "jszip";
import templateUrl from "./ot_template.xlsx?url";
import { supabase, STORAGE_BUCKET, isConfigured } from "../supabaseClient.js";

// ── DATA ──────────────────────────────────────────────────────────────────────

const SCALE = [
  { value: 1, label: "Selalu" },
  { value: 2, label: "Sering" },
  { value: 3, label: "Kadang" },
  { value: 4, label: "Jarang" },
  { value: 5, label: "Tidak Pernah" },
];

// ── EXCEL TEMPLATE MAP (OT_Assesment_Form.xlsx) ───────────────────────────────
// Maps each section's per-item score to its cell (col G, merged G:I) in the
// bundled template, plus the Kategori cell in the REKAP block (col J) that
// gets background-colored by classification. Client values go in C8:C15.
const TEMPLATE_CLIENT_CELLS = {
  nama: "C8", usia: "C9", tanggalLahir: "C10", jenisKelamin: "C11",
  diagnosis: "C12", asesor: "C13", tanggalAsesmen: "C14", noClient: "C15",
};
// section id -> { rows: [score rows in col G], kategori: rekap cell in col J }
const TEMPLATE_SECTION_MAP = {
  s1:  { rows: [27, 28, 29, 30, 31, 32, 33], kategori: "J142" },
  s2:  { rows: [39, 40, 41, 42],             kategori: "J143" },
  s3:  { rows: [48, 49, 50],                 kategori: "J144" },
  s4:  { rows: [56, 57, 58, 59, 60, 61, 62], kategori: "J145" },
  s5:  { rows: [68, 69, 70, 71, 72, 73, 74], kategori: "J146" },
  s6:  { rows: [80, 81, 82, 83, 84, 85],     kategori: "J147" },
  s7:  { rows: [91, 92, 93, 94],             kategori: "J148" },
  s8:  { rows: [103, 104, 105, 106, 107, 108, 109], kategori: "J149" },
  s9:  { rows: [117, 118, 119, 120, 121, 122, 123], kategori: "J150" },
  s10: { rows: [131, 132, 133, 134, 135, 136, 137], kategori: "J151" },
};
const KESIMPULAN_CELL = "B155";
// Category label + fill (ARGB rgb, no leading #) matching the app's flags.
// Injected directly into styles.xml via a surgical zip edit so the workbook is
// never rewritten by a library that could corrupt it.
const KATEGORI = {
  Typical:     { text: "Tipikal",     rgb: "FF38A169" },
  Kemungkinan: { text: "Kemungkinan", rgb: "FFD69E2E" },
  Definitif:   { text: "Definitif",   rgb: "FFE53E3E" },
};
const KATEGORI_ORDER = ["Typical", "Kemungkinan", "Definitif"];

const SECTIONS = [
  {
    id: "s1", code: "S1", label: "Tactile Sensitivity", tab: "Tactile", max: 35,
    items: [
      "Defensivitas taktil terhadap atribut pakaian (label, jahitan, tekstil)",
      "Menghindari atau menolak kontak fisik yang diinisiasi orang lain",
      "Menolak berjalan tanpa alas kaki pada permukaan tertentu (pasir, rumput)",
      "Hipersensitivitas taktil pada area wajah dan kepala",
      "Startle response berlebihan terhadap stimulasi taktil ringan tak diantisipasi",
      "Menghindari kontak dengan material messy (cat, tanah, lem, pasir basah)",
      "Ketidaknyamanan terhadap pakaian baru atau yang baru dicuci",
    ],
  },
  {
    id: "s2", code: "S2", label: "Taste / Smell", tab: "Taste & Smell", max: 20,
    items: [
      "Penolakan terhadap makanan berdasarkan karakteristik olfaktori",
      "Hipersensitivitas terhadap stimulus olfaktori lingkungan",
      "Menghindari makanan dengan karakteristik gustatori kuat / menyengat",
      "Perilaku mengendus objek sebelum interaksi (mouthing / sniffing)",
    ],
  },
  {
    id: "s3", code: "S3", label: "Vestibular / Movement", tab: "Vestibular", max: 15,
    items: [
      "Gravitational insecurity / intoleransi aktivitas dengan input vestibular",
      "Motion sickness / hipersensitivitas terhadap stimulasi vestibular pasif",
      "Fear response berlebihan terhadap perubahan posisi kepala atau ketinggian",
    ],
  },
  {
    id: "s4", code: "S4", label: "Underresponsive / Seeks Sensation", tab: "Underresponsive", max: 35,
    items: [
      "Hiporesponsivitas terhadap stimulus taktil pada wajah dan tangan",
      "Ambang nyeri tinggi / hiporesponsivitas terhadap stimulus nosiseptif",
      "Sensation seeking berulang — mencari input proprioseptif intens",
      "Body awareness rendah, sering menabrak orang atau benda",
      "Hiporesponsivitas terhadap stimulus suhu lingkungan",
      "Preferensi terhadap stimulasi sensoris berintensitas tinggi secara konsisten",
      "Respons lambat atau tidak ada terhadap stimulus auditori dan taktil",
    ],
  },
  {
    id: "s5", code: "S5", label: "Auditory Filtering", tab: "Auditory", max: 35,
    thresholds: { kemungkinanMin: 21, tipikalMin: 26 }, // 0–20 Definitif · 21–25 Kemungkinan · ≥26 Tipikal
    items: [
      "Distraksi auditif yang mempengaruhi atensi dan performa fungsional",
      "Sulit memproses instruksi verbal di lingkungan dengan background noise",
      "Defisit auditory figure-ground — sulit memilah stimulus relevan dari noise",
      "Hiporesponsivitas terhadap stimulus auditori verbal / nama dipanggil",
      "Penurunan performa fungsional di lingkungan dengan kebisingan tinggi",
      "Sulit melakukan auditory filtering terhadap stimulus tidak relevan",
      "Sering meminta pengulangan instruksi verbal (echoic memory deficit)",
    ],
  },
  {
    id: "s6", code: "S6", label: "Low Energy / Hypotonia", tab: "Low Energy", max: 30,
    items: [
      "Hipotonia umum yang berdampak pada aktivitas fungsional sehari-hari",
      "Penurunan daya tahan fisik (endurance) yang signifikan secara fungsional",
      "Memerlukan external support untuk mempertahankan postur duduk tegak",
      "Kompensasi bilateral pada tugas unilateral yang sesuai tahap perkembangan",
      "Kualitas gerakan lemah dengan effort berlebihan relatif terhadap tugas",
      "Postural instability yang konsisten saat duduk dan berdiri",
    ],
  },
  {
    id: "s7", code: "S7", label: "Visual / Auditory Sensitivity", tab: "Visual", max: 20,
    items: [
      "Kesulitan fungsional di lingkungan dengan stimulasi audiovisual tinggi",
      "Fotosensitivitas yang berdampak pada partisipasi dalam aktivitas",
      "Visual overresponsivity terhadap lingkungan kaya stimulus visual",
      "Distraksi visual signifikan terhadap gerakan di area periferal",
    ],
  },
  {
    id: "s8", code: "S8", label: "Gross Motor", tab: "Gross Motor", max: 35,
    items: [
      "Kesulitan postural control saat duduk atau berdiri tanpa support eksternal",
      "Defisit koordinasi bilateral pada gerakan kasar (jumping jacks, melompat)",
      "Kesulitan keseimbangan statis (berdiri satu kaki sesuai usia)",
      "Kesulitan keseimbangan dinamis (berjalan garis lurus, naik-turun tangga)",
      "Defisit koordinasi mata-tangan-kaki (menendang, menangkap, melempar bola)",
      "Kesulitan motor planning pada gerakan kasar baru (meniru gerakan/urutan)",
      "Kelemahan core strength yang berdampak pada aktivitas fungsional",
    ],
  },
  {
    id: "s9", code: "S9", label: "Fine Motor", tab: "Fine Motor", max: 35,
    items: [
      "Grasp pattern pensil yang belum sesuai tahap perkembangan usia",
      "Defisit koordinasi bilateral tangan (memegang kertas sambil menggunting)",
      "Kesulitan in-hand manipulation (meronce, memutar objek kecil di tangan)",
      "Kekuatan genggaman (grip strength) yang lemah secara fungsional",
      "Ketepatan visual-motor yang rendah (mewarnai dalam garis, menyusun puzzle)",
      "Kontrol tekanan alat tulis tidak sesuai (terlalu kuat / terlalu lemah)",
      "Kesulitan self-care fine motor (kancing baju, tali sepatu, sendok-garpu)",
    ],
  },
  {
    id: "s10", code: "S10", label: "Arousal & Self-Regulation", tab: "Arousal", max: 35,
    thresholds: { kemungkinanMin: 21, tipikalMin: 28 }, // 0–20 Definitif · 21–27 Kemungkinan · ≥28 Tipikal
    items: [
      "Tanda over-arousal (gelisah, hiperaktif, reaktif berlebihan terhadap stimulus)",
      "Tanda under-arousal (lesu, lambat merespons, tampak mengantuk / low alert)",
      "Mampu kembali ke kondisi tenang (regulated) setelah aktivitas intens secara mandiri",
      "Transisi arousal yang tiba-tiba (dari tenang ke sangat aktif, atau sebaliknya)",
      "Membutuhkan bantuan eksternal signifikan untuk kembali tenang (high co-regulation)",
      "Mampu mempertahankan kondisi alert optimal untuk aktivitas terstruktur sesuai usia",
      "Respons fight-flight-freeze saat menghadapi stimulus sensoris yang tidak disukai",
    ],
  },
];

// ── SCORING HELPERS ──────────────────────────────────────────────────────────

function sectionTotal(scores, sectionId) {
  const section = SECTIONS.find(s => s.id === sectionId);
  if (!section) return 0;
  return section.items.reduce((sum, _, i) => {
    const v = scores[`${sectionId}_${i}`];
    return sum + (v ? parseInt(v) : 0);
  }, 0);
}

function sectionFlag(total, section) {
  if (total === 0) return null;
  if (section.thresholds) {
    const { kemungkinanMin, tipikalMin } = section.thresholds;
    if (total < kemungkinanMin) return { label: "Definitif", color: "#E53E3E", bg: "#FFF5F5" };
    if (total < tipikalMin) return { label: "Kemungkinan", color: "#D69E2E", bg: "#FFFFF0" };
    return { label: "Typical", color: "#38A169", bg: "#F0FFF4" };
  }
  const pct = total / section.max;
  if (pct < 0.5) return { label: "Definitif", color: "#E53E3E", bg: "#FFF5F5" };
  if (pct < 0.75) return { label: "Kemungkinan", color: "#D69E2E", bg: "#FFFFF0" };
  return { label: "Typical", color: "#38A169", bg: "#F0FFF4" };
}

function sectionComplete(scores, section) {
  return section.items.every((_, i) => scores[`${section.id}_${i}`]);
}

// ── COMPONENTS ───────────────────────────────────────────────────────────────

function ScoreButton({ value, selected, onChange }) {
  const scale = SCALE.find(s => s.value === value);
  return (
    <button
      onClick={() => onChange(value)}
      style={{
        flex: 1,
        padding: "10px 4px",
        border: selected ? "2px solid #2B6CB0" : "1.5px solid #CBD5E0",
        borderRadius: 8,
        background: selected ? "#2B6CB0" : "#fff",
        color: selected ? "#fff" : "#4A5568",
        fontSize: 13,
        fontWeight: selected ? 700 : 400,
        cursor: "pointer",
        transition: "all 0.15s",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 3,
        minWidth: 0,
      }}
    >
      <span style={{ fontSize: 18, fontWeight: 700, lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 11, lineHeight: 1.2, textAlign: "center" }}>{scale?.label}</span>
    </button>
  );
}

function SectionTab({ section, active, complete, total, onClick }) {
  const flag = sectionFlag(total, section);
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 3,
        padding: "10px 14px",
        border: "none",
        borderBottom: active ? "3px solid #2B6CB0" : "3px solid transparent",
        background: "transparent",
        cursor: "pointer",
        whiteSpace: "nowrap",
        transition: "border-color 0.15s",
      }}
    >
      <span style={{
        fontSize: 12,
        fontWeight: 700,
        color: active ? "#2B6CB0" : "#718096",
      }}>
        {section.tab}
      </span>
      {complete && flag ? (
        <span style={{
          width: 7, height: 7, borderRadius: "50%",
          background: flag.color, display: "block",
        }} />
      ) : complete ? (
        <span style={{ fontSize: 10, color: "#38A169", lineHeight: 1 }}>✓</span>
      ) : (
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#E2E8F0", display: "block" }} />
      )}
    </button>
  );
}

// ── MAIN APP ─────────────────────────────────────────────────────────────────

export default function ANBAssessment() {
  const [tab, setTab] = useState("client");
  const [client, setClient] = useState({
    nama: "", noClient: "", usia: "", tanggalLahir: "",
    jenisKelamin: "", diagnosis: "", asesor: "", tanggalAsesmen: "",
  });
  const [scores, setScores] = useState({});
  const [notes, setNotes] = useState({});
  const [kesimpulan, setKesimpulan] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [xlsxBusy, setXlsxBusy] = useState(false);
  const [xlsxError, setXlsxError] = useState("");

  const setScore = useCallback((key, value) => {
    setScores(prev => ({ ...prev, [key]: value }));
  }, []);

  const totalSkor = SECTIONS.reduce((sum, s) => sum + sectionTotal(scores, s.id), 0);

  // ── GOOGLE SHEETS WEBHOOK URL ────────────────────────────────────────────────
  const SHEET_WEBHOOK = null; // storage moved to Supabase (see supabaseClient.js)

  // ── PDF GENERATOR ────────────────────────────────────────────────────────────
  function generatePDF() {
    const lines = [];
    const date = new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });

    lines.push("ABOVE & BEYOND — CLINICAL ASSESSMENT REPORT");
    lines.push("============================================================");
    lines.push(`Tanggal Cetak : ${date}`);
    lines.push("");
    lines.push("DATA KLIEN");
    lines.push(`Nama          : ${client.nama}`);
    lines.push(`No. Client    : ${client.noClient}`);
    lines.push(`Usia          : ${client.usia}`);
    lines.push(`Tanggal Lahir : ${client.tanggalLahir}`);
    lines.push(`Jenis Kelamin : ${client.jenisKelamin}`);
    lines.push(`Diagnosis     : ${client.diagnosis}`);
    lines.push(`Asesor        : ${client.asesor}`);
    lines.push(`Tgl. Asesmen  : ${client.tanggalAsesmen}`);
    lines.push("");
    lines.push("REKAP SKOR");
    lines.push("------------------------------------------------------------");

    SECTIONS.forEach(section => {
      const total = sectionTotal(scores, section.id);
      const flag = sectionFlag(total, section);
      const flagLabel = flag ? flag.label : "Belum diisi";
      lines.push(`${section.label.padEnd(32)} ${String(total).padStart(3)}/${section.max}  ${flagLabel}`);
    });

    lines.push("------------------------------------------------------------");
    lines.push(`TOTAL SKOR : ${totalSkor} / 295`);
    lines.push("");
    lines.push("DETAIL PER DOMAIN");
    lines.push("============================================================");

    SECTIONS.forEach(section => {
      const total = sectionTotal(scores, section.id);
      const flag = sectionFlag(total, section);
      lines.push("");
      lines.push(`${section.code} — ${section.label}  [${total}/${section.max}${flag ? " · " + flag.label : ""}]`);
      lines.push("------------------------------------------------------------");
      section.items.forEach((item, i) => {
        const val = scores[`${section.id}_${i}`];
        const scaleLabel = val ? SCALE.find(s => s.value === val || s.value === parseInt(val))?.label : "-";
        lines.push(`  ${String(i + 1).padStart(2)}. ${item}`);
        lines.push(`      → ${val || "-"} (${scaleLabel || "-"})`);
      });
      if (notes[section.id]) {
        lines.push(`  Catatan: ${notes[section.id]}`);
      }
    });

    lines.push("");
    lines.push("============================================================");
    lines.push("KESIMPULAN & REKOMENDASI KLINIS");
    lines.push("============================================================");
    lines.push(kesimpulan || "(Belum diisi)");
    lines.push("");
    lines.push(`Dicetak oleh: ${client.asesor}  |  ${date}`);
    lines.push("Above & Beyond Child Development Center — Medan");

    const text = lines.join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ANB_Assessment_${client.nama.replace(/\s+/g, "_")}_${client.tanggalAsesmen || date}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── EXCEL TEMPLATE EXPORT ─────────────────────────────────────────────────
  // Fills the bundled template by surgically editing the cells inside the xlsx
  // zip (sheet1.xml values + styles.xml fills for the Kategori cells). The
  // workbook is NEVER rewritten by a spreadsheet library, so nothing that Excel
  // would reject is introduced — every other byte of the template is preserved.
  // Requires "jszip" (npm i jszip).
  // Builds the filled workbook (main form + Catatan Klinis sheet) and returns a Blob.
  async function buildFilledXlsxBlob() {
    const resp = await fetch(templateUrl);
    if (!resp.ok) throw new Error("template fetch failed: " + resp.status);
    const buf = await resp.arrayBuffer();
    const sig = new Uint8Array(buf.slice(0, 2));
    if (sig[0] !== 0x50 || sig[1] !== 0x4b) throw new Error("template is not a valid xlsx");

    const zip = await JSZip.loadAsync(buf);
    let sheet = await zip.file("xl/worksheets/sheet1.xml").async("string");
    let styles = await zip.file("xl/styles.xml").async("string");

    const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const setCell = (ref, inner, extraAttr = "") => {
      const re = new RegExp(`<c r="${ref}"([^>]*?)(?:/>|>[\\s\\S]*?</c>)`);
      sheet = sheet.replace(re, (m, attrs) => {
        const s = (attrs.match(/\ss="\d+"/) || [""])[0];
        return `<c r="${ref}"${s}${extraAttr}>${inner}</c>`;
      });
    };
    const setNumber = (ref, num) => setCell(ref, `<v>${num}</v>`);
    const setString = (ref, text) => setCell(ref, `<is><t xml:space="preserve">${esc(text)}</t></is>`, ` t="inlineStr"`);

    const baseXf = '<xf numFmtId="0" fontId="1" fillId="0" borderId="12" applyAlignment="1" pivotButton="0" quotePrefix="0" xfId="0"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>';
    const fillCount = parseInt((styles.match(/<fills count="(\d+)">/) || [])[1] || "6", 10);
    const xfCount = parseInt((styles.match(/<cellXfs count="(\d+)">/) || [])[1] || "63", 10);
    const styleIndexFor = {};
    let newFills = "", newXfs = "";
    KATEGORI_ORDER.forEach((label, i) => {
      const rgb = KATEGORI[label].rgb;
      newFills += `<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor rgb="${rgb}"/></patternFill></fill>`;
      newXfs += baseXf.replace('fillId="0"', `fillId="${fillCount + i}"`);
      styleIndexFor[label] = xfCount + i;
    });
    styles = styles
      .replace(/<fills count="\d+">/, `<fills count="${fillCount + 3}">`)
      .replace(/<\/fills>/, newFills + "</fills>")
      .replace(/<cellXfs count="\d+">/, `<cellXfs count="${xfCount + 3}">`)
      .replace(/<\/cellXfs>/, newXfs + "</cellXfs>");

    Object.entries(TEMPLATE_CLIENT_CELLS).forEach(([key, ref]) => {
      if (client[key]) setString(ref, client[key]);
    });
    SECTIONS.forEach(section => {
      const map = TEMPLATE_SECTION_MAP[section.id];
      if (!map) return;
      section.items.forEach((_, i) => {
        const v = scores[`${section.id}_${i}`];
        if (map.rows[i] != null && v) setNumber(`G${map.rows[i]}`, parseInt(v));
      });
      const total = sectionTotal(scores, section.id);
      const flag = sectionFlag(total, section);
      const label = flag && flag.label;
      if (label && KATEGORI[label]) {
        const styleIdx = styleIndexFor[label];
        const re = new RegExp(`<c r="${map.kategori}"[^>]*?(?:/>|>[\\s\\S]*?</c>)`);
        sheet = sheet.replace(re, `<c r="${map.kategori}" s="${styleIdx}" t="inlineStr"><is><t xml:space="preserve">${esc(KATEGORI[label].text)}</t></is></c>`);
      }
    });
    if (kesimpulan) setString(KESIMPULAN_CELL, kesimpulan);

    zip.file("xl/worksheets/sheet1.xml", sheet);
    zip.file("xl/styles.xml", styles);

    // Second sheet: Catatan Klinis
    const xe = s => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r\n|\r|\n/g, "&#10;");
    const cellStr = (ref, text) => `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xe(text)}</t></is></c>`;
    const rows = [];
    let r = 1;
    rows.push(`<row r="${r++}"><c r="A1" t="inlineStr"><is><t>CATATAN KLINIS PER ASPEK</t></is></c></row>`);
    r++;
    rows.push(`<row r="${r}">${cellStr("A" + r, "Aspek")}${cellStr("B" + r, "Catatan Klinis")}</row>`); r++;
    SECTIONS.forEach(section => {
      const note = notes[section.id];
      rows.push(`<row r="${r}">${cellStr("A" + r, `${section.code} — ${section.label}`)}${cellStr("B" + r, note || "-")}</row>`);
      r++;
    });
    r++;
    rows.push(`<row r="${r}"><c r="A${r}" t="inlineStr"><is><t>KESIMPULAN &amp; REKOMENDASI KLINIS</t></is></c></row>`); r++;
    rows.push(`<row r="${r}">${cellStr("A" + r, kesimpulan || "(Belum diisi)")}</row>`); r++;
    const sheet2 =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<cols><col min="1" max="1" width="34" customWidth="1"/><col min="2" max="2" width="70" customWidth="1"/></cols>` +
      `<sheetData>${rows.join("")}</sheetData></worksheet>`;
    zip.file("xl/worksheets/sheet2.xml", sheet2);

    let wbxml = await zip.file("xl/workbook.xml").async("string");
    wbxml = wbxml.replace("</sheets>", `<sheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" name="Catatan Klinis" sheetId="2" state="visible" r:id="rId4"/></sheets>`);
    zip.file("xl/workbook.xml", wbxml);
    let wbrels = await zip.file("xl/_rels/workbook.xml.rels").async("string");
    wbrels = wbrels.replace("</Relationships>", `<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml" Id="rId4"/></Relationships>`);
    zip.file("xl/_rels/workbook.xml.rels", wbrels);
    let ct = await zip.file("[Content_Types].xml").async("string");
    ct = ct.replace("</Types>", `<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`);
    zip.file("[Content_Types].xml", ct);

    return zip.generateAsync({
      type: "blob",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      compression: "DEFLATE",
    });
  }

  const excelFileName = () => {
    const dateStr = new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
    return `ANB_Assessment_${(client.nama || "klien").replace(/\s+/g, "_")}_${client.tanggalAsesmen || dateStr}.xlsx`;
  };

  async function downloadExcelTemplate() {
    setXlsxBusy(true);
    setXlsxError("");
    try {
      const outBlob = await buildFilledXlsxBlob();
      const url = URL.createObjectURL(outBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = excelFileName();
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setXlsxError("Gagal membuat file Excel: " + (err && err.message ? err.message : "unknown"));
    } finally {
      setXlsxBusy(false);
    }
  }

  // ── SUBMIT ──────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError("");

    const row = {
      timestamp: new Date().toISOString(),
      nama: client.nama,
      noClient: client.noClient,
      usia: client.usia,
      tanggalLahir: client.tanggalLahir,
      jenisKelamin: client.jenisKelamin,
      diagnosis: client.diagnosis,
      asesor: client.asesor,
      tanggalAsesmen: client.tanggalAsesmen,
    };

    SECTIONS.forEach(section => {
      section.items.forEach((_, i) => {
        const val = scores[`${section.id}_${i}`];
        row[`${section.code}_${i + 1}`] = val ? parseInt(val) : "";
      });
      row[`${section.code}_catatan`] = notes[section.id] || "";
      const total = sectionTotal(scores, section.id);
      row[`${section.code}_total`] = total;
      const flag = sectionFlag(total, section);
      row[`${section.code}_flag`] = flag ? flag.label : "";
    });

    row.total_skor = totalSkor;
    row.kesimpulan = kesimpulan;

    try {
      if (!isConfigured) throw new Error("Supabase belum dikonfigurasi (isi src/supabaseClient.js).");

      // 1) Build the filled workbook and upload it to Storage.
      let filePath = "";
      try {
        const blob = await buildFilledXlsxBlob();
        const safe = (client.nama || "klien").replace(/[^\w\-]+/g, "_");
        filePath = `OT/${safe}_${Date.now()}.xlsx`;
        const up = await supabase.storage.from(STORAGE_BUCKET).upload(filePath, blob, {
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          upsert: false,
        });
        if (up.error) { filePath = ""; } // non-fatal: keep the row even if the file fails
      } catch (fileErr) {
        filePath = "";
      }

      // 2) Insert the assessment row (promoted columns + full JSONB payload).
      const { error } = await supabase.from("assessments").insert({
        type: "OT",
        client_name: client.nama || null,
        client_no: client.noClient || null,
        usia: client.usia || null,
        jenis_kelamin: client.jenisKelamin || null,
        diagnosis: client.diagnosis || null,
        asesor: client.asesor || null,
        assessment_date: client.tanggalAsesmen || null,
        total_score: totalSkor ?? null,
        kesimpulan: kesimpulan || null,
        data: row,
        file_path: filePath || null,
      });
      if (error) throw error;

      generatePDF();
      setSubmitted(true);
    } catch (e) {
      generatePDF();
      setSubmitError("Laporan tetap terunduh, tapi gagal menyimpan ke database: " + (e && e.message ? e.message : "unknown"));
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setClient({ nama: "", noClient: "", usia: "", tanggalLahir: "", jenisKelamin: "", diagnosis: "", asesor: "", tanggalAsesmen: "" });
    setScores({});
    setNotes({});
    setKesimpulan("");
    setSubmitted(false);
    setSubmitError("");
    setTab("client");
  }

  // ── SUBMITTED STATE ──────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div style={{ minHeight: "100vh", background: "#F7FAFC", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 48, maxWidth: 480, textAlign: "center", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "#1A202C", marginBottom: 8 }}>Asesmen Tersimpan</h2>
          <p style={{ color: "#718096", marginBottom: 8 }}>Data {client.nama} berhasil disimpan ke database.</p>
          <p style={{ color: "#A0AEC0", fontSize: 13, marginBottom: 24 }}>Laporan sudah terdownload — upload ke folder Drive klien.</p>
          <button onClick={resetForm} style={{ background: "#2B6CB0", color: "#fff", border: "none", borderRadius: 8, padding: "12px 32px", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
            Asesmen Baru
          </button>
        </div>
      </div>
    );
  }

  // ── LAYOUT ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#EBF4FF", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ background: "#2B6CB0", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ color: "#BEE3F8", fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>Above & Beyond</div>
          <div style={{ color: "#fff", fontSize: 17, fontWeight: 700, marginTop: 2 }}>Comprehensive Clinical Assessment</div>
        </div>
        {client.nama && (
          <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 8, padding: "6px 14px", color: "#fff", fontSize: 13, fontWeight: 600 }}>
            {client.nama}
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div style={{ background: "#fff", borderBottom: "1px solid #E2E8F0", overflowX: "auto", display: "flex", paddingLeft: 8, paddingRight: 8, WebkitOverflowScrolling: "touch" }}>
        <button
          onClick={() => setTab("client")}
          style={{
            padding: "10px 14px",
            border: "none",
            borderBottom: tab === "client" ? "3px solid #2B6CB0" : "3px solid transparent",
            background: "transparent",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 700,
            color: tab === "client" ? "#2B6CB0" : "#718096",
            whiteSpace: "nowrap",
            letterSpacing: 0.3,
          }}
        >
          📋 Data Klien
        </button>

        {SECTIONS.map(section => {
          const total = sectionTotal(scores, section.id);
          const complete = sectionComplete(scores, section);
          return (
            <SectionTab
              key={section.id}
              section={section}
              active={tab === section.id}
              complete={complete}
              total={total}
              onClick={() => setTab(section.id)}
            />
          );
        })}

        <button
          onClick={() => setTab("summary")}
          style={{
            padding: "10px 14px",
            border: "none",
            borderBottom: tab === "summary" ? "3px solid #2B6CB0" : "3px solid transparent",
            background: "transparent",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 700,
            color: tab === "summary" ? "#2B6CB0" : "#718096",
            whiteSpace: "nowrap",
          }}
        >
          📊 Rekap
        </button>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 16px 40px" }}>

        {/* ── CLIENT TAB ── */}
        {tab === "client" && (
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1A202C", marginBottom: 20, paddingBottom: 12, borderBottom: "1px solid #E2E8F0" }}>
              Data Klien
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {[
                { key: "nama", label: "Nama Anak", full: true },
                { key: "noClient", label: "No. Client" },
                { key: "usia", label: "Usia" },
                { key: "tanggalLahir", label: "Tanggal Lahir", type: "date" },
                { key: "jenisKelamin", label: "Jenis Kelamin", options: ["Laki-laki", "Perempuan"] },
                { key: "asesor", label: "Asesor" },
                { key: "tanggalAsesmen", label: "Tanggal Asesmen", type: "date" },
                { key: "diagnosis", label: "Diagnosis / Alasan Rujukan", full: true },
              ].map(field => (
                <div key={field.key} style={{ gridColumn: field.full ? "1 / -1" : "auto" }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#4A5568", marginBottom: 6 }}>
                    {field.label}
                  </label>
                  {field.options ? (
                    <select
                      value={client[field.key]}
                      onChange={e => setClient(prev => ({ ...prev, [field.key]: e.target.value }))}
                      style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #CBD5E0", borderRadius: 8, fontSize: 14, color: "#2D3748", background: "#fff" }}
                    >
                      <option value="">Pilih...</option>
                      {field.options.map(o => <option key={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input
                      type={field.type || "text"}
                      value={client[field.key]}
                      onChange={e => setClient(prev => ({ ...prev, [field.key]: e.target.value }))}
                      style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #CBD5E0", borderRadius: 8, fontSize: 14, color: "#2D3748", boxSizing: "border-box" }}
                    />
                  )}
                </div>
              ))}
            </div>
            <div style={{ marginTop: 24, textAlign: "right" }}>
              <button
                onClick={() => setTab("s1")}
                style={{ background: "#2B6CB0", color: "#fff", border: "none", borderRadius: 8, padding: "11px 28px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
              >
                Mulai Asesmen →
              </button>
            </div>
          </div>
        )}

        {/* ── SECTION TABS ── */}
        {SECTIONS.map(section => tab === section.id && (
          <div key={section.id} style={{ background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#2B6CB0", letterSpacing: 1, textTransform: "uppercase" }}>{section.code}</span>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: "#1A202C", margin: "2px 0 0" }}>{section.label}</h2>
              </div>
              {(() => {
                const total = sectionTotal(scores, section.id);
                const flag = sectionFlag(total, section);
                if (!flag) return null;
                return (
                  <div style={{ background: flag.bg, border: `1.5px solid ${flag.color}`, borderRadius: 8, padding: "4px 12px", fontSize: 13, fontWeight: 700, color: flag.color }}>
                    {flag.label} · {total}/{section.max}
                  </div>
                );
              })()}
            </div>

            <div style={{ background: "#EBF8FF", borderRadius: 8, padding: "8px 14px", marginBottom: 20, fontSize: 12, color: "#2C5282", marginTop: 12 }}>
              <strong>Skala:</strong> 1 = Selalu &nbsp;·&nbsp; 2 = Sering &nbsp;·&nbsp; 3 = Kadang &nbsp;·&nbsp; 4 = Jarang &nbsp;·&nbsp; 5 = Tidak Pernah
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {section.items.map((item, i) => {
                const key = `${section.id}_${i}`;
                const val = scores[key];
                return (
                  <div key={i} style={{ paddingBottom: 20, borderBottom: i < section.items.length - 1 ? "1px solid #F7FAFC" : "none" }}>
                    <div style={{ fontSize: 13, color: "#2D3748", marginBottom: 10, lineHeight: 1.5, fontWeight: 500 }}>
                      <span style={{ color: "#A0AEC0", fontWeight: 700, marginRight: 8 }}>{i + 1}.</span>
                      {item}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {SCALE.map(s => (
                        <ScoreButton
                          key={s.value}
                          value={s.value}
                          selected={val === s.value || val === String(s.value)}
                          onChange={v => setScore(key, v)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 20 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#718096", marginBottom: 6 }}>Catatan Klinis (opsional)</label>
              <textarea
                value={notes[section.id] || ""}
                onChange={e => setNotes(prev => ({ ...prev, [section.id]: e.target.value }))}
                rows={3}
                placeholder="Tambahkan catatan observasi klinis..."
                style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #CBD5E0", borderRadius: 8, fontSize: 13, color: "#2D3748", resize: "vertical", boxSizing: "border-box" }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
              <button
                onClick={() => {
                  const idx = SECTIONS.findIndex(s => s.id === section.id);
                  setTab(idx === 0 ? "client" : SECTIONS[idx - 1].id);
                }}
                style={{ background: "#EDF2F7", color: "#4A5568", border: "none", borderRadius: 8, padding: "11px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
              >
                ← Sebelumnya
              </button>
              <button
                onClick={() => {
                  const idx = SECTIONS.findIndex(s => s.id === section.id);
                  setTab(idx === SECTIONS.length - 1 ? "summary" : SECTIONS[idx + 1].id);
                }}
                style={{ background: "#2B6CB0", color: "#fff", border: "none", borderRadius: 8, padding: "11px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
              >
                Berikutnya →
              </button>
            </div>
          </div>
        ))}

        {/* ── SUMMARY TAB ── */}
        {tab === "summary" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            <div style={{ background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1A202C", marginBottom: 16 }}>Rekap Skor</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {SECTIONS.map(section => {
                  const total = sectionTotal(scores, section.id);
                  const flag = sectionFlag(total, section);
                  const pct = section.max > 0 ? total / section.max : 0;
                  return (
                    <div key={section.id} onClick={() => setTab(section.id)} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 8, border: "1.5px solid #E2E8F0", transition: "border-color 0.15s" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#2B6CB0", width: 28 }}>{section.code}</span>
                      <span style={{ fontSize: 13, color: "#4A5568", flex: 1 }}>{section.label}</span>
                      <div style={{ width: 80, height: 6, background: "#E2E8F0", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${pct * 100}%`, height: "100%", background: flag ? flag.color : "#E2E8F0", borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#2D3748", width: 44, textAlign: "right" }}>{total}/{section.max}</span>
                      {flag && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: flag.color, width: 80, textAlign: "right" }}>
                          {flag.label}
                        </span>
                      )}
                      {!flag && <span style={{ fontSize: 11, color: "#A0AEC0", width: 80, textAlign: "right" }}>Belum diisi</span>}
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: 16, padding: "14px 16px", background: "#EBF8FF", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#2C5282" }}>Total Skor</span>
                <span style={{ fontSize: 20, fontWeight: 800, color: "#2B6CB0" }}>{totalSkor} / 295</span>
              </div>
            </div>

            <div style={{ background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1A202C", marginBottom: 12 }}>Kesimpulan & Rekomendasi Klinis</h2>
              <textarea
                value={kesimpulan}
                onChange={e => setKesimpulan(e.target.value)}
                rows={5}
                placeholder="Tulis kesimpulan klinis dan rekomendasi intervensi..."
                style={{ width: "100%", padding: "12px 14px", border: "1.5px solid #CBD5E0", borderRadius: 8, fontSize: 14, color: "#2D3748", resize: "vertical", lineHeight: 1.6, boxSizing: "border-box" }}
              />
            </div>

            {submitError && (
              <div style={{ background: "#FFF5F5", border: "1.5px solid #FC8181", borderRadius: 8, padding: "12px 16px", fontSize: 13, color: "#C53030" }}>
                ⚠️ {submitError}
              </div>
            )}
            {xlsxError && (
              <div style={{ background: "#FFF5F5", border: "1.5px solid #FC8181", borderRadius: 8, padding: "12px 16px", fontSize: 13, color: "#C53030" }}>
                ⚠️ {xlsxError}
              </div>
            )}
            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={generatePDF}
                style={{ flex: 1, background: "#EDF2F7", color: "#2D3748", border: "none", borderRadius: 10, padding: "14px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
              >
                📄 Laporan (.txt)
              </button>
              <button
                onClick={downloadExcelTemplate}
                disabled={xlsxBusy}
                style={{ flex: 1, background: xlsxBusy ? "#A0AEC0" : "#2B6CB0", color: "#fff", border: "none", borderRadius: 10, padding: "14px 20px", fontSize: 14, fontWeight: 700, cursor: xlsxBusy ? "not-allowed" : "pointer" }}
              >
                {xlsxBusy ? "Membuat..." : "📊 Excel (Form)"}
              </button>
            </div>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{ width: "100%", background: submitting ? "#A0AEC0" : "#276749", color: "#fff", border: "none", borderRadius: 10, padding: "14px 20px", fontSize: 15, fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer", boxShadow: "0 2px 12px rgba(39,103,73,0.2)", transition: "background 0.15s" }}
            >
              {submitting ? "Menyimpan..." : "💾 Simpan ke Database + Download Laporan"}
            </button>
            <p style={{ fontSize: 12, color: "#A0AEC0", textAlign: "center", margin: 0 }}>
              "Excel (Form)" mengunduh file .xlsx sesuai template ANB — data & skor terisi, sel Kategori diwarnai sesuai klasifikasi.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
