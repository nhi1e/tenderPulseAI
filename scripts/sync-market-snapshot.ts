import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import XLSX from "xlsx";

import {
  classifyProductRecord,
  type ClassificationRecord,
} from "../lib/classification-rules";
import { mappedCompanyName } from "../lib/company-mapping";
import { hospitalName } from "../lib/hospital-identity";
import {
  MARKET_SNAPSHOT_SCHEMA_VERSION,
  type MarketSnapshotManifest,
  type SnapshotFact,
} from "../lib/market-snapshot";

const PORTAL_SEARCH_URL =
  "https://muasamcong.mpi.gov.vn/o/egp-portal-winning-bid-data/services/smart/search_prc";
const PAGE_SIZE = 1000;
const MAX_PAGES_PER_WINDOW = 250;
const DEFAULT_BASELINE_START = "2023-01-01";
const DEFAULT_LOOKBACK_DAYS = 30;
const SNAPSHOT_ROOT = path.resolve(process.env.TENDERPULSE_SNAPSHOT_ROOT || "public/data/market-snapshot");
const MANIFEST_PATH = path.join(SNAPSHOT_ROOT, "manifest.json");

type WinningBidRecord = {
  id?: string;
  tenThietBi?: string;
  donViTinh?: string;
  khoiLuongDouble?: number;
  khoiLuong?: number | string;
  kyMaHieu?: string;
  nhanHieu?: string;
  hangSanXuat?: string;
  chungLoai?: string;
  cauHinh?: string;
  donGia?: number;
  donGiaDuThau?: number;
  winningName?: string[] | string;
  winningCode?: string[] | string;
  maTbmt?: string;
  maCdt?: string;
  tenCdtBmt?: string;
  ngayDangTaiKqlcnt?: string;
  xuatXu?: string;
  maHs?: string;
  soLuuHanh?: string;
  namSanXuat?: string;
  bidForm?: string;
  soQuyetDinh?: string;
  ngayBanHanhQuyetDinh?: string;
  soNhaThauThamDu?: number;
  maKqlcnt?: string;
  kqlcntId?: string;
  idKqlcnt?: string;
  resultId?: string;
  diaDiem?: Array<{ wardName?: string; districtName?: string; provName?: string }>;
  locationText?: string;
};

type PortalPage = {
  content: WinningBidRecord[];
  totalElements?: number;
  totalPages?: number;
};

type SyncMode = "full" | "incremental" | "reclassify" | "import";

type Arguments = {
  mode: SyncMode;
  dateFrom?: string;
  dateTo: string;
  lookbackDays: number;
  concurrency: number;
  files: string[];
};

function vietnamToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function parseArguments(argv: string[]): Arguments {
  const values = [...argv];
  const readOption = (name: string) => {
    const index = values.indexOf(name);
    if (index < 0) return undefined;
    const value = values[index + 1];
    values.splice(index, 2);
    return value;
  };
  const mode = (readOption("--mode") || "incremental") as SyncMode;
  if (!["full", "incremental", "reclassify", "import"].includes(mode)) {
    throw new Error(`Unsupported mode: ${mode}`);
  }
  const dateFrom = readOption("--date-from");
  const dateTo = readOption("--date-to") || vietnamToday();
  const lookbackDays = Math.max(1, Number(readOption("--lookback") || DEFAULT_LOOKBACK_DAYS));
  const concurrency = Math.max(1, Math.min(3, Number(readOption("--concurrency") || 2)));
  const files = values.filter((value) => !value.startsWith("--"));
  return { mode, dateFrom, dateTo, lookbackDays, concurrency, files };
}

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .trim()
    .toLowerCase();
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const source = String(value ?? "").trim().replace(/\s/g, "");
  if (!source) return 0;
  if (/^-?\d{1,3}([.,]\d{3})+$/.test(source)) return Number(source.replace(/[.,]/g, "")) || 0;
  return Number(source.replace(",", ".")) || 0;
}

function formatList(value: string[] | string | undefined) {
  return Array.isArray(value) ? value.filter(Boolean).join("; ") : value || "";
}

function cleanText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function formatLocation(record: WinningBidRecord) {
  if (record.locationText) return record.locationText;
  if (!Array.isArray(record.diaDiem)) return "";
  return record.diaDiem
    .map((location) => [location.wardName, location.districtName, location.provName].filter(Boolean).join(", "))
    .filter(Boolean)
    .join("; ");
}

