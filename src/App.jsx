import { useState } from "react";
import VBMappAssessment from "./assessments/VBMapp_Assessment.jsx";
import ANBAssessment from "./assessments/OT_Assessment.jsx";

const TOOLS = [
  { id: "vbmapp", label: "VB-MAPP Milestones", Component: VBMappAssessment },
  { id: "ot", label: "ANB / OT Assessment", Component: ANBAssessment },
];

export default function App() {
  const [active, setActive] = useState(null);

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
