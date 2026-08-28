import { useState, useEffect, useCallback } from "react";
import { supabase, STORAGE_BUCKET, isConfigured } from "./supabaseClient.js";
import { GRID_COLS, GRID_ROWS, levelOf, BAND_TINT, TEST_ROUNDS, LEVELS_META } from "./assessments/VBMapp_Assessment.jsx";
import { downloadWordFromEntry, downloadTxtFromEntry } from "./assessments/reportFromEntry.js";

// OT section maxes are static constants in OT_Assessment.jsx (SECTIONS[].max);
// duplicated here (small, 10 numbers) since OT doesn't store max per entry.
// Keep in sync if OT_Assessment.jsx's SECTIONS maxes ever change.
const OT_SECTION_MAX = { S1: 35, S2: 20, S3: 15, S4: 35, S5: 35, S6: 30, S7: 20, S8: 35, S9: 35, S10: 35 };
const OT_SECTION_LABEL = {
  S1: "Tactile Sensitivity", S2: "Taste / Smell", S3: "Vestibular / Movement",
  S4: "Underresponsive", S5: "Auditory Filtering", S6: "Low Energy",
  S7: "Visual / Auditory", S8: "Gross Motor", S9: "Fine Motor", S10: "Arousal & Self-Regulation",
};

// ABLLS group names are defined in ABLLS_Assessment.jsx's GROUPS array; duplicated
// here (small, 11 entries) so the dashboard doesn't need to import that whole module.
const ABLLS_GROUP_NAME = {
  G1: "Dasar & Isian", G2: "WH — Rumah & Sekolah", G3: "Kelas, Ciri & Kategori",
  G4: "Recall & Komentar Visual", G5: "Lingkungan / Komunitas", G6: "WH Lanjutan",
  G7: "Sekuens & Deskripsi", G8: "Ya/Tidak & Multi-komponen", G9: "Peristiwa & Percakapan",
  G10: "Emosi", G11: "Perspective Taking",
};

const FLAG_COLOR = {
  Definitif: "#E53E3E",
  Kemungkinan: "#D69E2E",
  Typical: "#38A169",
  Tipikal: "#38A169",
};
const flagColor = f => FLAG_COLOR[f] || "#A0AEC0";

// Read display fields from a stored assessment row (columns + JSONB `data`).
const nameOf = e => e.client_name || (e.data && e.data.nama) || "(tanpa nama)";
const dateOf = e => e.assessment_date || (e.data && e.data.tanggalAsesmen) || e.created_at || "";
const asesorOf = e => e.asesor || (e.data && e.data.asesor) || "";

function fmtDate(v) {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d)) return String(v);
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

// Group the flat JSONB payload into section blocks: S1_1..S1_n, S1_total, S1_flag, S1_catatan
// ── OT: reconstruct per-aspect table from saved keys S{n}_total/_flag/_catatan ──
function otSectionsOf(entry) {
  const flat = entry.data || {};
  return Object.keys(OT_SECTION_MAX)
    .filter(code => flat[`${code}_total`] !== undefined)
    .map(code => ({
      code, name: OT_SECTION_LABEL[code] || code,
      total: flat[`${code}_total`], max: OT_SECTION_MAX[code],
      flag: flat[`${code}_flag`] || null,
      catatan: flat[`${code}_catatan`] || "",
    }));
}

// ── ABLLS: reconstruct per-group table from saved keys G{n}_total/_max/_catatan ──
function abllsGroupsOf(entry) {
  const flat = entry.data || {};
  const codes = Object.keys(flat)
    .map(k => k.match(/^([A-Za-z]+\d+)_total$/))
    .filter(Boolean)
    .map(m => m[1]);
  return codes
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map(code => ({
      code, name: ABLLS_GROUP_NAME[code] || code,
      total: flat[`${code}_total`], max: flat[`${code}_max`],
      catatan: flat[`${code}_catatan`] || "",
    }));
}

