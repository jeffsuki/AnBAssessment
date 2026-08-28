// Above & Beyond — shared brand kit + letterhead pieces for Word (.docx) reports.
// Colors sampled directly from the company profile (Aug 2026); logo extracted
// from the same document. Font is Poppins (closest match to the profile's
// rounded geometric sans — swap BRAND.font if the exact family name differs).

import {
  Document, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
  AlignmentType, BorderStyle, WidthType, ShadingType, HeadingLevel,
  Header, Footer, PageNumber, VerticalAlign, convertInchesToTwip,
} from "docx";
import logoUrl from "../assets/logo.png?url";

export const BRAND = {
  blue: "1E75BC",
  navy: "14293D",
  green: "8DC63F",
  gold: "FFCB05",
  orange: "F7941D",
  tint: "F4F9FD",
  gray: "718096",
  lightBorder: "E2E8F0",
  font: "Poppins",
};

let logoBufferCache = null;
export async function getLogoBuffer() {
  if (logoBufferCache) return logoBufferCache;
  const resp = await fetch(logoUrl);
  logoBufferCache = new Uint8Array(await resp.arrayBuffer());
  return logoBufferCache;
}

// A small bold uppercase blue label, like "TENTANG KAMI" / "VISI" in the profile.
export function eyebrow(text) {
  return new Paragraph({
    spacing: { after: 80 },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, color: BRAND.blue, size: 18, font: BRAND.font, characterSpacing: 20 })],
  });
}

// Bold navy headline.
export function headline(text, size = 32) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, bold: true, color: BRAND.navy, size, font: BRAND.font })],
  });
}

// The green→blue gradient accent bar is simulated as a short two-tone rule
// (true gradients aren't supported in docx borders, so we use two segments).
export function accentBar() {
  return new Table({
    width: { size: 1400, type: WidthType.DXA },
    borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } },
    rows: [new TableRow({
      height: { value: 40, rule: "exact" },
      children: [
        new TableCell({ width: { size: 700, type: WidthType.DXA }, shading: { type: ShadingType.SOLID, color: BRAND.green, fill: BRAND.green }, children: [new Paragraph("")] }),
        new TableCell({ width: { size: 700, type: WidthType.DXA }, shading: { type: ShadingType.SOLID, color: BRAND.blue, fill: BRAND.blue }, children: [new Paragraph("")] }),
      ],
    })],
  });
}

export function spacer(h = 160) {
  return new Paragraph({ spacing: { after: h }, children: [] });
}

export function bodyText(text, opts = {}) {
  return new Paragraph({
    spacing: { after: opts.after ?? 140, line: 300 },
    children: [new TextRun({ text, size: opts.size ?? 21, color: opts.color ?? BRAND.navy, font: BRAND.font, bold: !!opts.bold, italics: !!opts.italics })],
  });
}

// Rounded-card-like numbered/labelled row, echoing the MISI list cards.
export function infoRow(label, value) {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 2600, type: WidthType.DXA },
        borders: cellBorder(),
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 19, color: BRAND.gray, font: BRAND.font })] })],
      }),
      new TableCell({
        width: { size: 6400, type: WidthType.DXA },
        borders: cellBorder(),
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: value || "-", size: 21, color: BRAND.navy, font: BRAND.font })] })],
      }),
    ],
  });
}
function cellBorder() {
  const b = { style: BorderStyle.SINGLE, size: 2, color: BRAND.lightBorder };
  return { top: b, bottom: b, left: b, right: b };
}

export function infoTable(rows) {
  return new Table({
    width: { size: 9000, type: WidthType.DXA },
    rows: rows.map(([l, v]) => infoRow(l, v)),
  });
}

// Flag pill (Tipikal / Kemungkinan / Definitif or VB-MAPP round colors) as a
// shaded single-cell "badge" table, matching the profile's pill-tag look.
const FLAG_HEX = { Typical: "38A169", Tipikal: "38A169", Kemungkinan: "D69E2E", Definitif: "E53E3E" };
export function flagBadge(label) {
  const hex = FLAG_HEX[label] || BRAND.gray;
  return new Table({
    width: { size: 2000, type: WidthType.DXA },
    borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } },
    rows: [new TableRow({ children: [
      new TableCell({
        shading: { type: ShadingType.SOLID, color: hex, fill: hex },
        margins: { top: 40, bottom: 40, left: 160, right: 160 },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: label, bold: true, color: "FFFFFF", size: 18, font: BRAND.font })] })],
      }),
    ] })],
  });
}

export function sectionScoreRow(name, scoreText, flagLabel, note) {
  const cells = [
    new TableCell({ width: { size: 3600, type: WidthType.DXA }, borders: cellBorder(), margins: { top: 90, bottom: 90, left: 120, right: 120 },
      children: [new Paragraph({ children: [new TextRun({ text: name, bold: true, size: 20, color: BRAND.navy, font: BRAND.font })] })] }),
    new TableCell({ width: { size: 1800, type: WidthType.DXA }, borders: cellBorder(), margins: { top: 90, bottom: 90, left: 120, right: 120 },
      children: [new Paragraph({ children: [new TextRun({ text: scoreText, size: 20, color: BRAND.navy, font: BRAND.font })] })] }),
  ];
  if (flagLabel) {
    cells.push(new TableCell({ width: { size: 2000, type: WidthType.DXA }, borders: cellBorder(), verticalAlign: VerticalAlign.CENTER, margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [] })] }));
  }
  if (note) {
    cells.push(new TableCell({ width: { size: 3200, type: WidthType.DXA }, borders: cellBorder(), margins: { top: 90, bottom: 90, left: 120, right: 120 },
      children: [new Paragraph({ children: [new TextRun({ text: note, italics: true, size: 18, color: BRAND.gray, font: BRAND.font })] })] }));
  }
  return new TableRow({ children: cells });
}

export async function letterheadHeader(dateLabel) {
  const logo = await getLogoBuffer();
  return new Header({
    children: [
      new Table({
        width: { size: 9000, type: WidthType.DXA },
        borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } },
        rows: [new TableRow({ children: [
          new TableCell({ width: { size: 5000, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({ children: [new ImageRun({ data: logo, transformation: { width: 140, height: 56 }, type: "png" })] })] }),
          new TableCell({ width: { size: 4000, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: dateLabel, size: 18, color: BRAND.gray, font: BRAND.font })] })] }),
        ] })],
      }),
      new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: BRAND.lightBorder, space: 4 } }, spacing: { after: 0 }, children: [] }),
    ],
  });
}

export function letterheadFooter(orgLine = "Above & Beyond — Child Development Center") {
  return new Footer({
    children: [
      new Paragraph({
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: BRAND.lightBorder, space: 4 } },
        tabStops: [{ type: "right", position: convertInchesToTwip(6.3) }],
        children: [
          new TextRun({ text: orgLine, size: 16, color: BRAND.gray, font: BRAND.font }),
          new TextRun({ text: "\t", font: BRAND.font }),
          new TextRun({ children: [PageNumber.CURRENT], size: 16, color: BRAND.gray, font: BRAND.font }),
        ],
      }),
    ],
  });
}

export const PAGE_BREAK = new Paragraph({ children: [], pageBreakBefore: true });

export async function buildLetterheadDoc({ dateLabel, sections }) {
  const header = await letterheadHeader(dateLabel);
  return new Document({
    styles: { default: { document: { run: { font: BRAND.font, size: 21 } } } },
    sections: [{
      properties: { page: { margin: { top: 1100, bottom: 900, left: 1000, right: 1000 } } },
      headers: { default: header },
      footers: { default: letterheadFooter() },
      children: sections,
    }],
  });
}