function recordKey(record: WinningBidRecord) {
  return record.id || [
    record.maTbmt,
    record.tenThietBi,
    record.kyMaHieu,
    record.chungLoai,
    record.khoiLuongDouble ?? record.khoiLuong,
    record.donGia ?? record.donGiaDuThau,
    formatList(record.winningName),
    record.tenCdtBmt,
    record.soQuyetDinh,
    record.ngayBanHanhQuyetDinh,
  ].map((value) => normalize(value)).join("::");
}

function productKey(record: WinningBidRecord) {
  return normalize(record.kyMaHieu || record.chungLoai || record.nhanHieu || record.tenThietBi || recordKey(record));
}

function tenderResultKey(record: WinningBidRecord) {
  const explicit = record.maKqlcnt || record.kqlcntId || record.idKqlcnt || record.resultId;
  if (cleanText(explicit)) return cleanText(explicit);
  const fallback = [record.maTbmt, record.soQuyetDinh, record.ngayBanHanhQuyetDinh]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join("::");
  return fallback || cleanText(record.maTbmt) || "Không có mã KQLCNT";
}

function companyOf(record: WinningBidRecord) {
  const searchable = [
    record.tenThietBi,
    record.nhanHieu,
    record.hangSanXuat,
    record.chungLoai,
    record.kyMaHieu,
    record.cauHinh,
    formatList(record.winningName),
  ].filter(Boolean).join(" | ");
  return mappedCompanyName(searchable, record.hangSanXuat || "") || "Unknown / review needed";
}

function classificationRecord(record: WinningBidRecord): ClassificationRecord {
  return {
    sourceId: record.id || recordKey(record),
    tenderId: record.maTbmt,
    productName: record.tenThietBi,
    brand: record.nhanHieu,
    manufacturer: record.hangSanXuat,
    configuration: record.cauHinh,
  };
}

function factHash(fact: Omit<SnapshotFact, "firstSeenAt" | "lastSeenAt" | "contentHash">) {
  return createHash("sha256").update(JSON.stringify(fact)).digest("hex");
}

function factForRecord(record: WinningBidRecord, seenAt: string): SnapshotFact | undefined {
  const classification = classifyProductRecord(classificationRecord(record));
  if (!classification) return undefined;
  const { rule, evaluation } = classification;
  const key = recordKey(record);
  const sourceHospital = cleanText(record.tenCdtBmt) || "Chưa xác định";
  const units = toNumber(record.khoiLuongDouble ?? record.khoiLuong);
  const unitPrice = toNumber(record.donGia ?? record.donGiaDuThau);
  const base = {
    sourceId: record.id || key,
    key,
    subOu: rule.subOu,
    productGroup: rule.productGroup,
    classificationKeyword: evaluation.matchedKeyword || "",
    company: companyOf(record),
    supplier: formatList(record.winningName),
    supplierCode: formatList(record.winningCode),
    hospital: hospitalName(record.maCdt || "", sourceHospital),
    sourceHospital,
    buyerId: cleanText(record.maCdt),
    tender: tenderResultKey(record),
    tenderNotice: cleanText(record.maTbmt),
    product: productKey(record),
    productName: cleanText(record.tenThietBi),
    productCode: cleanText(record.kyMaHieu),
    model: cleanText(record.chungLoai),
    brand: cleanText(record.nhanHieu),
    manufacturer: cleanText(record.hangSanXuat),
    origin: cleanText(record.xuatXu),
    hsCode: cleanText(record.maHs),
    circulationNumber: cleanText(record.soLuuHanh),
    productionYear: String(record.namSanXuat || "").trim(),
    configuration: cleanText(record.cauHinh),
    unitOfMeasure: cleanText(record.donViTinh),
    unitPrice,
    bidForm: cleanText(record.bidForm),
    publishedAt: dateText(record.ngayDangTaiKqlcnt),
    decisionNumber: cleanText(record.soQuyetDinh),
    decisionDate: dateText(record.ngayBanHanhQuyetDinh),
    participantCount: toNumber(record.soNhaThauThamDu),
    location: formatLocation(record),
    value: units * unitPrice,
    units,
  };
  return {
    ...base,
    firstSeenAt: seenAt,
    lastSeenAt: seenAt,
    contentHash: factHash(base),
  };
}

function dateText(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "number" && value > 20_000 && value < 80_000) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  return String(value ?? "").trim();
}

