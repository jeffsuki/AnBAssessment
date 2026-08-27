import { useState, useCallback, useMemo } from "react";
import { supabase, isConfigured } from "../supabaseClient.js";
import { buildABLLSXlsxBlob } from "./reportBuilders.js";

// ─────────────────────────────────────────────────────────────────────────────
// ABLLS-R — SECTION H: INTRAVERBAL  |  Above & Beyond Child Development Center
// Skoring 0–4 sesuai ABLLS-R Protocol pp.43–51 (H30/H40/H43/H47/H48/H49 maks 2).
// H3 dapat diberi NA (anak verbal / tidak memakai isyarat) → keluar dari penyebut.
// Kolom jawaban anak: satu baris = satu jawaban benar. Bila butir punya kriteria
// terhitung (auto), skor terisi otomatis dari jumlah baris — bisa ditimpa manual.
// ─────────────────────────────────────────────────────────────────────────────

const SCALE_COLORS = { 0: "#E53E3E", 1: "#DD6B20", 2: "#D69E2E", 3: "#3182CE", 4: "#38A169" };

const TEST_ROUNDS = [
  { value: 1, label: "Tes ke-1", color: "#E53E3E" },
  { value: 2, label: "Tes ke-2", color: "#D69E2E" },
  { value: 3, label: "Tes ke-3", color: "#2B6CB0" },
  { value: 4, label: "Tes ke-4", color: "#38A169" },
];

const BANDS = [
  { min: 75, label: "Sesuai / Kuat",        color: "#38A169", bg: "#F0FFF4" },
  { min: 50, label: "Berkembang",           color: "#3182CE", bg: "#EBF8FF" },
  { min: 25, label: "Perlu Dukungan",       color: "#DD6B20", bg: "#FFFAF0" },
  { min: 0,  label: "Prioritas Intervensi", color: "#E53E3E", bg: "#FFF5F5" },
];
const bandFor = pct => BANDS.find(b => pct >= b.min) || BANDS[BANDS.length - 1];

