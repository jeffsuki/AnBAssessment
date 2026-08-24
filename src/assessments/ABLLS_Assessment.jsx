import { useState, useCallback, useMemo } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// ABLLS-R — SECTION H: INTRAVERBAL  |  Above & Beyond Child Development Center
// 49 tasks (H1–H49). Scoring 0–4 per ABLLS-R Protocol pp.43–51;
// H3 allows NA (non-ASL / talker). H30, H40, H43, H47, H48, H49 max = 2.
// Probe questions taken from the center's intraverbal assessment sheet.
// Each probe is checked across 3 trials ("check at least 3 times").
// ─────────────────────────────────────────────────────────────────────────────

const APP_PASSWORD = "AboveBeyond2026";
const TRIALS = [1, 2, 3];

const SCALE_COLORS = {
  0: "#E53E3E",
  1: "#DD6B20",
  2: "#D69E2E",
  3: "#3182CE",
  4: "#38A169",
};

const TEST_ROUNDS = [
  { value: 1, label: "Tes ke-1", color: "#E53E3E" },
  { value: 2, label: "Tes ke-2", color: "#D69E2E" },
  { value: 3, label: "Tes ke-3", color: "#2B6CB0" },
  { value: 4, label: "Tes ke-4", color: "#38A169" },
];

// classification bands (persentase pencapaian per kelompok)
const BANDS = [
  { min: 75, label: "Sesuai / Kuat",        color: "#38A169", bg: "#F0FFF4" },
  { min: 50, label: "Berkembang",           color: "#3182CE", bg: "#EBF8FF" },
  { min: 25, label: "Perlu Dukungan",       color: "#DD6B20", bg: "#FFFAF0" },
  { min: 0,  label: "Prioritas Intervensi", color: "#E53E3E", bg: "#FFF5F5" },
];
const bandFor = pct => BANDS.find(b => pct >= b.min) || BANDS[BANDS.length - 1];

