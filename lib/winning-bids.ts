const SEARCH_URL =
  "https://muasamcong.mpi.gov.vn/o/egp-portal-winning-bid-data/services/smart/search_prc";

const PAGE_SIZE = 1000;
const MAX_PAGES = 25;

export type WinningBidFilters = {
  dateFrom?: string;
  dateTo?: string;
  hospital?: string;
  brand?: string;
  supplier?: string;
  company?: string;
};

export type WinningBidRecord = {
  id?: string;
  tenThietBi?: string;
  donViTinh?: string;
  khoiLuongDouble?: number;
  khoiLuong?: number | string;
  xuatXu?: string;
  maHs?: string;
  kyMaHieu?: string;
  nhanHieu?: string;
  hangSanXuat?: string;
  chungLoai?: string;
  soLuuHanh?: string;
  namSanXuat?: string;
  cauHinh?: string;
  donGia?: number;
  donGiaDuThau?: number;
  winningCode?: string[] | string;
  winningName?: string[] | string;
  maTbmt?: string;
  maCdt?: string;
  tenCdtBmt?: string;
  bidForm?: string;
  ngayDangTaiKqlcnt?: string;
  soQuyetDinh?: string;
  ngayBanHanhQuyetDinh?: string;
  soNhaThauThamDu?: number;
  diaDiem?: Array<{
    wardName?: string;
    districtName?: string;
    provName?: string;
  }>;
};

type PortalPage = {
  content: WinningBidRecord[];
  totalElements?: number;
  totalPages?: number;
};

function portalFilters(filters: WinningBidFilters) {
  const result: Array<Record<string, unknown>> = [];

  if (filters.dateFrom || filters.dateTo) {
    result.push({
      fieldName: "ngay_dang_tai_kqlcnt",
      searchType: "range",
      from: filters.dateFrom ? `${filters.dateFrom}T00:00:00.000Z` : null,
      to: filters.dateTo ? `${filters.dateTo}T23:59:59.999Z` : null,
    });
  }

  result.push(
    { fieldName: "type", searchType: "in", fieldValues: ["HANG_HOA"] },
    { fieldName: "tab", searchType: "in", fieldValues: ["THIET_BI_VAT_TU_Y_TE"] },
  );

  return result;
}

function companySearch(company: string | undefined) {
  const searches: Record<string, string> = {
    medtronic: "Covidien Medtronic",
    ethicon: "Johnson Ethicon Harmonic",
    applied: "Applied Medical",
    bbraun: "B Braun Aesculap",
    olympus: "Olympus",
    miconvey: "Miconvey",
    innolcon: "Innolcon",
  };
  return company ? searches[company] : undefined;
}

function queryClause(
  keyword: string,
  matchFields: string[],
  filters: WinningBidFilters,
  matchType = "all-1",
) {
  return {
    index: "es-smart-pricing",
    keyWord: keyword,
    keyWordNotMatch: "",
    matchType,
    matchFields,
    filters: portalFilters(filters),
  };
}

function buildPayload(keyword: string, pageNumber: number, filters: WinningBidFilters) {
  const queries = [
    queryClause(
      keyword,
      ["ten_thiet_bi", "ma_hs", "xuat_xu", "ma_tbmt", "ky_ma_hieu", "nhan_hieu", "hang_san_xuat"],
      filters,
    ),
  ];

  if (filters.hospital) {
    queries.push(queryClause(filters.hospital, ["ten_cdt_bmt", "ma_cdt"], filters));
  }
  if (filters.brand) {
    queries.push(queryClause(filters.brand, ["nhan_hieu", "hang_san_xuat"], filters));
  }
  if (filters.supplier) {
    queries.push(queryClause(filters.supplier, ["winning_name", "winning_code"], filters));
  }
  const company = companySearch(filters.company);
  if (company) {
    queries.push(queryClause(company, ["ten_thiet_bi", "nhan_hieu", "hang_san_xuat", "ky_ma_hieu"], filters, "any-1"));
  }

  return [
    {
      pageSize: PAGE_SIZE,
      pageNumber,
      query: queries,
    },
  ];
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchPage(keyword: string, pageNumber: number, filters: WinningBidFilters, attempt = 1): Promise<PortalPage> {
  const response = await fetch(SEARCH_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Origin: "https://muasamcong.mpi.gov.vn",
      Referer: "https://muasamcong.mpi.gov.vn/web/guest/winning-bid-data",
    },
    body: JSON.stringify(buildPayload(keyword, pageNumber, filters)),
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });

  if (!response.ok) {
    if (attempt < 3 && (response.status === 429 || response.status >= 500)) {
      await wait(attempt * 750);
      return fetchPage(keyword, pageNumber, filters, attempt + 1);
    }

    throw new Error(`Portal request failed with status ${response.status}.`);
  }

  const data = (await response.json()) as { page?: PortalPage };

  if (!data.page || !Array.isArray(data.page.content)) {
    throw new Error("The procurement portal returned an unexpected response.");
  }

  return data.page;
}

export async function collectWinningBids(keyword: string, filters: WinningBidFilters = {}) {
  const firstPage = await fetchPage(keyword, 0, filters);
  const totalPages = Math.min(firstPage.totalPages ?? 1, MAX_PAGES);
  const records = [...firstPage.content];

  for (let pageNumber = 1; pageNumber < totalPages; pageNumber += 1) {
    await wait(200);
    const page = await fetchPage(keyword, pageNumber, filters);
    records.push(...page.content);
  }

  return {
    records,
    totalElements: firstPage.totalElements ?? records.length,
    totalPages: firstPage.totalPages ?? 1,
    truncated: (firstPage.totalPages ?? 1) > MAX_PAGES,
  };
}