// ── DATA BUTIR ───────────────────────────────────────────────────────────────
// ex   = satu contoh pertanyaan (bukan daftar penuh)
// c    = kriteria skor sesuai protokol
// auto = ambang hitung [skor1, skor2, skor3, skor4] — null bila tak dapat dihitung
//        dari kolom jawaban (kriteria 25/30/50 butir, berbasis waktu, atau struktur)
// unit = satuan yang dihitung di kolom jawaban
const TASKS = [
  { id: "H1", max: 4, nameId: "Melengkapi kata dari lagu", name: "Fill in words from songs",
    ex: "“Mary had a little...” / “Naik-naik ke puncak...”",
    c: { 4: "≥3 frasa dari 6 lagu", 3: "3 kata dari 3 lagu", 2: "2 kata dari 2 lagu", 1: "1 kata dari 2 lagu" },
    auto: null, unit: "lagu" },

  { id: "H2", max: 4, nameId: "Melengkapi frasa benda/aktivitas menyenangkan", name: "Fill in blanks about fun items and activities",
    ex: "“Ready, set...”",
    c: { 4: "≥10 respons isian", 3: "5 respons isian", 2: "2 respons isian", 1: "1 respons isian" },
    auto: [1, 2, 5, 10], unit: "isian" },

  { id: "H3", max: 4, allowNA: true, nameId: "Memberi isyarat kata (anak nonverbal)", name: "Sign English words (ASL / Bisindo)",
    ex: "“Tunjukkan isyarat untuk ‘makan’”",
    c: { 4: "25 isyarat", 3: "15 isyarat", 2: "5 isyarat", 1: "2 isyarat" },
    auto: null, unit: "isyarat",
    naNote: "Pilih NA bila anak dapat mengucapkan >50 kata atau tidak memakai isyarat." },

  { id: "H4", max: 4, nameId: "Suara binatang", name: "Animal sounds",
    ex: "“Anjing bunyinya apa?” / “Siapa yang bunyinya guk-guk?”",
    c: { 4: "8 suara binatang DAN 8 nama binatang", 3: "6 suara atau nama", 2: "4 suara atau nama", 1: "2 suara atau nama" },
    auto: [2, 4, 6, 8], unit: "suara/nama" },

  { id: "H5", max: 4, nameId: "Menjawab pertanyaan data diri", name: "Answers personal questions",
    ex: "“Siapa namamu?”",
    c: { 4: "≥4 informasi tentang diri", 3: "3 informasi", 2: "2 informasi", 1: "1 informasi" },
    auto: [1, 2, 3, 4], unit: "informasi" },

  { id: "H6", max: 4, nameId: "Melengkapi kata aktivitas sehari-hari", name: "Fill in words describing common activities",
    ex: "“Kamu sedang duduk di...”",
    c: { 4: "≥10 respons isian", 3: "5 respons isian", 2: "2 respons isian", 1: "1 respons isian" },
    auto: [1, 2, 5, 10], unit: "isian" },

  { id: "H7", max: 4, nameId: "Asosiasi intraverbal", name: "Intraverbal associations",
    ex: "“Apa yang cocok dengan pensil?”",
    c: { 4: "≥2 item terkait untuk 20 benda", 3: "2 item terkait untuk 10 benda", 2: "1 item terkait untuk 10 benda", 1: "1 item terkait untuk 5 benda" },
    auto: [5, 10, 10, 20], unit: "benda" },

  { id: "H8", max: 4, nameId: "Menyebut benda bila diberi fungsinya", name: "Fill in item given function",
    ex: "“Kamu makan pakai...”",
    c: { 4: "≥20 isian dengan dua respons", 3: "10 isian dengan dua respons", 2: "5 respons isian", 1: "2 respons isian" },
    auto: [2, 5, 10, 20], unit: "isian" },

  { id: "H9", max: 4, nameId: "Menyebut fungsi bila diberi bendanya", name: "Fill in function given item",
    ex: "“Sendok untuk...”",
    c: { 4: "≥20 isian dengan dua respons", 3: "10 isian dengan dua respons", 2: "5 respons isian", 1: "2 respons isian" },
    auto: [2, 5, 10, 20], unit: "isian" },

  { id: "H10", max: 4, nameId: "Pertanyaan “Apa” — benda di rumah", name: "Answers 'What' questions — items at home",
    ex: "“Apa isi kulkas?”",
    c: { 4: "≥30 pertanyaan, termasuk ≥3 respons untuk ≥5 lokasi", 3: "15 pertanyaan", 2: "10 pertanyaan", 1: "5 pertanyaan" },
    auto: null, unit: "pertanyaan" },

  { id: "H11", max: 4, nameId: "Pertanyaan “Apa” — fungsi benda", name: "Answers 'What' questions — function",
    ex: "“Apa yang dipakai untuk memotong kertas?”",
    c: { 4: "≥50 pertanyaan", 3: "25 pertanyaan", 2: "10 pertanyaan", 1: "5 pertanyaan" },
    auto: null, unit: "pertanyaan" },

  { id: "H12", max: 4, nameId: "Pertanyaan “Di mana” — benda di rumah/sekolah", name: "Answers 'Where' questions — items",
    ex: "“Di mana sikat gigi?”",
    c: { 4: "≥30 pertanyaan", 3: "15 pertanyaan", 2: "10 pertanyaan", 1: "5 pertanyaan" },
    auto: null, unit: "pertanyaan" },

  { id: "H13", max: 4, nameId: "Pertanyaan “Di mana” — aktivitas di rumah/sekolah", name: "Answers 'Where' questions — activities",
    ex: "“Di mana kamu cuci tangan?”",
    c: { 4: "≥30 pertanyaan", 3: "15 pertanyaan", 2: "10 pertanyaan", 1: "5 pertanyaan" },
    auto: null, unit: "pertanyaan" },

  { id: "H14", max: 4, nameId: "Menyebut contoh bila diberi kelompoknya", name: "Fill in item given the class",
    ex: "“Salah satu binatang adalah...”",
    c: { 4: "≥20 isian dengan dua respons", 3: "10 isian dengan dua respons", 2: "5 respons isian", 1: "2 respons isian" },
    auto: [2, 5, 10, 20], unit: "isian" },

  { id: "H15", max: 4, nameId: "Beberapa jawaban untuk satu kategori", name: "Multiple responses given specific categories",
    ex: "“Sebutkan beberapa binatang”",
    c: { 4: "20 kategori dengan 4 respons", 3: "10 kategori dengan 3 respons", 2: "5 kategori dengan 2 respons", 1: "2 kategori dengan 2 respons" },
    auto: [2, 5, 10, 20], unit: "kategori" },

  { id: "H16", max: 4, nameId: "Menyebut ciri bila diberi bendanya", name: "Fill in features given the item",
    ex: "“Burung punya...”",
    c: { 4: "≥20 isian dengan dua respons", 3: "10 isian dengan dua respons", 2: "5 respons isian", 1: "2 respons isian" },
    auto: [2, 5, 10, 20], unit: "isian" },

  { id: "H17", max: 4, nameId: "Menyebut benda bila diberi cirinya", name: "Fill in item given its feature",
    ex: "“Sesuatu yang punya ekor adalah...”",
    c: { 4: "≥20 isian dengan dua respons", 3: "10 isian dengan dua respons", 2: "5 respons isian", 1: "2 respons isian" },
    auto: [2, 5, 10, 20], unit: "isian" },

  { id: "H18", max: 4, nameId: "Menyebut kelompok bila diberi bendanya", name: "Fill in class given the item",
    ex: "“Anjing adalah...”",
    c: { 4: "≥20 isian dengan dua respons", 3: "10 isian dengan dua respons", 2: "5 respons isian", 1: "2 respons isian" },
    auto: [2, 5, 10, 20], unit: "isian" },

  { id: "H19", max: 4, nameId: "Menyebut benda yang tadi dilihat", name: "Name items previously observed",
    ex: "Ajak anak melihat ke jendela, lalu tanyakan: “Tadi kamu lihat apa?”",
    c: { 4: "≥2 benda, 1 jam setelah observasi", 3: "1 benda, 10 menit setelahnya", 2: "1 benda, 5 menit setelahnya", 1: "1 benda, langsung setelahnya" },
    auto: null, unit: "benda" },

  { id: "H20", max: 4, nameId: "Menyebut aktivitas yang tadi dilihat", name: "Name previously observed activities",
    ex: "“Tadi kucing/satpam itu sedang apa?”",
    c: { 4: "Menyebut aktivitas 1 jam setelahnya", 3: "10 menit setelahnya", 2: "5 menit setelahnya", 1: "Langsung setelahnya" },
    auto: null, unit: "aktivitas" },

  { id: "H21", max: 4, nameId: "Menyebut orang yang tadi dilihat", name: "Name people previously observed",
    ex: "“Tadi siapa yang kamu lihat?”",
    c: { 4: "≥2 orang, 1 jam setelah observasi", 3: "1 orang, 10 menit setelahnya", 2: "1 orang, 5 menit setelahnya", 1: "1 orang, langsung setelahnya" },
    auto: null, unit: "orang" },

  { id: "H22", max: 4, nameId: "Berkomentar terkait gambar (bukan menamai)", name: "With visual display, makes related statements",
    ex: "Tunjukkan gambar orang memasak — anak berkomentar “makanannya panas”",
    c: { 4: "Berkomentar pada 20 gambar", 3: "10 gambar", 2: "5 gambar", 1: "1 gambar" },
    auto: [1, 5, 10, 20], unit: "gambar" },

  { id: "H23", max: 4, nameId: "Pertanyaan “Apa” — benda di lingkungan", name: "Answers 'What' questions — community items",
    ex: "“Apa yang ada di taman?”",
    c: { 4: "≥20 pertanyaan terjawab", 3: "10 pertanyaan", 2: "5 pertanyaan", 1: "2 pertanyaan" },
    auto: [2, 5, 10, 20], unit: "pertanyaan" },

  { id: "H24", max: 4, nameId: "Pertanyaan “Apa” — aktivitas di lingkungan", name: "Answers 'What' questions — community activities",
    ex: "“Apa yang bisa kamu lakukan di taman?”",
    c: { 4: "≥20 pertanyaan terjawab", 3: "10 pertanyaan", 2: "5 pertanyaan", 1: "2 pertanyaan" },
    auto: [2, 5, 10, 20], unit: "pertanyaan" },

  { id: "H25", max: 4, nameId: "Pertanyaan “Di mana” — lingkungan", name: "Answers 'Where' questions — community",
    ex: "“Di mana kita beli susu?”",
    c: { 4: "≥30 pertanyaan", 3: "15 pertanyaan", 2: "10 pertanyaan", 1: "5 pertanyaan" },
    auto: null, unit: "pertanyaan" },

  { id: "H26", max: 4, nameId: "Beberapa jawaban tentang lingkungan sekitar", name: "Multiple responses about immediate community",
    ex: "“Sebutkan apa saja yang ada di supermarket”",
    c: { 4: "20 kategori dengan 3 respons", 3: "10 kategori dengan 3 respons", 2: "5 kategori dengan 2 respons", 1: "2 kategori dengan 2 respons" },
    auto: [2, 5, 10, 20], unit: "kategori" },

  { id: "H27", max: 4, nameId: "Menyebut kelompok bila diberi beberapa contoh", name: "States class given multiple class members",
    ex: "“Apel, nanas, semangka termasuk apa?”",
    c: { 4: "20 kelompok bila diberi ≥2 anggota", 3: "10 kelompok", 2: "5 kelompok", 1: "1 kelompok" },
    auto: [1, 5, 10, 20], unit: "kelompok" },

  { id: "H28", max: 4, nameId: "Pertanyaan “Siapa / Milik siapa”", name: "Answers 'Who/Whose' questions",
    ex: "“Siapa yang memadamkan api?”",
    c: { 4: "≥50 pertanyaan", 3: "25 pertanyaan", 2: "10 pertanyaan", 1: "5 pertanyaan" },
    auto: null, unit: "pertanyaan" },

  { id: "H29", max: 4, nameId: "Pertanyaan “Kapan”", name: "Answers 'When' questions",
    ex: "“Kapan kamu tidur?”",
    c: { 4: "≥50 pertanyaan", 3: "25 pertanyaan", 2: "10 pertanyaan", 1: "5 pertanyaan" },
    auto: null, unit: "pertanyaan" },

  { id: "H30", max: 2, nameId: "Membedakan jenis pertanyaan (apa/di mana/siapa/kapan)", name: "Discrimination of questions",
    ex: "“Apel warnanya apa? Di mana kita beli apel? Apel diapakan?” (diacak)",
    c: { 2: "Menjawab ≥4 jenis pertanyaan dalam urutan acak", 1: "Menjawab ≥2 jenis pertanyaan dalam urutan acak" },
    auto: [2, 4], unit: "jenis pertanyaan" },

  { id: "H31", max: 4, nameId: "Pertanyaan “Yang mana”", name: "Answers 'Which' questions",
    ex: "“Mana binatang, anjing atau sepatu?”",
    c: { 4: "≥50 pertanyaan", 3: "25 pertanyaan", 2: "10 pertanyaan", 1: "5 pertanyaan" },
    auto: null, unit: "pertanyaan" },

  { id: "H32", max: 4, nameId: "Pertanyaan “Bagaimana”", name: "Answers 'How' questions",
    ex: "“Bagaimana cara cuci tangan?”",
    c: { 4: "≥50 pertanyaan", 3: "25 pertanyaan", 2: "10 pertanyaan", 1: "5 pertanyaan" },
    auto: null, unit: "pertanyaan" },

  { id: "H33", max: 4, nameId: "Pertanyaan “Mengapa”", name: "Answers 'Why' questions",
    ex: "“Kenapa kamu pakai payung?”",
    c: { 4: "≥50 pertanyaan", 3: "25 pertanyaan", 2: "10 pertanyaan", 1: "5 pertanyaan" },
    auto: null, unit: "pertanyaan" },

  { id: "H34", max: 4, nameId: "Menjelaskan urutan langkah aktivitas harian", name: "Describes steps in sequence",
    ex: "“Ceritakan cara cuci tangan”",
    c: { 4: "≥5 langkah pada ≥2 rangkaian", 3: "4 langkah pada 1 rangkaian", 2: "3 langkah pada 1 rangkaian", 1: "2 langkah pada 1 rangkaian" },
    auto: [2, 3, 4, 5], unit: "langkah" },

  { id: "H35", max: 4, nameId: "Menebak aktivitas dari urutan tindakan", name: "States activity when told sequence",
    ex: "“Saya ambil handuk, buka air, pakai sabun — saya sedang apa?”",
    c: { 4: "≥20 pertanyaan terjawab", 3: "10 pertanyaan", 2: "5 pertanyaan", 1: "2 pertanyaan" },
    auto: [2, 5, 10, 20], unit: "pertanyaan" },

  { id: "H36", max: 4, nameId: "Menebak benda dari beberapa petunjuk", name: "States item when told features/functions/class",
    ex: "“Binatang, punya sayap, kecil — apa itu?”",
    c: { 4: "≥20 pertanyaan terjawab", 3: "10 pertanyaan", 2: "5 pertanyaan", 1: "2 pertanyaan" },
    auto: [2, 5, 10, 20], unit: "pertanyaan" },

  { id: "H37", max: 4, nameId: "Ya/Tidak untuk benda/aktivitas yang tidak hadir", name: "Intraverbal Yes/No",
    ex: "“Apakah babi bisa terbang?”",
    c: { 4: "≥50 pertanyaan", 3: "25 pertanyaan", 2: "10 pertanyaan", 1: "5 pertanyaan" },
    auto: null, unit: "pertanyaan" },

  { id: "H38", max: 4, nameId: "Beberapa jawaban untuk pertanyaan 2 komponen", name: "Multiple answers to 2-component questions",
    ex: "“Sebutkan binatang kecil!”",
    c: { 4: "4 respons untuk 5 pertanyaan berbeda", 3: "3 respons untuk 4 pertanyaan", 2: "2 respons untuk 3 pertanyaan", 1: "2 respons untuk 1 pertanyaan" },
    auto: null, unit: "pertanyaan" },

  { id: "H39", max: 4, nameId: "Beberapa jawaban untuk pertanyaan 3 komponen", name: "Multiple answers to 3-component questions",
    ex: "“Sebutkan buah kecil berwarna merah”",
    c: { 4: "4 respons untuk 5 pertanyaan berbeda", 3: "3 respons untuk 4 pertanyaan", 2: "2 respons untuk 3 pertanyaan", 1: "2 respons untuk 1 pertanyaan" },
    auto: null, unit: "pertanyaan" },

  { id: "H40", max: 2, nameId: "Mendeskripsikan benda", name: "Describes items",
    ex: "“Deskripsikan mobil”",
    c: { 2: "≥20 benda dengan ≥3 detail relevan (di luar nama benda)", 1: "≥10 benda dengan ≥2 detail relevan" },
    auto: [10, 20], unit: "benda" },

  { id: "H41", max: 4, nameId: "Menyebut langkah sebelum/sesudah", name: "Describes before/after steps",
    ex: "“Apa yang kamu lakukan sebelum sikat gigi?”",
    c: { 4: "Sebelum DAN sesudah untuk 10 aktivitas", 3: "Sebelum DAN sesudah untuk 5 aktivitas", 2: "1 langkah sebelum ATAU sesudah untuk 2 aktivitas", 1: "1 langkah sebelum atau sesudah untuk 1 aktivitas" },
    auto: null, unit: "aktivitas" },

  { id: "H42", max: 4, nameId: "Pertanyaan peristiwa lampau & mendatang", name: "Answers questions about past/future events",
    ex: "“Tadi pagi sarapan apa?”",
    c: { 4: "4 jawaban lampau DAN mendatang >1 bulan", 3: "2 jawaban lampau ATAU mendatang >1 bulan", 2: "2 jawaban lampau/mendatang dalam 1 minggu", 1: "≥2 jawaban peristiwa hari itu" },
    auto: null, unit: "jawaban" },

  { id: "H43", max: 2, nameId: "Mempertahankan percakapan", name: "Maintains a conversation",
    ex: "Pilih topik yang anak sukai, hitung jumlah pertukaran verbal",
    c: { 2: "5 pertukaran pada ≥10 topik, termasuk ≥1 pertanyaan/komentar baru dari anak", 1: "3 pertukaran pada ≥5 topik" },
    auto: [5, 10], unit: "topik" },

  { id: "H44", max: 4, nameId: "Menjawab pertanyaan dengan format baru", name: "Answers novel questions",
    ex: "“Sebutkan suara mobil” (bukan format “Bagaimana bunyi mobil?”)",
    c: { 4: "≥20 pertanyaan baru terjawab", 3: "10 pertanyaan", 2: "5 pertanyaan", 1: "2 pertanyaan" },
    auto: [2, 5, 10, 20], unit: "pertanyaan" },

  { id: "H45", max: 4, nameId: "Satu jawaban tentang peristiwa/perayaan", name: "Gives single answer about current events",
    ex: "“Apa yang kamu lakukan saat Idul Fitri/Natal/Imlek?”",
    c: { 4: "≥20 pertanyaan terjawab", 3: "10 pertanyaan", 2: "5 pertanyaan", 1: "2 pertanyaan" },
    auto: [2, 5, 10, 20], unit: "pertanyaan" },

  { id: "H46", max: 4, nameId: "Beberapa jawaban tentang peristiwa/perayaan", name: "Gives multiple answers about current events",
    ex: "“Sebutkan sebanyak mungkin kegiatan saat 17 Agustus”",
    c: { 4: "20 kategori dengan 3 respons", 3: "10 kategori dengan 3 respons", 2: "5 kategori dengan 2 respons", 1: "2 kategori dengan 1–2 respons" },
    auto: [2, 5, 10, 20], unit: "kategori" },

  { id: "H47", max: 2, nameId: "Beberapa jawaban dalam diskusi kelompok", name: "Gives multiple answers in group discussions",
    ex: "Diskusi kelompok: “Apa yang terjadi tadi pagi waktu kita masuk?”",
    c: { 2: "≥2 komentar untuk ≥3 topik dalam diskusi 20 menit", 1: "≥1 komentar untuk ≥2 topik dalam diskusi 10 menit" },
    auto: [2, 3], unit: "topik" },

  { id: "H48", max: 2, nameId: "Menceritakan pengalaman atau cerita", name: "Tells about experiences / tells stories",
    ex: "“Ceritakan waktu kamu ke kebun binatang”",
    c: { 2: "≥5 deskripsi peristiwa/cerita yang memuat ≥5 komponen", 1: "≥1 deskripsi yang memuat ≥3 komponen" },
    auto: [1, 5], unit: "cerita" },

  { id: "H49", max: 2, nameId: "Percakapan spontan", name: "Spontaneous conversation",
    ex: "Amati komentar spontan anak dalam percakapan yang sedang berlangsung",
    c: { 2: "Spontan berkomentar ≥10 kali per hari", 1: "Spontan berkomentar ≥10 kali per minggu (tanpa prompt)" },
    auto: null, unit: "komentar" },
];

