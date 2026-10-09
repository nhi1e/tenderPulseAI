/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { alertsFromDailyChanges, type TenderAlert, type TenderAlertSource } from "@/lib/tender-alerts";

const PORTAL_SEARCH_URL =
  "https://muasamcong.mpi.gov.vn/o/egp-portal-winning-bid-data/services/smart/search_prc";
const MARKET_DATA_AVAILABLE_FROM = "2023-01-01";
const PORTAL_CACHE_SECONDS = 30 * 60;
// Keep a bounded request time. Retrieval seeds are intentionally specific so
// normal portal searches should complete below this boundary; a timeout is
// surfaced separately instead of silently waiting and retrying for 45+ seconds.
const PORTAL_REQUEST_TIMEOUT_MS = 25_000;

interface Env {
  ASSETS: Fetcher;
  DB?: D1Database;
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

function portalFilters(filters: PortalFilters) {
  const result: Array<Record<string, unknown>> = [];
  if (filters.dateFrom || filters.dateTo) {
    result.push({
      // Staff confirmed that dashboard periods follow the decision date, not
      // the publication date. Both dates are still retained in Excel exports.
      fieldName: "ngay_ban_hanh_quyet_dinh",
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
    ["ten_thiet_bi", "ma_hs", "xuat_xu", "ma_tbmt", "ky_ma_hieu", "nhan_hieu", "hang_san_xuat", "cau_hinh"],
    filters,
  )];
  if (filters.hospital) queries.push(queryClause(filters.hospital, ["ten_cdt_bmt", "ma_cdt"], filters));
  if (filters.brand) queries.push(queryClause(filters.brand, ["nhan_hieu", "hang_san_xuat"], filters));
  if (filters.supplier) queries.push(queryClause(filters.supplier, ["winning_name", "winning_code"], filters));
  // Company is filtered after collection using the approved manufacturer alias
  // workbook. Sending the display name to the portal would omit rows stored under
  // source aliases such as Covidien, Nypro or Jabil.
  return [{ pageSize, pageNumber, query: queries }];
}

async function fetchPortalPage(
  body: string,
  debug: { requestId: string; keyword: string; page: number },
  attempt = 1,
): Promise<Response> {
  const startedAt = Date.now();
  console.info(`[TenderPulse:${debug.requestId}] portal fetch start`, {
    keyword: debug.keyword,
    page: debug.page,
    attempt,
  });
  const response = await fetch(PORTAL_SEARCH_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Origin: "https://muasamcong.mpi.gov.vn",
      Referer: "https://muasamcong.mpi.gov.vn/web/guest/winning-bid-data",
    },
    body,
    signal: AbortSignal.timeout(PORTAL_REQUEST_TIMEOUT_MS),
  });
  console.info(`[TenderPulse:${debug.requestId}] portal fetch response`, {
    keyword: debug.keyword,
    page: debug.page,
    attempt,
    status: response.status,
    elapsedMs: Date.now() - startedAt,
  });
  if (attempt < 3 && (response.status === 429 || response.status >= 500)) {
    await response.body?.cancel();
    await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    return fetchPortalPage(body, debug, attempt + 1);
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
  const requestId = crypto.randomUUID().slice(0, 8);
  const requestStartedAt = Date.now();
  const filters: PortalFilters = {
    dateFrom: clean(url.searchParams.get("dateFrom"), 10),
    dateTo: clean(url.searchParams.get("dateTo"), 10),
    hospital: clean(url.searchParams.get("hospital")),
    brand: clean(url.searchParams.get("brand")),
    supplier: clean(url.searchParams.get("supplier")),
    company: clean(url.searchParams.get("company"), 180),
  };
  if (!keyword) return Response.json({ error: "Vui lòng nhập từ khóa sản phẩm." }, { status: 400 });
  if ((filters.dateFrom && !/^\d{4}-\d{2}-\d{2}$/.test(filters.dateFrom)) ||
      (filters.dateTo && !/^\d{4}-\d{2}-\d{2}$/.test(filters.dateTo))) {
    return Response.json({ error: "Khoảng thời gian không hợp lệ." }, { status: 400 });
  }
  filters.dateFrom = !filters.dateFrom || filters.dateFrom < MARKET_DATA_AVAILABLE_FROM
    ? MARKET_DATA_AVAILABLE_FROM
    : filters.dateFrom;
  if (filters.dateTo && filters.dateTo < MARKET_DATA_AVAILABLE_FROM) {
    filters.dateTo = MARKET_DATA_AVAILABLE_FROM;
  }
  url.searchParams.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) url.searchParams.set("dateTo", filters.dateTo);

