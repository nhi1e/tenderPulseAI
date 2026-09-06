"use client";

import { createContext, Fragment, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Building2, CheckCircle2, CircleAlert,
  Database, Download, Filter, LoaderCircle, RefreshCw, Search, Sparkles, Trophy,
} from "lucide-react";
import {
  Combobox, ComboboxContent, ComboboxEmpty, ComboboxGroup, ComboboxInput,
  ComboboxItem, ComboboxLabel, ComboboxList,
} from "@/components/ui/combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import keywordMasterJson from "@/data/keyword-master.json";
import { companyGroupingKey, mappedCompanyName } from "@/lib/company-mapping";
import { MARKET_OVERVIEW_SEARCH_SEEDS } from "@/lib/market-overview-config";
import {
  aggregateOverviewFacts,
  type OverviewFact,
  type OverviewHospital,
  type OverviewNamedValue,
  type OverviewSubOu,
  type OverviewTender,
} from "@/lib/market-overview-aggregate";

type NamedValue = { name: string; value: number };
type SearchFilters = {
  dateFrom: string;
  dateTo: string;
  hospital: string;
  brand: string;
  supplier: string;
  company: string;
};
type WinningBidRecord = {
  id?: string; tenThietBi?: string; donViTinh?: string; khoiLuongDouble?: number;
  khoiLuong?: number | string; kyMaHieu?: string; nhanHieu?: string;
  hangSanXuat?: string; chungLoai?: string; cauHinh?: string; donGia?: number;
  donGiaDuThau?: number; winningName?: string[] | string; maTbmt?: string;
  tenCdtBmt?: string; ngayDangTaiKqlcnt?: string; xuatXu?: string; maHs?: string;
  soLuuHanh?: string; namSanXuat?: string; winningCode?: string[] | string;
  maCdt?: string; bidForm?: string; soQuyetDinh?: string;
  ngayBanHanhQuyetDinh?: string; soNhaThauThamDu?: number;
  diaDiem?: Array<{ wardName?: string; districtName?: string; provName?: string }>;
};
type PortalPage = { content: WinningBidRecord[]; totalElements?: number; totalPages?: number };
type LiveCollectionProgress = {
  completedPages: number;
  totalPages: number;
  records: WinningBidRecord[];
  portalTotalElements: number;
  excludedRecords: number;
  keywordRule?: KeywordMasterRule;
  truncated: boolean;
};
type ProductData = {
  keyword: string; group: string; fetchedAt: string; truncated: boolean;
  records: WinningBidRecord[];
  keywordRule?: KeywordMasterRule; excludedRecords: number; portalTotalElements: number;
  filters: SearchFilters;
  lineItems: number; totalElements: number; totalValue: number; totalQuantity: number;
  tenders: number; hospitals: number; medtronicValue: number; medtronicShare: number;
  medtronicQuantity: number; medtronicQuantityShare: number; dateRange: string;
  trend: { month: string; value: number }[]; manufacturers: NamedValue[];
  topHospitals: NamedValue[]; topProducts: NamedValue[]; topSuppliers: NamedValue[];
  insight: string; qualityNote: string;
};

type OverviewFilterState = {
  dateFrom: string;
  dateTo: string;
  hospital: string;
  subOu: string;
  productGroup: string;
  company: string;
};
type KeywordCatalogItem = { subOu: string; productGroups: string[]; keywords: string[] };
type KeywordMasterRule = { id: number; subOu: string; productGroup: string; keyword: string; excludes: string[]; note: string };
type ActivityItem = { id: string; keyword: string; searchedAt: string; filters: SearchFilters };
type OverviewLoadProgress = { completed: number; total: number; current: string[] };
type HospitalDirectoryEntry = { name: string; id?: string };
type LearnedProductEntry = { value: string; kind: "brand" | "model" };
type ProductSuggestion = { value: string; kind: "keyword" | "brand" | "model"; subOu?: string; productGroup?: string };
type Language = "en" | "vi";

const subOuOrder = ["VS&D", "Endo Stapling", "Open Stapling", "Hernia", "Suture", "A&I", "ES"];
const keywordMaster = keywordMasterJson as KeywordMasterRule[];
const overviewKeywordCatalog: KeywordCatalogItem[] = subOuOrder.map((subOu) => ({
  subOu,
  productGroups: [...new Set(keywordMaster.filter((rule) => rule.subOu === subOu).map((rule) => rule.productGroup))],
  keywords: keywordMaster.filter((rule) => rule.subOu === subOu).map((rule) => rule.keyword),
}));
const OVERVIEW_CACHE_KEY = "tenderpulse.overview-session-cache.v3";
const HOSPITAL_DIRECTORY_KEY = "tenderpulse.hospital-directory.v1";
const PRODUCT_DIRECTORY_KEY = "tenderpulse.product-directory.v1";
const DIRECTORY_UPDATE_EVENT = "tenderpulse:directory-updated";
const initialHospitals: HospitalDirectoryEntry[] = [
  { name: "Bệnh viện Bạch Mai" },
  { name: "Bệnh viện Chợ Rẫy" },
  { name: "Bệnh viện Đại học Y Hà Nội" },
  { name: "Bệnh viện Hữu nghị Việt Đức" },
  { name: "Bệnh viện Nhân dân 115" },
  { name: "Bệnh viện Trung ương Huế" },
  { name: "Bệnh viện Trung ương Quân đội 108" },
  { name: "Bệnh viện 30-4" },
];
const LanguageContext = createContext<Language>("en");

type OverviewCacheEntry = {
  slices: OverviewSubOu[];
  updatedAt?: string;
  succeeded: number;
  total: number;
};

function useLanguage() {
  return useContext(LanguageContext);
}
function copy(language: Language, english: string, vietnamese: string) {
  return language === "en" ? english : vietnamese;
}
function localeFor(language: Language) {
  return language === "en" ? "en-US" : "vi-VN";
}