function dateKey(value: string) {
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const local = value.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return local ? `${local[3]}-${local[2]}-${local[1]}` : "";
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function monthWindows(dateFrom: string, dateTo: string) {
  const windows: Array<{ dateFrom: string; dateTo: string }> = [];
  let cursor = new Date(`${dateFrom}T00:00:00.000Z`);
  const end = new Date(`${dateTo}T00:00:00.000Z`);
  while (cursor <= end) {
    const start = cursor.toISOString().slice(0, 10);
    const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
    const boundedEnd = monthEnd > end ? end : monthEnd;
    windows.push({ dateFrom: start, dateTo: boundedEnd.toISOString().slice(0, 10) });
    cursor = new Date(Date.UTC(boundedEnd.getUTCFullYear(), boundedEnd.getUTCMonth(), boundedEnd.getUTCDate() + 1));
  }
  return windows;
}

function portalPayload(pageNumber: number, dateFrom: string, dateTo: string) {
  return [{
    pageSize: PAGE_SIZE,
    pageNumber,
    query: [{
      index: "es-smart-pricing",
      keyWord: "",
      keyWordNotMatch: "",
      matchType: "all-1",
      matchFields: [
        "ten_thiet_bi", "ma_hs", "xuat_xu", "ma_tbmt", "ky_ma_hieu",
        "nhan_hieu", "hang_san_xuat", "cau_hinh",
      ],
      filters: [
        {
          fieldName: "ngay_ban_hanh_quyet_dinh",
          searchType: "range",
          from: `${dateFrom}T00:00:00.000Z`,
          to: `${dateTo}T23:59:59.999Z`,
        },
        { fieldName: "type", searchType: "in", fieldValues: ["HANG_HOA"] },
        { fieldName: "tab", searchType: "in", fieldValues: ["THIET_BI_VAT_TU_Y_TE"] },
      ],
    }],
  }];
}

async function fetchPortalPage(page: number, dateFrom: string, dateTo: string, attempt = 1): Promise<PortalPage> {
  const startedAt = Date.now();
  const response = await fetch(PORTAL_SEARCH_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Origin: "https://muasamcong.mpi.gov.vn",
      Referer: "https://muasamcong.mpi.gov.vn/web/guest/winning-bid-data",
    },
    body: JSON.stringify(portalPayload(page, dateFrom, dateTo)),
    signal: AbortSignal.timeout(60_000),
  });
  if (attempt < 3 && (response.status === 429 || response.status >= 500)) {
    await response.body?.cancel();
    await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
    return fetchPortalPage(page, dateFrom, dateTo, attempt + 1);
  }
  if (!response.ok) throw new Error(`Portal returned ${response.status} for ${dateFrom}–${dateTo}, page ${page + 1}.`);
  const data = await response.json() as { page?: PortalPage };
  if (!data.page || !Array.isArray(data.page.content)) throw new Error("Portal returned an unexpected response.");
  console.log(`[snapshot] ${dateFrom}–${dateTo} page ${page + 1}/${data.page.totalPages || 1} · ${data.page.content.length} rows · ${Date.now() - startedAt} ms`);
  return data.page;
}

async function fetchWindow(window: { dateFrom: string; dateTo: string }) {
  const first = await fetchPortalPage(0, window.dateFrom, window.dateTo);
  const totalPages = Math.max(1, first.totalPages || 1);
  if (totalPages > MAX_PAGES_PER_WINDOW) {
    throw new Error(`${window.dateFrom}–${window.dateTo} has ${totalPages} pages; split the window before continuing.`);
  }
  const records = [...first.content];
  for (let start = 1; start < totalPages; start += 2) {
    const pages = Array.from({ length: Math.min(2, totalPages - start) }, (_, index) => start + index);
    const results = await Promise.all(pages.map((page) => fetchPortalPage(page, window.dateFrom, window.dateTo)));
    results.forEach((result) => records.push(...result.content));
  }
  return records;
}

async function fetchPortalRecords(dateFrom: string, dateTo: string, concurrency: number) {
  const windows = monthWindows(dateFrom, dateTo);
  const records = new Map<string, WinningBidRecord>();
  let nextWindow = 0;
  const worker = async () => {
    while (nextWindow < windows.length) {
      const index = nextWindow;
      nextWindow += 1;
      const rows = await fetchWindow(windows[index]);
      rows.forEach((record) => records.set(recordKey(record), record));
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, windows.length) }, () => worker()));
  return [...records.values()];
}