// ── TASK DATA ────────────────────────────────────────────────────────────────
// c = criteria per score point; p = probe questions; max = skor maksimum
const TASKS = [
  { id: "H1", name: "Fill in words from songs", nameId: "Melengkapi kata dari lagu",
    obj: "Saat orang lain menyanyi, anak dapat melengkapi kata/frasa dari lagu.", max: 4,
    c: { 4: "≥3 frasa dari 6 lagu", 3: "3 kata dari 3 lagu", 2: "2 kata dari 2 lagu", 1: "1 kata dari 2 lagu" },
    p: ["Mary had a little...", "The wheels on the bus go...", "Itsy bitsy spider came...", "If you're happy and you know it...", "Row row your...", "There was a farmer who had a farm and Bingo was his name..."] },

  { id: "H2", name: "Fill in blanks about fun items and activities", nameId: "Melengkapi frasa tentang benda/aktivitas menyenangkan",
    obj: "Anak melengkapi frasa terbuka terkait benda dan aktivitas yang menyenangkan.", max: 4,
    c: { 4: "≥10 respons isian", 3: "5 respons isian", 2: "2 respons isian", 1: "1 respons isian" },
    p: ["Let's go up and...", "Ready, set...", "1, 2, ..."] },

  { id: "H3", name: "Sign English words (ASL / Bisindo)", nameId: "Memberi isyarat kata (khusus anak nonverbal)",
    obj: "Anak memberi isyarat (ASL/Bisindo) saat diberi kata secara lisan. Isyarat tidak harus persis.", max: 4, allowNA: true,
    c: { 4: "25 isyarat", 3: "15 isyarat", 2: "5 isyarat", 1: "2 isyarat" },
    p: ["Hanya untuk anak nonverbal — pilih NA bila anak dapat mengucapkan >50 kata atau tidak memakai isyarat"] },

  { id: "H4", name: "Animal sounds", nameId: "Suara binatang",
    obj: "Anak menyebut nama binatang bila diberi suaranya, atau sebaliknya.", max: 4,
    c: { 4: "8 suara binatang DAN 8 nama binatang", 3: "6 suara atau nama", 2: "4 suara atau nama", 1: "2 suara atau nama" },
    p: ["Suara anjing?", "Suara kucing?", "Suara bebek?", "Suara sapi?", "Suara burung hantu?", "Suara serigala?"] },

  { id: "H5", name: "Answers personal questions", nameId: "Menjawab pertanyaan data diri",
    obj: "Anak menjawab pertanyaan mengenai informasi pribadi.", max: 4,
    c: { 4: "≥4 informasi tentang diri", 3: "3 informasi", 2: "2 informasi", 1: "1 informasi" },
    p: ["Siapa namamu?", "Berapa umurmu?", "Di mana rumahmu?", "Siapa nama ayahmu?", "Siapa nama ibumu?", "Di mana sekolahmu?"] },

  { id: "H6", name: "Fill in words describing common activities", nameId: "Melengkapi kata aktivitas sehari-hari",
    obj: "Anak melengkapi kata terakhir dari frasa yang menggambarkan aktivitas yang sedang berlangsung.", max: 4,
    c: { 4: "≥10 respons isian", 3: "5 respons isian", 2: "2 respons isian", 1: "1 respons isian" },
    p: ["You are sitting in a...", "You are playing...", "You are drinking...", "You go to school riding a...", "You wear a...", "You eat..."] },

  { id: "H7", name: "Intraverbal associations", nameId: "Asosiasi intraverbal",
    obj: "Anak menyebut benda yang berkaitan saat ditanya 'apa yang cocok dengan...?'", max: 4,
    c: { 4: "≥2 item terkait untuk 20 benda", 3: "2 item terkait untuk 10 benda", 2: "1 item terkait untuk 10 benda", 1: "1 item terkait untuk 5 benda" },
    p: ["Apa yang cocok dengan pensil?", "Apa yang cocok dengan baju?", "Apa yang cocok dengan sepatu?", "Sendok dipakai dengan apa?", "Meja pasangannya apa?", "Pintu pasangannya apa?"] },

  { id: "H8", name: "Fill in item given function", nameId: "Menyebut benda bila diberi fungsinya",
    obj: "Anak melengkapi nama benda dalam frasa yang berkaitan dengan fungsi benda.", max: 4,
    c: { 4: "≥20 isian dengan dua respons", 3: "10 isian dengan dua respons", 2: "5 respons isian", 1: "2 respons isian" },
    p: ["You eat with a...", "Dad/mom drives a...", "You brush teeth with a...", "You wash hands with a...", "You sit on a...", "You drink a..."] },

  { id: "H9", name: "Fill in function given item", nameId: "Menyebut fungsi bila diberi bendanya",
    obj: "Anak melengkapi kata yang menyebut fungsi dari sebuah benda.", max: 4,
    c: { 4: "≥20 isian dengan dua respons", 3: "10 isian dengan dua respons", 2: "5 respons isian", 1: "2 respons isian" },
    p: ["Kursi untuk...", "Sendok untuk...", "Penghapus untuk...", "Mata untuk...", "Mulut untuk...", "Tangan untuk..."] },

  { id: "H10", name: "Answers 'What' questions — items at home", nameId: "Pertanyaan 'Apa' — benda di rumah",
    obj: "Anak menjawab pertanyaan 'apa' mengenai benda-benda yang ada di rumah.", max: 4,
    c: { 4: "≥30 pertanyaan, termasuk ≥3 respons untuk ≥5 lokasi", 3: "15 pertanyaan", 2: "10 pertanyaan", 1: "5 pertanyaan" },
    p: ["Apa yang ada di kamarmu?", "Apa isi kulkas?", "Apa yang ada di kamar mandi?", "Sebutkan satu benda di dapur", "Apa yang ada di halaman?", "Apa yang ada di ruang tamu?"] },

  { id: "H11", name: "Answers 'What' questions — function", nameId: "Pertanyaan 'Apa' — fungsi benda",
    obj: "Anak menjawab pertanyaan 'apa' mengenai fungsi benda.", max: 4,
    c: { 4: "≥50 pertanyaan", 3: "25 pertanyaan", 2: "10 pertanyaan", 1: "5 pertanyaan" },
    p: ["Apa yang dipakai untuk minum?", "Apa yang dipakai untuk memotong kertas/sayur?", "Apa yang dipakai untuk memasak?", "Mata untuk apa?", "Bantal untuk apa?", "Tas untuk apa?"] },

  { id: "H12", name: "Answers 'Where' questions — items at home/school", nameId: "Pertanyaan 'Di mana' — benda di rumah/sekolah",
    obj: "Anak menjawab pertanyaan 'di mana' mengenai benda di rumah atau kelas.", max: 4,
    c: { 4: "≥30 pertanyaan", 3: "15 pertanyaan", 2: "10 pertanyaan", 1: "5 pertanyaan" },
    p: ["Di mana toilet?", "Di mana buku?", "Di mana sikat gigi?", "Di mana pisau?", "Di mana bantal?", "Di mana papan tulis?"] },

  { id: "H13", name: "Answers 'Where' questions — activities at home/school", nameId: "Pertanyaan 'Di mana' — aktivitas di rumah/sekolah",
    obj: "Anak menjawab pertanyaan 'di mana' mengenai aktivitas di rumah atau sekolah.", max: 4,
    c: { 4: "≥30 pertanyaan", 3: "15 pertanyaan", 2: "10 pertanyaan", 1: "5 pertanyaan" },
    p: ["Di mana kamu cuci tangan?", "Di mana kamu mengerjakan PR?", "Di mana kamu tidur?", "Di mana memasak telur?", "Di mana kamu membaca buku?", "Di mana kamu bermain dengan teman?"] },

  { id: "H14", name: "Fill in item given the class", nameId: "Menyebut contoh bila diberi kelompoknya",
    obj: "Anak melengkapi nama benda/contoh dari kelompok yang disebutkan.", max: 4,
    c: { 4: "≥20 isian dengan dua respons", 3: "10 isian dengan dua respons", 2: "5 respons isian", 1: "2 respons isian" },
    p: ["Salah satu makanan adalah...", "Salah satu binatang adalah...", "Salah satu kendaraan adalah...", "Salah satu buah adalah...", "Salah satu pakaian adalah...", "Salah satu alat dapur/tulis adalah..."] },

  { id: "H15", name: "Multiple responses given specific categories", nameId: "Beberapa jawaban untuk satu kategori",
    obj: "Anak menyebutkan beberapa anggota dari kategori tertentu.", max: 4,
    c: { 4: "20 kategori dengan 4 respons", 3: "10 kategori dengan 3 respons", 2: "5 kategori dengan 2 respons", 1: "2 kategori dengan 2 respons" },
    p: ["Sebutkan beberapa binatang", "Sebutkan hal yang bisa dimakan", "Sebutkan hal yang bisa dinaiki", "Sebutkan beberapa minuman", "Sebutkan beberapa alat tulis", "Sebutkan beberapa anggota tubuh"] },

  { id: "H16", name: "Fill in features given the item", nameId: "Menyebut ciri bila diberi bendanya",
    obj: "Anak melengkapi kata yang menyebut ciri/bagian dari benda yang disebutkan.", max: 4,
    c: { 4: "≥20 isian dengan dua respons", 3: "10 isian dengan dua respons", 2: "5 respons isian", 1: "2 respons isian" },
    p: ["Burung punya...", "Pohon punya...", "Mobil punya...", "Rumah punya...", "Sapi punya...", "Mama/papa punya..."] },

  { id: "H17", name: "Fill in item given its feature", nameId: "Menyebut benda bila diberi cirinya",
    obj: "Anak melengkapi nama benda bila diberi tahu salah satu cirinya.", max: 4,
    c: { 4: "≥20 isian dengan dua respons", 3: "10 isian dengan dua respons", 2: "5 respons isian", 1: "2 respons isian" },
    p: ["Sesuatu yang punya ekor adalah...", "Sesuatu yang punya mata adalah...", "Sesuatu yang punya kancing adalah...", "Sesuatu yang punya jari adalah...", "Sesuatu yang punya pintu adalah...", "Sesuatu yang punya daun adalah..."] },

  { id: "H18", name: "Fill in class given the item", nameId: "Menyebut kelompok bila diberi bendanya",
    obj: "Anak melengkapi kelompok/kelas dari benda atau contoh yang diberikan.", max: 4,
    c: { 4: "≥20 isian dengan dua respons", 3: "10 isian dengan dua respons", 2: "5 respons isian", 1: "2 respons isian" },
    p: ["Anjing adalah...", "Apel adalah...", "Pulpen adalah...", "Nasi goreng adalah...", "Helikopter adalah...", "Jus adalah..."] },

  { id: "H19", name: "Name items previously observed", nameId: "Menyebut benda yang tadi dilihat",
    obj: "Anak menyebutkan benda yang sebelumnya telah diamati.", max: 4,
    c: { 4: "≥2 benda, 1 jam setelah observasi", 3: "1 benda, 10 menit setelahnya", 2: "1 benda, 5 menit setelahnya", 1: "1 benda, langsung setelahnya" },
    p: ["Ajak anak melihat ke jendela, lalu tanyakan apa yang tadi dilihat", "Tunjukkan gambar, lalu tanyakan apa yang tadi dilihat", "Setelah membaca satu halaman buku, tanyakan apa yang tadi dilihat"] },

  { id: "H20", name: "Name previously observed activities", nameId: "Menyebut aktivitas yang tadi dilihat",
    obj: "Anak menyebutkan aktivitas yang baru saja diamatinya.", max: 4,
    c: { 4: "Menyebut aktivitas 1 jam setelahnya", 3: "10 menit setelahnya", 2: "5 menit setelahnya", 1: "Langsung setelahnya" },
    p: ["Setelah melihat ke jendela: tadi kucing/satpam sedang apa?", "Setelah melihat gambar: orang itu tadi sedang apa?", "Setelah membaca buku: tadi pemadam/kucing/anak itu sedang apa?"] },

  { id: "H21", name: "Name people previously observed", nameId: "Menyebut orang yang tadi dilihat",
    obj: "Anak menyebutkan orang yang sebelumnya telah diamati.", max: 4,
    c: { 4: "≥2 orang, 1 jam setelah observasi", 3: "1 orang, 10 menit setelahnya", 2: "1 orang, 5 menit setelahnya", 1: "1 orang, langsung setelahnya" },
    p: ["Setelah melihat ke jendela: tadi siapa yang kamu lihat?", "Setelah melihat gambar: tadi siapa yang kamu lihat?", "Setelah membaca buku: tadi siapa yang kamu lihat?"] },

  { id: "H22", name: "With visual display, makes related statements", nameId: "Berkomentar terkait gambar (bukan menamai)",
    obj: "Anak membuat komentar terkait gambar benda/aktivitas, di luar sekadar menamai benda.", max: 4,
    c: { 4: "Berkomentar pada 20 gambar", 3: "10 gambar", 2: "5 gambar", 1: "1 gambar" },
    p: ["Tunjukkan gambar sebuah peristiwa (3 kali) — contoh respons: 'makanannya panas', 'kelihatan enak', 'dia capek'"] },

  { id: "H23", name: "Answers 'What' questions — items in the community", nameId: "Pertanyaan 'Apa' — benda di lingkungan",
    obj: "Anak memberi jawaban tunggal mengenai apa yang bisa dilihat di berbagai tempat umum.", max: 4,
    c: { 4: "≥20 pertanyaan terjawab", 3: "10 pertanyaan", 2: "5 pertanyaan", 1: "2 pertanyaan" },
    p: ["Apa yang kamu lihat di tempat ibadah?", "Apa yang ada di taman?", "Apa yang ada di playground?", "Apa yang kamu temukan di mall?", "Apa yang kamu lihat di sirkus?", "Apa yang ada di toko?"] },

  { id: "H24", name: "Answers 'What' questions — activities in the community", nameId: "Pertanyaan 'Apa' — aktivitas di lingkungan",
    obj: "Anak memberi jawaban tunggal mengenai apa yang bisa dilakukan di berbagai tempat umum.", max: 4,
    c: { 4: "≥20 pertanyaan terjawab", 3: "10 pertanyaan", 2: "5 pertanyaan", 1: "2 pertanyaan" },
    p: ["Apa yang bisa kamu lakukan di taman?", "Apa yang bisa kamu lakukan di supermarket?", "Apa yang kamu lakukan di kebun binatang?"] },

  { id: "H25", name: "Answers 'Where' questions — community", nameId: "Pertanyaan 'Di mana' — lingkungan",
    obj: "Anak menjawab pertanyaan 'di mana' mengenai aktivitas dan benda di lingkungan sekitar.", max: 4,
    c: { 4: "≥30 pertanyaan", 3: "15 pertanyaan", 2: "10 pertanyaan", 1: "5 pertanyaan" },
    p: ["Di mana kita beli susu?", "Di mana kamu main perosotan?", "Di mana kamu bertemu guru?", "Di mana banyak pohon?", "Di mana kamu bisa makan (makanan favorit)?", "Di mana ada lift?"] },

  { id: "H26", name: "Multiple responses about immediate community", nameId: "Beberapa jawaban tentang lingkungan sekitar",
    obj: "Anak memberi beberapa jawaban untuk pertanyaan mengenai lingkungan terdekatnya.", max: 4,
    c: { 4: "20 kategori dengan 3 respons", 3: "10 kategori dengan 3 respons", 2: "5 kategori dengan 2 respons", 1: "2 kategori dengan 2 respons" },
    p: ["Sebutkan apa saja yang ada di playground", "Sebutkan sebanyak mungkin isi supermarket", "Sebutkan semua yang ada di taman", "Sebutkan semua yang ada di sekolah", "Apa saja yang ada di mall?", "Apa saja yang ada di restoran?"] },

  { id: "H27", name: "States class given multiple class members", nameId: "Menyebut kelompok bila diberi beberapa contoh",
    obj: "Anak mengidentifikasi kelompok bila disebutkan dua atau lebih anggotanya.", max: 4,
    c: { 4: "20 kelompok bila diberi ≥2 anggota", 3: "10 kelompok", 2: "5 kelompok", 1: "1 kelompok bila diberi ≥2 anggota" },
    p: ["Apel, nanas, semangka termasuk apa?", "Pensil, penghapus, penggaris termasuk apa?", "Bantal, selimut, kasur termasuk apa?", "Mobil, pesawat, kapal termasuk apa?", "Anjing, kelinci, kucing termasuk apa?", "Mata, tangan, kaki termasuk apa?"] },

  { id: "H28", name: "Answers 'Who/Whose' questions", nameId: "Pertanyaan 'Siapa / Milik siapa'",
    obj: "Anak menjawab pertanyaan 'siapa' (orang) atau 'milik siapa' (kepemilikan).", max: 4,
    c: { 4: "≥50 pertanyaan", 3: "25 pertanyaan", 2: "10 pertanyaan", 1: "5 pertanyaan" },
    p: ["Punya siapa tas itu?", "Kamu naik mobil siapa ke sekolah?", "Siapa yang mengajar di sekolah?", "Ke siapa kamu pergi kalau sakit?", "Siapa yang memadamkan api?", "Siapa yang masak di rumah?"] },

  { id: "H29", name: "Answers 'When' questions", nameId: "Pertanyaan 'Kapan'",
    obj: "Anak menjawab pertanyaan 'kapan'.", max: 4,
    c: { 4: "≥50 pertanyaan", 3: "25 pertanyaan", 2: "10 pertanyaan", 1: "5 pertanyaan" },
    p: ["Kapan kamu tidur?", "Kapan kamu pakai payung?", "Kapan kamu ke sekolah?", "Kapan kamu minum?", "Kapan kamu sarapan?", "Kapan papa ke pom bensin?"] },

  { id: "H30", name: "Discrimination of questions about items and activities", nameId: "Membedakan jenis pertanyaan (apa/di mana/siapa/kapan)",
    obj: "Anak membedakan apakah ia sedang ditanya 'apa', 'di mana', 'siapa', atau 'kapan' saat pertanyaan diacak.", max: 2,
    c: { 2: "Menjawab ≥4 jenis pertanyaan dalam urutan acak", 1: "Menjawab ≥2 jenis pertanyaan dalam urutan acak" },
    p: ["Apel warnanya apa? Di mana kita beli apel? Apel diapakan?", "Kapan kamu ke sekolah? Di mana sekolahmu? Siapa gurumu? Naik apa ke sekolah?", "Makanan apa yang kamu suka? Beli di mana? Pergi dengan siapa?", "Di rumah kamu suka main apa? Main dengan siapa? Kapan waktunya main/tidur?", "Mainan favoritmu apa? Siapa yang belikan? Kapan kamu memainkannya? Di mana?"] },

  { id: "H31", name: "Answers 'Which' questions", nameId: "Pertanyaan 'Yang mana'",
    obj: "Anak menjawab pertanyaan 'yang mana' secara intraverbal dari dua pilihan atau lebih.", max: 4,
    c: { 4: "≥50 pertanyaan", 3: "25 pertanyaan", 2: "10 pertanyaan", 1: "5 pertanyaan" },
    p: ["Mana binatang, anjing atau sepatu?", "Mana yang hijau, mie atau daun?", "Mana makanan, kursi atau nasi goreng?", "Mana mainan, boneka atau botol?", "Mana yang diminum, gelembung atau susu?", "Mana untuk sikat gigi, odol atau tusuk gigi?"] },

  { id: "H32", name: "Answers 'How' questions", nameId: "Pertanyaan 'Bagaimana'",
    obj: "Anak menjawab pertanyaan 'bagaimana' (satu jawaban).", max: 4,
    c: { 4: "≥50 pertanyaan", 3: "25 pertanyaan", 2: "10 pertanyaan", 1: "5 pertanyaan" },
    p: ["Bagaimana cara mematikan lampu?", "Bagaimana cara memotong kertas?", "Bagaimana cara makan?", "Bagaimana cara cuci tangan?", "Bagaimana cara pipis?", "Bagaimana cara meniup gelembung?"] },

  { id: "H33", name: "Answers 'Why' questions", nameId: "Pertanyaan 'Mengapa'",
    obj: "Anak menjawab pertanyaan 'mengapa'.", max: 4,
    c: { 4: "≥50 pertanyaan", 3: "25 pertanyaan", 2: "10 pertanyaan", 1: "5 pertanyaan" },
    p: ["Kenapa pakai payung?", "Kenapa harus ke dokter?", "Kenapa lampu harus dimatikan?", "Kenapa harus mandi/bersih-bersih?", "Kenapa kamu makan?", "Kenapa kamu tidur?"] },

  { id: "H34", name: "Describes steps in sequence of a daily activity", nameId: "Menjelaskan urutan langkah aktivitas harian",
    obj: "Anak menyebutkan langkah-langkah berurutan dari suatu aktivitas harian.", max: 4,
    c: { 4: "≥5 langkah pada ≥2 rangkaian", 3: "4 langkah pada 1 rangkaian", 2: "3 langkah pada 1 rangkaian", 1: "2 langkah pada 1 rangkaian" },
    p: ["Ceritakan cara cuci tangan", "Ceritakan langkah memakai sepatu", "Ceritakan langkah memakai baju", "Ceritakan langkah bersiap ke sekolah", "Ceritakan langkah bersiap makan siang di sekolah", "Ceritakan cara menyikat gigi"] },

  { id: "H35", name: "States activity when told sequence of actions", nameId: "Menebak aktivitas dari urutan tindakan",
    obj: "Anak menyebutkan aktivitas yang dimaksud bila diberi rangkaian tindakan.", max: 4,
    c: { 4: "≥20 pertanyaan terjawab", 3: "10 pertanyaan", 2: "5 pertanyaan", 1: "2 pertanyaan" },
    p: ["Kalau saya ambil piring, sendok, garpu — saya mau apa?", "Saya ambil handuk, buka air, pakai sabun — saya sedang apa?", "Saya ambil tas, pakai sepatu, buka pintu — saya sedang apa?", "Saya ambil sikat gigi, beri odol, masukkan ke mulut — saya sedang apa?", "Saya bersihkan luka lalu ambil plester — saya sedang apa?", "Saya ke tempat tidur, berbaring, pakai selimut — saya sedang apa?"] },

  { id: "H36", name: "States item when told features/functions/class", nameId: "Menebak benda dari beberapa petunjuk",
    obj: "Anak menyebut nama benda setelah diberi beberapa petunjuk (ciri, fungsi, kelompok).", max: 4,
    c: { 4: "≥20 pertanyaan terjawab", 3: "10 pertanyaan", 2: "5 pertanyaan", 1: "2 pertanyaan" },
    p: ["Binatang, punya sayap, kecil — apa itu?", "Punya roda, pintu, dan jendela — apa itu?", "Aku makan sesuatu yang bulat, merah, manis — apa itu?", "Dipakai di kaki, harus pakai kaus kaki dulu — apa itu?", "Alat tulis yang tajam untuk memotong — apa itu?", "Makhluk hidup, punya batang dan daun — apa itu?"] },

  { id: "H37", name: "Intraverbal Yes/No with Can/Do/Does/Will questions", nameId: "Ya/Tidak untuk benda atau aktivitas yang tidak ada",
    obj: "Anak menjawab 'ya' atau 'tidak' (atau gerakan kepala) untuk benda/aktivitas yang tidak hadir.", max: 4,
    c: { 4: "≥50 pertanyaan", 3: "25 pertanyaan", 2: "10 pertanyaan", 1: "5 pertanyaan" },
    p: ["Apakah babi bisa terbang?", "Apakah mobil punya empat roda?", "Apakah bantal bisa dimakan?", "Apakah pisang berwarna kuning?", "Apakah kamu bisa bernapas di dalam air?", "Apakah pesawat terbang di langit?"] },

  { id: "H38", name: "Multiple answers to 2-component questions", nameId: "Beberapa jawaban untuk pertanyaan 2 komponen",
    obj: "Anak memberi beberapa jawaban untuk pertanyaan dengan dua kriteria.", max: 4,
    c: { 4: "4 respons untuk 5 pertanyaan berbeda", 3: "3 respons untuk 4 pertanyaan", 2: "2 respons untuk 3 pertanyaan", 1: "2 respons untuk 1 pertanyaan" },
    p: ["Sebutkan binatang kecil!", "Apa saja yang berkaki empat?", "Sebutkan binatang besar di kebun binatang", "Sebutkan kendaraan besar", "Sebutkan makanan yang panas", "Sebutkan benda yang bulat"] },

  { id: "H39", name: "Multiple answers to 3-component questions", nameId: "Beberapa jawaban untuk pertanyaan 3 komponen",
    obj: "Anak memberi beberapa jawaban untuk pertanyaan dengan tiga kriteria.", max: 4,
    c: { 4: "4 respons untuk 5 pertanyaan berbeda", 3: "3 respons untuk 4 pertanyaan", 2: "2 respons untuk 3 pertanyaan", 1: "2 respons untuk 1 pertanyaan" },
    p: ["Sebutkan buah kecil berwarna merah", "Benda di rumah yang bisa dibuka dan ditutup?", "Sebutkan makanan dingin yang manis", "Benda kotak untuk menulis? (papan tulis, iPad, kertas)", "Kendaraan darat yang besar? (truk, bus, damkar)", "Baju pria yang berkantong? (jaket, celana, kaus)"] },

  { id: "H40", name: "Describes items", nameId: "Mendeskripsikan benda",
    obj: "Anak mendeskripsikan benda melalui kegunaan, ciri, dan/atau kelompoknya.", max: 2,
    c: { 2: "Mendeskripsikan ≥20 benda dengan ≥3 detail relevan (di luar nama benda)", 1: "Mendeskripsikan ≥10 benda dengan ≥2 detail relevan" },
    p: ["Deskripsikan mobil", "Deskripsikan jeruk", "Deskripsikan pohon", "Deskripsikan sekolah", "Deskripsikan rumahmu", "Deskripsikan pensil"] },

  { id: "H41", name: "Describes before/after steps in a daily activity", nameId: "Menyebut langkah sebelum/sesudah",
    obj: "Anak menyebutkan langkah yang terjadi sebelum dan sesudah suatu langkah dalam aktivitas harian.", max: 4,
    c: { 4: "Sebelum DAN sesudah untuk 10 aktivitas", 3: "Sebelum DAN sesudah untuk 5 aktivitas", 2: "1 langkah sebelum ATAU sesudah untuk 2 aktivitas", 1: "1 langkah sebelum atau sesudah untuk 1 aktivitas" },
    p: ["Apa yang kamu lakukan sebelum sikat gigi?", "Sebelum makan pisang?", "Sebelum berangkat sekolah?", "Sesudah sikat gigi?", "Sesudah makan pisang?", "Sesudah pulang sekolah?"] },

  { id: "H42", name: "Answers questions about past/future events", nameId: "Pertanyaan peristiwa lampau & mendatang",
    obj: "Anak menjawab pertanyaan dengan satu respons mengenai peristiwa lampau dan yang akan datang.", max: 4,
    c: { 4: "4 jawaban peristiwa lampau DAN mendatang >1 bulan", 3: "2 jawaban lampau ATAU mendatang >1 bulan", 2: "2 jawaban lampau atau mendatang dalam 1 minggu", 1: "≥2 jawaban peristiwa hari itu" },
    p: ["Tadi pagi sarapan apa?", "Akhir pekan lalu kamu ngapain?", "Liburan lalu kamu ke mana?", "Setelah ini kamu mau apa?", "Liburan nanti mau ke mana?", "Terakhir ke mall/pantai kamu ngapain?"] },

  { id: "H43", name: "Maintains a conversation with an adult or peer", nameId: "Mempertahankan percakapan",
    obj: "Anak mempertahankan percakapan satu topik selama minimal lima pertukaran verbal.", max: 2,
    c: { 2: "5 pertukaran pada ≥10 topik, termasuk ≥1 pertanyaan atau komentar baru dari anak", 1: "3 pertukaran pada ≥5 topik" },
    p: ["Pilih topik yang anak sukai — anak diminta memberi komentar terkait dan mengajukan pertanyaan", "5 pertukaran = sangat baik (minimal 1 pertanyaan)", "3 pertukaran = cukup; di bawah itu perlu stimulasi"] },

  { id: "H44", name: "Answers novel questions", nameId: "Menjawab pertanyaan dengan format baru",
    obj: "Anak menjawab pertanyaan yang diajukan dengan cara berbeda dari yang diajarkan.", max: 4,
    c: { 4: "≥20 pertanyaan baru terjawab", 3: "10 pertanyaan", 2: "5 pertanyaan", 1: "2 pertanyaan" },
    p: ["Ubah format pertanyaan dari butir mana pun. Contoh: 'Bagaimana bunyi mobil?' → 'Sebutkan suara mobil' → 'Mobil bunyinya apa?'"] },

  { id: "H45", name: "Gives single answer about current events", nameId: "Satu jawaban tentang peristiwa/perayaan",
    obj: "Anak menjawab pertanyaan mengenai peristiwa yang sedang berlangsung di lingkungannya.", max: 4,
    c: { 4: "≥20 pertanyaan terjawab", 3: "10 pertanyaan", 2: "5 pertanyaan", 1: "2 pertanyaan" },
    p: ["Apa yang kamu lakukan saat Imlek/Idul Fitri/Natal/Waisak/Nyepi?", "Apa yang kamu lakukan saat 17 Agustus?", "Apa yang kamu lakukan saat kumpul keluarga/karyawisata?"] },

  { id: "H46", name: "Gives multiple answers about current events", nameId: "Beberapa jawaban tentang peristiwa/perayaan",
    obj: "Anak memberi beberapa jawaban untuk pertanyaan mengenai peristiwa yang sedang berlangsung.", max: 4,
    c: { 4: "20 kategori dengan 3 respons", 3: "10 kategori dengan 3 respons", 2: "5 kategori dengan 2 respons", 1: "2 kategori dengan 1–2 respons" },
    p: ["Sebutkan sebanyak mungkin kegiatan saat Imlek/Idul Fitri/Natal/Waisak/Nyepi", "Apa saja yang bisa dilakukan saat 17 Agustus?", "Apa saja yang biasa dilakukan saat kumpul keluarga/karyawisata?"] },

  { id: "H47", name: "Gives multiple answers in group discussions", nameId: "Beberapa jawaban dalam diskusi kelompok",
    obj: "Anak memberi beberapa jawaban untuk berbagai topik dalam diskusi kelompok.", max: 2,
    c: { 2: "≥2 komentar untuk ≥3 topik dalam diskusi 20 menit", 1: "≥1 komentar untuk ≥2 topik dalam diskusi 10 menit" },
    p: ["Amati dalam sesi kelompok: apakah anak memberi beberapa jawaban untuk berbagai topik?"] },

  { id: "H48", name: "Tells about experiences / tells stories", nameId: "Menceritakan pengalaman atau cerita",
    obj: "Anak menceritakan pengalaman atau peristiwa dengan minimal lima komponen terpisah.", max: 2,
    c: { 2: "≥5 deskripsi peristiwa/cerita yang memuat ≥5 komponen", 1: "≥1 deskripsi peristiwa/cerita yang memuat ≥3 komponen" },
    p: ["Minta anak menceritakan pengalamannya (jalan-jalan, kebun binatang, mall)", "Atau cerita favoritnya (episode film atau dongeng)", "Dihitung benar bila memuat 5 deskripsi/komponen"] },

  { id: "H49", name: "Spontaneous conversation", nameId: "Percakapan spontan",
    obj: "Anak secara spontan menambahkan komentar yang relevan dalam percakapan yang sedang berlangsung.", max: 2,
    c: { 2: "Spontan berkomentar ≥10 kali per hari", 1: "Spontan berkomentar ≥10 kali per minggu (tanpa prompt)" },
    p: ["Buka topik spontan yang disukai atau berkaitan dengan anak, amati apakah anak mempertahankan percakapan"] },
];

