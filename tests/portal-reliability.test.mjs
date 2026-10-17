import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const worker = await readFile(path.join(root, "worker", "index.ts"), "utf8");
const snapshotCollector = await readFile(path.join(root, "scripts", "sync-market-snapshot.ts"), "utf8");
const page = await readFile(path.join(root, "app", "page.tsx"), "utf8");
const workflow = await readFile(path.join(root, ".github", "workflows", "update-market-snapshot.yml"), "utf8");

test("uses the current Mua Sắm Công host for winning-bid API requests", () => {
  for (const source of [worker, snapshotCollector]) {
    assert.match(source, /https:\/\/muasamcong\.mof\.gov\.vn\/o\/egp-portal-winning-bid-data\/services\/smart\/search_prc/);
    assert.match(source, /Origin: "https:\/\/muasamcong\.mof\.gov\.vn"/);
    assert.match(source, /Referer: "https:\/\/muasamcong\.mof\.gov\.vn/);
    assert.doesNotMatch(source, /muasamcong\.mpi\.gov\.vn/);
  }
});

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

test("includes upstream portal status and request ID in failure diagnostics", () => {
  assert.match(worker, /code: "PORTAL_UPSTREAM_HTTP_ERROR"/);
  assert.match(worker, /portalStatus: portalResponse\.status/);
  assert.match(worker, /X-TenderPulse-Request": requestId/);
  assert.match(page, /portalStatus: data\?\.portalStatus/);
  assert.match(page, /requestId: data\?\.requestId/);
});

test("uses accurate dashboard messaging when every Sub-OU fails", () => {
  assert.match(page, /successfulSlices\.length\s*\?\s*copy\(language/);
  assert.match(page, /Could not load any Sub-OUs/);
  assert.match(page, /Không thể tải dữ liệu Sub-OU nào/);
});

test("uses saved data first and queries only the uncovered trailing dates", () => {
  assert.match(page, /loadOverviewFactsFromSnapshot\(subOu, nextFilters, fetch, true\)/);
  assert.match(page, /updating only dates missing from daily snapshot/);
  assert.match(page, /dateFrom: liveDateFrom/);
  assert.match(page, /Live portal data unavailable after/);
});

test("loads independent overview seeds with bounded concurrency", () => {
  assert.match(page, /const seedConcurrency = Math\.min\(2, seeds\.length\)/);
  assert.match(page, /Promise\.all\(Array\.from\(\{ length: seedConcurrency \}, \(\) => runSeedWorker\(\)\)\)/);
  assert.match(page, /classification rules, page limit, deduplication, or final aggregation/);
});

test("prefers the daily snapshot and reloads it without forcing live portal searches", () => {
  assert.match(page, /loadOverviewFactsFromSnapshot\(subOu, nextFilters, fetch, true\)/);
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

test("ingests only incremental snapshot changes into the alert database", () => {
  assert.match(workflow, /npm run data:sync|sync-market-snapshot/);
  assert.doesNotMatch(workflow, /Publish new-entry alerts|ALERT_INGEST_TOKEN/);
  assert.match(worker, /manifest\.lastSync\?\.mode !== "incremental"/);
  assert.match(worker, /daily-changes\.json/);
  assert.match(worker, /ingestLatestSnapshotAlerts\(env\)/);
  assert.match(worker, /INSERT OR IGNORE INTO tender_alerts/);
  assert.doesNotMatch(worker, /\/api\/alerts\/ingest|ALERT_INGEST_TOKEN/);
});

test("serves open tender invitations from the dedicated notice feed", () => {
  assert.match(worker, /url\.pathname === "\/api\/open-tender-alerts"/);
  assert.match(worker, /open-tender-alerts\/alerts\.json/);
  assert.match(page, /fetch\("\/api\/open-tender-alerts\?limit=200"/);
  assert.match(page, /Open tender invitations/);
  assert.match(page, /matchedKeywords/);
  assert.doesNotMatch(page, /alertsFromDailyChanges\(changes\)/);
  assert.doesNotMatch(page, /KQLCNT mới trên Mua Sắm Công/);
});

test("keeps award snapshot alert APIs separate from open tender notices", () => {
  assert.match(worker, /url\.pathname === "\/api\/alerts\/snapshot"/);
  assert.match(worker, /addSnapshotAlertPostingTimes\(env, alerts, manifest\.partitions/);
  assert.match(worker, /fact\.publishedAt/);
  assert.match(worker, /url\.pathname === "\/api\/open-tender-alerts"/);
});