// ── KELOMPOK ─────────────────────────────────────────────────────────────────
const GROUPS = [
  { code: "G1", name: "Dasar & Isian",             short: "Dasar",      from: 1,  to: 9  },
  { code: "G2", name: "WH — Rumah & Sekolah",      short: "WH Rumah",   from: 10, to: 13 },
  { code: "G3", name: "Kelas, Ciri & Kategori",    short: "Kategori",   from: 14, to: 18 },
  { code: "G4", name: "Recall & Komentar Visual",  short: "Recall",     from: 19, to: 22 },
  { code: "G5", name: "Lingkungan / Komunitas",    short: "Komunitas",  from: 23, to: 27 },
  { code: "G6", name: "WH Lanjutan",               short: "WH Lanjut",  from: 28, to: 33 },
  { code: "G7", name: "Sekuens & Deskripsi",       short: "Sekuens",    from: 34, to: 36 },
  { code: "G8", name: "Ya/Tidak & Multi-komponen", short: "Multi",      from: 37, to: 40 },
  { code: "G9", name: "Peristiwa & Percakapan",    short: "Percakapan", from: 41, to: 49 },
].map(g => ({ ...g, tasks: TASKS.filter(t => { const n = Number(t.id.slice(1)); return n >= g.from && n <= g.to; }) }));