const excelColumns: Record<string, keyof WinningBidRecord | "locationText"> = {
  "id": "id",
  "tên thiết bị, vật tư y tế": "tenThietBi",
  "tên thiết bị": "tenThietBi",
  "danh mục hàng hóa": "tenThietBi",
  "đơn vị tính": "donViTinh",
  "khối lượng": "khoiLuong",
  "xuất xứ": "xuatXu",
  "xuất xứ (quốc gia, vùng lãnh thổ)": "xuatXu",
  "mã hs": "maHs",
  "ký mã hiệu": "kyMaHieu",
  "kỹ mã hiệu": "kyMaHieu",
  "nhãn hiệu": "nhanHieu",
  "hãng sản xuất": "hangSanXuat",
  "chủng loại (model)": "chungLoai",
  "chủng loại (models)": "chungLoai",
  "số lưu hành / giấy phép nhập khẩu": "soLuuHanh",
  "số lưu hành hoặc số giấy phép nhập khẩu": "soLuuHanh",
  "năm sản xuất": "namSanXuat",
  "cấu hình, tính năng kỹ thuật": "cauHinh",
  "cấu hình, tính năng kỹ thuật cơ bản": "cauHinh",
  "đơn giá trúng thầu": "donGia",
  "mã định danh nt trúng thầu": "winningCode",
  "tên nt trúng thầu": "winningName",
  "mã tbmt": "maTbmt",
  "mã định danh cđt": "maCdt",
  "tên cđt": "tenCdtBmt",
  "hình thức lcnt": "bidForm",
  "ngày đăng tải kqlcnt": "ngayDangTaiKqlcnt",
  "số quyết định": "soQuyetDinh",
  "ngày ban hành quyết định": "ngayBanHanhQuyetDinh",
  "số nhà thầu tham dự": "soNhaThauThamDu",
  "địa điểm": "locationText",
};

function recordsFromWorkbook(filename: string) {
  const workbook = XLSX.readFile(filename, { cellDates: true });
  const records: WinningBidRecord[] = [];
  workbook.SheetNames.forEach((sheetName) => {
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: "" });
    const defaultTenderNotice = (() => {
      for (const row of matrix.slice(0, 20)) {
        const labelIndex = row.findIndex((value) => normalize(value) === "ma tbmt");
        if (labelIndex < 0) continue;
        const value = row.slice(labelIndex + 1).find((cell) => String(cell || "").trim());
        if (value) return String(value).trim();
      }
      return "";
    })();
    const headerIndex = matrix.findIndex((row) => {
      const headers = row.map((value) => normalize(value));
      const hasProduct = headers.some((value) => value.includes("ten thiet bi") || value === "danh muc hang hoa");
      const hasDetail = headers.some((value) => value === "hang san xuat" || value === "don vi tinh");
      return hasProduct && hasDetail;
    });
    if (headerIndex < 0) return;
    const headers = matrix[headerIndex].map((value) => excelColumns[String(value || "").normalize("NFC").replace(/\s+/g, " ").trim().toLocaleLowerCase("vi-VN")]);
    matrix.slice(headerIndex + 1).forEach((row) => {
      const record: WinningBidRecord = {};
      headers.forEach((field, index) => {
        if (!field || row[index] === "" || row[index] == null) return;
        (record as Record<string, unknown>)[field] = row[index];
      });
      record.maTbmt ||= defaultTenderNotice;
      if (record.tenThietBi || record.maTbmt) records.push(record);
    });
  });
  return records;
}

async function readManifest() {
  try {
    return JSON.parse(await readFile(MANIFEST_PATH, "utf8")) as MarketSnapshotManifest;
  } catch {
    return undefined;
  }
}

