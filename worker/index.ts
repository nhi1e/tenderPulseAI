/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

const PORTAL_SEARCH_URL =
  "https://muasamcong.mpi.gov.vn/o/egp-portal-winning-bid-data/services/smart/search_prc";
const PORTAL_CACHE_SECONDS = 30 * 60;

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

type PortalFilters = {
  dateFrom?: string;
  dateTo?: string;
  hospital?: string;
  brand?: string;
  supplier?: string;
  company?: string;
};

function clean(value: string | null, max = 200) {
  return String(value || "").trim().slice(0, max);
}

function companySearch(company: string | undefined) {
  const searches: Record<string, string> = {
    medtronic: "Covidien Medtronic LigaSure",
    ethicon: "Johnson Ethicon Harmonic",
    applied: "Applied Medical",
    bbraun: "B Braun Aesculap",
    olympus: "Olympus",
    miconvey: "Miconvey",
    innolcon: "Innolcon",
  };
  return company ? searches[company] : undefined;
}

function portalFilters(filters: PortalFilters) {
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

function queryClause(keyword: string, matchFields: string[], filters: PortalFilters, matchType = "all-1") {
  return {
    index: "es-smart-pricing",
    keyWord: keyword,
    keyWordNotMatch: "",
    matchType,
    matchFields,
    filters: portalFilters(filters),
  };
}

function portalPayload(keyword: string, pageNumber: number, pageSize: number, filters: PortalFilters) {
  const queries = [queryClause(
    keyword,
    ["ten_thiet_bi", "ma_hs", "xuat_xu", "ma_tbmt", "ky_ma_hieu", "nhan_hieu", "hang_san_xuat"],
    filters,
  )];
  if (filters.hospital) queries.push(queryClause(filters.hospital, ["ten_cdt_bmt", "ma_cdt"], filters));
  if (filters.brand) queries.push(queryClause(filters.brand, ["nhan_hieu", "hang_san_xuat"], filters));
  if (filters.supplier) queries.push(queryClause(filters.supplier, ["winning_name", "winning_code"], filters));
  const company = companySearch(filters.company);
  if (company) queries.push(queryClause(company, ["ten_thiet_bi", "nhan_hieu", "hang_san_xuat", "ky_ma_hieu"], filters, "any-1"));
  return [{ pageSize, pageNumber, query: queries }];
}

async function fetchPortalPage(body: string, attempt = 1): Promise<Response> {
  const response = await fetch(PORTAL_SEARCH_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Origin: "https://muasamcong.mpi.gov.vn",
      Referer: "https://muasamcong.mpi.gov.vn/web/guest/winning-bid-data",
    },
    body,
    signal: AbortSignal.timeout(25_000),
  });
  if (attempt < 3 && (response.status === 429 || response.status >= 500)) {
    await response.body?.cancel();
    await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    return fetchPortalPage(body, attempt + 1);
  }
  return response;
}

async function handlePortalPage(request: Request, ctx: ExecutionContext) {
  if (request.method !== "GET") {
    return Response.json({ error: "Method not allowed." }, { status: 405 });
  }
  const url = new URL(request.url);
  const keyword = clean(url.searchParams.get("keyword"), 120);
  const page = Math.max(0, Math.floor(Number(url.searchParams.get("page")) || 0));
  const pageSize = Math.max(50, Math.min(1000, Math.floor(Number(url.searchParams.get("pageSize")) || 1000)));
  const forceRefresh = url.searchParams.get("refresh") === "1";
  const filters: PortalFilters = {
    dateFrom: clean(url.searchParams.get("dateFrom"), 10),
    dateTo: clean(url.searchParams.get("dateTo"), 10),
    hospital: clean(url.searchParams.get("hospital")),
    brand: clean(url.searchParams.get("brand")),
    supplier: clean(url.searchParams.get("supplier")),
    company: clean(url.searchParams.get("company"), 30),
  };
  if (!keyword) return Response.json({ error: "Vui lòng nhập từ khóa sản phẩm." }, { status: 400 });
  if ((filters.dateFrom && !/^\d{4}-\d{2}-\d{2}$/.test(filters.dateFrom)) ||
      (filters.dateTo && !/^\d{4}-\d{2}-\d{2}$/.test(filters.dateTo))) {
    return Response.json({ error: "Khoảng thời gian không hợp lệ." }, { status: 400 });
  }

  const canonicalUrl = new URL(url);
  canonicalUrl.searchParams.delete("refresh");
  const cacheKey = new Request(canonicalUrl.toString(), { method: "GET" });
  const cache = (caches as unknown as { default?: Cache }).default;
  if (!forceRefresh && cache) {
    const cached = await cache.match(cacheKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set("X-TenderPulse-Cache", "HIT");
      return new Response(cached.body, { status: cached.status, headers });
    }
  }

  try {
    const portalResponse = await fetchPortalPage(JSON.stringify(portalPayload(keyword, page, pageSize, filters)));
    if (!portalResponse.ok || !portalResponse.body) {
      await portalResponse.body?.cancel();
      return Response.json({ error: `Portal request failed with status ${portalResponse.status}.` }, { status: 502 });
    }
    const headers = new Headers();
    headers.set("Content-Type", portalResponse.headers.get("Content-Type") || "application/json; charset=utf-8");
    headers.set("Cache-Control", `public, max-age=60, s-maxage=${PORTAL_CACHE_SECONDS}`);
    headers.set("X-TenderPulse-Cache", "MISS");
    const response = new Response(portalResponse.body, { status: 200, headers });
    if (cache) ctx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
    return response;
  } catch (error) {
    console.error("Portal page proxy failed", error);
    return Response.json({ error: "Không thể kết nối với Cổng Mua Sắm Công." }, { status: 502 });
  }
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/portal-search-page") {
      return handlePortalPage(request, ctx);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