const TOTAL_MAX = TASKS.reduce((s, t) => s + t.max, 0); // 184

// ── HELPER ───────────────────────────────────────────────────────────────────
const isNA = v => v === "NA";
const countLines = txt => (txt || "").split("\n").map(s => s.trim()).filter(Boolean).length;

// skor tertinggi yang ambangnya terpenuhi; 0 bila belum ada yang terpenuhi
function suggestScore(task, count) {
  if (!task.auto) return null;
  let s = 0;
  task.auto.forEach((threshold, i) => { if (count >= threshold) s = i + 1; });
  return s;
}

function groupScore(scores, g) {
  let got = 0, max = 0;
  g.tasks.forEach(t => {
    if (isNA(scores[t.id])) return;
    max += t.max;
    if (scores[t.id] != null) got += Number(scores[t.id]);
  });
  return { got, max };
}
const groupDone = (scores, g) => g.tasks.every(t => scores[t.id] != null);
function totalScore(scores) {
  return GROUPS.reduce((a, g) => {
    const { got, max } = groupScore(scores, g);
    return { got: a.got + got, max: a.max + max };
  }, { got: 0, max: 0 });
}

// ── KOMPONEN KECIL ───────────────────────────────────────────────────────────
function ScoreButton({ value, selected, onClick, label, sub }) {
  const color = value === "NA" ? "#718096" : SCALE_COLORS[value];
  return (
    <button onClick={onClick}
      style={{
        flex: 1, minWidth: 0, padding: "9px 4px", borderRadius: 8, cursor: "pointer",
        border: selected ? `2px solid ${color}` : "1.5px solid #CBD5E0",
        background: selected ? color : "#fff", color: selected ? "#fff" : "#4A5568",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 2, transition: "all .15s",
      }}>
      <span style={{ fontSize: 16, fontWeight: 800, lineHeight: 1 }}>{label}</span>
      <span style={{ fontSize: 9, lineHeight: 1.1, textAlign: "center" }}>{sub}</span>
    </button>
  );
}