// ── GROUPS (untuk tab & rekap) ───────────────────────────────────────────────
const GROUPS = [
  { code: "G1", name: "Dasar & Isian",            short: "Dasar",      from: 1,  to: 9  },
  { code: "G2", name: "WH — Rumah & Sekolah",     short: "WH Rumah",   from: 10, to: 13 },
  { code: "G3", name: "Kelas, Ciri & Kategori",   short: "Kategori",   from: 14, to: 18 },
  { code: "G4", name: "Recall & Komentar Visual", short: "Recall",     from: 19, to: 22 },
  { code: "G5", name: "Lingkungan / Komunitas",   short: "Komunitas",  from: 23, to: 27 },
  { code: "G6", name: "WH Lanjutan",              short: "WH Lanjut",  from: 28, to: 33 },
  { code: "G7", name: "Sekuens & Deskripsi",      short: "Sekuens",    from: 34, to: 36 },
  { code: "G8", name: "Ya/Tidak & Multi-komponen",short: "Multi",      from: 37, to: 40 },
  { code: "G9", name: "Peristiwa & Percakapan",   short: "Percakapan", from: 41, to: 49 },
].map(g => ({ ...g, tasks: TASKS.filter(t => { const n = Number(t.id.slice(1)); return n >= g.from && n <= g.to; }) }));

