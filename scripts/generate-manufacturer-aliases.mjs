import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import * as XLSX from "xlsx";

const workbookPath = process.argv[2];
if (!workbookPath) {
  throw new Error("Usage: node scripts/generate-manufacturer-aliases.mjs <staff-review.xlsx>");
}

const workbook = XLSX.read(await readFile(workbookPath), { type: "buffer" });
const sheetName = "05_Hãng chưa mapping";
const sheet = workbook.Sheets[sheetName];
if (!sheet) throw new Error(`Missing sheet: ${sheetName}`);

const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });

function cleanCanonicalName(value) {
  return String(value || "")
    .trim()
    .replace(/^["“”]+|["“”]+$/g, "")
    .replace(/^\s*-\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

const entries = rows.slice(6).flatMap((row, offset) => {
  const lookupKey = String(row[0] || "").trim();
  const canonical = cleanCanonicalName(row[13] || row[1]);
  if (!lookupKey || !canonical) return [];
  return [{
    sourceRow: offset + 7,
    lookupKey,
    canonical,
    parent: cleanCanonicalName(row[14]),
    scope: String(row[15] || "").trim(),
    status: String(row[16] || "").trim(),
  }];
});

const output = {
  source: {
    workbook: path.basename(workbookPath),
    sheet: sheetName,
    version: "2026-09-23",
    note: "Technical alias clusters consolidated to one canonical manufacturer. Parent-company ownership is retained as audit metadata and is not inferred when the sheet requests more data or item-level splitting.",
  },
  entries,
};

const outputPath = path.resolve("data/manufacturer-aliases.json");
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${entries.length} manufacturer alias groups to ${outputPath}`);
