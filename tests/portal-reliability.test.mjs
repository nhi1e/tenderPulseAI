import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const worker = await readFile(path.join(root, "worker", "index.ts"), "utf8");
const page = await readFile(path.join(root, "app", "page.tsx"), "utf8");

test("keeps a bounded portal timeout after narrowing expensive searches", () => {
  assert.match(worker, /PORTAL_REQUEST_TIMEOUT_MS\s*=\s*25_000/);
  assert.match(worker, /AbortSignal\.timeout\(PORTAL_REQUEST_TIMEOUT_MS\)/);
  assert.match(worker, /code: "PORTAL_TIMEOUT"/);
  assert.match(worker, /status: 504/);
});

test("retries transient portal proxy failures once in the browser", () => {
  assert.match(page, /const maxAttempts = 2/);
  assert.match(page, /response\.status === 429 \|\| response\.status === 502 \|\| response\.status === 503/);
  assert.doesNotMatch(page, /response\.status === 504/);
});

test("resumes an incomplete overview from cached successful Sub-OUs", () => {
  assert.match(page, /const pendingTargets = targets\.filter/);
  assert.match(page, /writeOverviewCache\(nextFilters/);
  assert.match(page, /pendingTargets\.length/);
});

test("emits structured timing logs for portal pages, seeds, and Sub-OUs", () => {
  assert.match(worker, /\[TenderPulse:\$\{requestId\}\] proxy request/);
  assert.match(worker, /X-TenderPulse-Portal-Ms/);
  assert.match(page, /\[TenderPulse\] page response/);
  assert.match(page, /\[TenderPulse\] seed complete/);
  assert.match(page, /\[TenderPulse\] Sub-OU complete/);
  assert.match(page, /\[TenderPulse\] overview load complete/);
});

test("loads independent overview seeds with bounded concurrency", () => {
  assert.match(page, /const seedConcurrency = Math\.min\(2, seeds\.length\)/);
  assert.match(page, /Promise\.all\(Array\.from\(\{ length: seedConcurrency \}, \(\) => runSeedWorker\(\)\)\)/);
  assert.match(page, /classification rules, page limit, deduplication, or final aggregation/);
});

test("prefers the daily snapshot and reloads it without forcing live portal searches", () => {
  assert.match(page, /loadOverviewFactsFromSnapshot\(subOu, nextFilters\)/);
  assert.match(page, /if \(!forceRefresh\)/);
  assert.match(page, /Sub-OU loaded from daily snapshot/);
  assert.match(page, /tenderpulse\.overview-session-cache\.v16/);
  assert.match(page, /readMarketSnapshotManifest\(fetch, true\)/);
  assert.match(page, /loadOverview\(filters, catalog, false, true\)/);
  assert.match(page, /Reload snapshot/);
  assert.doesNotMatch(page, /onClick=\{\(\) => void loadOverview\(filters, catalog, true\)\}/);
});

test("enforces the public data boundary of January 1, 2023", () => {
  assert.match(worker, /MARKET_DATA_AVAILABLE_FROM = "2023-01-01"/);
  assert.match(worker, /filters\.dateFrom < MARKET_DATA_AVAILABLE_FROM/);
  assert.match(page, /const marketDataStartDate = new Date\(2023, 0, 1\)/);
  assert.match(page, /captionLayout="dropdown"/);
  assert.match(page, /startMonth=\{marketDataStartDate\}/);
  assert.doesNotMatch(page, /type="date"/);
  assert.match(page, /boundedSearchFilters\(filters\)/);
  assert.match(page, /boundedOverviewFilters\(draft\)/);
});