const TOTAL_MAX = TASKS.reduce((s, t) => s + t.max, 0); // 184

// ── HELPERS ──────────────────────────────────────────────────────────────────
const isNA = v => v === "NA";
function groupScore(scores, g) {
  let got = 0, max = 0;
  g.tasks.forEach(t => {
    const v = scores[t.id];
    if (isNA(v)) return;              // NA dikeluarkan dari penyebut
    max += t.max;
    if (v != null) got += Number(v);
  });
  return { got, max };
}
function groupDone(scores, g) {
  return g.tasks.every(t => scores[t.id] != null);
}
function totalScore(scores) {
  return GROUPS.reduce((acc, g) => {
    const { got, max } = groupScore(scores, g);
    return { got: acc.got + got, max: acc.max + max };
  }, { got: 0, max: 0 });
}

// ── SMALL COMPONENTS ─────────────────────────────────────────────────────────
function ScoreButton({ value, selected, onClick, label, sub }) {
  const color = value === "NA" ? "#718096" : SCALE_COLORS[value];
  return (
    <button onClick={onClick}
      style={{
        flex: 1, minWidth: 0, padding: "9px 4px", borderRadius: 8, cursor: "pointer",
        border: selected ? `2px solid ${color}` : "1.5px solid #CBD5E0",
        background: selected ? color : "#fff",
        color: selected ? "#fff" : "#4A5568",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 2, transition: "all .15s",
      }}>
      <span style={{ fontSize: 16, fontWeight: 800, lineHeight: 1 }}>{label}</span>
      <span style={{ fontSize: 9, lineHeight: 1.1, textAlign: "center" }}>{sub}</span>
    </button>
  );
}