export default function ABLLSAssessment() {
  const [tab, setTab] = useState("client");
  const [client, setClient] = useState({
    nama: "", noClient: "", usia: "", tanggalLahir: "",
    jenisKelamin: "", diagnosis: "", asesor: "", tanggalAsesmen: "",
  });
  const [testRound, setTestRound] = useState(1);
  const [scores, setScores] = useState({});
  const [answers, setAnswers] = useState({});   // jawaban anak per butir
  const [manual, setManual] = useState({});     // butir yang skornya ditimpa manual
  const [notes, setNotes] = useState({});
  const [kesimpulan, setKesimpulan] = useState("");
  const [rekomendasi, setRekomendasi] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [saveErr, setSaveErr] = useState("");
  const [xlsxBusy, setXlsxBusy] = useState(false);

  // tulis jawaban → skor ikut terisi bila butir punya kriteria terhitung
  const setAnswer = useCallback((task, text) => {
    setAnswers(p => ({ ...p, [task.id]: text }));
    if (!task.auto) return;
    setManual(m => {
      if (m[task.id]) return m;                       // sudah ditimpa manual, jangan ganggu
      const s = suggestScore(task, countLines(text));
      setScores(p => ({ ...p, [task.id]: s }));
      return m;
    });
  }, []);

  const setScoreManual = useCallback((id, v) => {
    setScores(p => ({ ...p, [id]: v }));
    setManual(m => ({ ...m, [id]: true }));
  }, []);

  const backToAuto = useCallback(task => {
    setManual(m => ({ ...m, [task.id]: false }));
    setScores(p => ({ ...p, [task.id]: suggestScore(task, countLines(answers[task.id])) }));
  }, [answers]);

  const total = useMemo(() => totalScore(scores), [scores]);
  const totalPct = total.max ? (total.got / total.max) * 100 : 0;
  const roundColor = TEST_ROUNDS.find(r => r.value === testRound)?.color || "#2B6CB0";
  const answered = TASKS.filter(t => scores[t.id] != null).length;

  // ── LAPORAN ─────────────────────────────────────────────────────────────────
  function generateReport() {
    const date = new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
    const L = [];
    L.push("ABOVE & BEYOND — ABLLS-R  |  SECTION H: INTRAVERBAL");
    L.push("============================================================");
    L.push(`Tanggal Cetak : ${date}`);
    L.push(`Tes ke-       : ${testRound}`);
    L.push("");
    L.push("DATA KLIEN");
    L.push(`Nama          : ${client.nama}`);
    L.push(`No. Client    : ${client.noClient}`);
    L.push(`Usia          : ${client.usia}`);
    L.push(`Tanggal Lahir : ${client.tanggalLahir}`);
    L.push(`Jenis Kelamin : ${client.jenisKelamin}`);
    L.push(`Diagnosis     : ${client.diagnosis}`);
    L.push(`Asesor        : ${client.asesor}`);
    L.push(`Tgl. Asesmen  : ${client.tanggalAsesmen}`);
    L.push("");
    L.push("REKAP PER KELOMPOK KETERAMPILAN");
    L.push("------------------------------------------------------------");
    GROUPS.forEach(g => {
      const { got, max } = groupScore(scores, g);
      const pct = max ? Math.round((got / max) * 100) : 0;
      L.push(`${g.name.padEnd(30)} ${String(got).padStart(3)} / ${String(max).padEnd(3)}  ${String(pct).padStart(3)}%  ${bandFor(pct).label}`);
    });
    L.push("------------------------------------------------------------");
    L.push(`TOTAL : ${total.got} / ${total.max}  (${Math.round(totalPct)}%) — ${bandFor(totalPct).label}`);
    L.push(`Skor maksimum penuh protokol: ${TOTAL_MAX} (butir NA dikeluarkan dari penyebut)`);
    L.push("");
    L.push("DETAIL PER BUTIR");
    L.push("============================================================");
    GROUPS.forEach(g => {
      L.push("");
      L.push(`### ${g.code} — ${g.name}`);
      g.tasks.forEach(t => {
        const v = scores[t.id];
        const shown = v == null ? "-" : (isNA(v) ? "NA" : v);
        L.push("");
        L.push(`  ${t.id} (${shown}/${t.max})  ${t.nameId}`);
        L.push(`     Kriteria skor ${shown === "-" || shown === "NA" ? "—" : shown}: ${isNA(v) || v == null || v === 0 ? "—" : t.c[v]}`);
        const ans = (answers[t.id] || "").trim();
        if (ans) {
          L.push(`     Jawaban anak (${countLines(ans)} ${t.unit}):`);
          ans.split("\n").filter(s => s.trim()).forEach(line => L.push(`       • ${line.trim()}`));
        }
        if (manual[t.id]) L.push("     (skor diisi manual oleh asesor)");
      });
      const note = notes[g.code];
      if (note) L.push(`\n  Catatan ${g.code}: ${note}`);
    });
    L.push("");
    L.push("============================================================");
    L.push("KESIMPULAN KLINIS");
    L.push("============================================================");
    L.push(kesimpulan || "(Belum diisi)");
    L.push("");
    L.push("REKOMENDASI PROGRAM");
    L.push("------------------------------------------------------------");
    L.push(rekomendasi || "(Belum diisi)");
    L.push("");
    L.push(`Dicetak oleh: ${client.asesor}  |  ${date}`);
    L.push("Above & Beyond Child Development Center — Medan");

    const blob = new Blob([L.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ABLLSR_Intraverbal_${(client.nama || "klien").replace(/\s+/g, "_")}_Tes${testRound}_${client.tanggalAsesmen || date}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function saveToSupabase() {
    setSaving(true); setSaveMsg(""); setSaveErr("");
    try {
      if (!isConfigured) throw new Error("Supabase belum dikonfigurasi (isi src/supabaseClient.js).");

      // Flat payload: per-task score/answer/manual, per-group totals, notes.
      const data = {
        nama: client.nama, noClient: client.noClient, usia: client.usia,
        tanggalLahir: client.tanggalLahir, jenisKelamin: client.jenisKelamin,
        diagnosis: client.diagnosis, asesor: client.asesor,
        tanggalAsesmen: client.tanggalAsesmen, testRound,
        kesimpulan, rekomendasi,
      };
      GROUPS.forEach(g => {
        g.tasks.forEach(t => {
          const v = scores[t.id];
          data[`${t.id}_skor`] = v != null ? v : "";
          if (answers[t.id]) data[`${t.id}_jawaban`] = answers[t.id];
          if (manual[t.id]) data[`${t.id}_manual`] = true;
        });
        const gs = groupScore(scores, g);
        data[`${g.code}_total`] = gs.got;
        data[`${g.code}_max`] = gs.max;
        if (notes[g.code]) data[`${g.code}_catatan`] = notes[g.code];
      });
      data.total_skor = total.got;
      data.max_skor = total.max;

      const { error } = await supabase.from("assessments").insert({
        type: "ABLLS",
        client_name: client.nama || null,
        client_no: client.noClient || null,
        usia: client.usia || null,
        jenis_kelamin: client.jenisKelamin || null,
        diagnosis: client.diagnosis || null,
        asesor: client.asesor || null,
        assessment_date: client.tanggalAsesmen || null,
        test_round: testRound || null,
        total_score: total.got ?? null,
        max_score: total.max ?? null,
        kesimpulan: kesimpulan || null,
        data,
      });
      if (error) throw error;
      setSaveMsg("Tersimpan ke database. Entri muncul di Dashboard.");
    } catch (e) {
      setSaveErr("Gagal menyimpan: " + (e && e.message ? e.message : "unknown"));
    } finally {
      setSaving(false);
    }
  }

  async function downloadExcel() {
    setXlsxBusy(true);
    try {
      const cfg = {
        client, testRound,
        groups: GROUPS.map(g => {
          const gs = groupScore(scores, g);
          return {
            code: g.code, name: g.name, total: gs.got, max: gs.max,
            tasks: g.tasks.map(t => ({
              id: t.id, nameId: t.nameId, max: t.max,
              score: scores[t.id], answer: answers[t.id] || "",
              manual: !!manual[t.id], na: isNA(scores[t.id]),
            })),
          };
        }),
        totalGot: total.got, totalMax: total.max,
        kesimpulan, rekomendasi,
      };
      const blob = await buildABLLSXlsxBlob(cfg);
      const date = new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ABLLSR_Intraverbal_${(client.nama || "klien").replace(/\s+/g, "_")}_Tes${testRound}_${client.tanggalAsesmen || date}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setSaveErr("Gagal membuat file Excel: " + (e && e.message ? e.message : "unknown"));
    } finally {
      setXlsxBusy(false);
    }
  }

  function resetForm() {
    setClient({ nama: "", noClient: "", usia: "", tanggalLahir: "", jenisKelamin: "", diagnosis: "", asesor: "", tanggalAsesmen: "" });
    setScores({}); setAnswers({}); setManual({}); setNotes({});
    setKesimpulan(""); setRekomendasi(""); setTestRound(1); setTab("client");
    setSaving(false); setSaveMsg(""); setSaveErr("");
  }

  const activeGroup = GROUPS.find(g => g.code === tab);

  return (
    <div style={{ minHeight: "100vh", background: "#EBF4FF", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ background: "#2B6CB0", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ color: "#BEE3F8", fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>Above &amp; Beyond</div>
          <div style={{ color: "#fff", fontSize: 17, fontWeight: 700, marginTop: 2 }}>ABLLS-R — Section H: Intraverbal</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ background: roundColor, borderRadius: 8, padding: "6px 12px", color: "#fff", fontSize: 12, fontWeight: 700 }}>Tes ke-{testRound}</div>
          <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 8, padding: "6px 12px", color: "#fff", fontSize: 12, fontWeight: 700 }}>{answered}/49 butir</div>
          {client.nama && <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 8, padding: "6px 14px", color: "#fff", fontSize: 13, fontWeight: 600 }}>{client.nama}</div>}
        </div>
      </div>

      {/* Tab */}
      <div style={{ background: "#fff", borderBottom: "1px solid #E2E8F0", overflowX: "auto", display: "flex", padding: "0 8px", WebkitOverflowScrolling: "touch" }}>
        {[{ id: "client", label: "📋 Data Klien" }, ...GROUPS.map(g => ({ id: g.code, label: `${g.code} · ${g.short}`, g })), { id: "summary", label: "📊 Rekap" }].map(t => {
          const active = tab === t.id;
          const gs = t.g ? groupScore(scores, t.g) : null;
          return (
            <button key={t.id} onClick={() => { setTab(t.id); window.scrollTo({ top: 0 }); }}
              style={{ padding: "11px 14px", border: "none", borderBottom: active ? "3px solid #2B6CB0" : "3px solid transparent", background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 700, color: active ? "#2B6CB0" : "#718096", whiteSpace: "nowrap", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <span>{t.label}</span>
              {gs && <span style={{ fontSize: 10, fontWeight: 600, color: active ? "#2B6CB0" : "#A0AEC0" }}>{gs.got}/{gs.max}</span>}
            </button>
          );
        })}
      </div>

      <div style={{ maxWidth: 820, margin: "0 auto", padding: "20px 16px 48px" }}>

        {/* DATA KLIEN */}
        {tab === "client" && (
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1A202C", marginBottom: 20, paddingBottom: 12, borderBottom: "1px solid #E2E8F0" }}>Data Klien</h2>
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
              ].map(f => (
                <div key={f.key} style={{ gridColumn: f.full ? "1 / -1" : "auto" }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#4A5568", marginBottom: 6 }}>{f.label}</label>
                  {f.options ? (
                    <select value={client[f.key]} onChange={e => setClient(p => ({ ...p, [f.key]: e.target.value }))}
                      style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #CBD5E0", borderRadius: 8, fontSize: 14, color: "#2D3748", background: "#fff" }}>
                      <option value="">Pilih...</option>
                      {f.options.map(o => <option key={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input type={f.type || "text"} value={client[f.key]} onChange={e => setClient(p => ({ ...p, [f.key]: e.target.value }))}
                      style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #CBD5E0", borderRadius: 8, fontSize: 14, color: "#2D3748", boxSizing: "border-box" }} />
                  )}
                </div>
              ))}
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#4A5568", marginBottom: 6 }}>Tes ke-</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {TEST_ROUNDS.map(r => (
                    <button key={r.value} onClick={() => setTestRound(r.value)}
                      style={{ flex: 1, padding: 10, borderRadius: 8, border: testRound === r.value ? `2px solid ${r.color}` : "1.5px solid #CBD5E0", background: testRound === r.value ? r.color : "#fff", color: testRound === r.value ? "#fff" : "#4A5568", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ background: "#EBF8FF", borderRadius: 8, padding: "12px 14px", marginTop: 20, fontSize: 12, color: "#2C5282", lineHeight: 1.7 }}>
              <strong>Cara pakai.</strong> Tiap butir menampilkan satu contoh pertanyaan — asesor bebas memakai pertanyaan lain yang setara.
              Tulis jawaban anak di kolom yang tersedia, <strong>satu jawaban per baris</strong>.
              Untuk butir dengan kriteria terhitung, skor terisi otomatis dari jumlah baris; skor tetap bisa ditimpa manual.
              Butir dengan kriteria besar (25/30/50 pertanyaan) hanya memakai tombol skor 0–4 — jumlah tidak dihitung otomatis.
            </div>

            <div style={{ marginTop: 24, textAlign: "right" }}>
              <button onClick={() => { setTab("G1"); window.scrollTo({ top: 0 }); }}
                style={{ background: "#2B6CB0", color: "#fff", border: "none", borderRadius: 8, padding: "11px 28px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Mulai Asesmen →</button>
            </div>
          </div>
        )}

        {/* BUTIR */}
        {activeGroup && (
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#2B6CB0", letterSpacing: 1, textTransform: "uppercase" }}>
                  {activeGroup.code} · {activeGroup.tasks[0].id}–{activeGroup.tasks[activeGroup.tasks.length - 1].id}
                </span>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: "#1A202C", margin: "2px 0 0" }}>{activeGroup.name}</h2>
              </div>
              <div style={{ background: "#EBF8FF", borderRadius: 8, padding: "4px 12px", fontSize: 13, fontWeight: 700, color: "#2B6CB0" }}>
                {groupScore(scores, activeGroup).got} / {groupScore(scores, activeGroup).max}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {activeGroup.tasks.map(t => {
                const val = scores[t.id];
                const opts = t.max === 4 ? [0, 1, 2, 3, 4] : [0, 1, 2];
                const count = countLines(answers[t.id]);
                const sug = suggestScore(t, count);
                return (
                  <div key={t.id} style={{ border: "1px solid #E2E8F0", borderRadius: 10, padding: 16 }}>
                    {/* Judul + contoh pertanyaan */}
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <span style={{ background: "#2B6CB0", color: "#fff", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 800, flexShrink: 0, marginTop: 2 }}>{t.id}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#1A202C", lineHeight: 1.4 }}>{t.nameId}</div>
                        <div style={{ fontSize: 11, color: "#A0AEC0", fontStyle: "italic" }}>{t.name}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 12.5, color: "#2C5282", background: "#EBF8FF", borderRadius: 6, padding: "7px 10px", margin: "10px 0 12px", lineHeight: 1.5 }}>
                      <strong style={{ fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase", color: "#3182CE" }}>Contoh</strong>
                      <div>{t.ex}</div>
                    </div>

                    {/* Kolom jawaban anak */}
                    <label style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 11, fontWeight: 700, color: "#718096", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.4 }}>
                      <span>Jawaban anak — satu {t.unit} per baris</span>
                      {t.auto
                        ? <span style={{ fontSize: 11, fontWeight: 700, color: count ? "#2B6CB0" : "#CBD5E0", textTransform: "none", letterSpacing: 0 }}>{count} {t.unit}</span>
                        : <span style={{ fontSize: 10, fontWeight: 600, color: "#CBD5E0", textTransform: "none", letterSpacing: 0 }}>skor manual</span>}
                    </label>
                    <textarea rows={3} value={answers[t.id] || ""}
                      onChange={e => setAnswer(t, e.target.value)}
                      placeholder={"Tulis jawaban benar anak di sini,\nsatu per baris..."}
                      style={{ width: "100%", padding: "9px 11px", border: "1.5px solid #CBD5E0", borderRadius: 8, fontSize: 13, color: "#2D3748", resize: "vertical", lineHeight: 1.6, boxSizing: "border-box", fontFamily: "inherit" }} />

                    {t.auto && (
                      <div style={{ fontSize: 11, color: "#718096", marginTop: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span>Ambang otomatis: {t.auto.map((n, i) => `${i + 1} = ${n}`).join(" · ")} {t.unit}</span>
                        {manual[t.id] && (
                          <button onClick={() => backToAuto(t)}
                            style={{ border: "1px solid #CBD5E0", background: "#fff", borderRadius: 20, padding: "2px 10px", fontSize: 10.5, fontWeight: 700, color: "#2B6CB0", cursor: "pointer" }}>
                            ↺ kembali ke skor otomatis ({sug})
                          </button>
                        )}
                      </div>
                    )}

                    {/* Kriteria */}
                    <div style={{ fontSize: 11, color: "#718096", lineHeight: 1.7, margin: "12px 0 8px" }}>
                      {opts.filter(o => o > 0).sort((a, b) => b - a).map(o => (
                        <div key={o} style={{ fontWeight: val === o ? 700 : 400, color: val === o ? SCALE_COLORS[o] : "#718096" }}>
                          <strong style={{ color: SCALE_COLORS[o] }}>{o}</strong> = {t.c[o]}
                        </div>
                      ))}
                      <div><strong style={{ color: SCALE_COLORS[0] }}>0</strong> = belum memenuhi kriteria mana pun</div>
                      {t.naNote && <div style={{ marginTop: 4, color: "#A0AEC0", fontStyle: "italic" }}>{t.naNote}</div>}
                    </div>

                    {/* Tombol skor */}
                    <div style={{ display: "flex", gap: 6 }}>
                      {opts.map(o => (
                        <ScoreButton key={o} value={o} label={String(o)}
                          sub={o === 0 ? "Belum" : o === t.max ? "Mahir" : "Sebagian"}
                          selected={val === o} onClick={() => setScoreManual(t.id, o)} />
                      ))}
                      {t.allowNA && (
                        <ScoreButton value="NA" label="NA" sub="Tidak relevan"
                          selected={isNA(val)} onClick={() => setScoreManual(t.id, "NA")} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 20 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#718096", marginBottom: 6 }}>Catatan Klinis — {activeGroup.code} (opsional)</label>
              <textarea value={notes[activeGroup.code] || ""} rows={2}
                onChange={e => setNotes(p => ({ ...p, [activeGroup.code]: e.target.value }))}
                placeholder="Observasi klinis untuk kelompok keterampilan ini..."
                style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #CBD5E0", borderRadius: 8, fontSize: 13, color: "#2D3748", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }} />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22 }}>
              <button onClick={() => {
                const i = GROUPS.findIndex(g => g.code === activeGroup.code);
                setTab(i === 0 ? "client" : GROUPS[i - 1].code); window.scrollTo({ top: 0 });
              }} style={{ background: "#EDF2F7", color: "#4A5568", border: "none", borderRadius: 8, padding: "11px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>← Sebelumnya</button>
              <button onClick={() => {
                const i = GROUPS.findIndex(g => g.code === activeGroup.code);
                setTab(i === GROUPS.length - 1 ? "summary" : GROUPS[i + 1].code); window.scrollTo({ top: 0 });
              }} style={{ background: "#2B6CB0", color: "#fff", border: "none", borderRadius: 8, padding: "11px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Berikutnya →</button>
            </div>
          </div>
        )}

        {/* REKAP */}
        {tab === "summary" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: bandFor(totalPct).bg, border: `1.5px solid ${bandFor(totalPct).color}`, borderRadius: 12, padding: "20px 22px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: bandFor(totalPct).color }}>Total Intraverbal (Section H)</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: "#1A202C", marginTop: 2 }}>{total.got} <span style={{ fontSize: 16, color: "#718096", fontWeight: 600 }}>/ {total.max}</span></div>
                  <div style={{ fontSize: 12, color: "#718096" }}>{answered} dari 49 butir terisi · skor penuh protokol {TOTAL_MAX}</div>
                </div>
                <div style={{ background: bandFor(totalPct).color, color: "#fff", borderRadius: 10, padding: "10px 18px", textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 800 }}>{Math.round(totalPct)}%</div>
                  <div style={{ fontSize: 11, fontWeight: 700 }}>{bandFor(totalPct).label}</div>
                </div>
              </div>
            </div>

            <div style={{ background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1A202C", marginBottom: 14 }}>Profil per Kelompok Keterampilan</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {GROUPS.map(g => {
                  const { got, max } = groupScore(scores, g);
                  const pct = max ? (got / max) * 100 : 0;
                  const band = bandFor(pct);
                  return (
                    <div key={g.code} onClick={() => { setTab(g.code); window.scrollTo({ top: 0 }); }}
                      style={{ cursor: "pointer", border: "1px solid #EDF2F7", borderRadius: 10, padding: "10px 12px", background: band.bg }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: "#2D3748", flex: 1 }}>{g.code} · {g.name}</span>
                        <span style={{ fontSize: 11, fontWeight: 800, color: band.color, background: "#fff", borderRadius: 20, padding: "2px 10px", border: `1px solid ${band.color}` }}>{band.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#2D3748", width: 56, textAlign: "right" }}>{got}/{max}</span>
                      </div>
                      <div style={{ height: 8, background: "#E2E8F0", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: band.color, borderRadius: 4, transition: "width .2s" }} />
                      </div>
                      {!groupDone(scores, g) && <div style={{ fontSize: 10.5, color: "#A0AEC0", marginTop: 4 }}>Belum semua butir terisi</div>}
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 14, paddingTop: 12, borderTop: "1px solid #EDF2F7" }}>
                {BANDS.map(b => (
                  <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#718096" }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: b.color, display: "inline-block" }} />
                    {b.label} ({b.min}%+)
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1A202C", marginBottom: 4 }}>Butir Prioritas Program</h2>
              <p style={{ fontSize: 12, color: "#A0AEC0", marginBottom: 12 }}>Butir dengan skor 0–1 — kandidat target intervensi berikutnya.</p>
              {(() => {
                const low = TASKS.filter(t => scores[t.id] != null && !isNA(scores[t.id]) && Number(scores[t.id]) <= 1);
                if (!low.length) return <div style={{ fontSize: 12.5, color: "#718096" }}>Belum ada butir berskor 0–1 yang tercatat.</div>;
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {low.map(t => (
                      <div key={t.id} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 12.5, color: "#2D3748" }}>
                        <span style={{ background: SCALE_COLORS[Number(scores[t.id])], color: "#fff", borderRadius: 5, padding: "1px 7px", fontSize: 11, fontWeight: 800 }}>{t.id} · {scores[t.id]}</span>
                        <span>{t.nameId}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            <div style={{ background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1A202C", marginBottom: 12 }}>Kesimpulan Klinis</h2>
              <textarea value={kesimpulan} onChange={e => setKesimpulan(e.target.value)} rows={4}
                placeholder="Gambaran repertoar intraverbal anak saat ini..."
                style={{ width: "100%", padding: "12px 14px", border: "1.5px solid #CBD5E0", borderRadius: 8, fontSize: 14, color: "#2D3748", resize: "vertical", lineHeight: 1.6, boxSizing: "border-box", marginBottom: 18, fontFamily: "inherit" }} />
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1A202C", marginBottom: 12 }}>Rekomendasi Program</h2>
              <textarea value={rekomendasi} onChange={e => setRekomendasi(e.target.value)} rows={4}
                placeholder="Target pengajaran, prosedur prompting, frekuensi sesi..."
                style={{ width: "100%", padding: "12px 14px", border: "1.5px solid #CBD5E0", borderRadius: 8, fontSize: 14, color: "#2D3748", resize: "vertical", lineHeight: 1.6, boxSizing: "border-box", fontFamily: "inherit" }} />
            </div>

            {saveErr && (
              <div style={{ background: "#FFF5F5", border: "1.5px solid #FC8181", borderRadius: 8, padding: "12px 16px", fontSize: 13, color: "#C53030" }}>⚠️ {saveErr}</div>
            )}
            {saveMsg && (
              <div style={{ background: "#F0FFF4", border: "1.5px solid #9AE6B4", borderRadius: 8, padding: "12px 16px", fontSize: 13, color: "#276749" }}>✅ {saveMsg}</div>
            )}
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={generateReport}
                style={{ flex: 1, background: "#EDF2F7", color: "#2D3748", border: "none", borderRadius: 10, padding: "14px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>📄 Laporan (.txt)</button>
              <button onClick={downloadExcel} disabled={xlsxBusy}
                style={{ flex: 1, background: xlsxBusy ? "#A0AEC0" : "#2B6CB0", color: "#fff", border: "none", borderRadius: 10, padding: "14px 20px", fontSize: 14, fontWeight: 700, cursor: xlsxBusy ? "not-allowed" : "pointer" }}>
                {xlsxBusy ? "Membuat..." : "📊 Excel"}</button>
              <button onClick={saveToSupabase} disabled={saving}
                style={{ flex: 2, background: saving ? "#A0AEC0" : "#276749", color: "#fff", border: "none", borderRadius: 10, padding: "14px 20px", fontSize: 15, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", boxShadow: "0 2px 12px rgba(39,103,73,0.2)" }}>
                {saving ? "Menyimpan..." : "💾 Simpan ke Database"}</button>
              <button onClick={resetForm}
                style={{ flex: 1, background: "#EDF2F7", color: "#4A5568", border: "none", borderRadius: 10, padding: "14px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Asesmen Baru</button>
            </div>
            <p style={{ fontSize: 12, color: "#A0AEC0", textAlign: "center", margin: 0 }}>
              "Simpan ke Database" mengirim entri ke Dashboard. Laporan (.txt) memuat jawaban anak per butir; butir NA dikeluarkan dari penyebut.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