async function readExistingFacts(manifest: MarketSnapshotManifest | undefined) {
  if (!manifest || manifest.status !== "ready") return [];
  const partitions = await Promise.all(manifest.partitions.map(async (partition) =>
    JSON.parse(await readFile(path.join(
      SNAPSHOT_ROOT,
      partition.path.replace(/^\/data\/market-snapshot\//, ""),
    ), "utf8")) as SnapshotFact[]
  ));
  return partitions.flat();
}

function slug(value: string) {
  return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

function factYear(fact: SnapshotFact) {
  return dateKey(fact.decisionDate).slice(0, 4) || "undated";
}

function alertSummary(fact: SnapshotFact) {
  return {
    key: fact.key,
    subOu: fact.subOu,
    productGroup: fact.productGroup,
    hospital: fact.hospital,
    buyerId: fact.buyerId,
    productName: fact.productName,
    company: fact.company,
    value: fact.value,
    decisionDate: fact.decisionDate,
  };
}

async function writeSnapshot(
  facts: SnapshotFact[],
  coverage: { dateFrom: string; dateTo: string },
  mode: SyncMode,
  changes: { newFacts: SnapshotFact[]; changedFacts: SnapshotFact[]; removedFacts: SnapshotFact[] },
  syncRange: { dateFrom: string; dateTo: string } = coverage,
) {
  const generatedAt = new Date().toISOString();
  const partitionRoot = path.join(SNAPSHOT_ROOT, "partitions");
  const tempRoot = path.join(SNAPSHOT_ROOT, `.partitions-${process.pid}`);
  await rm(tempRoot, { recursive: true, force: true });
  await mkdir(tempRoot, { recursive: true });
  const groups = new Map<string, SnapshotFact[]>();
  facts.forEach((fact) => {
    const year = factYear(fact);
    const key = `${year}/${slug(fact.subOu)}`;
    const rows = groups.get(key) || [];
    rows.push(fact);
    groups.set(key, rows);
  });
  const partitions = [];
  for (const [key, rows] of [...groups.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    rows.sort((left, right) => dateKey(left.decisionDate).localeCompare(dateKey(right.decisionDate)) || left.key.localeCompare(right.key));
    const [year, subOuSlug] = key.split("/");
    const directory = path.join(tempRoot, year);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, `${subOuSlug}.json`), JSON.stringify(rows));
    partitions.push({
      subOu: rows[0].subOu,
      year,
      path: `/data/market-snapshot/partitions/${year}/${subOuSlug}.json`,
      records: rows.length,
    });
  }
  await rm(partitionRoot, { recursive: true, force: true });
  await rename(tempRoot, partitionRoot);
  const manifest: MarketSnapshotManifest = {
    schemaVersion: MARKET_SNAPSHOT_SCHEMA_VERSION,
    status: "ready",
    generatedAt,
    coverage,
    records: facts.length,
    partitions,
    lastSync: {
      mode,
      dateFrom: syncRange.dateFrom,
      dateTo: syncRange.dateTo,
      newRecords: changes.newFacts.length,
      changedRecords: changes.changedFacts.length,
      removedRecords: changes.removedFacts.length,
    },
  };
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(SNAPSHOT_ROOT, "daily-changes.json"), `${JSON.stringify({
    generatedAt,
    coverage,
    new: changes.newFacts.map(alertSummary),
    changed: changes.changedFacts.map(alertSummary),
    removed: changes.removedFacts.map(alertSummary),
  }, null, 2)}\n`);
  console.log(`[snapshot] wrote ${facts.length.toLocaleString()} classified records in ${partitions.length} partitions`);
  console.log(`[snapshot] changes: ${changes.newFacts.length} new, ${changes.changedFacts.length} changed, ${changes.removedFacts.length} removed`);
}

function mergeFreshFacts(
  previousFacts: SnapshotFact[],
  freshFacts: SnapshotFact[],
  refreshFrom: string,
  refreshTo: string,
  seenAt: string,
) {
  const previousByKey = new Map(previousFacts.map((fact) => [fact.key, fact]));
  const retained = previousFacts.filter((fact) => {
    const date = dateKey(fact.decisionDate);
    return !date || date < refreshFrom || date > refreshTo;
  });
  const merged = new Map(retained.map((fact) => [fact.key, fact]));
  const newFacts: SnapshotFact[] = [];
  const changedFacts: SnapshotFact[] = [];
  freshFacts.forEach((fact) => {
    const previous = previousByKey.get(fact.key);
    const next = {
      ...fact,
      firstSeenAt: previous?.firstSeenAt || seenAt,
      lastSeenAt: seenAt,
    };
    if (!previous) newFacts.push(next);
    else if (previous.contentHash !== next.contentHash) changedFacts.push(next);
    merged.set(next.key, next);
  });
  const freshKeys = new Set(freshFacts.map((fact) => fact.key));
  const removedFacts = previousFacts.filter((fact) => {
    const date = dateKey(fact.decisionDate);
    return date >= refreshFrom && date <= refreshTo && !freshKeys.has(fact.key);
  });
  return { facts: [...merged.values()], newFacts, changedFacts, removedFacts };
}

