import keywordMasterJson from "@/data/keyword-master.json";
import { mappedCompanyName } from "@/lib/company-mapping";

import {
  collectWinningBids,
  type WinningBidFilters,
  type WinningBidRecord,
} from "@/lib/winning-bids";
import {
  aggregateOverviewFacts,
  type OverviewFact,
  type OverviewSubOu,
} from "@/lib/market-overview-aggregate";

export type {
  OverviewFact,
  OverviewHospital,
  OverviewNamedValue,
  OverviewSubOu,
  OverviewTender,
} from "@/lib/market-overview-aggregate";

export const SUB_OU_ORDER = [
  "VS&D",
  "Endo Stapling",
  "Open Stapling",
  "Hernia",
  "Suture",
  "A&I",
  "ES",
] as const;

export type SubOuName = (typeof SUB_OU_ORDER)[number];

export type KeywordRule = {
  id: number;
  subOu: string;
  productGroup: string;
  keyword: string;
  excludes: string[];
  note: string;
};

export type OverviewFilters = WinningBidFilters & {
  subOu?: string;
  productGroup?: string;
};

const keywordRules = keywordMasterJson as KeywordRule[];
const OVERVIEW_MAX_PAGES_PER_SEED = 6;
const SEGMENT_PAGE_SIZE = 3;

// Portal search seeds keep the live request set bounded. Every returned record is
// then checked against all 196 approved include/exclude rules before aggregation.
const GROUP_SEARCH_SEEDS: Record<string, string[]> = {
  "Dao siêu âm": ["dao siêu âm"],
  "Dao hàn mạch": ["hàn mạch", "hàn mô"],
  "Dụng cụ khâu cắt nối nội soi": ["khâu cắt nối nội soi", "cắt khâu nối nội soi", "khâu cắt nội soi", "cắt khâu nội soi", "khâu nối nội soi"],
  "Băng ghim nội soi": ["băng ghim nội soi", "băng đạn nội soi", "reload nội soi", "cartridge nội soi"],
  "Dụng cụ khâu cắt nối mổ mở": ["khâu cắt nối mổ mở", "cắt khâu nối mổ mở", "khâu nối mổ mở", "khâu cắt mổ mở", "cắt nối mổ mở", "khâu thẳng mổ mở"],
  "Băng ghim mổ mở": ["băng ghim mổ mở", "băng đạn mổ mở", "ghim khâu máy mổ mở"],
  "Khâu nối tròn/vòng": ["khâu nối tròn", "khâu cắt nối tròn", "khâu nối vòng"],
  "Lưới thoát vị": ["lưới thoát vị", "mảnh ghép thoát vị"],
  "Dụng cụ cố định lưới thoát vị": ["cố định lưới thoát vị", "ghim cố định lưới"],
  "Chỉ phẫu thuật": ["chỉ phẫu thuật", "chỉ khâu", "chỉ tan", "chỉ không tan", "chỉ tiêu", "chỉ không tiêu"],
  Trocar: ["trocar"],
  "Túi đựng bệnh phẩm": ["túi đựng bệnh phẩm", "túi bệnh phẩm", "túi lấy bệnh phẩm", "túi thu hồi bệnh phẩm", "dụng cụ lấy bệnh phẩm"],
  "Túi bảo vệ vết mổ": ["bảo vệ vết mổ", "bảo vệ thành vết mổ", "bảo vệ nong vết mổ"],
  "Đơn cực": ["đơn cực"],
  "Kẹp lưỡng cực": ["lưỡng cực"],
  "Tấm điện cực trung tính": ["điện cực trung tính", "bản cực trung tính", "tấm lót điện cực thu hồi", "thu hồi điện cực"],
};

export function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function getKeywordCatalog() {
  return SUB_OU_ORDER.map((subOu) => ({
    subOu,
    productGroups: [...new Set(
      keywordRules
        .filter((rule) => rule.subOu === subOu)
        .map((rule) => rule.productGroup),
    )],
    keywords: keywordRules
      .filter((rule) => rule.subOu === subOu)
      .map((rule) => rule.keyword),
  }));
}

function searchableText(record: WinningBidRecord) {
  return normalizeSearchText([
    record.tenThietBi,
    record.kyMaHieu,
    record.nhanHieu,
    record.hangSanXuat,
    record.chungLoai,
    record.cauHinh,
    listText(record.winningName),
  ].filter(Boolean).join(" | "));
}

function classifyRecord(record: WinningBidRecord) {
  const text = searchableText(record);
  if (!text) return undefined;

  return keywordRules
    .filter((rule) => {
      const keyword = normalizeSearchText(rule.keyword);
      if (!text.includes(keyword)) return false;
      return !rule.excludes.some((exclude) => text.includes(normalizeSearchText(exclude)));
    })
    .sort((left, right) => right.keyword.length - left.keyword.length)[0];
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const source = String(value ?? "").trim().replace(/\s/g, "");
  if (!source) return 0;
  if (/^-?\d{1,3}([.,]\d{3})+$/.test(source)) return Number(source.replace(/[.,]/g, "")) || 0;
  return Number(source.replace(",", ".")) || 0;
}