// ── VB-MAPP: reconstruct the pyramid grid from saved keys L{lv}_{domain}_{n} ──
function vbmappCell(entry, levelId, domainCode, n) {
  const flat = entry.data || {};
  const levelMeta = LEVELS_META.find(l => l.id === levelId);
  const domainMeta = levelMeta && levelMeta.domains.find(d => d.code === domainCode);
  if (!domainMeta) return { exists: false };
  if (domainMeta.disabled) return { exists: true, disabled: true };
  const key = `${levelId}_${domainCode}_${n}`;
  const v = flat[key];
  if (v === undefined) return { exists: true, disabled: false, answered: false };
  if (v === "tidak_dapat_diuji") return { exists: true, disabled: true };
  const score = Number(v);
  return { exists: true, disabled: false, answered: true, score };
}

function vbmappLevelTotal(entry, levelId) {
  const flat = entry.data || {};
  return flat[`${levelId}_total`];
}

// Compact read-only pyramid grid for the dashboard detail view, reconstructed
// from a saved entry's data (mirrors the assessment tool's own Rekap grid).
function VbmappGridMini({ entry }) {
  const round = TEST_ROUNDS.find(r => r.value === entry.test_round) || TEST_ROUNDS[0];
  const CELL = 40, LABEL = 26;
  return (
    <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
      <table style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
        <thead>
          <tr>
            <th style={{ width: LABEL }} />
            {GRID_COLS.map(code => (
              <th key={code} style={{ width: CELL, height: 34, verticalAlign: "middle", padding: "0 2px" }}>
                <div style={{ fontSize: 8, fontWeight: 700, color: "#4A5568", lineHeight: 1.1, textAlign: "center", wordBreak: "break-word" }}>{code}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {GRID_ROWS.map(n => (
            <tr key={n}>
              <td style={{ width: LABEL, textAlign: "center", fontSize: 9, fontWeight: 700, color: "#4A5568", background: BAND_TINT[levelOf(n)], border: "1px solid #E2E8F0" }}>{n}</td>
              {GRID_COLS.map(code => {
                const c = vbmappCell(entry, levelOf(n), code, n);
                let bg = "#fff";
                if (!c.exists) bg = "#E2E8F0";
                else if (c.disabled) bg = "repeating-linear-gradient(45deg,#F7FAFC,#F7FAFC 2px,#EDF2F7 2px,#EDF2F7 4px)";
                else if (c.answered && c.score >= 1) bg = round.color;
                else if (c.answered && c.score >= 0.5) bg = round.half;
                return <td key={code} style={{ width: CELL, height: CELL, border: "1px solid #E2E8F0", background: bg }} />;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Password-gated confirmation for a destructive delete. Rendered as an overlay
// so it can't be dismissed by accident, and the button stays disabled until the
// password matches.
function DeleteConfirm({ entry, pw, setPw, err, busy, onCancel, onConfirm, expected }) {
  if (!entry) return null;
  const name = entry.client_name || (entry.data && entry.data.nama) || "(tanpa nama)";
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,32,44,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 26, maxWidth: 420, width: "100%", boxShadow: "0 10px 40px rgba(0,0,0,0.25)" }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, color: "#1A202C", margin: "0 0 8px" }}>Hapus entri ini?</h3>
        <p style={{ fontSize: 13, color: "#4A5568", lineHeight: 1.6, margin: "0 0 4px" }}>
          <b>{entry.type}</b> — {name}{entry.assessment_date ? ` · ${fmtDate(entry.assessment_date)}` : ""}
        </p>
        <p style={{ fontSize: 13, color: "#C53030", lineHeight: 1.6, margin: "0 0 16px" }}>
          Data asesmen dan laporannya akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.
        </p>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#4A5568", marginBottom: 6 }}>
          Masukkan password hapus
        </label>
        <input type="password" value={pw} autoFocus
          onChange={ev => setPw(ev.target.value)}
          onKeyDown={ev => { if (ev.key === "Enter" && pw === expected && !busy) onConfirm(); }}
          style={{ width: "100%", padding: "10px 12px", border: err ? "1.5px solid #FC8181" : "1.5px solid #CBD5E0", borderRadius: 8, fontSize: 14, color: "#2D3748", boxSizing: "border-box", marginBottom: err ? 8 : 18 }} />
        {err && <p style={{ color: "#C53030", fontSize: 12, margin: "0 0 14px" }}>{err}</p>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onCancel} disabled={busy}
            style={{ background: "#EDF2F7", color: "#4A5568", border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: busy ? "wait" : "pointer" }}>
            Batal
          </button>
          <button onClick={onConfirm} disabled={busy || pw !== expected}
            style={{ background: busy || pw !== expected ? "#FEB2B2" : "#C53030", color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: busy || pw !== expected ? "not-allowed" : "pointer" }}>
            {busy ? "Menghapus…" : "Hapus permanen"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [entries, setEntries] = useState(null); // null = loading
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("date"); // "date" | "name"
  const [sortDir, setSortDir] = useState("desc"); // "asc" | "desc"
  const [regenId, setRegenId] = useState(null);   // id of the entry being rebuilt
  const [regenErr, setRegenErr] = useState("");
  const [stTest, setStTest] = useState(null); // { ok, msg } | "running" | null
  const [pendingDelete, setPendingDelete] = useState(null); // entry awaiting confirmation
  const [deletePw, setDeletePw] = useState("");
  const [deleteErr, setDeleteErr] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Deleting an assessment is destructive and irreversible, so it's gated behind
  // a separate password that isn't the site password — a mistyped click can't
  // remove a client's record.
  const DELETE_PASSWORD = "ABeyondd3l3t3";

  const confirmDelete = useCallback(async () => {
    if (deletePw !== DELETE_PASSWORD) {
      setDeleteErr("Password salah.");
      return;
    }
    const entry = pendingDelete;
    setDeleting(true);
    setDeleteErr("");
    try {
      // Remove the stored report first; a leftover file with no row is harmless,
      // but a row pointing at a deleted file would show a broken link.
      if (entry.report_docx_path) {
        await supabase.storage.from(STORAGE_BUCKET).remove([entry.report_docx_path]);
      }
      const { error } = await supabase.from("assessments").delete().eq("id", entry.id);
      if (error) throw error;
      setEntries(prev => (prev || []).filter(x => x.id !== entry.id));
      setPendingDelete(null);
      setDeletePw("");
      setSelected(null);
    } catch (err) {
      setDeleteErr(`Gagal menghapus: ${err && err.message ? err.message : "unknown"}. Pastikan tabel assessments punya policy DELETE untuk role anon.`);
    } finally {
      setDeleting(false);
    }
  }, [deletePw, pendingDelete]);

  // Actually try an upload + public read against the bucket, instead of
  // inferring bucket health from the absence of file paths on old rows.
  const testStorage = useCallback(async () => {
    setStTest("running");
    if (!isConfigured) {
      setStTest({ ok: false, msg: "Supabase belum dikonfigurasi di src/supabaseClient.js." });
      return;
    }
    const path = `diagnostics/test_${Date.now()}.txt`;
    try {
      const up = await supabase.storage.from(STORAGE_BUCKET)
        .upload(path, new Blob(["ok"], { type: "text/plain" }), { contentType: "text/plain", upsert: false });
      if (up.error) {
        setStTest({ ok: false, msg: `Upload ditolak: ${up.error.message}. Cek policy INSERT untuk role anon pada storage.objects.` });
        return;
      }
      const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
      let readable = false;
      try {
        const res = await fetch(data.publicUrl, { method: "GET", cache: "no-store" });
        readable = res.ok;
      } catch { readable = false; }
      supabase.storage.from(STORAGE_BUCKET).remove([path]).catch(() => {});
      setStTest(readable
        ? { ok: true, msg: `Upload dan baca publik berhasil. Bucket ${STORAGE_BUCKET} sehat — asesmen baru akan tersimpan filenya.` }
        : { ok: false, msg: `Upload berhasil, tapi file tidak bisa dibaca publik. Jadikan bucket ${STORAGE_BUCKET} public, atau tambahkan policy SELECT untuk anon.` });
    } catch (err) {
      setStTest({ ok: false, msg: err && err.message ? err.message : "unknown" });
    }
  }, []);

  // Rebuild the Word report from the row's stored JSONB and download it.
  // Used when report_docx_path is null (upload failed or predates the feature),
  // so the download button is never absent.
  const downloadTxt = useCallback(entry => {
    setRegenErr("");
    try {
      downloadTxtFromEntry(entry);
    } catch (err) {
      setRegenErr(`Gagal membuat laporan .txt: ${err && err.message ? err.message : "unknown"}`);
    }
  }, []);

  const regenerate = useCallback(async entry => {
    setRegenErr("");
    setRegenId(entry.id ?? entry.created_at);
    try {
      await downloadWordFromEntry(entry);
    } catch (err) {
      setRegenErr(`Gagal membuat laporan untuk ${entry.client_name || "entri ini"}: ${err && err.message ? err.message : "unknown"}`);
    } finally {
      setRegenId(null);
    }
  }, []);

  const load = useCallback(async () => {
    setEntries(null);
    setError("");
    if (!isConfigured) {
      setError("Supabase belum dikonfigurasi. Isi URL & anon key di src/supabaseClient.js.");
      setEntries([]);
      return;
    }
    const { data, error } = await supabase
      .from("assessments")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      setError(error.message);
      setEntries([]);
    } else {
      setEntries(data || []);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Resolve the stored Word report's Storage path to a public URL.
  const reportUrlFor = entry => {
    if (!entry.report_docx_path) return "";
    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(entry.report_docx_path);
    return data ? data.publicUrl : "";
  };

  const types = ["ALL", ...Array.from(new Set((entries || []).map(e => e.type)))];
  const filtered = (entries || []).filter(e => {
    if (typeFilter !== "ALL" && e.type !== typeFilter) return false;
    if (!query) return true;
    const hay = `${nameOf(e)} ${asesorOf(e)} ${e.client_no || ""}`.toLowerCase();
    return hay.includes(query.toLowerCase());
  });

  const sorted = [...filtered].sort((a, b) => {
    let cmp;
    if (sortBy === "name") {
      cmp = nameOf(a).localeCompare(nameOf(b), "id", { sensitivity: "base" });
    } else {
      const da = new Date(dateOf(a) || 0).getTime() || 0;
      const db = new Date(dateOf(b) || 0).getTime() || 0;
      cmp = da - db;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  // ── DETAIL VIEW ──────────────────────────────────────────────────────────────
  if (selected) {
    const e = selected;
    return (
      <div style={{ minHeight: "100vh", background: "#EBF4FF", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
        <div style={{ background: "#2B6CB0", padding: "14px 20px", display: "flex", alignItems: "center", gap: 14 }}>
          <button onClick={() => setSelected(null)}
            style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            ← Daftar
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ color: "#BEE3F8", fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>{e.type} · Detail Entri</div>
            <div style={{ color: "#fff", fontSize: 17, fontWeight: 700 }}>{nameOf(e)}</div>
          </div>
          <button onClick={() => { setPendingDelete(e); setDeletePw(""); setDeleteErr(""); }}
            style={{ background: "rgba(197,48,48,0.9)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", flex: "none" }}>
            🗑 Hapus
          </button>
        </div>

        <div style={{ maxWidth: 760, margin: "0 auto", padding: "20px 16px 48px" }}>
          {/* Client card */}
          <div style={{ background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 8px rgba(0,0,0,0.06)", marginBottom: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 20px" }}>
              {[
                ["Nama", nameOf(e)], ["No. Client", e.client_no || (e.data && e.data.noClient)], ["Usia", e.usia || (e.data && e.data.usia)],
                ["Jenis Kelamin", e.jenis_kelamin || (e.data && e.data.jenisKelamin)], ["Asesor", asesorOf(e)], ["Tgl. Asesmen", fmtDate(dateOf(e))],
                ["Diagnosis", e.diagnosis || (e.data && e.data.diagnosis)],
              ].filter(([, v]) => v).map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize: 11, color: "#A0AEC0", fontWeight: 600 }}>{k}</div>
                  <div style={{ fontSize: 14, color: "#2D3748" }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              <button onClick={() => downloadTxt(e)}
                style={{ background: "#EDF2F7", color: "#2D3748", border: "1.5px solid #CBD5E0", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                📄 Download Laporan (.txt)
              </button>
              {reportUrlFor(e) ? (
                <a href={reportUrlFor(e)} target="_blank" rel="noreferrer"
                  style={{ display: "inline-block", background: "#EBF8FF", color: "#1E75BC", border: "1.5px solid #90CDF4", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
                  📝 Download Laporan
                </a>
              ) : (
                <button onClick={() => regenerate(e)} disabled={regenId != null}
                  title="Laporan dibuat ulang dari data tersimpan"
                  style={{ background: "#EBF8FF", color: "#1E75BC", border: "1.5px solid #90CDF4", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: regenId != null ? "wait" : "pointer" }}>
                  {regenId != null ? "Membuat laporan…" : "📝 Buat & Download Laporan"}
                </button>
              )}
            </div>
            {regenErr && (
              <div style={{ background: "#FFF5F5", border: "1.5px solid #FC8181", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#C53030", marginTop: 10 }}>
                ⚠️ {regenErr}
              </div>
            )}
          </div>

          {/* Rekap — rendered per assessment type */}
          {e.type === "VBMAPP" && (
            <div style={{ background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 8px rgba(0,0,0,0.06)", marginBottom: 16 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1A202C", margin: "0 0 12px" }}>Rekap — Grafik VB-MAPP</h3>
              <VbmappGridMini entry={e} />
              <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                {LEVELS_META.map(lv => {
                  const t = vbmappLevelTotal(e, lv.id);
                  return t !== undefined ? (
                    <div key={lv.id} style={{ background: BAND_TINT[lv.id], borderRadius: 8, padding: "6px 12px", fontSize: 12 }}>
                      <b>{lv.label}</b>: {t}
                    </div>
                  ) : null;
                })}
              </div>
              {((e.total_score ?? (e.data && e.data.grand_total)) != null) && (
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #E2E8F0", fontSize: 14, fontWeight: 700, color: "#2B6CB0" }}>
                  Total Milestones: {e.total_score ?? e.data.grand_total}{(e.max_score ?? (e.data && e.data.grand_max)) ? ` / ${e.max_score ?? e.data.grand_max}` : ""}
                </div>
              )}
            </div>
          )}

          {e.type === "OT" && (() => {
            const secs = otSectionsOf(e);
            return secs.length > 0 && (
              <div style={{ background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 8px rgba(0,0,0,0.06)", marginBottom: 16 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1A202C", margin: "0 0 12px" }}>Rekap — Skor per Aspek</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {secs.map(s => (
                    <div key={s.code} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#4A5568", width: 130 }}>{s.code} — {s.name}</span>
                      <span style={{ fontSize: 13, color: "#2D3748", width: 60 }}>{s.total}/{s.max}</span>
                      {s.flag ? (
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#fff", background: flagColor(s.flag), borderRadius: 6, padding: "2px 10px" }}>
                          {s.flag === "Typical" ? "Tipikal" : s.flag}
                        </span>
                      ) : <span style={{ fontSize: 12, color: "#CBD5E0" }}>—</span>}
                      {s.catatan ? <span style={{ fontSize: 12, color: "#718096", fontStyle: "italic", marginLeft: 4 }}>“{s.catatan}”</span> : null}
                    </div>
                  ))}
                </div>
                {(e.total_score != null) && (
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #E2E8F0", fontSize: 14, fontWeight: 700, color: "#2B6CB0" }}>
                    Total Skor: {e.total_score}
                  </div>
                )}
              </div>
            );
          })()}

          {e.type === "ABLLS" && (() => {
            const groups = abllsGroupsOf(e);
            return groups.length > 0 && (
              <div style={{ background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 8px rgba(0,0,0,0.06)", marginBottom: 16 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1A202C", margin: "0 0 12px" }}>Rekap — Skor per Kelompok</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {groups.map(g => (
                    <div key={g.code} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#4A5568", flex: 1 }}>{g.code} — {g.name}</span>
                      <span style={{ fontSize: 13, color: "#2D3748", width: 60, textAlign: "right" }}>{g.total}/{g.max}</span>
                      {g.catatan ? <span style={{ fontSize: 12, color: "#718096", fontStyle: "italic", marginLeft: 4 }}>“{g.catatan}”</span> : null}
                    </div>
                  ))}
                </div>
                {(e.total_score != null) && (
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #E2E8F0", fontSize: 14, fontWeight: 700, color: "#2B6CB0" }}>
                    Total Skor: {e.total_score}{e.max_score ? ` / ${e.max_score}` : ""}
                  </div>
                )}
              </div>
            );
          })()}

          <DeleteConfirm entry={pendingDelete} pw={deletePw} setPw={setDeletePw} err={deleteErr}
            busy={deleting} expected={DELETE_PASSWORD}
            onCancel={() => { setPendingDelete(null); setDeletePw(""); setDeleteErr(""); }}
            onConfirm={confirmDelete} />

          {/* Conclusion */}
          {e.kesimpulan && (
            <div style={{ background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1A202C", margin: "0 0 8px" }}>Kesimpulan & Rekomendasi</h3>
              <div style={{ fontSize: 14, color: "#2D3748", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{e.kesimpulan}</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── LIST VIEW ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#EBF4FF", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <div style={{ background: "#2B6CB0", padding: "14px 20px" }}>
        <div style={{ color: "#BEE3F8", fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>Above & Beyond</div>
        <div style={{ color: "#fff", fontSize: 17, fontWeight: 700 }}>Dashboard — Semua Entri</div>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "20px 16px 48px" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari nama / asesor / no. client…"
            style={{ flex: "1 1 220px", padding: "10px 12px", border: "1.5px solid #CBD5E0", borderRadius: 8, fontSize: 14, boxSizing: "border-box" }} />
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            style={{ padding: "10px 12px", border: "1.5px solid #CBD5E0", borderRadius: 8, fontSize: 14, background: "#fff" }}>
            {types.map(t => <option key={t} value={t}>{t === "ALL" ? "Semua jenis" : t}</option>)}
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            style={{ padding: "10px 12px", border: "1.5px solid #CBD5E0", borderRadius: 8, fontSize: 14, background: "#fff" }}>
            <option value="date">Urutkan: Tanggal</option>
            <option value="name">Urutkan: Nama</option>
          </select>
          <button onClick={() => setSortDir(d => (d === "asc" ? "desc" : "asc"))}
            title={sortDir === "asc" ? "Menaik (A→Z / lama→baru)" : "Menurun (Z→A / baru→lama)"}
            style={{ padding: "10px 14px", background: "#fff", color: "#4A5568", border: "1.5px solid #CBD5E0", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            {sortDir === "asc" ? "↑" : "↓"}
          </button>
          <button onClick={load}
            style={{ padding: "10px 16px", background: "#2B6CB0", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            ↻ Muat ulang
          </button>
        </div>

        <DeleteConfirm entry={pendingDelete} pw={deletePw} setPw={setDeletePw} err={deleteErr}
          busy={deleting} expected={DELETE_PASSWORD}
          onCancel={() => { setPendingDelete(null); setDeletePw(""); setDeleteErr(""); }}
          onConfirm={confirmDelete} />

        {entries === null && <div style={{ textAlign: "center", color: "#718096", padding: 40 }}>Memuat entri…</div>}

        {regenErr && (
          <div style={{ background: "#FFF5F5", border: "1.5px solid #FC8181", borderRadius: 8, padding: "12px 16px", fontSize: 13, color: "#C53030", marginBottom: 16 }}>
            ⚠️ {regenErr}
          </div>
        )}

        {entries && entries.length > 0 && entries.every(e => !e.report_docx_path) && (
          <div style={{ background: "#FFFFF0", border: "1.5px solid #F6E05E", borderRadius: 8, padding: "12px 16px", fontSize: 13, color: "#744210", marginBottom: 16, lineHeight: 1.6 }}>
            Belum ada entri yang punya laporan tersimpan di Storage. Ini normal untuk entri yang
            disimpan sebelum bucket <b>{STORAGE_BUCKET}</b> dikonfigurasi — entri lama tidak terisi surut.
            Tombol 📄 dan 📝 tetap berfungsi: laporan dibuat ulang dari data.
            <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button onClick={testStorage} disabled={stTest === "running"}
                style={{ background: "#fff", color: "#744210", border: "1.5px solid #F6E05E", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 700, cursor: stTest === "running" ? "wait" : "pointer" }}>
                {stTest === "running" ? "Menguji…" : "Tes koneksi Storage"}
              </button>
              {stTest && stTest !== "running" && (
                <span style={{ fontSize: 12, color: stTest.ok ? "#276749" : "#C53030", fontWeight: 600 }}>
                  {stTest.ok ? "✅" : "⚠️"} {stTest.msg}
                </span>
              )}
            </div>
          </div>
        )}

        {error && (
          <div style={{ background: "#FFF5F5", border: "1.5px solid #FC8181", borderRadius: 8, padding: "12px 16px", fontSize: 13, color: "#C53030", marginBottom: 16 }}>
            ⚠️ Gagal memuat data: {error}. Pastikan URL & anon key Supabase sudah benar di src/supabaseClient.js.
          </div>
        )}

        {entries && entries.length === 0 && !error && (
          <div style={{ textAlign: "center", color: "#A0AEC0", padding: 40 }}>Belum ada entri tersimpan.</div>
        )}

        {filtered.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sorted.map((e, i) => {
              const reportUrl = reportUrlFor(e);
              return (
                <div key={i} role="button" tabIndex={0}
                  onClick={() => setSelected(e)}
                  onKeyDown={ev => { if (ev.key === "Enter") setSelected(e); }}
                  style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff", border: "1.5px solid #E2E8F0", borderRadius: 10, padding: "12px 16px", cursor: "pointer", textAlign: "left" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1A202C" }}>{nameOf(e)}</div>
                    <div style={{ fontSize: 12, color: "#718096" }}>
                      {e.type}{asesorOf(e) ? ` · ${asesorOf(e)}` : ""}{dateOf(e) ? ` · ${fmtDate(dateOf(e))}` : ""}
                    </div>
                  </div>
                  {((e.total_score ?? (e.data && e.data.total_skor)) != null) && (
                    <span style={{ fontSize: 13, fontWeight: 800, color: "#2B6CB0" }}>{e.total_score ?? (e.data && e.data.total_skor)}</span>
                  )}
                  <button onClick={ev => { ev.stopPropagation(); downloadTxt(e); }}
                    title="Download Laporan (.txt)"
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 8, background: "#EDF2F7", color: "#2D3748", border: "1.5px solid #CBD5E0", fontSize: 15, flex: "none", cursor: "pointer", padding: 0 }}>
                    📄
                  </button>
                  {reportUrl ? (
                    <a href={reportUrl} target="_blank" rel="noreferrer" onClick={ev => ev.stopPropagation()}
                      title="Download Laporan (Word)"
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 8, background: "#EBF8FF", color: "#1E75BC", textDecoration: "none", fontSize: 15, flex: "none" }}>
                      📝
                    </a>
                  ) : (
                    <button onClick={ev => { ev.stopPropagation(); regenerate(e); }}
                      disabled={regenId != null}
                      title="Buat & download Laporan (Word) dari data tersimpan"
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 8, background: "#EBF8FF", color: "#1E75BC", border: "1.5px dashed #90CDF4", fontSize: 15, flex: "none", cursor: regenId != null ? "wait" : "pointer", padding: 0 }}>
                      {regenId === (e.id ?? e.created_at) ? "…" : "📝"}
                    </button>
                  )}
                  <button onClick={ev => { ev.stopPropagation(); setPendingDelete(e); setDeletePw(""); setDeleteErr(""); }}
                    title="Hapus entri"
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 8, background: "#FFF5F5", color: "#C53030", border: "1.5px solid #FEB2B2", fontSize: 14, flex: "none", cursor: "pointer", padding: 0 }}>
                    🗑
                  </button>
                  <span style={{ color: "#CBD5E0", fontSize: 18 }}>›</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