function recordForFact(fact: SnapshotFact): WinningBidRecord {
  return {
    id: fact.sourceId,
    tenThietBi: fact.productName,
    donViTinh: fact.unitOfMeasure,
    khoiLuong: fact.units,
    kyMaHieu: fact.productCode,
    nhanHieu: fact.brand,
    hangSanXuat: fact.manufacturer,
    chungLoai: fact.model,
    cauHinh: fact.configuration,
    donGia: fact.unitPrice,
    winningName: fact.supplier,
    winningCode: fact.supplierCode,
    maTbmt: fact.tenderNotice,
    maCdt: fact.buyerId,
    tenCdtBmt: fact.sourceHospital,
    ngayDangTaiKqlcnt: fact.publishedAt,
    xuatXu: fact.origin,
    maHs: fact.hsCode,
    soLuuHanh: fact.circulationNumber,
    namSanXuat: fact.productionYear,
    bidForm: fact.bidForm,
    soQuyetDinh: fact.decisionNumber,
    ngayBanHanhQuyetDinh: fact.decisionDate,
    soNhaThauThamDu: fact.participantCount,
    resultId: fact.tender,
    locationText: fact.location,
  };
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const manifest = await readManifest();
  const previousFacts = await readExistingFacts(manifest);
  const seenAt = new Date().toISOString();

  if (args.mode === "reclassify") {
    if (!manifest?.coverage || !previousFacts.length) throw new Error("No ready snapshot exists to reclassify.");
    const freshFacts = previousFacts
      .map((fact) => factForRecord(recordForFact(fact), seenAt))
      .filter((fact): fact is SnapshotFact => Boolean(fact));
    const previousByKey = new Map(previousFacts.map((fact) => [fact.key, fact]));
    const merged = freshFacts.map((fact) => ({
      ...fact,
      firstSeenAt: previousByKey.get(fact.key)?.firstSeenAt || seenAt,
    }));
    const changedFacts = merged.filter((fact) => previousByKey.get(fact.key)?.contentHash !== fact.contentHash);
    const mergedKeys = new Set(merged.map((fact) => fact.key));
    const removedFacts = previousFacts.filter((fact) => !mergedKeys.has(fact.key));
    await writeSnapshot(merged, manifest.coverage, "reclassify", { newFacts: [], changedFacts, removedFacts });
    return;
  }

  let refreshFrom: string;
  let coverageFrom: string;
  let records: WinningBidRecord[];
  if (args.mode === "import") {
    if (!args.files.length) throw new Error("Pass one or more raw Excel files after `--`.");
    records = args.files.flatMap((filename) => recordsFromWorkbook(path.resolve(filename)));
    refreshFrom = args.dateFrom || DEFAULT_BASELINE_START;
    coverageFrom = refreshFrom;
    console.log(`[snapshot] imported ${records.length.toLocaleString()} raw Excel rows from ${args.files.length} files`);
  } else if (args.mode === "full" || !manifest?.coverage) {
    refreshFrom = args.dateFrom || DEFAULT_BASELINE_START;
    coverageFrom = refreshFrom;
    records = await fetchPortalRecords(refreshFrom, args.dateTo, args.concurrency);
  } else {
    const lookbackFrom = addDays(args.dateTo, -args.lookbackDays);
    const previousOverlap = addDays(manifest.coverage.dateTo, -args.lookbackDays);
    refreshFrom = args.dateFrom || (lookbackFrom < previousOverlap ? lookbackFrom : previousOverlap);
    coverageFrom = manifest.coverage.dateFrom;
    records = await fetchPortalRecords(refreshFrom, args.dateTo, args.concurrency);
  }

  const uniqueRecords = new Map(records.map((record) => [recordKey(record), record]));
  const freshFacts = [...uniqueRecords.values()]
    .map((record) => factForRecord(record, seenAt))
    .filter((fact): fact is SnapshotFact => Boolean(fact));
  console.log(`[snapshot] classified ${freshFacts.length.toLocaleString()} of ${uniqueRecords.size.toLocaleString()} unique rows`);

  const baseFacts = args.mode === "full" || args.mode === "import" ? [] : previousFacts;
  const merged = mergeFreshFacts(baseFacts, freshFacts, refreshFrom, args.dateTo, seenAt);
  await writeSnapshot(
    merged.facts,
    { dateFrom: coverageFrom, dateTo: args.dateTo },
    args.mode,
    merged,
    { dateFrom: refreshFrom, dateTo: args.dateTo },
  );
}

main().catch((error) => {
  console.error("[snapshot] failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