  const canonicalUrl = new URL(url);
  canonicalUrl.searchParams.delete("refresh");
  const cacheKey = new Request(canonicalUrl.toString(), { method: "GET" });
  const cache = (caches as unknown as { default?: Cache }).default;
  console.info(`[TenderPulse:${requestId}] proxy request`, {
    keyword,
    page,
    pageSize,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
    hospitalFilter: Boolean(filters.hospital),
    brandFilter: Boolean(filters.brand),
    supplierFilter: Boolean(filters.supplier),
    forceRefresh,
  });
  if (!forceRefresh && cache) {
    const cached = await cache.match(cacheKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set("X-TenderPulse-Cache", "HIT");
      headers.set("X-TenderPulse-Request", requestId);
      console.info(`[TenderPulse:${requestId}] cache hit`, {
        keyword,
        page,
        elapsedMs: Date.now() - requestStartedAt,
      });
      return new Response(cached.body, { status: cached.status, headers });
    }
  }

  try {
    const portalResponse = await fetchPortalPage(
      JSON.stringify(portalPayload(keyword, page, pageSize, filters)),
      { requestId, keyword, page },
    );
    if (!portalResponse.ok || !portalResponse.body) {
      await portalResponse.body?.cancel();
      console.error(`[TenderPulse:${requestId}] portal rejected request`, {
        keyword,
        page,
        status: portalResponse.status,
        elapsedMs: Date.now() - requestStartedAt,
      });
      return Response.json({ error: `Portal request failed with status ${portalResponse.status}.` }, { status: 502 });
    }
    const portalElapsedMs = Date.now() - requestStartedAt;
    const headers = new Headers();
    headers.set("Content-Type", portalResponse.headers.get("Content-Type") || "application/json; charset=utf-8");
    headers.set("Cache-Control", `public, max-age=60, s-maxage=${PORTAL_CACHE_SECONDS}`);
    headers.set("X-TenderPulse-Cache", "MISS");
    headers.set("X-TenderPulse-Request", requestId);
    headers.set("X-TenderPulse-Portal-Ms", String(portalElapsedMs));
    headers.set("Server-Timing", `portal;dur=${portalElapsedMs}`);
    console.info(`[TenderPulse:${requestId}] proxy response ready`, {
      keyword,
      page,
      status: 200,
      cache: "MISS",
      elapsedMs: portalElapsedMs,
    });
    const response = new Response(portalResponse.body, { status: 200, headers });
    if (cache) ctx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
    return response;
  } catch (error) {
    console.error(`[TenderPulse:${requestId}] portal proxy failed`, {
      keyword,
      page,
      elapsedMs: Date.now() - requestStartedAt,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    });
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      return Response.json({
        error: "Cổng Mua Sắm Công phản hồi quá chậm cho truy vấn này.",
        code: "PORTAL_TIMEOUT",
      }, { status: 504 });
    }
    return Response.json({ error: "Không thể kết nối với Cổng Mua Sắm Công." }, { status: 502 });
  }
}

function alertDatabaseError(error: unknown) {
  console.error("[TenderPulse:alerts] database request failed", error);
  const message = error instanceof Error ? error.message : String(error);
  const setupRequired = message.includes("no such table") || message.includes("D1_ERROR");
  return Response.json({
    error: setupRequired
      ? "Alert database migrations have not been applied."
      : "Alert database is temporarily unavailable.",
    code: setupRequired ? "ALERT_DATABASE_NOT_READY" : "ALERT_DATABASE_ERROR",
  }, { status: 503 });
}