function emptyFilters(): SearchFilters {
  return { dateFrom: "", dateTo: "", hospital: "", brand: "", supplier: "", company: "all" };
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").trim().toLowerCase();
}
function readStoredDirectory<T>(key: string): T[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value as T[] : [];
  } catch {
    return [];
  }
}
function usefulDirectoryValue(value: string | undefined, maxLength: number) {
  const cleaned = String(value || "").replace(/\s+/g, " ").trim();
  if (cleaned.length < 2 || cleaned.length > maxLength) return "";
  if (["không xác định", "chưa xác định", "n/a", "na"].includes(normalize(cleaned))) return "";
  return cleaned;
}
function rememberAutocompleteValues(records: WinningBidRecord[]) {
  if (typeof window === "undefined" || !records.length) return;
  try {
    const hospitals = new Map<string, HospitalDirectoryEntry>();
    [...initialHospitals, ...readStoredDirectory<HospitalDirectoryEntry>(HOSPITAL_DIRECTORY_KEY)].forEach((entry) => {
      const name = usefulDirectoryValue(entry.name, 180);
      if (name) hospitals.set(normalize(name), { name, id: usefulDirectoryValue(entry.id, 80) || undefined });
    });
    records.forEach((record) => {
      const name = usefulDirectoryValue(record.tenCdtBmt, 180);
      if (!name) return;
      const key = normalize(name);
      const existing = hospitals.get(key);
      hospitals.set(key, { name, id: usefulDirectoryValue(record.maCdt, 80) || existing?.id });
    });

    const products = new Map<string, LearnedProductEntry>();
    readStoredDirectory<LearnedProductEntry>(PRODUCT_DIRECTORY_KEY).forEach((entry) => {
      const value = usefulDirectoryValue(entry.value, 100);
      if (value && (entry.kind === "brand" || entry.kind === "model")) products.set(normalize(value), { value, kind: entry.kind });
    });
    records.forEach((record) => {
      const values: LearnedProductEntry[] = [
        { value: usefulDirectoryValue(record.nhanHieu, 100), kind: "brand" },
        { value: usefulDirectoryValue(record.kyMaHieu, 100), kind: "model" },
        { value: usefulDirectoryValue(record.chungLoai, 100), kind: "model" },
      ];
      values.forEach((entry) => {
        if (entry.value) products.set(normalize(entry.value), entry);
      });
    });

    window.localStorage.setItem(HOSPITAL_DIRECTORY_KEY, JSON.stringify([...hospitals.values()].sort((a, b) => a.name.localeCompare(b.name, "vi")).slice(0, 2000)));
    window.localStorage.setItem(PRODUCT_DIRECTORY_KEY, JSON.stringify([...products.values()].sort((a, b) => a.value.localeCompare(b.value, "vi")).slice(0, 3000)));
    window.dispatchEvent(new Event(DIRECTORY_UPDATE_EVENT));
  } catch {
    // Autocomplete is optional; live search still works if storage is unavailable.
  }
}
function useAutocompleteDirectories() {
  const [hospitals, setHospitals] = useState<HospitalDirectoryEntry[]>(initialHospitals);
  const [learnedProducts, setLearnedProducts] = useState<LearnedProductEntry[]>([]);
  useEffect(() => {
    const load = () => {
      const storedHospitals = readStoredDirectory<HospitalDirectoryEntry>(HOSPITAL_DIRECTORY_KEY);
      const hospitalMap = new Map<string, HospitalDirectoryEntry>();
      [...initialHospitals, ...storedHospitals].forEach((entry) => {
        if (entry?.name) hospitalMap.set(normalize(entry.name), entry);
      });
      setHospitals([...hospitalMap.values()]);
      setLearnedProducts(readStoredDirectory<LearnedProductEntry>(PRODUCT_DIRECTORY_KEY));
    };
    load();
    window.addEventListener(DIRECTORY_UPDATE_EVENT, load);
    return () => window.removeEventListener(DIRECTORY_UPDATE_EVENT, load);
  }, []);
  return { hospitals, learnedProducts };
}
function rankedMatch(value: string, query: string) {
  const normalizedValue = normalize(value);
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return 2;
  if (normalizedValue === normalizedQuery) return 0;
  if (normalizedValue.startsWith(normalizedQuery)) return 1;
  if (normalizedValue.includes(normalizedQuery)) return 2;
  return 3;
}
function hospitalSuggestionsFor(hospitals: HospitalDirectoryEntry[], query: string) {
  return hospitals
    .filter((entry) => rankedMatch(`${entry.name} ${entry.id || ""}`, query) < 3)
    .sort((left, right) => rankedMatch(left.name, query) - rankedMatch(right.name, query) || left.name.localeCompare(right.name, "vi"))
    .slice(0, 10);
}
function productSuggestionsFor(learnedProducts: LearnedProductEntry[], query: string) {
  const suggestions = new Map<string, ProductSuggestion>();
  keywordMaster.forEach((rule) => {
    const key = normalize(rule.keyword);
    if (!suggestions.has(key)) suggestions.set(key, { value: rule.keyword, kind: "keyword", subOu: rule.subOu, productGroup: rule.productGroup });
  });
  learnedProducts.forEach((entry) => {
    const key = normalize(entry.value);
    if (!suggestions.has(key)) suggestions.set(key, entry);
  });
  return [...suggestions.values()]
    .filter((entry) => rankedMatch(entry.value, query) < 3)
    .sort((left, right) => rankedMatch(left.value, query) - rankedMatch(right.value, query) || Number(Boolean(right.subOu)) - Number(Boolean(left.subOu)) || left.value.localeCompare(right.value, "vi"))
    .slice(0, 14);
}
function keywordRuleFor(keyword: string) {
  const normalizedKeyword = normalize(keyword);
  return keywordMaster.find((rule) => normalize(rule.keyword) === normalizedKeyword);
}
function recordSearchText(record: WinningBidRecord) {
  return normalize([
    record.tenThietBi,
    record.maHs,
    record.kyMaHieu,
    record.nhanHieu,
    record.hangSanXuat,
    record.chungLoai,
    record.cauHinh,
  ].filter(Boolean).join(" | "));
}
function followsKeywordRule(record: WinningBidRecord, rule: KeywordMasterRule) {
  const text = recordSearchText(record);
  if (!text.includes(normalize(rule.keyword))) return false;
  return !rule.excludes.some((exclude) => text.includes(normalize(exclude)));
}
function portalPageUrl(keyword: string, page: number, filters: SearchFilters, forceRefresh = false) {
  const params = new URLSearchParams({ keyword, page: String(page), pageSize: "1000" });
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.hospital) params.set("hospital", filters.hospital);
  if (filters.brand) params.set("brand", filters.brand);
  if (filters.supplier) params.set("supplier", filters.supplier);
  if (filters.company && filters.company !== "all") params.set("company", filters.company);
  if (forceRefresh) params.set("refresh", "1");
  return `/api/portal-search-page?${params.toString()}`;
}
async function fetchPortalPage(keyword: string, page: number, filters: SearchFilters, forceRefresh = false) {
  const response = await fetch(portalPageUrl(keyword, page, filters, forceRefresh));
  const body = await response.text();
  let data: { page?: PortalPage; error?: string } | undefined;
  try {
    data = body ? JSON.parse(body) as { page?: PortalPage; error?: string } : undefined;
  } catch {
    throw new Error("The data service returned an invalid response.");
  }
  if (!response.ok || !data?.page || !Array.isArray(data.page.content)) {
    throw new Error(data?.error || "Could not retrieve this portal page.");
  }
  return data.page;
}
async function collectLiveWinningBids(
  keyword: string,
  filters: SearchFilters,
  options: {
    maxPages?: number;
    forceRefresh?: boolean;
    applyKeywordRule?: boolean;
    onProgress?: (progress: LiveCollectionProgress) => void;
  } = {},
) {
  const maxPages = Math.max(1, Math.min(options.maxPages ?? 25, 25));
  const firstPage = await fetchPortalPage(keyword, 0, filters, options.forceRefresh);
  const portalTotalPages = Math.max(1, firstPage.totalPages ?? 1);
  const totalPages = Math.min(portalTotalPages, maxPages);
  const portalTotalElements = firstPage.totalElements ?? firstPage.content.length;
  const rawRecords = [...firstPage.content];
  const rule = options.applyKeywordRule === false ? undefined : keywordRuleFor(keyword);
  const publish = (completedPages: number) => {
    const records = rule ? rawRecords.filter((record) => followsKeywordRule(record, rule)) : [...rawRecords];
    options.onProgress?.({
      completedPages,
      totalPages,
      records,
      portalTotalElements,
      excludedRecords: rawRecords.length - records.length,
      keywordRule: rule,
      truncated: portalTotalPages > maxPages,
    });
    return records;
  };
  let records = publish(1);

  // Two independent page requests at a time keep the interface responsive
  // without creating a burst of traffic against the public portal.
  for (let start = 1; start < totalPages; start += 2) {
    const pageNumbers = Array.from({ length: Math.min(2, totalPages - start) }, (_, index) => start + index);
    const pages = await Promise.all(pageNumbers.map((page) => fetchPortalPage(keyword, page, filters, options.forceRefresh)));
    pages.forEach((page) => rawRecords.push(...page.content));
    records = publish(start + pages.length);
  }

  rememberAutocompleteValues(rawRecords);

  return {
    records,
    totalElements: rule ? records.length : portalTotalElements,
    portalTotalElements,
    excludedRecords: rawRecords.length - records.length,
    keywordRule: rule,
    totalPages: portalTotalPages,
    truncated: portalTotalPages > maxPages,
  };
}
function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const source = String(value ?? "").trim().replace(/\s/g, "");
  if (!source) return 0;
  if (/^-?\d{1,3}([.,]\d{3})+$/.test(source)) return Number(source.replace(/[.,]/g, "")) || 0;
  return Number(source.replace(",", ".")) || 0;
}
function formatVnd(value: number, language: Language = "en") {
  const locale = localeFor(language);
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toLocaleString(locale, { maximumFractionDigits: 1 })} ${copy(language, "bn VND", "tỷ VND")}`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toLocaleString(locale, { maximumFractionDigits: 1 })} ${copy(language, "mn VND", "triệu VND")}`;
  return `${Math.round(value).toLocaleString(locale)} VND`;
}
function formatList(value: string[] | string | undefined) {
  return Array.isArray(value) ? value.filter(Boolean).join("; ") : value || "";
}
function formatDownloadDate(date: Date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}
function filenameSlug(value: string) {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "ket-qua";
}
function safeExcelText(value: unknown) {
  const text = String(value ?? "");
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}
function formatLocation(locations: WinningBidRecord["diaDiem"]) {
  if (!Array.isArray(locations)) return "";
  return locations
    .map((location) => [location.wardName, location.districtName, location.provName].filter(Boolean).join(", "))
    .filter(Boolean)
    .join("; ");
}
const bidFormNames: Record<string, string> = {
  DTRR: "Đấu thầu rộng rãi",
  CGTTRG: "Chào giá trực tuyến theo quy trình rút gọn",
  MSTT: "Mua sắm trực tiếp",
  CDTRG: "Chỉ định thầu rút gọn",
};
const companyDisplayNames: Record<string, string> = {
  medtronic: "Medtronic",
  ethicon: "J&J / Ethicon",
  applied: "Applied Medical",
  bbraun: "B. Braun / Aesculap",
  olympus: "Olympus",
  miconvey: "Miconvey",
  innolcon: "Innolcon",
};
type ExcelSheet = {
  name: string;
  rows: Record<string, unknown>[] | unknown[][];
  columns: number[];
  matrix?: boolean;
};
async function downloadWorkbook(sheets: ExcelSheet[], filename: string) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  sheets.forEach((sheet) => {
    const worksheet = sheet.matrix
      ? XLSX.utils.aoa_to_sheet(sheet.rows as unknown[][])
      : XLSX.utils.json_to_sheet(sheet.rows as Record<string, unknown>[]);
    worksheet["!cols"] = sheet.columns.map((wch) => ({ wch }));
    if (!sheet.matrix && sheet.rows.length) {
      const width = Object.keys(sheet.rows[0] as Record<string, unknown>).length;
      worksheet["!autofilter"] = { ref: XLSX.utils.encode_range({ r: 0, c: 0 }, { r: sheet.rows.length, c: Math.max(0, width - 1) }) };
    }
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31));
  });
  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx", compression: true }) as ArrayBuffer;
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
function dateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function defaultOverviewFilters(): OverviewFilterState {
  const today = new Date();
  return {
    dateFrom: `${today.getFullYear()}-01-01`,
    dateTo: dateInputValue(today),
    hospital: "",
    subOu: "all",
    productGroup: "all",
    company: "all",
  };
}
function overviewCacheId(filters: OverviewFilterState) {
  return JSON.stringify([
    filters.dateFrom,
    filters.dateTo,
    filters.hospital,
    filters.subOu,
    filters.productGroup,
    filters.company,
  ]);
}
function readOverviewCache(filters: OverviewFilterState) {
  try {
    const cache = JSON.parse(window.sessionStorage.getItem(OVERVIEW_CACHE_KEY) || "{}") as Record<string, OverviewCacheEntry>;
    const entry = cache[overviewCacheId(filters)];
    return entry && Array.isArray(entry.slices) ? entry : undefined;
  } catch {
    return undefined;
  }
}
function writeOverviewCache(filters: OverviewFilterState, entry: OverviewCacheEntry) {
  try {
    const cache = JSON.parse(window.sessionStorage.getItem(OVERVIEW_CACHE_KEY) || "{}") as Record<string, OverviewCacheEntry>;
    cache[overviewCacheId(filters)] = entry;
    window.sessionStorage.setItem(OVERVIEW_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // The dashboard still works when browser storage is unavailable.
  }
}
function parseDate(value: string | undefined) {
  if (!value) return null;
  const iso = new Date(value);
  if (!Number.isNaN(iso.getTime())) return iso;
  const [day, month, year] = value.slice(0, 10).split("/").map(Number);
  return day && month && year ? new Date(year, month - 1, day) : null;
}
function valueOf(record: WinningBidRecord) {
  return toNumber(record.khoiLuongDouble ?? record.khoiLuong) * toNumber(record.donGia ?? record.donGiaDuThau);
}
function companyOf(record: WinningBidRecord, language: Language = "en") {
  const searchable = [
    record.tenThietBi,
    record.nhanHieu,
    record.hangSanXuat,
    record.chungLoai,
    record.kyMaHieu,
    record.cauHinh,
    formatList(record.winningName),
  ].filter(Boolean).join(" | ");
  return mappedCompanyName(searchable, record.hangSanXuat || "") || copy(language, "Unknown / review needed", "Chưa xác định / cần kiểm tra");
}
function overviewSearchFilters(filters: OverviewFilterState): SearchFilters {
  return {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    hospital: filters.hospital,
    brand: "",
    supplier: "",
    company: filters.company,
  };
}
function recordKey(record: WinningBidRecord) {
  return record.id || [
    record.maTbmt,
    record.tenThietBi,
    record.kyMaHieu,
    record.chungLoai,
    record.donGia ?? record.donGiaDuThau,
    formatList(record.winningName),
    record.tenCdtBmt,
  ].map((value) => normalize(String(value ?? ""))).join("::");
}
function productKey(record: WinningBidRecord) {
  return normalize(record.kyMaHieu || record.chungLoai || record.nhanHieu || record.tenThietBi || recordKey(record));
}
function overviewFactFor(record: WinningBidRecord, rules: KeywordMasterRule[]): OverviewFact | undefined {
  const text = recordSearchText(record);
  const rule = rules
    .filter((candidate) => text.includes(normalize(candidate.keyword)) && !candidate.excludes.some((exclude) => text.includes(normalize(exclude))))
    .sort((left, right) => right.keyword.length - left.keyword.length)[0];
  if (!rule) return undefined;
  const hospital = record.tenCdtBmt?.trim() || "Chưa xác định";
  return {
    key: recordKey(record),
    company: companyOf(record),
    supplier: formatList(record.winningName),
    hospital,
    tender: record.maTbmt?.trim() || `Không có mã · ${hospital}`,
    product: productKey(record),
    productName: record.tenThietBi?.trim() || "",
    model: (record.kyMaHieu || record.chungLoai || "").trim(),
    brand: record.nhanHieu?.trim() || "",
    manufacturer: record.hangSanXuat?.trim() || "",
    unitOfMeasure: record.donViTinh?.trim() || "",
    unitPrice: toNumber(record.donGia ?? record.donGiaDuThau),
    publishedAt: record.ngayDangTaiKqlcnt || "",
    value: valueOf(record),
    units: toNumber(record.khoiLuongDouble ?? record.khoiLuong),
  };
}
function groupFor(keyword: string, language: Language = "en") {
  const value = normalize(keyword);
  if (/luoi|hernia/.test(value)) return "Thoát vị";
  if (/dao|ligasure|han mach|sieu am|vessel/.test(value)) return "VS&D · Vessel Sealing & Dissector";
  return copy(language, "Custom search", "Nhóm tìm kiếm tùy chỉnh");
}
function topBy(
  records: WinningBidRecord[],
  key: (record: WinningBidRecord) => string,
  metric: (record: WinningBidRecord) => number,
  language: Language = "en",
  groupSimilarCompanies = false,
) {
  const totals = new Map<string, NamedValue>();
  for (const record of records) {
    const name = key(record).trim() || copy(language, "Unknown / review needed", "Chưa xác định / cần kiểm tra");
    const groupingKey = groupSimilarCompanies ? companyGroupingKey(name) : name;
    const current = totals.get(groupingKey) || { name, value: 0 };
    current.value += metric(record);
    totals.set(groupingKey, current);
  }
  return [...totals.values()].sort((a, b) => b.value - a.value).slice(0, 5);
}

function summarize(
  keyword: string,
  fetchedAt: string,
  records: WinningBidRecord[],
  totalElements: number,
  truncated: boolean,
  filters: SearchFilters,
  source: { keywordRule?: KeywordMasterRule; excludedRecords?: number; portalTotalElements?: number } = {},
  language: Language = "en",
): ProductData {
  const totalValue = records.reduce((sum, record) => sum + valueOf(record), 0);
  const totalQuantity = records.reduce((sum, record) => sum + toNumber(record.khoiLuongDouble ?? record.khoiLuong), 0);
  const medtronicRecords = records.filter((record) => companyOf(record) === "Medtronic");
  const medtronicValue = medtronicRecords.reduce((sum, record) => sum + valueOf(record), 0);
  const medtronicQuantity = medtronicRecords.reduce((sum, record) => sum + toNumber(record.khoiLuongDouble ?? record.khoiLuong), 0);
  const dated = records.map((record) => ({ record, date: parseDate(record.ngayDangTaiKqlcnt) }))
    .filter((item): item is { record: WinningBidRecord; date: Date } => item.date !== null)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const months = new Map<string, { month: string; value: number }>();
  for (const item of dated) {
    const key = `${item.date.getFullYear()}-${String(item.date.getMonth() + 1).padStart(2, "0")}`;
    const current = months.get(key) || { month: `T${item.date.getMonth() + 1}/${String(item.date.getFullYear()).slice(-2)}`, value: 0 };
    current.value += valueOf(item.record);
    months.set(key, current);
  }
  const trend = [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([, value]) => value);
  const units = new Set(records.map((record) => normalize(record.donViTinh || "")).filter(Boolean));
  const missingManufacturerValue = records.filter((record) => !record.hangSanXuat?.trim()).reduce((sum, record) => sum + valueOf(record), 0);
  const missingShare = totalValue ? (missingManufacturerValue / totalValue) * 100 : 0;
  const firstDate = dated.at(0)?.date;
  const lastDate = dated.at(-1)?.date;
  const locale = localeFor(language);
  const dateRange = firstDate && lastDate ? `${firstDate.toLocaleDateString(locale)}–${lastDate.toLocaleDateString(locale)}` : copy(language, "All available dates", "Tất cả thời gian có dữ liệu");
  const medtronicShare = totalValue ? (medtronicValue / totalValue) * 100 : 0;
  const medtronicQuantityShare = totalQuantity ? (medtronicQuantity / totalQuantity) * 100 : 0;
  const exclusionNote = source.keywordRule && source.excludedRecords
    ? copy(language, ` The approved exclusion terms removed ${source.excludedRecords.toLocaleString(locale)} false-positive matches: records containing the search words but describing a different item.`, ` Các điều kiện loại trừ đã duyệt loại ${source.excludedRecords.toLocaleString(locale)} kết quả trùng từ nhưng mô tả mặt hàng khác.`)
    : "";
  return {
    keyword,
    records,
    group: source.keywordRule ? `${source.keywordRule.subOu} · ${source.keywordRule.productGroup}` : groupFor(keyword, language),
    fetchedAt,
    truncated,
    filters,
    keywordRule: source.keywordRule,
    excludedRecords: source.excludedRecords || 0,
    portalTotalElements: source.portalTotalElements || totalElements,
    lineItems: records.length,
    totalElements,
    totalValue, totalQuantity,
    tenders: new Set(records.map((record) => record.maTbmt).filter(Boolean)).size,
    hospitals: new Set(records.map((record) => record.tenCdtBmt).filter(Boolean)).size,
    medtronicValue, medtronicShare, medtronicQuantity, medtronicQuantityShare, dateRange,
    trend: trend.length ? trend : [{ month: copy(language, "No publication date", "Chưa có ngày đăng tải"), value: 0 }],
    manufacturers: topBy(records, (record) => companyOf(record, language), valueOf, language, true),
    topHospitals: topBy(records, (record) => record.tenCdtBmt || "", valueOf, language),
    topProducts: topBy(records, (record) => record.kyMaHieu || record.chungLoai || record.nhanHieu || record.tenThietBi || "", (record) => toNumber(record.khoiLuongDouble ?? record.khoiLuong), language),
    topSuppliers: topBy(records, (record) => formatList(record.winningName), valueOf, language),
    insight: medtronicValue
      ? copy(language, `Medtronic-related product labels represent approximately ${medtronicShare.toLocaleString(locale, { maximumFractionDigits: 1 })}% of the recorded awarded value in this live search.`, `Các nhãn sản phẩm liên quan đến Medtronic chiếm khoảng ${medtronicShare.toLocaleString(locale, { maximumFractionDigits: 1 })}% giá trị trúng thầu ghi nhận trong kết quả tìm kiếm trực tiếp này.`)
      : copy(language, "No current records were classified as Medtronic from the available product fields.", "Chưa có bản ghi nào được phân loại là Medtronic từ các trường sản phẩm hiện có."),
    qualityNote: copy(language, `The data contains ${units.size} units of measure; ${missingShare.toLocaleString(locale, { maximumFractionDigits: 1 })}% of awarded value has no manufacturer information.${exclusionNote} Company market share remains an estimate until the name mappings are confirmed.`, `Dữ liệu có ${units.size} loại đơn vị tính; ${missingShare.toLocaleString(locale, { maximumFractionDigits: 1 })}% giá trị trúng thầu không có thông tin hãng sản xuất.${exclusionNote} Thị phần công ty vẫn là ước tính cho tới khi danh sách tên quy đổi được xác nhận.`),
  };
}

function TrendChart({ data }: { data: ProductData["trend"] }) {
  const language = useLanguage();
  const width = 720, height = 220;
  const padding = { top: 18, right: 16, bottom: 34, left: 42 };
  const max = Math.max(...data.map((point) => point.value), 1);
  const x = (index: number) => data.length === 1 ? width / 2 : padding.left + (index * (width - padding.left - padding.right)) / (data.length - 1);
  const y = (value: number) => padding.top + (1 - value / max) * (height - padding.top - padding.bottom);
  const points = data.map((point, index) => `${x(index)},${y(point.value)}`);
  const area = `${points.join(" ")} ${x(data.length - 1)},${height - padding.bottom} ${x(0)},${height - padding.bottom}`;
  return <svg className="trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={copy(language, "Awarded value over time", "Diễn biến giá trị trúng thầu")}>
    {[0, .5, 1].map((ratio) => { const lineY = padding.top + ratio * (height - padding.top - padding.bottom); return <g key={ratio}><line className="chart-gridline" x1={padding.left} x2={width - padding.right} y1={lineY} y2={lineY} /><text className="chart-axis" x="0" y={lineY + 4}>{((max * (1 - ratio)) / 1_000_000_000).toLocaleString(localeFor(language), { maximumFractionDigits: 0 })} {copy(language, "bn", "tỷ")}</text></g>; })}
    <polygon className="chart-area" points={area} /><polyline className="chart-line" points={points.join(" ")} />
    {data.map((point, index) => <g key={`${point.month}-${index}`}><circle className="chart-dot" cx={x(index)} cy={y(point.value)} r="3" />{(index === 0 || index === data.length - 1 || index === Math.floor(data.length / 2)) && <text className="chart-axis chart-month" x={x(index)} y={height - 10} textAnchor={index === 0 ? "start" : index === data.length - 1 ? "end" : "middle"}>{point.month}</text>}</g>)}
  </svg>;
}

function HospitalAutocomplete({ value, onChange, language, compact = false }: {
  value: string;
  onChange: (value: string) => void;
  language: Language;
  compact?: boolean;
}) {
  const { hospitals } = useAutocompleteDirectories();
  const suggestions = useMemo(() => hospitalSuggestionsFor(hospitals, value), [hospitals, value]);
  const selected = hospitals.find((entry) => normalize(entry.name) === normalize(value))?.name || null;
  return <Combobox<string>
    items={suggestions.map((entry) => entry.name)}
    inputValue={value}
    value={selected}
    filter={null}
    autoHighlight
    onInputValueChange={(next) => onChange(next)}
    onValueChange={(next) => onChange(next || "")}
  >
    <ComboboxInput
      className={`hospital-autocomplete ${compact ? "is-compact" : ""}`}
      showClear={Boolean(value)}
      placeholder={copy(language, "Type a hospital name or ID", "Nhập tên hoặc mã bệnh viện")}
      aria-label={copy(language, "Hospital or buyer", "Bệnh viện hoặc chủ đầu tư")}
    />
    <ComboboxContent className="autocomplete-popup hospital-autocomplete-popup">
      <ComboboxList>
        <ComboboxGroup>
          <ComboboxLabel>{copy(language, "Hospital names found in portal data", "Tên bệnh viện đã tìm thấy trên cổng")}</ComboboxLabel>
          {suggestions.map((entry) => <ComboboxItem className="autocomplete-option" value={entry.name} key={`${entry.name}-${entry.id || ""}`}>
            <div><strong>{entry.name}</strong>{entry.id && <span>{copy(language, "Organization ID", "Mã đơn vị")}: {entry.id}</span>}</div>
          </ComboboxItem>)}
        </ComboboxGroup>
        <ComboboxEmpty>{copy(language, "No saved match. You can still enter the exact name.", "Chưa có gợi ý phù hợp. Bạn vẫn có thể nhập tên chính xác.")}</ComboboxEmpty>
      </ComboboxList>
    </ComboboxContent>
  </Combobox>;
}

function ProductSearch({ loading, error, status, onSearch }: { loading: boolean; error?: string; status?: string; onSearch: (query: string) => void }) {
  const language = useLanguage();
  const [query, setQuery] = useState("");
  const { learnedProducts } = useAutocompleteDirectories();
  const suggestions = useMemo(() => productSuggestionsFor(learnedProducts, query), [learnedProducts, query]);
  const masterSuggestions = suggestions.filter((entry) => entry.subOu);
  const learnedSuggestions = suggestions.filter((entry) => !entry.subOu);
  const selectedSuggestion = suggestions.find((entry) => normalize(entry.value) === normalize(query));
  const selectedRule = keywordMaster.find((rule) => normalize(rule.keyword) === normalize(query));
  const submit = () => { if (query.trim() && !loading) onSearch(query.trim()); };
  return <div className="search-shell">
    <div className="product-command">
      <div className="direct-search-head"><strong>{copy(language, "Enter a product, brand, or model", "Nhập sản phẩm, brand hoặc model")}</strong><span>{copy(language, "Approved keyword rules are applied automatically when available.", "Quy tắc trong bộ từ khóa chuẩn sẽ được áp dụng tự động khi có.")}</span></div>
      <form onSubmit={(event) => { event.preventDefault(); submit(); }}><div className="search-input-row">
        <Combobox<string>
          items={suggestions.map((entry) => entry.value)}
          inputValue={query}
          value={selectedSuggestion?.value || null}
          filter={null}
          autoHighlight
          onInputValueChange={setQuery}
          onValueChange={(next) => { if (next) setQuery(next); }}
        >
          <ComboboxInput className="product-autocomplete" showTrigger={false} placeholder={copy(language, "Example: LigaSure, lưới thoát vị, LF1937…", "Ví dụ: LigaSure, lưới thoát vị, LF1937…")} aria-label={copy(language, "Live product search", "Tìm kiếm sản phẩm trực tiếp")} />
          <ComboboxContent className="autocomplete-popup product-autocomplete-popup">
            <ComboboxList>
              {masterSuggestions.length > 0 && <ComboboxGroup><ComboboxLabel>{copy(language, "Approved keyword master", "Bộ từ khóa chuẩn")}</ComboboxLabel>{masterSuggestions.map((entry) => <ComboboxItem className="autocomplete-option" value={entry.value} key={`master-${normalize(entry.value)}`}><div><strong>{entry.value}</strong><span>{entry.subOu} · {entry.productGroup}</span></div></ComboboxItem>)}</ComboboxGroup>}
              {learnedSuggestions.length > 0 && <ComboboxGroup><ComboboxLabel>{copy(language, "Brands and models found in live results", "Brand và model tìm thấy trong dữ liệu trực tiếp")}</ComboboxLabel>{learnedSuggestions.map((entry) => <ComboboxItem className="autocomplete-option" value={entry.value} key={`learned-${entry.kind}-${normalize(entry.value)}`}><div><strong>{entry.value}</strong><span>{entry.kind === "brand" ? "Brand" : "Model"}</span></div></ComboboxItem>)}</ComboboxGroup>}
              <ComboboxEmpty>{copy(language, "No saved suggestion. You can still search this exact phrase.", "Chưa có gợi ý phù hợp. Bạn vẫn có thể tìm theo cụm từ này.")}</ComboboxEmpty>
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        <button className="search-button" type="submit" disabled={loading || !query.trim()}>{loading ? <LoaderCircle className="spin" /> : <Search />}<span>{loading ? copy(language, "Searching…", "Đang tìm…") : copy(language, "Search", "Tìm kiếm")}</span></button>
      </div></form>
      {query.trim() && <div className={`keyword-rule-preview ${selectedRule ? "is-master-rule" : "is-custom-rule"}`}>
        {selectedRule ? <><div><strong>{copy(language, "Applying rule", "Áp dụng quy tắc")} #{selectedRule.id}</strong><span>{selectedRule.subOu} · {selectedRule.productGroup}</span></div><p>{selectedRule.note}</p>{selectedRule.excludes.length > 0 && <div className="exclude-list"><span>{copy(language, "Automatic exclusions:", "Loại trừ tự động:")}</span>{selectedRule.excludes.map((term) => <b key={term}>{term}</b>)}</div>}<p className="ambiguity-explanation">{copy(language, "What ‘removed’ means: the portal may return records containing the same words but describing accessories, cables, generators, CUSA systems, or another approved exclusion. A record is removed only when its product description contains one of the exclusion terms above; missing manufacturer or price data alone does not remove it.", "‘Đã loại’ nghĩa là gì: cổng có thể trả về các bản ghi chứa cùng từ nhưng thực tế mô tả phụ kiện, dây/cáp, bộ phát, hệ thống CUSA hoặc mặt hàng khác nằm trong điều kiện loại trừ đã duyệt. Hệ thống chỉ loại khi mô tả sản phẩm chứa một trong các cụm từ loại trừ ở trên; không loại chỉ vì thiếu hãng sản xuất hoặc giá.")}</p></> : <><div><strong>{copy(language, "Custom search", "Tìm kiếm tùy chỉnh")}</strong><span>{copy(language, "Outside the 196-keyword catalog", "Không thuộc danh mục 196 từ khóa")}</span></div><p>{copy(language, "Results will use your exact search phrase without keyword-master exclusions.", "Kết quả sẽ được lấy theo cụm từ bạn nhập và không áp dụng điều kiện loại trừ từ keyword master.")}</p></>}
      </div>}
    </div>
    {loading && status && <p className="search-loading-status"><LoaderCircle className="spin" />{status}</p>}
    {error && <p className="search-message">{error}</p>}
  </div>;
}

function Brand() {
  const language = useLanguage();
  return <div className="brand" aria-label={copy(language, "TenderPulse AI Medtronic analytics", "TenderPulse AI phân tích Medtronic")}><span className="brand-name">TenderPulse <b>AI</b></span><span className="brand-divider" /><span className="company-label">MEDTRONIC MARKET INTELLIGENCE</span></div>;
}
function SearchHome({ loading, error, status, onSearch }: { loading: boolean; error?: string; status?: string; onSearch: (query: string) => void }) {
  const language = useLanguage();
  return <main className="home-page"><section className="search-hero keyword-search-hero">
    <div className="company-pill"><CheckCircle2 /> {copy(language, "Company view: Medtronic", "Góc nhìn công ty: Medtronic")}</div><h1>{copy(language, "Search live tender data", "Tra cứu dữ liệu thầu")}<br /><span>{copy(language, "by product, brand, or model.", "theo sản phẩm, brand hoặc model.")}</span></h1>
    <p>{copy(language, "Type what you want to look up. Each search retrieves the latest public award data and automatically applies a matching approved keyword rule.", "Nhập trực tiếp nội dung cần tra cứu. Mỗi lượt tìm kiếm lấy dữ liệu trúng thầu công khai mới nhất và tự động áp dụng quy tắc từ khóa phù hợp.")}</p>
    <ProductSearch loading={loading} error={error} status={status} onSearch={onSearch} />
    <div className="source-line"><Database /> {copy(language, "Live data from Mua Sắm Công", "Dữ liệu trực tiếp từ Mua Sắm Công")}</div>
  </section><div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" /></main>;
}
function RankingPanel({ eyebrow, title, items, currency = true, company = false }: { eyebrow: string; title: string; items: NamedValue[]; currency?: boolean; company?: boolean }) {
  const language = useLanguage();
  const max = Math.max(...items.map((item) => item.value), 1);
  return <article className="panel manufacturer-panel"><div className="panel-heading"><div><span className="panel-eyebrow">{eyebrow}</span><h2>{title}</h2></div></div><div className="rank-list">{items.map((item, index) => <div className={`rank-row ${company && item.name.includes("Medtronic") ? "is-company" : ""}`} key={item.name}><div className="rank-label"><span>{index + 1}</span><strong>{item.name}</strong><em>{currency ? formatVnd(item.value, language) : `${Math.round(item.value).toLocaleString(localeFor(language))} ${copy(language, "products", "sản phẩm")}`}</em></div><div className="rank-track"><span style={{ width: `${(item.value / max) * 100}%` }} /></div></div>)}</div></article>;
}

function FilterBar({ initial, loading, onApply }: { initial: SearchFilters; loading: boolean; onApply: (filters: SearchFilters) => void }) {
  const language = useLanguage();
  const [filters, setFilters] = useState<SearchFilters>(initial);
  const update = (field: keyof SearchFilters, value: string) => setFilters((current) => ({ ...current, [field]: value }));
  const hasFilters = Object.entries(filters).some(([key, value]) => key === "company" ? value !== "all" : Boolean(value));

  return <form className="filter-bar" onSubmit={(event) => { event.preventDefault(); onApply(filters); }}>
    <div className="filter-title"><Filter /><span>{copy(language, "Filters", "Bộ lọc")}<small>{copy(language, "Sent to the portal", "Gửi trực tiếp tới cổng")}</small></span></div>
    <label className="filter-field"><small>{copy(language, "FROM DATE", "TỪ NGÀY")}</small><input type="date" value={filters.dateFrom} max={filters.dateTo || undefined} onChange={(event) => update("dateFrom", event.target.value)} /></label>
    <label className="filter-field"><small>{copy(language, "TO DATE", "ĐẾN NGÀY")}</small><input type="date" value={filters.dateTo} min={filters.dateFrom || undefined} onChange={(event) => update("dateTo", event.target.value)} /></label>
    <div className="filter-field"><small>{copy(language, "HOSPITAL / BUYER", "BỆNH VIỆN / CHỦ ĐẦU TƯ")}</small><HospitalAutocomplete value={filters.hospital} onChange={(value) => update("hospital", value)} language={language} compact /></div>
    <label className="filter-field"><small>{copy(language, "BRAND / MANUFACTURER", "BRAND / HÃNG SẢN XUẤT")}</small><input type="text" value={filters.brand} onChange={(event) => update("brand", event.target.value)} placeholder={copy(language, "Example: LigaSure", "Ví dụ: LigaSure")} /></label>
    <label className="filter-field"><small>{copy(language, "WINNING SUPPLIER", "NHÀ THẦU TRÚNG")}</small><input type="text" value={filters.supplier} onChange={(event) => update("supplier", event.target.value)} placeholder={copy(language, "Enter name or ID", "Nhập tên hoặc mã")} /></label>
    <div className="filter-field"><small>{copy(language, "COMPANY", "CÔNG TY")}</small><Select value={filters.company} onValueChange={(value) => update("company", value)}><SelectTrigger className="company-select"><SelectValue /></SelectTrigger><SelectContent>
      <SelectItem value="all">{copy(language, "All companies", "Tất cả công ty")}</SelectItem><SelectItem value="medtronic">Medtronic</SelectItem><SelectItem value="ethicon">J&amp;J / Ethicon</SelectItem><SelectItem value="applied">Applied Medical</SelectItem><SelectItem value="bbraun">B. Braun / Aesculap</SelectItem><SelectItem value="olympus">Olympus</SelectItem><SelectItem value="miconvey">Miconvey</SelectItem><SelectItem value="innolcon">Innolcon</SelectItem>
    </SelectContent></Select></div>
    <div className="filter-actions"><button className="apply-filter" type="submit" disabled={loading}>{loading ? <LoaderCircle className="spin" /> : <Search />}{copy(language, "Apply", "Áp dụng")}</button><button className="clear-filter" type="button" disabled={loading || !hasFilters} onClick={() => { const cleared = emptyFilters(); setFilters(cleared); onApply(cleared); }}>{copy(language, "Clear", "Xóa lọc")}</button></div>
  </form>;
}

function Dashboard({ product, loading, error, status, onBack, onSearch }: { product: ProductData; loading: boolean; error?: string; status?: string; onBack: () => void; onSearch: (query: string, filters?: SearchFilters) => void }) {
  const language = useLanguage();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string>();

  async function downloadExcel() {
    setExporting(true);
    setExportError(undefined);
    try {
      if (!product.records.length) throw new Error(copy(language, "There are no results to export.", "Không có kết quả để xuất Excel."));
      const resultRows = product.records.map((record, index) => {
        const quantity = toNumber(record.khoiLuongDouble ?? record.khoiLuong);
        const unitPrice = toNumber(record.donGia ?? record.donGiaDuThau);
        return {
          STT: index + 1,
          "Tên thiết bị, vật tư y tế": safeExcelText(record.tenThietBi),
          "Đơn vị tính": safeExcelText(record.donViTinh),
          "Khối lượng": quantity,
          "Xuất xứ": safeExcelText(record.xuatXu),
          "Mã HS": safeExcelText(record.maHs),
          "Ký mã hiệu": safeExcelText(record.kyMaHieu),
          "Nhãn hiệu": safeExcelText(record.nhanHieu),
          "Hãng sản xuất": safeExcelText(record.hangSanXuat),
          "Chủng loại (model)": safeExcelText(record.chungLoai),
          "Số lưu hành / giấy phép nhập khẩu": safeExcelText(record.soLuuHanh),
          "Năm sản xuất": safeExcelText(record.namSanXuat),
          "Cấu hình, tính năng kỹ thuật": safeExcelText(record.cauHinh),
          "Đơn giá trúng thầu": unitPrice,
          "Thành tiền ước tính": quantity * unitPrice,
          "Mã định danh NT trúng thầu": safeExcelText(formatList(record.winningCode)),
          "Tên NT trúng thầu": safeExcelText(formatList(record.winningName)),
          "Mã TBMT": safeExcelText(record.maTbmt),
          "Mã định danh CĐT": safeExcelText(record.maCdt),
          "Tên CĐT": safeExcelText(record.tenCdtBmt),
          "Hình thức LCNT": safeExcelText(record.bidForm ? bidFormNames[record.bidForm] || record.bidForm : ""),
          "Ngày đăng tải KQLCNT": safeExcelText(record.ngayDangTaiKqlcnt),
          "Số quyết định": safeExcelText(record.soQuyetDinh),
          "Ngày ban hành quyết định": safeExcelText(record.ngayBanHanhQuyetDinh),
          "Số nhà thầu tham dự": toNumber(record.soNhaThauThamDu) || "",
          "Địa điểm": safeExcelText(formatLocation(record.diaDiem)),
        };
      });
      const infoRows = [
        ["Thông tin xuất dữ liệu", ""],
        ["Từ khóa", safeExcelText(product.keyword)],
        ["Thời gian xuất", new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })],
        ["Số dòng kết quả", product.records.length],
        ["Từ ngày", product.filters.dateFrom || "Tất cả"],
        ["Đến ngày", product.filters.dateTo || "Tất cả"],
        ["Bệnh viện / chủ đầu tư", safeExcelText(product.filters.hospital || "Tất cả")],
        ["Brand / hãng sản xuất", safeExcelText(product.filters.brand || "Tất cả")],
        ["Nhà thầu trúng", safeExcelText(product.filters.supplier || "Tất cả")],
        ["Công ty", safeExcelText(product.filters.company !== "all" ? companyDisplayNames[product.filters.company] || product.filters.company : "Tất cả")],
        ["Nguồn dữ liệu", "Cổng Mua Sắm Công"],
      ];
      await downloadWorkbook([
        { name: "Kết quả", rows: resultRows, columns: [7, 44, 14, 14, 24, 13, 22, 22, 32, 22, 28, 15, 60, 20, 20, 26, 42, 18, 22, 38, 34, 20, 22, 22, 18, 38] },
        { name: "Thông tin tìm kiếm", rows: infoRows, columns: [28, 65], matrix: true },
      ], `${formatDownloadDate(new Date())}-${filenameSlug(product.keyword)}.xlsx`);
    } catch (caught) {
      setExportError(caught instanceof Error ? caught.message : copy(language, "Could not create the Excel file.", "Không thể tạo file Excel."));
    } finally {
      setExporting(false);
    }
  }

  return <main className="dashboard-page"><div className="search-result-toolbar"><div className="result-route"><span>{copy(language, "Product search result", "Kết quả tra cứu sản phẩm")}</span><strong>{product.keyword}</strong></div><button className="new-search" onClick={onBack}><ArrowLeft /> {copy(language, "New search", "Tra cứu mới")}</button></div><section className="dashboard-shell">
    {loading && <div className="live-banner"><LoaderCircle className="spin" /> {status || copy(language, "Retrieving the latest portal data…", "Đang lấy dữ liệu mới nhất từ cổng…")}</div>}{error && <div className="live-banner live-banner-error"><CircleAlert /> {error}</div>}
    {exportError && <div className="live-banner live-banner-error"><CircleAlert /> {exportError}</div>}
    <div className="dashboard-heading"><div><div className="result-kicker"><span>{copy(language, "MEDTRONIC MARKET OVERVIEW", "TỔNG QUAN THỊ TRƯỜNG MEDTRONIC")}</span><i /><span>{product.group}</span></div><h1>{product.keyword}</h1><p>{product.lineItems.toLocaleString(localeFor(language))} {copy(language, "result rows", "dòng kết quả")} · {product.dateRange} · {copy(language, "Updated", "Cập nhật lúc")} {new Date(product.fetchedAt).toLocaleString(localeFor(language), { timeZone: "Asia/Ho_Chi_Minh" })}</p>{product.keywordRule && <div className="applied-master-rule"><strong>Keyword master #{product.keywordRule.id}</strong><span>{product.excludedRecords.toLocaleString(localeFor(language))} {copy(language, "false-positive matches removed using the approved exclusion terms", "kết quả trùng từ nhưng sai mặt hàng đã được loại bằng điều kiện loại trừ đã duyệt")}</span></div>}</div><button className="export-button" type="button" disabled={loading || exporting} onClick={downloadExcel}>{exporting ? <LoaderCircle className="spin" /> : <Download />}<span>{exporting ? copy(language, "Creating Excel…", "Đang tạo Excel…") : copy(language, "Export Excel", "Xuất Excel")}</span></button></div>
    <FilterBar key={product.fetchedAt} initial={product.filters} loading={loading} onApply={(filters) => onSearch(product.keyword, filters)} />
    <div className="metric-grid">
      <article className="metric-card"><div className="metric-icon blue"><Trophy /></div><span>{copy(language, "Total awarded value", "Tổng giá trị trúng thầu")}</span><strong>{formatVnd(product.totalValue, language)}</strong><small>{copy(language, "Calculated from the current search results", "Tính trực tiếp từ kết quả tìm kiếm")}</small></article>
      <article className="metric-card company-metric"><div className="metric-icon company"><CheckCircle2 /></div><span>{copy(language, "Medtronic awarded value", "Giá trị Medtronic trúng")}</span><strong>{formatVnd(product.medtronicValue, language)}</strong><small>{copy(language, "Represents", "Chiếm")} {product.medtronicShare.toLocaleString(localeFor(language), { maximumFractionDigits: 1 })}% {copy(language, "of market value", "giá trị thị trường")}</small></article>
      <article className="metric-card"><div className="metric-icon violet"><Database /></div><span>{copy(language, "Medtronic unit share", "Thị phần Medtronic theo số lượng")}</span><strong>{product.medtronicQuantityShare.toLocaleString(localeFor(language), { maximumFractionDigits: 1 })}%</strong><small>{Math.round(product.medtronicQuantity).toLocaleString(localeFor(language))} / {Math.round(product.totalQuantity).toLocaleString(localeFor(language))} {copy(language, "recorded units", "sản phẩm ghi nhận")}</small></article>
      <article className="metric-card"><div className="metric-icon green"><Database /></div><span>{copy(language, "Tender notices with results", "Số TBMT có kết quả")}</span><strong>{product.tenders.toLocaleString(localeFor(language))}</strong><small>{copy(language, "Distinct tender notice IDs", "Tính theo Mã TBMT riêng biệt")}</small></article>
      <article className="metric-card"><div className="metric-icon blue"><Building2 /></div><span>{copy(language, "Hospitals / buyers", "Số bệnh viện / chủ đầu tư")}</span><strong>{product.hospitals.toLocaleString(localeFor(language))}</strong><small>{product.totalElements.toLocaleString(localeFor(language))} {copy(language, "filtered portal results", "kết quả trên cổng")}</small></article>
    </div>
    <div className="dashboard-grid">
      <article className="panel trend-panel"><div className="panel-heading"><div><span className="panel-eyebrow">{copy(language, "AWARDED VALUE", "GIÁ TRỊ TRÚNG THẦU")}</span><h2>{copy(language, "Awarded value over time", "Diễn biến giá trị theo thời gian")}</h2></div><span className="panel-period">{copy(language, "Current results", "Kết quả hiện tại")} · VND</span></div><TrendChart data={product.trend} /></article>
      <article className="panel company-panel"><div className="company-panel-head"><span>MEDTRONIC</span><CheckCircle2 /></div><p>{copy(language, "Estimated company position", "Vị thế công ty ước tính")}</p><div className="company-share">{product.medtronicShare.toLocaleString(localeFor(language), { maximumFractionDigits: 1 })}<small>%</small></div><div className="share-track"><span style={{ width: `${Math.min(product.medtronicShare, 100)}%` }} /></div><strong>{formatVnd(product.medtronicValue, language)} {copy(language, "recorded value", "giá trị ghi nhận")}</strong></article>
      <RankingPanel eyebrow={copy(language, "COMPETITIVE COMPARISON", "SO SÁNH CẠNH TRANH")} title={copy(language, "Awarded value by company", "Giá trị trúng thầu theo công ty")} items={product.manufacturers} company /><RankingPanel eyebrow={copy(language, "CUSTOMER DEMAND", "NHU CẦU KHÁCH HÀNG")} title={copy(language, "Top 5 hospitals by awarded value", "Top 5 bệnh viện theo giá trị trúng thầu")} items={product.topHospitals} />
      <RankingPanel eyebrow={copy(language, "PRODUCT DEMAND", "NHU CẦU SẢN PHẨM")} title={copy(language, "Top 5 models by awarded units", "Top 5 model theo số lượng trúng")} items={product.topProducts} currency={false} /><RankingPanel eyebrow={copy(language, "WINNING SUPPLIERS", "NHÀ THẦU")} title={copy(language, "Top 5 suppliers by awarded value", "Top 5 nhà thầu trúng theo giá trị")} items={product.topSuppliers} />
    </div>
    <div className="insight-grid"><article className="insight-card"><div className="insight-icon"><Sparkles /></div><div><span>{copy(language, "TENDERPULSE INSIGHT", "NHẬN ĐỊNH TENDERPULSE")}</span><p>{product.insight}</p></div></article><article className="quality-card"><CircleAlert /><div><span>{copy(language, "DATA QUALITY NOTE", "LƯU Ý CHẤT LƯỢNG DỮ LIỆU")}</span><p>{product.qualityNote}</p></div></article></div>
    <p className="dashboard-footnote">{product.truncated ? copy(language, `Portal results exceeded the safety limit; the dashboard uses the first ${product.lineItems.toLocaleString(localeFor(language))} records.`, `Kết quả trên cổng vượt giới hạn an toàn; dashboard được tính từ ${product.lineItems.toLocaleString(localeFor(language))} bản ghi đầu tiên.`) : copy(language, "All figures are recalculated after each search using Mua Sắm Công award data.", "Toàn bộ số liệu được tính sau mỗi lượt tìm kiếm từ dữ liệu trúng thầu từ Mua Sắm Công")}</p>
  </section></main>;
}

function percent(value: number, language: Language = "en") {
  return `${value.toLocaleString(localeFor(language), { maximumFractionDigits: 1 })}%`;
}

function mergeNamedValues(slices: OverviewSubOu[], select: (slice: OverviewSubOu) => OverviewNamedValue[]) {
  const totals = new Map<string, OverviewNamedValue>();
  slices.flatMap(select).forEach((entry) => {
    const current = totals.get(entry.name) || { name: entry.name, value: 0, units: 0 };
    current.value += entry.value;
    current.units += entry.units;
    totals.set(entry.name, current);
  });
  return [...totals.values()].sort((left, right) => right.value - left.value);
}

function mergeHospitals(slices: OverviewSubOu[]) {
  const totals = new Map<string, OverviewHospital>();
  slices.flatMap((slice) => slice.hospitals).forEach((entry) => {
    const current = totals.get(entry.name) || { name: entry.name, value: 0, units: 0, products: 0, tenders: 0 };
    current.value += entry.value;
    current.units += entry.units;
    current.products += entry.products;
    current.tenders += entry.tenders;
    totals.set(entry.name, current);
  });
  return [...totals.values()].sort((left, right) => right.value - left.value);
}

function mergeTenders(slices: OverviewSubOu[]) {
  const totals = new Map<string, OverviewTender>();
  slices.flatMap((slice) => slice.tenders).forEach((entry) => {
    const current = totals.get(entry.id) || { id: entry.id, hospital: entry.hospital, value: 0, products: 0 };
    current.value += entry.value;
    current.products += entry.products;
    totals.set(entry.id, current);
  });
  return [...totals.values()].sort((left, right) => right.value - left.value);
}

function OverviewFilterBar({ filters, catalog, loading, onApply }: {
  filters: OverviewFilterState;
  catalog: KeywordCatalogItem[];
  loading: boolean;
  onApply: (filters: OverviewFilterState) => void;
}) {
  const language = useLanguage();
  const [draft, setDraft] = useState(filters);
  const update = (field: keyof OverviewFilterState, value: string) => {
    setDraft((current) => {
      const next = { ...current, [field]: value };
      if (field === "subOu") next.productGroup = "all";
      return next;
    });
  };
  const groups = catalog
    .filter((item) => draft.subOu === "all" || item.subOu === draft.subOu)
    .flatMap((item) => item.productGroups)
    .filter((name, index, values) => values.indexOf(name) === index);

  return <form className="overview-filter" onSubmit={(event) => { event.preventDefault(); onApply(draft); }}>
    <label><span>{copy(language, "From", "Từ ngày")}</span><input type="date" value={draft.dateFrom} max={draft.dateTo || undefined} onChange={(event) => update("dateFrom", event.target.value)} /></label>
    <label><span>{copy(language, "To", "Đến ngày")}</span><input type="date" value={draft.dateTo} min={draft.dateFrom || undefined} onChange={(event) => update("dateTo", event.target.value)} /></label>
    <div className="overview-filter-field"><span>{copy(language, "Hospital", "Bệnh viện")}</span><HospitalAutocomplete value={draft.hospital} onChange={(value) => update("hospital", value)} language={language} compact /></div>
    <label><span>Sub-OU</span><select value={draft.subOu} onChange={(event) => update("subOu", event.target.value)}><option value="all">{copy(language, "All", "Tất cả")}</option>{subOuOrder.map((name) => <option value={name} key={name}>{name}</option>)}</select></label>
    <label><span>{copy(language, "Product group", "Nhóm sản phẩm")}</span><select value={draft.productGroup} onChange={(event) => update("productGroup", event.target.value)}><option value="all">{copy(language, "All", "Tất cả")}</option>{groups.map((name) => <option value={name} key={name}>{name}</option>)}</select></label>
    <label><span>{copy(language, "Company", "Công ty")}</span><select value={draft.company} onChange={(event) => update("company", event.target.value)}><option value="all">{copy(language, "All", "Tất cả")}</option><option value="medtronic">Medtronic</option><option value="ethicon">J&amp;J / Ethicon</option><option value="bbraun">B. Braun / Aesculap</option><option value="applied">Applied Medical</option><option value="olympus">Olympus</option></select></label>
    <button className="overview-apply" type="submit" disabled={loading}>{loading ? copy(language, "Updating…", "Đang cập nhật…") : copy(language, "Apply", "Áp dụng")}</button>
  </form>;
}

function MarketOverview() {
  const language = useLanguage();
  const initialFilters = useMemo(defaultOverviewFilters, []);
  const [filters, setFilters] = useState(initialFilters);
  const [catalog] = useState<KeywordCatalogItem[]>(overviewKeywordCatalog);
  const [slices, setSlices] = useState<OverviewSubOu[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState<OverviewLoadProgress>({ completed: 0, total: 0, current: [] });
  const [lastLoadSummary, setLastLoadSummary] = useState<{ succeeded: number; total: number }>();
  const [exporting, setExporting] = useState(false);
  const [exportingHospital, setExportingHospital] = useState<string>();
  const [error, setError] = useState<string>();
  const [updatedAt, setUpdatedAt] = useState<string>();
  const [loadedFromCache, setLoadedFromCache] = useState(false);
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  const [showAllHospitals, setShowAllHospitals] = useState<Set<string>>(new Set());
  const started = useRef(false);

  async function fetchSubOuSlice(
    subOu: string,
    nextFilters: OverviewFilterState,
    completedSubOus: number,
    totalSubOus: number,
    forceRefresh = false,
  ) {
    const facts = new Map<string, OverviewFact>();
    let sourceTotalElements = 0;
    let truncated = false;
    const failedQueries: string[] = [];
    const rules = keywordMaster.filter((rule) =>
      rule.subOu === subOu &&
      (nextFilters.productGroup === "all" || rule.productGroup === nextFilters.productGroup),
    );
    const productGroups = [...new Set(rules.map((rule) => rule.productGroup))];
    const seeds = [...new Set(productGroups.flatMap((group) => MARKET_OVERVIEW_SEARCH_SEEDS[group] || [group]))];
    let successfulQueries = 0;

    for (let seedIndex = 0; seedIndex < seeds.length; seedIndex += 1) {
      const seed = seeds[seedIndex];
      try {
        setLoadProgress({
          completed: completedSubOus,
          total: totalSubOus,
          current: [`${subOu} · ${copy(language, "query", "truy vấn")} ${seedIndex + 1}/${seeds.length}`],
        });
        const result = await collectLiveWinningBids(seed, overviewSearchFilters(nextFilters), {
          maxPages: 25,
          forceRefresh,
          applyKeywordRule: false,
          onProgress: (progress) => setLoadProgress({
            completed: completedSubOus,
            total: totalSubOus,
            current: [`${subOu} · ${seedIndex + 1}/${seeds.length} · ${copy(language, "page", "trang")} ${progress.completedPages}/${progress.totalPages}`],
          }),
        });
        successfulQueries += 1;
        sourceTotalElements += result.portalTotalElements;
        truncated ||= result.truncated;
        result.records.forEach((record) => {
          const fact = overviewFactFor(record, rules);
          if (fact) facts.set(fact.key, fact);
        });
      } catch {
        failedQueries.push(seed);
      }
      if (seedIndex + 1 < seeds.length) await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (seeds.length && !successfulQueries) {
      throw new Error(copy(language, `Could not update ${subOu}.`, `Không thể cập nhật ${subOu}.`));
    }

    return {
      fetchedAt: new Date().toISOString(),
      slice: aggregateOverviewFacts(subOu, [...facts.values()], {
        sourceTotalElements,
        truncated,
        failedQueries,
      }),
    };
  }

  async function loadOverview(nextFilters: OverviewFilterState, availableCatalog = catalog, forceRefresh = false) {
    const matchingCatalog = availableCatalog.length ? availableCatalog : overviewKeywordCatalog;
    const targets = matchingCatalog
      .filter((item) => nextFilters.subOu === "all" || item.subOu === nextFilters.subOu)
      .filter((item) => nextFilters.productGroup === "all" || item.productGroups.includes(nextFilters.productGroup))
      .map((item) => item.subOu);

    if (!forceRefresh) {
      const cached = readOverviewCache(nextFilters);
      if (cached) {
        setFilters(nextFilters);
        setSlices(cached.slices);
        setUpdatedAt(cached.updatedAt);
        setLastLoadSummary({ succeeded: cached.succeeded, total: cached.total });
        setLoadProgress({ completed: cached.total, total: cached.total, current: [] });
        setError(undefined);
        setLoadedFromCache(true);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    setError(undefined);
    setLoadedFromCache(false);
    setLastLoadSummary(undefined);
    setSlices([]);
    setFilters(nextFilters);
    const failures: string[] = [];
    const successfulSlices: OverviewSubOu[] = [];
    let latestFetchedAt: string | undefined;
    let completed = 0;
    let succeeded = 0;
    setLoadProgress({ completed: 0, total: targets.length, current: [] });

    // One Sub-OU at a time is slower on a cold load, but avoids bursting the
    // portal and Cloudflare Worker with concurrent long-running requests.
    for (let index = 0; index < targets.length; index += 1) {
      const batch = targets.slice(index, index + 1);
      setLoadProgress({ completed, total: targets.length, current: batch });
      const responses = await Promise.allSettled(batch.map(async (subOu) => {
        const result = await fetchSubOuSlice(subOu, nextFilters, completed, targets.length, forceRefresh);
        if (result.fetchedAt) {
          latestFetchedAt = result.fetchedAt;
          setUpdatedAt(result.fetchedAt);
        }
        return result.slice;
      }));
      responses.forEach((result, batchIndex) => {
        if (result.status === "fulfilled") {
          succeeded += 1;
          successfulSlices.push(result.value);
          setSlices((current) => [...current, result.value].sort((left, right) => subOuOrder.indexOf(left.name) - subOuOrder.indexOf(right.name)));
        } else {
          failures.push(batch[batchIndex]);
        }
      });
      completed += batch.length;
      setLoadProgress({ completed, total: targets.length, current: [] });
      if (index + 1 < targets.length) await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (failures.length) setError(copy(language, `Could not load: ${failures.join(", ")}. The remaining Sub-OUs are still shown.`, `Chưa thể tải: ${failures.join(", ")}. Các Sub-OU còn lại vẫn được hiển thị.`));
    setLastLoadSummary({ succeeded, total: targets.length });
    if (!failures.length) {
      const sortedSlices = successfulSlices.sort((left, right) => subOuOrder.indexOf(left.name) - subOuOrder.indexOf(right.name));
      setSlices(sortedSlices);
      writeOverviewCache(nextFilters, {
        // Keep the session cache compact. Detailed facts stay in memory after a
        // live load and are retrieved for one hospital on demand after a reload.
        slices: sortedSlices.map(({ facts: _facts, ...slice }) => slice),
        updatedAt: latestFetchedAt,
        succeeded,
        total: targets.length,
      });
    }
    setLoading(false);
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void loadOverview(initialFilters, overviewKeywordCatalog);
  }, [initialFilters]);

  const totals = useMemo(() => {
    const marketSize = slices.reduce((sum, slice) => sum + slice.marketSize, 0);
    const units = slices.reduce((sum, slice) => sum + slice.totalUnits, 0);
    const medtronicValue = slices.reduce((sum, slice) => sum + slice.medtronicValue, 0);
    const medtronicUnits = slices.reduce((sum, slice) => sum + slice.medtronicUnits, 0);
    const hospitals = mergeHospitals(slices);
    const tenders = mergeTenders(slices);
    return {
      marketSize,
      medtronicValueShare: marketSize ? (medtronicValue / marketSize) * 100 : 0,
      medtronicUnitShare: units ? (medtronicUnits / units) * 100 : 0,
      hospitals,
      tenders,
      suppliers: mergeNamedValues(slices, (slice) => slice.suppliers).filter((entry) => entry.name !== "Chưa xác định"),
    };
  }, [slices]);
  const hasWarnings = slices.some((slice) => slice.truncated || slice.failedQueries.length);

  async function exportExcel() {
    setExporting(true);
    try {
      if (!slices.length) throw new Error(copy(language, "There is no overview data to export.", "Chưa có dữ liệu tổng quan để xuất."));
      const subOuRows = slices.map((slice) => ({
        "Sub-OU": safeExcelText(slice.name), "Market Size (VND)": slice.marketSize,
        "Market Share Medtronic (VND)": slice.medtronicValueShare / 100,
        "Market Share Medtronic (Unit)": slice.medtronicUnitShare / 100,
        "Số KQLCNT": slice.tenderCount, "Bệnh viện trúng thầu": slice.hospitalCount, "Số sản phẩm": slice.productCount,
        "Top 1 đối thủ": safeExcelText(slice.competitors[0]?.name), "Top 1 Value": slice.competitors[0]?.value || 0, "Top 1 Unit": slice.competitors[0]?.units || 0,
        "Top 2 đối thủ": safeExcelText(slice.competitors[1]?.name), "Top 2 Value": slice.competitors[1]?.value || 0, "Top 2 Unit": slice.competitors[1]?.units || 0,
        "Top 3 đối thủ": safeExcelText(slice.competitors[2]?.name), "Top 3 Value": slice.competitors[2]?.value || 0, "Top 3 Unit": slice.competitors[2]?.units || 0,
      }));
      const hospitalRows = slices.flatMap((slice) => slice.hospitals.map((hospital) => ({
        "Sub-OU": safeExcelText(slice.name), "Bệnh viện / chủ đầu tư": safeExcelText(hospital.name),
        "Số sản phẩm": hospital.products, "Số KQLCNT": hospital.tenders, "Số lượng": hospital.units, "Market Size (VND)": hospital.value,
      })));
      const supplierRows = slices.flatMap((slice) => slice.suppliers.map((supplier) => ({
        "Sub-OU": safeExcelText(slice.name), "Nhà phân phối": safeExcelText(supplier.name), "Số lượng": supplier.units, "Market Size (VND)": supplier.value,
      })));
      const infoRows = [
        ["Thông tin xuất dữ liệu", ""], ["Ngày tải", new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })],
        ["Từ ngày", filters.dateFrom || "Tất cả"], ["Đến ngày", filters.dateTo || "Tất cả"],
        ["Bệnh viện / chủ đầu tư", safeExcelText(filters.hospital || "Tất cả")],
        ["Sub-OU", safeExcelText(filters.subOu !== "all" ? filters.subOu : "Tất cả")],
        ["Nhóm sản phẩm", safeExcelText(filters.productGroup !== "all" ? filters.productGroup : "Tất cả")],
        ["Công ty", safeExcelText(filters.company !== "all" ? filters.company : "Tất cả")], ["Nguồn", "Cổng Mua Sắm Công"],
      ];
      await downloadWorkbook([
        { name: "Tổng quan Sub-OU", rows: subOuRows, columns: [22, ...Array(15).fill(22)] },
        { name: "Bệnh viện", rows: hospitalRows, columns: [22, 48, 16, 16, 16, 22] },
        { name: "Nhà phân phối", rows: supplierRows, columns: [22, 48, 16, 22] },
        { name: "Bộ lọc", rows: infoRows, columns: [30, 64], matrix: true },
      ], `${formatDownloadDate(new Date())}-tong-quan-thi-truong.xlsx`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy(language, "Could not create the Excel file.", "Không thể tạo file Excel."));
    } finally {
      setExporting(false);
    }
  }

  async function exportHospital(subOu: string, hospital: string) {
    const exportKey = `${subOu}::${hospital}`;
    setExportingHospital(exportKey);
    setError(undefined);
    try {
      let facts = slices.find((item) => item.name === subOu)?.facts;
      if (!facts?.length) {
        const result = await fetchSubOuSlice(subOu, { ...filters, hospital }, 0, 1);
        facts = result.slice.facts;
      }
      const rows = (facts || [])
        .filter((fact) => fact.hospital === hospital)
        .map((fact) => ({ ...fact, subOu }));
      if (!rows.length) {
        throw new Error(copy(language, "No detailed rows are available for this hospital under the active filters.", "Không có dữ liệu chi tiết của bệnh viện này theo bộ lọc hiện tại."));
      }
      const detailRows = rows.map((row) => ({
        "Sub-OU": safeExcelText(row.subOu), "Bệnh viện / chủ đầu tư": safeExcelText(row.hospital), "Mã TBMT": safeExcelText(row.tender),
        "Tên sản phẩm": safeExcelText(row.productName), "Model / mã hiệu": safeExcelText(row.model), "Nhãn hiệu": safeExcelText(row.brand),
        "Hãng sản xuất": safeExcelText(row.manufacturer), "Công ty quy đổi": safeExcelText(row.company), "Nhà thầu trúng": safeExcelText(row.supplier),
        "Đơn vị tính": safeExcelText(row.unitOfMeasure), "Số lượng": row.units, "Đơn giá trúng thầu": row.unitPrice,
        "Giá trị trúng thầu": row.value, "Ngày đăng KQLCNT": safeExcelText(row.publishedAt),
      }));
      const infoRows = [
        ["Bệnh viện / chủ đầu tư", safeExcelText(hospital)], ["Ngày tải", new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })],
        ["Từ ngày", filters.dateFrom || "Tất cả"], ["Đến ngày", filters.dateTo || "Tất cả"],
        ["Sub-OU", filters.subOu !== "all" ? safeExcelText(filters.subOu) : "Tất cả"],
        ["Nhóm sản phẩm", filters.productGroup !== "all" ? safeExcelText(filters.productGroup) : "Tất cả"],
        ["Công ty", filters.company !== "all" ? safeExcelText(filters.company) : "Tất cả"], ["Nguồn", "Cổng Mua Sắm Công"],
      ];
      await downloadWorkbook([
        { name: "Chi tiết bệnh viện", rows: detailRows, columns: [18, 46, 20, 54, 24, 22, 36, 30, 42, 16, 16, 22, 22, 20] },
        { name: "Bộ lọc", rows: infoRows, columns: [30, 64], matrix: true },
      ], `${formatDownloadDate(new Date())}-${filenameSlug(hospital)}.xlsx`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy(language, "Could not create the hospital Excel file.", "Không thể tạo file Excel cho bệnh viện."));
    } finally {
      setExportingHospital(undefined);
    }
  }

  const toggleRow = (name: string) => setOpenRows((current) => {
    const next = new Set(current);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });
  const toggleAllHospitals = (name: string) => setShowAllHospitals((current) => {
    const next = new Set(current);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });

  const progressPercent = loadProgress.total ? Math.round((loadProgress.completed / loadProgress.total) * 100) : 0;
  const lastLoadLabel = lastLoadSummary
    ? lastLoadSummary.total
      ? copy(language, `Updated ${lastLoadSummary.succeeded}/${lastLoadSummary.total} Sub-OUs`, `Đã cập nhật ${lastLoadSummary.succeeded}/${lastLoadSummary.total} Sub-OU`)
      : copy(language, "No Sub-OU matches the current filters.", "Không có Sub-OU phù hợp với bộ lọc.")
    : undefined;

  return <main className="overview-page"><section className="overview-shell">
    <div className="overview-heading"><div><h1>{copy(language, "Market overview", "Tổng quan thị trường")}</h1><p>{copy(language, "Award data classified using 196 approved keywords and exclusion rules.", "Dữ liệu trúng thầu được phân loại theo bộ 196 từ khóa và điều kiện loại trừ.")}</p></div><div className="overview-actions"><span>{loading ? copy(language, "Updating live data", "Đang cập nhật dữ liệu trực tiếp") : loadedFromCache ? copy(language, "Loaded from this session's cache", "Đã tải từ bộ nhớ của phiên này") : updatedAt ? `${copy(language, "Updated", "Cập nhật")} ${new Date(updatedAt).toLocaleString(localeFor(language), { timeZone: "Asia/Ho_Chi_Minh" })}` : lastLoadLabel || copy(language, "Not updated yet", "Chưa cập nhật dữ liệu")}</span><button className="refresh-overview" type="button" onClick={() => void loadOverview(filters, catalog, true)} disabled={loading}><RefreshCw />{copy(language, "Force refresh", "Làm mới dữ liệu")}</button><button type="button" onClick={exportExcel} disabled={loading || exporting || !slices.length}>{exporting ? copy(language, "Creating…", "Đang tạo…") : copy(language, "Export Excel", "Xuất Excel")}</button></div></div>
    <OverviewFilterBar key={`${filters.dateFrom}-${filters.dateTo}-${filters.hospital}-${filters.subOu}-${filters.productGroup}-${filters.company}`} filters={filters} catalog={catalog} loading={loading} onApply={loadOverview} />
    {loading && <div className="overview-loading" role="status" aria-live="polite">
      <div className="loading-copy"><div><strong>{copy(language, "Retrieving the latest data from Mua Sắm Công", "Đang lấy dữ liệu mới nhất từ Cổng Mua Sắm Công")}</strong><span>{loadProgress.current.length ? `${copy(language, "Processing", "Đang xử lý")}: ${loadProgress.current.join(", ")}` : copy(language, "Preparing queries…", "Đang chuẩn bị truy vấn…")}</span></div><b>{loadProgress.completed}/{loadProgress.total || "…"} Sub-OU · {progressPercent}%</b></div>
      <div className="loading-progress" aria-hidden="true"><span style={{ width: `${progressPercent}%` }} /></div>
      <small>{copy(language, "Each Sub-OU appears as soon as it finishes processing.", "Kết quả của từng Sub-OU sẽ xuất hiện ngay khi xử lý xong.")}</small>
    </div>}
    {!loading && lastLoadLabel && !error && <div className="overview-load-complete" role="status">{lastLoadLabel}</div>}
    {error && <div className="overview-notice error-notice">{error}</div>}
    {hasWarnings && <div className="overview-notice">{copy(language, "Some queries were limited or incomplete. Do not use these rows as final figures until the update is complete.", "Một số truy vấn bị giới hạn hoặc chưa hoàn tất. Không dùng các dòng này làm số liệu cuối cùng cho đến khi cập nhật đủ.")}</div>}
    <div className="overview-metrics">
      <article><span>Market size</span><strong>{formatVnd(totals.marketSize, language)}</strong><small>{copy(language, "Awarded value within the selected scope", "Giá trị trúng thầu trong phạm vi lọc")}</small></article>
      <article><span>{copy(language, "Medtronic share · value", "Thị phần Medtronic · giá trị")}</span><strong>{percent(totals.medtronicValueShare, language)}</strong><small>{copy(language, "Covidien and LigaSure are mapped to Medtronic", "Covidien và LigaSure được quy đổi vào Medtronic")}</small></article>
      <article><span>{copy(language, "Medtronic share · units", "Thị phần Medtronic · số lượng")}</span><strong>{percent(totals.medtronicUnitShare, language)}</strong><small>{copy(language, "Calculated from recorded product quantities", "Tính theo số lượng sản phẩm ghi nhận")}</small></article>
      <article><span>{copy(language, "Award results", "Số KQLCNT")}</span><strong>{totals.tenders.length.toLocaleString(localeFor(language))}</strong><small>{copy(language, "Distinct tender notice IDs", "Mã TBMT riêng biệt")}</small></article>
      <article><span>{copy(language, "Winning hospitals", "Bệnh viện trúng thầu")}</span><strong>{totals.hospitals.filter((item) => item.name !== "Chưa xác định").length.toLocaleString(localeFor(language))}</strong><small>{copy(language, "Expandable by Sub-OU", "Có thể mở theo từng Sub-OU")}</small></article>
    </div>

    <section className="subou-section"><div className="section-title"><div><h2>{copy(language, "Analysis by Sub-OU", "Phân tích theo Sub-OU")}</h2><p>{copy(language, "Select the hospital count at the end of a row to view product details.", "Chọn số bệnh viện ở cuối mỗi dòng để xem chi tiết sản phẩm.")}</p></div>{loading && <span className="loading-label">{copy(language, "Received", "Đã nhận")} {slices.length}/{loadProgress.total || "…"} {copy(language, "results", "kết quả")}</span>}</div>
      <div className="subou-table-wrap"><table className="subou-table"><thead><tr><th>Sub-OU</th><th>Market size</th><th>Medtronic share</th><th>{copy(language, "Top 3 competitors", "Top 3 đối thủ")}</th><th>{copy(language, "Results", "KQLCNT")}</th><th>{copy(language, "Hospitals", "Bệnh viện")}</th></tr></thead><tbody>
        {slices.map((slice, index) => <Fragment key={slice.name}>
          <tr className={openRows.has(slice.name) ? "is-open" : ""}>
            <td><span className="subou-index">{String(index + 1).padStart(2, "0")}</span><div><strong>{slice.name}</strong><small>{slice.productCount.toLocaleString(localeFor(language))} {copy(language, "products", "sản phẩm")}</small></div></td>
            <td><strong>{formatVnd(slice.marketSize, language)}</strong><small>{Math.round(slice.totalUnits).toLocaleString(localeFor(language))} {copy(language, "units", "đơn vị")}</small></td>
            <td><strong>{percent(slice.medtronicValueShare, language)} <em>{copy(language, "value", "giá trị")}</em></strong><small>{percent(slice.medtronicUnitShare, language)} {copy(language, "units", "số lượng")}</small></td>
            <td><div className="competitor-stack">{slice.competitors.length ? slice.competitors.map((item, rank) => <div key={item.name}><span>{rank + 1}. {item.name}</span><b>MS Value {percent(slice.marketSize ? (item.value / slice.marketSize) * 100 : 0, language)}</b><small>MS Unit {percent(slice.totalUnits ? (item.units / slice.totalUnits) * 100 : 0, language)}</small></div>) : <span>{copy(language, "Insufficient data", "Chưa đủ dữ liệu")}</span>}</div></td>
            <td><strong>{slice.tenderCount.toLocaleString(localeFor(language))}</strong></td>
            <td><button className="hospital-expand" type="button" onClick={() => toggleRow(slice.name)} aria-expanded={openRows.has(slice.name)}><span><strong>{slice.hospitalCount.toLocaleString(localeFor(language))}</strong><small>{copy(language, "hospitals", "bệnh viện")}</small></span><b>{openRows.has(slice.name) ? copy(language, "Collapse", "Thu gọn") : copy(language, "View", "Xem")}</b></button></td>
          </tr>
          {openRows.has(slice.name) && <tr className="hospital-detail-row"><td colSpan={6}><div className="hospital-detail"><div className="hospital-detail-head"><div><strong>{copy(language, "Hospitals in", "Bệnh viện thuộc")} {slice.name}</strong><span>{copy(language, "Product count reflects distinct models/codes after classification. Export uses this hospital and every active dashboard filter.", "Số sản phẩm là số model/mã hiệu riêng biệt sau phân loại. File xuất áp dụng bệnh viện này và toàn bộ bộ lọc hiện tại.")}</span></div><button type="button" onClick={() => toggleRow(slice.name)}>{copy(language, "Close", "Đóng")}</button></div><div className="hospital-mini-table"><div className="hospital-mini-head"><span>{copy(language, "Hospital / buyer", "Bệnh viện / chủ đầu tư")}</span><span>{copy(language, "Products", "Sản phẩm")}</span><span>{copy(language, "Results", "KQLCNT")}</span><span>{copy(language, "Units", "Số lượng")}</span><span>{copy(language, "Value", "Giá trị")}</span></div>{slice.hospitals.slice(0, showAllHospitals.has(slice.name) ? undefined : 8).map((hospital) => { const exportKey = `${slice.name}::${hospital.name}`; return <div className="hospital-mini-row" key={hospital.name}><div className="hospital-name-cell"><strong>{hospital.name}</strong><button className="hospital-export-button" type="button" title={copy(language, "Export this hospital", "Xuất Excel bệnh viện này")} aria-label={copy(language, `Export ${hospital.name} to Excel`, `Xuất Excel cho ${hospital.name}`)} disabled={Boolean(exportingHospital)} onClick={() => void exportHospital(slice.name, hospital.name)}>{exportingHospital === exportKey ? <LoaderCircle className="spin" /> : <Download />}</button></div><span>{hospital.products.toLocaleString(localeFor(language))}</span><span>{hospital.tenders.toLocaleString(localeFor(language))}</span><span>{Math.round(hospital.units).toLocaleString(localeFor(language))}</span><span>{formatVnd(hospital.value, language)}</span></div>; })}</div>{slice.hospitals.length > 8 && <button className="show-more-hospitals" type="button" onClick={() => toggleAllHospitals(slice.name)}>{showAllHospitals.has(slice.name) ? copy(language, "Show first 8 hospitals", "Hiện 8 bệnh viện đầu") : copy(language, `View all ${slice.hospitals.length} hospitals`, `Xem toàn bộ ${slice.hospitals.length} bệnh viện`)}</button>}</div></td></tr>}
        </Fragment>)}
        {loading && !slices.length && Array.from({ length: 3 }, (_, index) => <tr className="subou-skeleton-row" key={`skeleton-${index}`} aria-hidden="true">
          <td><span className="skeleton-block skeleton-name" /></td><td><span className="skeleton-block skeleton-value" /></td><td><span className="skeleton-block skeleton-value" /></td><td><span className="skeleton-block skeleton-wide" /></td><td><span className="skeleton-block skeleton-short" /></td><td><span className="skeleton-block skeleton-short" /></td>
        </tr>)}
        {!slices.length && !loading && <tr><td className="empty-overview" colSpan={6}>{copy(language, "No data matches the current filters.", "Không có dữ liệu phù hợp với bộ lọc hiện tại.")}</td></tr>}
      </tbody></table></div>
    </section>

    <div className="overview-bottom-grid">
      <OverviewList title={copy(language, "Top 5 distributors by market size", "Top 5 nhà phân phối theo market size")} rows={totals.suppliers.slice(0, 5)} />
      <OverviewList title={copy(language, "Top 5 hospitals by market size", "Top 5 bệnh viện theo market size")} rows={totals.hospitals.slice(0, 5)} meta={(row) => `${(row as OverviewHospital).products} ${copy(language, "products", "sản phẩm")}`} />
      <article className="overview-list"><h3>{copy(language, "Top 5 award results by value", "Top 5 KQLCNT theo giá trị")}</h3><div>{totals.tenders.slice(0, 5).map((tender, index) => <div className="overview-list-row" key={tender.id}><span>{index + 1}</span><div><strong>{tender.id}</strong><small>{tender.hospital} · {tender.products} {copy(language, "products", "sản phẩm")}</small></div><b>{formatVnd(tender.value, language)}</b></div>)}</div></article>
    </div>
  </section></main>;
}

function OverviewList({ title, rows, meta }: { title: string; rows: OverviewNamedValue[]; meta?: (row: OverviewNamedValue) => string }) {
  const language = useLanguage();
  return <article className="overview-list"><h3>{title}</h3><div>{rows.map((row, index) => <div className="overview-list-row" key={row.name}><span>{index + 1}</span><div><strong>{row.name}</strong><small>{meta ? meta(row) : `${Math.round(row.units).toLocaleString(localeFor(language))} ${copy(language, "units", "đơn vị")}`}</small></div><b>{formatVnd(row.value, language)}</b></div>)}</div></article>;
}

function SearchExperience({ resume, onActivity }: { resume?: ActivityItem; onActivity: (activity: ActivityItem) => void }) {
  const language = useLanguage();
  const [selectedProduct, setSelectedProduct] = useState<ProductData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState<string>();
  const [error, setError] = useState<string>();
  const lastResult = useRef<{
    keyword: string;
    fetchedAt: string;
    records: WinningBidRecord[];
    totalElements: number;
    truncated: boolean;
    filters: SearchFilters;
    source: { keywordRule?: KeywordMasterRule; excludedRecords?: number; portalTotalElements?: number };
  } | undefined>(undefined);
  async function searchLive(keyword: string, filters: SearchFilters = emptyFilters()) {
    setLoading(true); setError(undefined); setLoadingStatus(copy(language, "Connecting to Mua Sắm Công…", "Đang kết nối Cổng Mua Sắm Công…"));
    try {
      const fetchedAt = new Date().toISOString();
      const data = await collectLiveWinningBids(keyword, filters, {
        maxPages: 25,
        onProgress: (progress) => {
          setLoadingStatus(copy(
            language,
            `Loaded page ${progress.completedPages}/${progress.totalPages} · ${progress.records.length.toLocaleString(localeFor(language))} matching rows`,
            `Đã tải trang ${progress.completedPages}/${progress.totalPages} · ${progress.records.length.toLocaleString(localeFor(language))} dòng phù hợp`,
          ));
          if (progress.records.length) {
            const totalElements = progress.keywordRule ? progress.records.length : progress.portalTotalElements;
            setSelectedProduct(summarize(keyword, fetchedAt, progress.records, totalElements, progress.truncated, filters, {
              keywordRule: progress.keywordRule,
              excludedRecords: progress.excludedRecords,
              portalTotalElements: progress.portalTotalElements,
            }, language));
          }
        },
      });
      const records = data.records;
      if (!records.length) throw new Error(copy(language, `No current award data was found for “${keyword}”.`, `Không tìm thấy dữ liệu trúng thầu hiện tại cho “${keyword}”.`));
      const result = {
        keyword,
        fetchedAt,
        records,
        totalElements: data.totalElements || records.length,
        truncated: Boolean(data.truncated),
        filters,
        source: {
          keywordRule: data.keywordRule,
          excludedRecords: data.excludedRecords,
          portalTotalElements: data.portalTotalElements,
        },
      };
      lastResult.current = result;
      setSelectedProduct(summarize(result.keyword, result.fetchedAt, result.records, result.totalElements, result.truncated, result.filters, result.source, language));
      onActivity({ id: `${Date.now()}-${filenameSlug(keyword)}`, keyword, searchedAt: new Date().toISOString(), filters });
    } catch (caught) { setError(caught instanceof Error ? caught.message : copy(language, "Could not complete the live search.", "Không thể thực hiện tìm kiếm trực tiếp.")); }
    finally { setLoading(false); setLoadingStatus(undefined); }
  }
  useEffect(() => {
    if (resume) void searchLive(resume.keyword, resume.filters);
  }, [resume?.id]);
  useEffect(() => {
    const result = lastResult.current;
    if (result) setSelectedProduct(summarize(result.keyword, result.fetchedAt, result.records, result.totalElements, result.truncated, result.filters, result.source, language));
  }, [language]);
  if (!selectedProduct) return <SearchHome loading={loading} error={error} status={loadingStatus} onSearch={searchLive} />;
  return <Dashboard product={selectedProduct} loading={loading} error={error} status={loadingStatus} onBack={() => { setSelectedProduct(null); setError(undefined); }} onSearch={searchLive} />;
}

export default function Home() {
  const [language, setLanguage] = useState<Language>("en");
  const [activeTab, setActiveTab] = useState("overview");
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [resume, setResume] = useState<ActivityItem>();
  const [showActivity, setShowActivity] = useState(false);
  const localReady = useRef(false);

  useEffect(() => {
    const storedTab = window.localStorage.getItem("tenderpulse.active-tab");
    const storedActivity = window.localStorage.getItem("tenderpulse.recent-activity");
    const storedLanguage = window.localStorage.getItem("tenderpulse.language");
    if (storedTab === "overview" || storedTab === "search") setActiveTab(storedTab);
    if (storedLanguage === "vi") {
      setLanguage("vi");
      document.documentElement.lang = "vi";
    }
    if (storedActivity) {
      try { setActivity(JSON.parse(storedActivity) as ActivityItem[]); } catch { /* Ignore invalid older local data. */ }
    }
    localReady.current = true;
  }, []);

  const changeTab = (value: string) => {
    setActiveTab(value);
    if (localReady.current) window.localStorage.setItem("tenderpulse.active-tab", value);
  };
  const changeLanguage = (value: Language) => {
    setLanguage(value);
    document.documentElement.lang = value;
    window.localStorage.setItem("tenderpulse.language", value);
  };
  const rememberActivity = (next: ActivityItem) => {
    setActivity((current) => {
      const updated = [next, ...current.filter((item) => normalize(item.keyword) !== normalize(next.keyword))].slice(0, 8);
      window.localStorage.setItem("tenderpulse.recent-activity", JSON.stringify(updated));
      return updated;
    });
  };
  const reopenActivity = (item: ActivityItem) => {
    setResume({ ...item, id: `${item.id}-${Date.now()}` });
    changeTab("search");
    setShowActivity(false);
  };

  return <LanguageContext.Provider value={language}><Tabs className="app-tabs" value={activeTab} onValueChange={changeTab}>
    <header className="app-header"><Brand /><TabsList className="main-tabs" variant="line"><TabsTrigger value="overview">{copy(language, "Market overview", "Tổng quan thị trường")}</TabsTrigger><TabsTrigger value="search">{copy(language, "Product search", "Tra cứu sản phẩm")}</TabsTrigger></TabsList><div className="header-actions"><div className="language-switch" role="group" aria-label="Interface language"><button className={language === "en" ? "is-active" : ""} type="button" onClick={() => changeLanguage("en")} aria-pressed={language === "en"}>EN</button><button className={language === "vi" ? "is-active" : ""} type="button" onClick={() => changeLanguage("vi")} aria-pressed={language === "vi"}>VI</button></div><div className="activity-menu"><button type="button" onClick={() => setShowActivity((current) => !current)} aria-expanded={showActivity}>{copy(language, "Recent activity", "Hoạt động gần đây")}{activity.length ? <span>{activity.length}</span> : null}</button>{showActivity && <div className="activity-panel"><div className="activity-panel-head"><strong>{copy(language, "Activity on this device", "Hoạt động trên thiết bị này")}</strong><button type="button" onClick={() => setShowActivity(false)}>{copy(language, "Close", "Đóng")}</button></div>{activity.length ? activity.map((item) => <button className="activity-item" type="button" key={item.id} onClick={() => reopenActivity(item)}><strong>{item.keyword}</strong><span>{new Date(item.searchedAt).toLocaleString(localeFor(language))}</span></button>) : <p>{copy(language, "No saved searches yet.", "Chưa có lượt tra cứu nào được lưu.")}</p>}</div>}</div></div></header>
    <TabsContent className="app-tab-content" value="overview"><MarketOverview /></TabsContent>
    <TabsContent className="app-tab-content" value="search"><SearchExperience resume={resume} onActivity={rememberActivity} /></TabsContent>
  </Tabs></LanguageContext.Provider>;
}
