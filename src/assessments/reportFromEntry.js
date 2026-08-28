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