function alertPayloadFromRow(row: Record<string, unknown>) {
  try {
    const payload = JSON.parse(String(row.payload_json || "{}")) as TenderAlert;
    return {
      ...payload,
      id: String(row.id || payload.id),
      kind: String(row.kind || payload.kind),
      detectedAt: String(row.detected_at || payload.detectedAt),
      readAt: row.read_at ? String(row.read_at) : null,
    };
  } catch {
    return undefined;
  }
}

async function handleAlerts(request: Request, env: Env) {
  if (request.method !== "GET") return Response.json({ error: "Method not allowed." }, { status: 405 });
  if (!env.DB) return Response.json({ error: "Alert database is not configured.", code: "ALERT_DATABASE_NOT_CONFIGURED" }, { status: 503 });
  const url = new URL(request.url);
  const readerId = clean(url.searchParams.get("reader"), 120);
  const limit = Math.max(1, Math.min(200, Math.floor(Number(url.searchParams.get("limit")) || 100)));
  const unreadOnly = url.searchParams.get("unread") === "1";
  if (!readerId) return Response.json({ error: "reader is required." }, { status: 400 });
  const unreadClause = unreadOnly ? "AND r.alert_id IS NULL" : "";
  try {
    await ingestLatestSnapshotAlerts(env);
    const [feed, count] = await env.DB.batch([
      env.DB.prepare(`
        SELECT a.id, a.kind, a.detected_at, a.payload_json, r.read_at
        FROM tender_alerts a
        LEFT JOIN alert_reads r ON r.alert_id = a.id AND r.reader_id = ?
        WHERE 1 = 1 ${unreadClause}
        ORDER BY a.detected_at DESC, a.id DESC
        LIMIT ?
      `).bind(readerId, limit),
      env.DB.prepare(`
        SELECT COUNT(*) AS count
        FROM tender_alerts a
        LEFT JOIN alert_reads r ON r.alert_id = a.id AND r.reader_id = ?
        WHERE r.alert_id IS NULL
      `).bind(readerId),
    ]);
    const alerts = (feed.results || [])
      .map((row) => alertPayloadFromRow(row as Record<string, unknown>))
      .filter((alert): alert is TenderAlert => Boolean(alert));
    const unreadCount = Number((count.results?.[0] as Record<string, unknown> | undefined)?.count || 0);
    return Response.json({ alerts, unreadCount, source: "d1" }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return alertDatabaseError(error);
  }
}

async function handleAlertRead(request: Request, env: Env) {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed." }, { status: 405 });
  if (!env.DB) return Response.json({ error: "Alert database is not configured.", code: "ALERT_DATABASE_NOT_CONFIGURED" }, { status: 503 });
  try {
    const body = await request.json() as { readerId?: string; alertIds?: string[]; all?: boolean };
    const readerId = clean(body.readerId || "", 120);
    if (!readerId) return Response.json({ error: "readerId is required." }, { status: 400 });
    const readAt = new Date().toISOString();
    if (body.all) {
      await env.DB.prepare(`
        INSERT OR REPLACE INTO alert_reads (alert_id, reader_id, read_at)
        SELECT id, ?, ? FROM tender_alerts
      `).bind(readerId, readAt).run();
      return Response.json({ ok: true, readAt });
    }
    const alertIds = [...new Set((Array.isArray(body.alertIds) ? body.alertIds : [])
      .map((value) => clean(String(value), 300)).filter(Boolean))].slice(0, 200);
    if (!alertIds.length) return Response.json({ error: "alertIds is required." }, { status: 400 });
    await env.DB.batch(alertIds.map((alertId) => env.DB!.prepare(`
      INSERT OR REPLACE INTO alert_reads (alert_id, reader_id, read_at) VALUES (?, ?, ?)
    `).bind(alertId, readerId, readAt)));
    return Response.json({ ok: true, readAt });
  } catch (error) {
    return alertDatabaseError(error);
  }
}

async function readAlertAsset<T>(env: Env, pathname: string): Promise<T | undefined> {
  const response = await env.ASSETS.fetch(new Request(`https://tenderpulse-assets.local${pathname}`));
  if (!response.ok) return undefined;
  return response.json() as Promise<T>;
}

async function ingestLatestSnapshotAlerts(env: Env) {
  if (!env.DB) return 0;
  const manifest = await readAlertAsset<{
    lastSync?: { mode?: string };
    generatedAt?: string | null;
  }>(env, "/data/market-snapshot/manifest.json");
  // Ignore full/import baselines so the first deployment does not generate
  // alerts for the entire history.
  if (!manifest?.generatedAt || manifest.lastSync?.mode !== "incremental") return 0;
  const previousRun = await env.DB.prepare(
    "SELECT generated_at FROM alert_sync_runs WHERE generated_at = ? LIMIT 1",
  ).bind(manifest.generatedAt).first();
  if (previousRun) return 0;

  const changes = await readAlertAsset<{
    generatedAt?: string;
    new?: TenderAlertSource[];
    changed?: TenderAlertSource[];
  }>(env, "/data/market-snapshot/daily-changes.json");
  if (!changes?.generatedAt || changes.generatedAt !== manifest.generatedAt) return 0;
  const newRows = Array.isArray(changes.new) ? changes.new : [];
  const changedRows = Array.isArray(changes.changed) ? changes.changed : [];
  const alerts = alertsFromDailyChanges(changes);
  const rows = alerts.map((alert) => ({
    id: alert.id,
    sourceKey: alert.key,
    kind: alert.kind,
    contentHash: alert.contentHash,
    detectedAt: alert.detectedAt,
    syncGeneratedAt: changes.generatedAt,
    subOu: alert.subOu,
    productGroup: alert.productGroup,
    hospital: alert.hospital,
    buyerId: alert.buyerId,
    productName: alert.productName,
    company: alert.company,
    tenderNotice: alert.tenderNotice,
    decisionDate: alert.decisionDate,
    payloadJson: JSON.stringify(alert),
  }));
  const chunks = Array.from({ length: Math.ceil(rows.length / 25) }, (_, index) => rows.slice(index * 25, (index + 1) * 25));
  const statements = chunks.map((chunk) => env.DB!.prepare(`
    INSERT OR IGNORE INTO tender_alerts (
      id, source_key, kind, content_hash, detected_at, sync_generated_at,
      sub_ou, product_group, hospital, buyer_id, product_name, company,
      tender_notice, decision_date, payload_json
    )
    SELECT
      json_extract(value, '$.id'), json_extract(value, '$.sourceKey'),
      json_extract(value, '$.kind'), json_extract(value, '$.contentHash'),
      json_extract(value, '$.detectedAt'), json_extract(value, '$.syncGeneratedAt'),
      json_extract(value, '$.subOu'), json_extract(value, '$.productGroup'),
      json_extract(value, '$.hospital'), json_extract(value, '$.buyerId'),
      json_extract(value, '$.productName'), json_extract(value, '$.company'),
      json_extract(value, '$.tenderNotice'), json_extract(value, '$.decisionDate'),
      json_extract(value, '$.payloadJson')
    FROM json_each(?)
  `).bind(JSON.stringify(chunk)));
  const results = statements.length ? await env.DB.batch(statements) : [];
  const inserted = results.reduce((total, result) => total + Number(result.meta?.changes || 0), 0);
  await env.DB.prepare(`
    INSERT OR IGNORE INTO alert_sync_runs (generated_at, received_at, new_records, changed_records, inserted_alerts)
    VALUES (?, ?, ?, ?, ?)
  `).bind(changes.generatedAt, new Date().toISOString(), newRows.length, changedRows.length, inserted).run();
  console.info("[TenderPulse:alerts] incremental snapshot ingested", {
    generatedAt: changes.generatedAt,
    received: alerts.length,
    inserted,
  });
  return inserted;
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

    if (url.pathname === "/api/alerts") {
      return handleAlerts(request, env);
    }

    if (url.pathname === "/api/alerts/read") {
      return handleAlertRead(request, env);
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
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(ingestLatestSnapshotAlerts(env).catch((error) => {
      console.error("[TenderPulse:alerts] scheduled ingestion failed", error);
    }));
  },
};

export default worker;
