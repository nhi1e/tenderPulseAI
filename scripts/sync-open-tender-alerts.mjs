import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { classificationRules } from "../lib/classification-rules.ts";
import {
  buildOpenTenderSearchPayload,
  diffOpenTenderNotices,
  normalizePortalNotice,
  normalizeSearchTerms,
} from "../lib/open-tender-alerts.mjs";

const PORTAL_ORIGIN = "https://muasamcong.mof.gov.vn";
const SEARCH_URL = `${PORTAL_ORIGIN}/o/egp-portal-contractor-selection-v2/services/smart/search?token=`;
const OUTPUT_ROOT = path.resolve(process.env.TENDERPULSE_OPEN_TENDER_ALERTS_ROOT || "public/data/open-tender-alerts");
const STATE_PATH = path.resolve(process.env.TENDERPULSE_OPEN_TENDER_ALERTS_STATE || "data/open-tender-alerts/state.json");
const ALERTS_PATH = path.join(OUTPUT_ROOT, "alerts.json");
const PAGE_LIMIT = 100;

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}

const lookbackDays = Math.max(1, Math.min(30, Number(option("--lookback", "7")) || 7));
const concurrency = Math.max(1, Math.min(6, Number(option("--concurrency", "4")) || 4));
const forceBaseline = process.argv.includes("--baseline");
// One-time historical population: make currently active notices posted in the
// lookback window visible as alerts, then persist them as seen so later daily
// runs only report new or changed notices. A normal first run stays silent.
const backfill = process.argv.includes("--backfill");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

async function atomicWrite(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temp, file);
}

async function fetchPage(keyword, pageNumber, from, to, attempt = 1) {
  const response = await fetch(SEARCH_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json; charset=utf-8",
      Origin: PORTAL_ORIGIN,
      Referer: `${PORTAL_ORIGIN}/vi/web/guest/contractor-selection`,
    },
    body: JSON.stringify(buildOpenTenderSearchPayload(keyword, pageNumber, from, to)),
    // A redirect can silently turn this POST into a GET, which the portal
    // rejects with 405 and hides the original redirect target.
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("Location") || "(no Location header)";
    throw new Error(`Portal search redirected (${response.status}) for “${keyword}”, page ${pageNumber}: ${location}`);
  }
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 400);
    if (attempt < 4 && (response.status === 429 || response.status >= 500)) {
      await sleep(attempt * 750);
      return fetchPage(keyword, pageNumber, from, to, attempt + 1);
    }
    throw new Error(`Portal search failed (${response.status}) for “${keyword}”, page ${pageNumber}: ${detail}`);
  }
  const data = await response.json();
  if (!data?.page || !Array.isArray(data.page.content)) {
    throw new Error(`Portal returned an unexpected search response for “${keyword}”, page ${pageNumber}.`);
  }
  return data.page;
}

async function queryKeyword(keyword, from, to) {
  const first = await fetchPage(keyword, 0, from, to);
  const totalPages = Math.max(1, Number(first.totalPages) || 1);
  if (totalPages > PAGE_LIMIT) {
    throw new Error(`Portal reported ${totalPages} pages for “${keyword}”; refusing to save an incomplete alert scan.`);
  }
  const pages = [first];
  for (let pageNumber = 1; pageNumber < totalPages; pageNumber += 1) {
    pages.push(await fetchPage(keyword, pageNumber, from, to));
  }
  return pages.flatMap((page) => page.content.map((record) => normalizePortalNotice(record, [keyword])).filter(Boolean));
}

async function mapConcurrent(values, limit, fn) {
  const results = new Array(values.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= values.length) return;
      results[index] = await fn(values[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

async function main() {
  const generatedAt = new Date().toISOString();
  const previousState = await readJson(STATE_PATH);
  const isBaseline = forceBaseline || (!previousState?.lastSuccessfulSync && !backfill);
  const searchTerms = normalizeSearchTerms(classificationRules);
  const from = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
  const to = generatedAt;
  const notices = new Map();

  console.info(`[TenderPulse:open-tenders] scan start`, {
    terms: searchTerms.length,
    lookbackDays,
    from,
    to,
    concurrency,
    mode: isBaseline ? "baseline" : "incremental",
  });

  let completed = 0;
  const termResults = await mapConcurrent(searchTerms, concurrency, async (keyword) => {
    const rows = await queryKeyword(keyword, from, to);
    completed += 1;
    console.info(`[TenderPulse:open-tenders] keyword complete`, { completed, total: searchTerms.length, keyword, rows: rows.length });
    return rows;
  });

  for (const rows of termResults) {
    for (const notice of rows) {
      const current = notices.get(notice.noticeId);
      if (current) {
        notices.set(notice.noticeId, normalizePortalNotice({
          notifyNo: current.notifyNo,
          notifyId: current.notifyId,
          notifyNoStand: current.noticeId,
          bidName: current.title,
          investorName: current.buyer,
          investorCode: current.buyerCode,
          publicDate: current.publishedAt,
          bidCloseDate: current.bidCloseAt,
          bidForm: current.bidForm,
          bidPrice: current.bidPrice,
          locations: current.location ? [{ districtName: current.location }] : [],
        }, [...current.matchedKeywords, ...notice.matchedKeywords]));
      } else {
        notices.set(notice.noticeId, notice);
      }
    }
  }

  const { seen, events } = diffOpenTenderNotices([...notices.values()], previousState, generatedAt, isBaseline);
  const eventHistory = [
    ...(Array.isArray(previousState?.alertHistory) ? previousState.alertHistory : []),
    ...events,
  ].filter((event) => Date.parse(generatedAt) - Date.parse(event.detectedAt) <= 90 * 24 * 60 * 60 * 1000)
    .sort((left, right) => right.detectedAt.localeCompare(left.detectedAt))
    .slice(0, 2_000);

  const nextState = { schemaVersion: 1, lastSuccessfulSync: generatedAt, seen, alertHistory: eventHistory };
  const feed = {
    schemaVersion: 1,
    generatedAt,
    baseline: isBaseline,
    lookbackDays,
    searchTerms: searchTerms.length,
    activeNoticesMatched: notices.size,
    newNotices: events.filter((event) => event.kind === "new").length,
    updatedNotices: events.filter((event) => event.kind === "updated").length,
    items: eventHistory,
  };

  await atomicWrite(STATE_PATH, nextState);
  await atomicWrite(ALERTS_PATH, feed);
  console.info(`[TenderPulse:open-tenders] scan complete`, {
    activeNoticesMatched: notices.size,
    newNotices: feed.newNotices,
    updatedNotices: feed.updatedNotices,
    history: eventHistory.length,
    baseline: isBaseline,
  });
}

main().catch((error) => {
  console.error("[TenderPulse:open-tenders] scan failed", error);
  process.exitCode = 1;
});
