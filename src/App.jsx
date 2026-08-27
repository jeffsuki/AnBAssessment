import { useState } from "react";
import VBMappAssessment from "./assessments/VBMapp_Assessment.jsx";
import ANBAssessment from "./assessments/OT_Assessment.jsx";
import ABLLSAssessment from "./assessments/ABLLS_Assessment.jsx";
import Dashboard from "./Dashboard.jsx";

const TOOLS = [
  { id: "dashboard", label: "📊 Dashboard — Semua Entri", Component: Dashboard },
  { id: "vbmapp", label: "VB-MAPP Milestones", Component: VBMappAssessment },
  { id: "ot", label: "ANB / OT Assessment", Component: ANBAssessment },
  { id: "ablls", label: "ABLLS-R Assessment", Component: ABLLSAssessment },
];

// ── SITE-WIDE PASSWORD ────────────────────────────────────────────────────────
// This is a client-side gate only: it deters casual visitors and keeps the
// tools out of search engines/accidental links, but the password is visible
// in the built JS to anyone who looks. Do not rely on this for protecting
// real client data — use it as a light front-door lock only.
// Change this to whatever password you want the team to use:
const SITE_PASSWORD = "ABeyond4$$";
const SESSION_KEY = "ab_site_unlocked";

function PasswordGate({ onUnlock }) {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    if (input === SITE_PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, "1");
      onUnlock();
    } else {
      setError("Password salah. Silakan coba lagi.");
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#EBF4FF", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <form onSubmit={handleSubmit} style={{ background: "#fff", borderRadius: 16, padding: 40, maxWidth: 380, width: "100%", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🔒</div>
          <div style={{ color: "#2B6CB0", fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>Above & Beyond</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1A202C", margin: "4px 0 0" }}>Clinical Assessment Tools</h2>
        </div>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#4A5568", marginBottom: 6 }}>Masukkan Password</label>
        <input
          type="password"
          value={input}
          autoFocus
          onChange={e => { setInput(e.target.value); setError(""); }}
          style={{
            width: "100%", padding: "11px 14px",
            border: error ? "1.5px solid #FC8181" : "1.5px solid #CBD5E0",
            borderRadius: 8, fontSize: 14, color: "#2D3748", boxSizing: "border-box",
            marginBottom: error ? 8 : 20,
          }}
        />
        {error && <p style={{ color: "#C53030", fontSize: 12, margin: "0 0 16px" }}>{error}</p>}
        <button type="submit" style={{ width: "100%", background: "#2B6CB0", color: "#fff", border: "none", borderRadius: 8, padding: "12px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
          Masuk
        </button>
      </form>
    </div>
  );
}

export default function App() {
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(SESSION_KEY) === "1");
  const [active, setActive] = useState(null);

  if (!unlocked) {
    return <PasswordGate onUnlock={() => setUnlocked(true)} />;
  }

  if (active) {
    const tool = TOOLS.find(t => t.id === active);
    return (
      <div>
        <button
          onClick={() => setActive(null)}
          style={{
            position: "fixed", top: 10, left: 10, zIndex: 1000,
            background: "#1A202C", color: "#fff", border: "none",
            borderRadius: 8, padding: "8px 14px", fontSize: 13,
            fontWeight: 700, cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
          }}
        >
          ← Menu
        </button>
        <tool.Component />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#EBF4FF", fontFamily: "'Segoe UI', system-ui, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 420, width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ color: "#2B6CB0", fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Above & Beyond</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1A202C", margin: "6px 0 0" }}>Clinical Assessment Tools</h1>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {TOOLS.map(t => (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              style={{
                background: "#fff", border: "1.5px solid #CBD5E0", borderRadius: 12,
                padding: "18px 20px", fontSize: 15, fontWeight: 700, color: "#2D3748",
                cursor: "pointer", textAlign: "left", boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
              }}
            >
              {t.label} →
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