function TrialBoxes({ taskId, probeIdx, trials, toggle }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {TRIALS.map(t => {
        const k = `${taskId}_p${probeIdx}_t${t}`;
        const on = !!trials[k];
        return (
          <button key={t} onClick={() => toggle(k)} title={`Percobaan ${t}`}
            style={{
              width: 26, height: 26, borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700,
              border: on ? "1.5px solid #38A169" : "1.5px solid #CBD5E0",
              background: on ? "#38A169" : "#fff", color: on ? "#fff" : "#A0AEC0",
            }}>{on ? "✓" : t}</button>
        );
      })}
    </div>
  );
}

export default function ABLLSAssessment() {
  const [authenticated, setAuthenticated] = useState(true);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const [tab, setTab] = useState("client");     // client | G1..G9 | summary
  const [client, setClient] = useState({
    nama: "", noClient: "", usia: "", tanggalLahir: "",
    jenisKelamin: "", diagnosis: "", asesor: "", tanggalAsesmen: "",
  });
  const [testRound, setTestRound] = useState(1);
  const [scores, setScores] = useState({});
  const [trials, setTrials] = useState({});
  const [probeNotes, setProbeNotes] = useState({});   // pertanyaan pengganti per task
  const [notes, setNotes] = useState({});             // catatan klinis per kelompok
  const [kesimpulan, setKesimpulan] = useState("");
  const [rekomendasi, setRekomendasi] = useState("");

  const setScore = useCallback((id, v) => setScores(p => ({ ...p, [id]: v })), []);
  const toggleTrial = useCallback(k => setTrials(p => ({ ...p, [k]: !p[k] })), []);

  const total = useMemo(() => totalScore(scores), [scores]);
  const totalPct = total.max ? (total.got / total.max) * 100 : 0;
  const roundColor = TEST_ROUNDS.find(r => r.value === testRound)?.color || "#2B6CB0";
  const answered = TASKS.filter(t => scores[t.id] != null).length;

  function handlePasswordSubmit(e) {
    e.preventDefault();
    if (passwordInput === APP_PASSWORD) {
      setAuthenticated(true); setPasswordError("");
      try { sessionStorage.setItem("ab_auth", "1"); } catch { /* ignore */ }
    } else setPasswordError("Password salah. Silakan coba lagi.");
  }

  // ── LAPORAN (.txt) ──────────────────────────────────────────────────────────
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
        L.push(`  ${t.id.padEnd(4)} (${String(shown).padStart(2)}/${t.max})  ${t.name}`);
        const marked = t.p.map((_, i) => TRIALS.filter(x => trials[`${t.id}_p${i}_t${x}`]).length)
          .reduce((a, b) => a + b, 0);
        if (marked) L.push(`         Percobaan benar tercatat: ${marked}`);
        const pn = probeNotes[t.id];
        if (pn) L.push(`         Pertanyaan tambahan: ${pn}`);
      });
      const note = notes[g.code];
      if (note) L.push(`  Catatan ${g.code}: ${note}`);
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

  function resetForm() {
    setClient({ nama: "", noClient: "", usia: "", tanggalLahir: "", jenisKelamin: "", diagnosis: "", asesor: "", tanggalAsesmen: "" });
    setScores({}); setTrials({}); setNotes({}); setProbeNotes({});
    setKesimpulan(""); setRekomendasi(""); setTestRound(1); setTab("client");
  }

  // ── PASSWORD GATE ───────────────────────────────────────────────────────────
  if (!authenticated) {
    return (
      <div style={{ minHeight: "100vh", background: "#EBF4FF", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
        <form onSubmit={handlePasswordSubmit} style={{ background: "#fff", borderRadius: 16, padding: 40, maxWidth: 380, width: "100%", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🔒</div>
            <div style={{ color: "#2B6CB0", fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>Above &amp; Beyond</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1A202C", margin: "4px 0 0" }}>ABLLS-R — Intraverbal</h2>
          </div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#4A5568", marginBottom: 6 }}>Masukkan Password</label>
          <input type="password" value={passwordInput} autoFocus
            onChange={e => { setPasswordInput(e.target.value); setPasswordError(""); }}
            style={{ width: "100%", padding: "11px 14px", border: passwordError ? "1.5px solid #FC8181" : "1.5px solid #CBD5E0", borderRadius: 8, fontSize: 14, color: "#2D3748", boxSizing: "border-box", marginBottom: passwordError ? 8 : 20 }} />
          {passwordError && <p style={{ color: "#C53030", fontSize: 12, margin: "0 0 16px" }}>{passwordError}</p>}
          <button type="submit" style={{ width: "100%", background: "#2B6CB0", color: "#fff", border: "none", borderRadius: 8, padding: "12px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Masuk</button>
        </form>
      </div>
    );
  }

  const activeGroup = GROUPS.find(g => g.code === tab);

  // ── MAIN ────────────────────────────────────────────────────────────────────
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

      {/* Tabs */}
      <div style={{ background: "#fff", borderBottom: "1px solid #E2E8F0", overflowX: "auto", display: "flex", padding: "0 8px", WebkitOverflowScrolling: "touch" }}>
        {[{ id: "client", label: "📋 Data Klien" }, ...GROUPS.map(g => ({ id: g.code, label: `${g.code} · ${g.short}`, g })), { id: "summary", label: "📊 Rekap" }].map(t => {
          const active = tab === t.id;
          const gs = t.g ? groupScore(scores, t.g) : null;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ padding: "11px 14px", border: "none", borderBottom: active ? "3px solid #2B6CB0" : "3px solid transparent", background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 700, color: active ? "#2B6CB0" : "#718096", whiteSpace: "nowrap", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <span>{t.label}</span>
              {gs && <span style={{ fontSize: 10, fontWeight: 600, color: active ? "#2B6CB0" : "#A0AEC0" }}>{gs.got}/{gs.max}</span>}
            </button>
          );
        })}
      </div>

      <div style={{ maxWidth: 820, margin: "0 auto", padding: "20px 16px 48px" }}>

        {/* ── DATA KLIEN ── */}
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

            <div style={{ background: "#EBF8FF", borderRadius: 8, padding: "12px 14px", marginTop: 20, fontSize: 12, color: "#2C5282", lineHeight: 1.6 }}>
              <strong>Cara pakai.</strong> Setiap butir diuji minimal 3 kali — centang kotak percobaan untuk tiap pertanyaan yang dijawab benar.
              Bila pertanyaan tidak cocok untuk anak, ganti dengan pertanyaan lain yang relevan dan tulis di kolom “pertanyaan pengganti”.
              Skor akhir per butir mengikuti kriteria protokol ABLLS-R (0–4; sebagian butir maksimum 2).
            </div>

            <div style={{ marginTop: 24, textAlign: "right" }}>
              <button onClick={() => setTab("G1")}
                style={{ background: "#2B6CB0", color: "#fff", border: "none", borderRadius: 8, padding: "11px 28px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Mulai Asesmen →</button>
            </div>
          </div>
        )}

        {/* ── GROUP TABS ── */}
        {activeGroup && (
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
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

            <div style={{ background: "#EBF8FF", borderRadius: 8, padding: "8px 14px", margin: "12px 0 20px", fontSize: 12, color: "#2C5282" }}>
              Centang percobaan yang dijawab benar (minimal 3 kali per butir), lalu pilih skor sesuai kriteria di bawah butir.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
              {activeGroup.tasks.map(t => {
                const val = scores[t.id];
                const opts = t.max === 4 ? [0, 1, 2, 3, 4] : [0, 1, 2];
                return (
                  <div key={t.id} style={{ paddingBottom: 22, borderBottom: "1px solid #F0F4F8" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 4 }}>
                      <span style={{ background: "#2B6CB0", color: "#fff", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 800, flexShrink: 0, marginTop: 2 }}>{t.id}</span>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#1A202C", lineHeight: 1.4 }}>{t.nameId}</div>
                        <div style={{ fontSize: 11, color: "#A0AEC0", fontStyle: "italic" }}>{t.name}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: "#4A5568", lineHeight: 1.6, margin: "6px 0 12px", paddingLeft: 2 }}>{t.obj}</div>

                    {/* Probes */}
                    <div style={{ background: "#F7FAFC", borderRadius: 8, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#718096", letterSpacing: 0.5, textTransform: "uppercase" }}>Pertanyaan uji · centang percobaan benar</div>
                      {t.p.map((q, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
                          <span style={{ fontSize: 12.5, color: "#2D3748", lineHeight: 1.45, flex: 1 }}>{q}</span>
                          <TrialBoxes taskId={t.id} probeIdx={i} trials={trials} toggle={toggleTrial} />
                        </div>
                      ))}
                      <input
                        value={probeNotes[t.id] || ""}
                        onChange={e => setProbeNotes(p => ({ ...p, [t.id]: e.target.value }))}
                        placeholder="Pertanyaan pengganti (bila butir tidak sesuai untuk anak)..."
                        style={{ width: "100%", padding: "8px 10px", border: "1.5px dashed #CBD5E0", borderRadius: 8, fontSize: 12, color: "#2D3748", background: "#fff", boxSizing: "border-box" }} />
                    </div>

                    {/* Criteria */}
                    <div style={{ fontSize: 11, color: "#718096", lineHeight: 1.7, margin: "12px 0 8px" }}>
                      {opts.filter(o => o > 0).sort((a, b) => b - a).map(o => (
                        <div key={o}>
                          <strong style={{ color: SCALE_COLORS[o] }}>{o}</strong> = {t.c[o]}
                        </div>
                      ))}
                      <div><strong style={{ color: SCALE_COLORS[0] }}>0</strong> = belum muncul / tidak memenuhi kriteria mana pun</div>
                    </div>

                    {/* Score buttons */}
                    <div style={{ display: "flex", gap: 6 }}>
                      {opts.map(o => (
                        <ScoreButton key={o} value={o} label={String(o)}
                          sub={o === 0 ? "Belum" : o === t.max ? "Mahir" : "Sebagian"}
                          selected={val === o} onClick={() => setScore(t.id, o)} />
                      ))}
                      {t.allowNA && (
                        <ScoreButton value="NA" label="NA" sub="Tidak relevan"
                          selected={isNA(val)} onClick={() => setScore(t.id, "NA")} />
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
                style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #CBD5E0", borderRadius: 8, fontSize: 13, color: "#2D3748", resize: "vertical", boxSizing: "border-box" }} />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22 }}>
              <button onClick={() => {
                const i = GROUPS.findIndex(g => g.code === activeGroup.code);
                setTab(i === 0 ? "client" : GROUPS[i - 1].code);
                window.scrollTo({ top: 0 });
              }} style={{ background: "#EDF2F7", color: "#4A5568", border: "none", borderRadius: 8, padding: "11px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>← Sebelumnya</button>
              <button onClick={() => {
                const i = GROUPS.findIndex(g => g.code === activeGroup.code);
                setTab(i === GROUPS.length - 1 ? "summary" : GROUPS[i + 1].code);
                window.scrollTo({ top: 0 });
              }} style={{ background: "#2B6CB0", color: "#fff", border: "none", borderRadius: 8, padding: "11px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Berikutnya →</button>
            </div>
          </div>
        )}

        {/* ── REKAP ── */}
        {tab === "summary" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Total band card */}
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

            {/* Per-group profile */}
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

            {/* Prioritas: butir skor terendah */}
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

            {/* Kesimpulan & rekomendasi */}
            <div style={{ background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1A202C", marginBottom: 12 }}>Kesimpulan Klinis</h2>
              <textarea value={kesimpulan} onChange={e => setKesimpulan(e.target.value)} rows={4}
                placeholder="Gambaran repertoar intraverbal anak saat ini..."
                style={{ width: "100%", padding: "12px 14px", border: "1.5px solid #CBD5E0", borderRadius: 8, fontSize: 14, color: "#2D3748", resize: "vertical", lineHeight: 1.6, boxSizing: "border-box", marginBottom: 18 }} />
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1A202C", marginBottom: 12 }}>Rekomendasi Program</h2>
              <textarea value={rekomendasi} onChange={e => setRekomendasi(e.target.value)} rows={4}
                placeholder="Target pengajaran, prosedur prompting, frekuensi sesi..."
                style={{ width: "100%", padding: "12px 14px", border: "1.5px solid #CBD5E0", borderRadius: 8, fontSize: 14, color: "#2D3748", resize: "vertical", lineHeight: 1.6, boxSizing: "border-box" }} />
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={generateReport}
                style={{ flex: 2, background: "#276749", color: "#fff", border: "none", borderRadius: 10, padding: "14px 20px", fontSize: 15, fontWeight: 700, cursor: "pointer", boxShadow: "0 2px 12px rgba(39,103,73,0.2)" }}>📄 Download Laporan</button>
              <button onClick={resetForm}
                style={{ flex: 1, background: "#EDF2F7", color: "#4A5568", border: "none", borderRadius: 10, padding: "14px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Asesmen Baru</button>
            </div>
            <p style={{ fontSize: 12, color: "#A0AEC0", textAlign: "center", margin: 0 }}>
              Laporan (.txt) terdownload ke perangkat — upload ke folder Drive klien. Butir bertanda NA dikeluarkan dari penyebut.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