function quantityOf(record: WinningBidRecord) {
  return toNumber(record.khoiLuongDouble ?? record.khoiLuong);
}

function valueOf(record: WinningBidRecord) {
  return quantityOf(record) * toNumber(record.donGia ?? record.donGiaDuThau);
}

function listText(value: string[] | string | undefined) {
  return Array.isArray(value) ? value.filter(Boolean).join("; ") : value || "";
}

function companyOf(record: WinningBidRecord) {
  const text = searchableText(record);
  return mappedCompanyName(text, record.hangSanXuat || "") || "Chưa xác định";
}

function recordKey(record: WinningBidRecord) {
  return record.id || [
    record.maTbmt,
    record.tenThietBi,
    record.kyMaHieu,
    record.chungLoai,
    record.donGia ?? record.donGiaDuThau,
    listText(record.winningName),
    record.tenCdtBmt,
  ].map((value) => normalizeSearchText(String(value ?? ""))).join("::");
}

function productKey(record: WinningBidRecord) {
  return normalizeSearchText(
    record.kyMaHieu || record.chungLoai || record.nhanHieu || record.tenThietBi || recordKey(record),
  );
}

function overviewRequestPlan(subOu: string, filters: OverviewFilters) {
  const requestedRules = keywordRules.filter((rule) =>
    rule.subOu === subOu &&
    (!filters.productGroup || filters.productGroup === "all" || rule.productGroup === filters.productGroup),
  );
  const productGroups = [...new Set(requestedRules.map((rule) => rule.productGroup))];
  const seeds = [...new Set(productGroups.flatMap((group) => GROUP_SEARCH_SEEDS[group] || [group]))];
  const portalFilters: WinningBidFilters = {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    hospital: filters.hospital,
    company: filters.company,
  };
  return { productGroups, seeds, portalFilters };
}

function overviewFacts(
  subOu: string,
  productGroups: string[],
  records: WinningBidRecord[],
): OverviewFact[] {
  return records.flatMap((record) => {
    const rule = classifyRecord(record);
    if (!rule || rule.subOu !== subOu || !productGroups.includes(rule.productGroup)) return [];
    const hospital = record.tenCdtBmt?.trim() || "Chưa xác định";
    return [{
      key: recordKey(record),
      company: companyOf(record),
      supplier: listText(record.winningName),
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
      units: quantityOf(record),
    }];
  });
}

async function collectSeeds(
  seeds: string[],
  filters: WinningBidFilters,
) {
  const records = new Map<string, WinningBidRecord>();
  const failedQueries: string[] = [];
  let sourceTotalElements = 0;
  let truncated = false;

  // Keep each overview request below a Worker-sized outbound request budget.
  // Broad groups such as Suture and ES can otherwise fan out into hundreds of
  // portal pages and fail in production even though they succeed locally.
  for (let start = 0; start < seeds.length; start += 2) {
    const batch = seeds.slice(start, start + 2);
    const results = await Promise.allSettled(
      batch.map((seed) => collectWinningBids(seed, filters, { maxPages: OVERVIEW_MAX_PAGES_PER_SEED })),
    );

    results.forEach((result, index) => {
      const seed = batch[index];
      if (result.status === "rejected") {
        failedQueries.push(seed);
        return;
      }
      sourceTotalElements += result.value.totalElements;
      truncated ||= result.value.truncated || result.value.nextPage !== undefined;
      result.value.records.forEach((record) => records.set(recordKey(record), record));
    });
    if (start + batch.length < seeds.length) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  return {
    records: [...records.values()],
    sourceTotalElements,
    truncated,
    failedQueries,
  };
}

export async function buildMarketOverviewSlice(
  subOu: string,
  filters: OverviewFilters,
): Promise<OverviewSubOu> {
  const { productGroups, seeds, portalFilters } = overviewRequestPlan(subOu, filters);
  const source = await collectSeeds(seeds, portalFilters);
  const facts = overviewFacts(subOu, productGroups, source.records);
  return aggregateOverviewFacts(subOu, facts, {
    sourceTotalElements: source.sourceTotalElements,
    truncated: source.truncated,
    failedQueries: source.failedQueries,
  });
}

export async function buildMarketOverviewSegment(
  subOu: string,
  filters: OverviewFilters,
  seedIndex: number,
  startPage: number,
) {
  const { productGroups, seeds, portalFilters } = overviewRequestPlan(subOu, filters);
  const seed = seeds[seedIndex];
  if (!seed) throw new Error("Invalid overview segment.");

  const result = await collectWinningBids(seed, portalFilters, {
    startPage,
    maxPages: SEGMENT_PAGE_SIZE,
  });

  return {
    seed,
    seedIndex,
    seedCount: seeds.length,
    startPage,
    nextPage: result.nextPage,
    facts: overviewFacts(subOu, productGroups, result.records),
    sourceTotalElements: startPage === 0 ? result.portalTotalElements : 0,
    truncated: result.truncated,
  };
}
