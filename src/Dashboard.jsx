import { useState, useEffect, useCallback } from "react";
import { supabase, STORAGE_BUCKET, isConfigured } from "./supabaseClient.js";

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
function sectionsOf(entry) {
  const flat = entry.data || {};
  const secs = {};
  Object.keys(flat).forEach(k => {
    const m = k.match(/^([A-Za-z]+\d+)_(.+)$/);
    if (!m) return;
    const code = m[1];
    const rest = m[2];
    secs[code] = secs[code] || { code, items: [], total: undefined, flag: undefined, catatan: undefined };
    if (rest === "total") secs[code].total = flat[k];
    else if (rest === "flag") secs[code].flag = flat[k];
    else if (rest === "catatan") secs[code].catatan = flat[k];
    else if (/^\d+$/.test(rest)) secs[code].items.push({ n: parseInt(rest), v: flat[k] });
  });
  Object.values(secs).forEach(s => s.items.sort((a, b) => a.n - b.n));
  return Object.values(secs).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
}

export default function Dashboard() {
  const [entries, setEntries] = useState(null); // null = loading
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");

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

  // Resolve a Storage path to a public URL for the "open file" link.
  const fileUrlFor = entry => {
    if (!entry.file_path) return "";
    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(entry.file_path);
    return data ? data.publicUrl : "";
  };

  const types = ["ALL", ...Array.from(new Set((entries || []).map(e => e.type)))];
  const filtered = (entries || []).filter(e => {
    if (typeFilter !== "ALL" && e.type !== typeFilter) return false;
    if (!query) return true;
    const hay = `${nameOf(e)} ${asesorOf(e)} ${e.client_no || ""}`.toLowerCase();
    return hay.includes(query.toLowerCase());
  });

  // ── DETAIL VIEW ──────────────────────────────────────────────────────────────
  if (selected) {
    const e = selected;
    const secs = sectionsOf(e);
    return (
      <div style={{ minHeight: "100vh", background: "#EBF4FF", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
        <div style={{ background: "#2B6CB0", padding: "14px 20px", display: "flex", alignItems: "center", gap: 14 }}>
          <button onClick={() => setSelected(null)}
            style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            ← Daftar
          </button>
          <div>
            <div style={{ color: "#BEE3F8", fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>{e.type} · Detail Entri</div>
            <div style={{ color: "#fff", fontSize: 17, fontWeight: 700 }}>{nameOf(e)}</div>
          </div>
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
            {fileUrlFor(e) && (
              <a href={fileUrlFor(e)} target="_blank" rel="noreferrer"
                style={{ display: "inline-block", marginTop: 14, background: "#EBF8FF", color: "#2B6CB0", border: "1.5px solid #90CDF4", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
                📄 Buka file form (Excel)
              </a>
            )}
          </div>

          {/* Section scores */}
          {secs.length > 0 && (
            <div style={{ background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 8px rgba(0,0,0,0.06)", marginBottom: 16 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1A202C", margin: "0 0 12px" }}>Skor per Aspek</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {secs.map(s => (
                  <div key={s.code} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#4A5568", width: 44 }}>{s.code}</span>
                    <span style={{ fontSize: 13, color: "#2D3748", width: 60 }}>{s.total != null && s.total !== "" ? s.total : "—"}</span>
                    {s.flag ? (
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#fff", background: flagColor(s.flag), borderRadius: 6, padding: "2px 10px" }}>
                        {s.flag === "Typical" ? "Tipikal" : s.flag}
                      </span>
                    ) : <span style={{ fontSize: 12, color: "#CBD5E0" }}>—</span>}
                    {s.catatan ? <span style={{ fontSize: 12, color: "#718096", fontStyle: "italic", marginLeft: 4 }}>“{s.catatan}”</span> : null}
                  </div>
                ))}
              </div>
              {((e.total_score ?? (e.data && e.data.total_skor)) != null) && (
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #E2E8F0", fontSize: 14, fontWeight: 700, color: "#2B6CB0" }}>
                  Total Skor: {e.total_score ?? (e.data && e.data.total_skor)}{(e.max_score || (e.data && e.data.grand_max)) ? ` / ${e.max_score ?? e.data.grand_max}` : ""}
                </div>
              )}
            </div>
          )}

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
          <button onClick={load}
            style={{ padding: "10px 16px", background: "#2B6CB0", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            ↻ Muat ulang
          </button>
        </div>

        {entries === null && <div style={{ textAlign: "center", color: "#718096", padding: 40 }}>Memuat entri…</div>}

        {error && (
          <div style={{ background: "#FFF5F5", border: "1.5px solid #FC8181", borderRadius: 8, padding: "12px 16px", fontSize: 13, color: "#C53030", marginBottom: 16 }}>
            ⚠️ Gagal memuat data: {error}. Pastikan Apps Script sudah di-deploy dengan doGet dan akses "Anyone".
          </div>
        )}

        {entries && entries.length === 0 && !error && (
          <div style={{ textAlign: "center", color: "#A0AEC0", padding: 40 }}>Belum ada entri tersimpan.</div>
        )}

        {filtered.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map((e, i) => (
              <button key={i} onClick={() => setSelected(e)}
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
                <span style={{ color: "#CBD5E0", fontSize: 18 }}>›</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
