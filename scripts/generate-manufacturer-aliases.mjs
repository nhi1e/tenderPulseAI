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
    .replace(/^\s*[-•.,;:]+\s*/, "")
    .replace(/\s+/g, " ")
    .replace(/\s*\/?\s*(?:việt nam\s*)?mã\s+hàng\s*:.*$/iu, "")
    .replace(/\s*[/,-]\s*(?:đức|anh|mỹ|hoa kỳ|tây ban nha|thụy sĩ|ấn độ|nhật bản|trung quốc|việt nam|thổ nhĩ kỳ|turkey|ý|pháp|bỉ|hàn quốc|hy lạp|đài loan|austria|peru|bulgaria|pakistan|vương quốc anh|united kingdom|cộng hòa séc|germany|uk|usa)\s*$/iu, "")
    .trim();
}

function stripOccurrenceCount(value) {
  return cleanCanonicalName(value)
    .replace(/\s*\(\s*\d+(?:[.,]\d+)?\s*\)\s*$/u, "")
    .trim();
}

function normalizedKey(value) {
  return stripOccurrenceCount(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSplitRequired(parent, status) {
  return normalizedKey(`${parent} ${status}`).includes("can tach");
}

function isPlausibleCompanyName(value) {
  const cleaned = cleanCanonicalName(value);
  const key = normalizedKey(cleaned);
  if (!cleaned || cleaned.length > 120 || !/[A-Za-z\p{L}]/u.test(cleaned)) return false;
  if (/^\d+(?:\s*(?:\d+|xx|thang|nam))*$/.test(key)) return false;
  if (/^[a-z]\d+$/.test(key)) return false;
  if (/^(?:hang|nha) san xuat$/.test(key)) return false;
  if (/^(?:khong xac dinh|chua xac dinh|unknown|n a|na)$/.test(key)) return false;
  if (/^(?:chi tiet|thong tin chi tiet|theo|nhu bang|gom nhieu ma hang|cung cap khi giao hang)/.test(key)) return false;
  if (/^bang danh muc hang hoa/.test(key)) return false;
  if (/^(?:nhieu hang|ao|an do|duc|my|trung quoc|viet nam|cai|soi|beijing|fujian|gangzhou|guangzhou|jiangsu|shaoxing|shenzhen|tianjin|tonglu|zhejiang)$/.test(key)) return false;
  if (/[;|+]/u.test(cleaned)) return false;
  if ((cleaned.match(/\//g)?.length || 0) >= 2) return false;
  return true;
}

function reportingName(canonical, parent, status) {
  const canonicalKey = normalizedKey(canonical).replace(/\s/g, "");
  const parentKey = normalizedKey(parent).replace(/\s/g, "");

  if (isSplitRequired(parent, status)) return "";

  // High-confidence brand families that appear on several Sheet 05 rows.
  // These are spelling/legal-name/country variants, not fuzzy guesses.
  if (canonicalKey.includes("systagenixwoundmanage")) return "Solventum Corporation";
  if (canonicalKey === "sutter" || canonicalKey.startsWith("suttermedizintechnik")) {
    return "Sutter Medizintechnik";
  }
  if (canonicalKey.startsWith("amnotec")) {
    return "AMNOTEC International Medical GmbH";
  }

  // Sheet 05's parent/brand-owner column is the reporting identity used for
  // market-share aggregation. It consolidates the many KARL STORZ, B. Braun,
  // Medtronic, etc. spellings while preserving the source value separately.
  if (parentKey && !/^(nhieuhang|chuaxacdinh|khongxacdinh|unknown)/.test(parentKey)) {
    const candidate = cleanCanonicalName(parent)
      .replace(/\s*[/,-]\s*(?:đức|anh|mỹ|hoa kỳ|united kingdom|germany|uk|usa)\s*$/iu, "")
      .replace(/^b\.?\s*braun surgical$/iu, "B. Braun")
      .replace(/^sutter$/iu, "Sutter Medizintechnik")
      .trim();
    return isPlausibleCompanyName(candidate) ? candidate : "";
  }

  const fallback = stripOccurrenceCount(canonical);
  return isPlausibleCompanyName(fallback) ? fallback : "";
}

function sourceAliases(row) {
  const values = [row[0], row[1], ...String(row[2] || "").split(/\s+\|\s+/u)];
  return [...new Set(values.map(stripOccurrenceCount).filter(Boolean))];
}

const entries = rows.slice(6).flatMap((row, offset) => {
  const lookupKey = String(row[0] || "").trim();
  const canonical = cleanCanonicalName(row[13] || row[1]);
  if (!lookupKey || !canonical) return [];
  const parent = cleanCanonicalName(row[14]);
  const status = String(row[16] || "").trim();
  return [{
    sourceRow: offset + 7,
    lookupKey,
    aliases: sourceAliases(row),
    canonical,
    reportingName: reportingName(canonical, parent, status),
    parent,
    scope: String(row[15] || "").trim(),
    status,
  }];
});

const output = {
  source: {
    workbook: path.basename(workbookPath),
    sheet: sheetName,
    version: "2026-09-23",
    note: "All aliases in Sheet 05 are indexed. Occurrence suffixes, punctuation, country suffixes, spelling variants and confirmed parent/brand-owner identities are consolidated for reporting. Rows requiring item-level splitting are not forced into one company.",
  },
  entries,
};

const outputPath = path.resolve("data/manufacturer-aliases.json");
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${entries.length} manufacturer alias groups to ${outputPath}`);
