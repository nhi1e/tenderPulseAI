import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const runtimeModule = path.join(root, "lib", `.market-snapshot-test-${process.pid}.ts`);
const source = (await readFile(path.join(root, "lib", "market-snapshot.ts"), "utf8"))
  .replace(
    'import { companyGroupingKey } from "@/lib/company-mapping";',
    'function companyGroupingKey(value: string) { return value.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, ""); }',
  )
  .replace('import type { OverviewFact } from "@/lib/market-overview-aggregate";', 'type OverviewFact = Record<string, any>;');
await writeFile(runtimeModule, source);
const snapshot = await import(`${pathToFileURL(runtimeModule).href}?test=${Date.now()}`);

after(async () => {
  await rm(runtimeModule, { force: true });
});

function fact(overrides = {}) {
  return {
    key: "row-1",
    sourceId: "row-1",
    subOu: "Endo Stapling",
    productGroup: "Băng ghim nội soi",
    company: "Medtronic",
    hospital: "Bệnh viện K",
    sourceHospital: "BENH VIEN K",
    buyerId: "vn001",
    decisionDate: "2026-06-01T00:00:00",
    firstSeenAt: "2026-10-01T00:00:00Z",
    lastSeenAt: "2026-10-01T00:00:00Z",
    contentHash: "abc",
    ...overrides,
  };
}

function snapshotFetcher(manifest, partitions) {
  return async (url) => {
    const value = url === snapshot.MARKET_SNAPSHOT_MANIFEST_URL ? manifest : partitions[url];
    return new Response(value === undefined ? "Not found" : JSON.stringify(value), {
      status: value === undefined ? 404 : 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

test("filters a ready snapshot by date, hospital ID, product group, and mapped company", async () => {
  const partitionPath = "/data/market-snapshot/partitions/2026/endo-stapling.json";
  const manifest = {
    schemaVersion: 1,
    status: "ready",
    generatedAt: "2026-10-07T00:00:00Z",
    coverage: { dateFrom: "2023-01-01", dateTo: "2026-10-07" },
    records: 3,
    partitions: [{ subOu: "Endo Stapling", year: "2026", path: partitionPath, records: 3 }],
  };
  const fetcher = snapshotFetcher(manifest, {
    [partitionPath]: [
      fact(),
      fact({ key: "row-2", sourceId: "row-2", buyerId: "vn002", hospital: "Bệnh viện 108" }),
      fact({ key: "row-3", sourceId: "row-3", company: "Johnson & Johnson" }),
    ],
  });
  await snapshot.readMarketSnapshotManifest(fetcher, true);
  const result = await snapshot.loadOverviewFactsFromSnapshot("Endo Stapling", {
    dateFrom: "2026-01-01",
    dateTo: "2026-10-07",
    hospital: "Bệnh viện K [vn001]",
    productGroup: "Băng ghim nội soi",
    company: "Medtronic",
  }, fetcher);
  assert.deepEqual(result?.facts.map((row) => row.key), ["row-1"]);
  assert.equal(result?.generatedAt, manifest.generatedAt);
});

test("does not use a snapshot outside its completed coverage", async () => {
  const manifest = {
    schemaVersion: 1,
    status: "ready",
    generatedAt: "2026-10-07T00:00:00Z",
    coverage: { dateFrom: "2026-01-01", dateTo: "2026-10-07" },
    records: 0,
    partitions: [],
  };
  const fetcher = snapshotFetcher(manifest, {});
  await snapshot.readMarketSnapshotManifest(fetcher, true);
  const result = await snapshot.loadOverviewFactsFromSnapshot("ES", {
    dateFrom: "2025-01-01",
    dateTo: "2026-10-07",
    hospital: "",
    productGroup: "all",
    company: "all",
  }, fetcher);
  assert.equal(result, undefined);
});

test("collector keeps a complete raw-field snapshot and incremental change log", async () => {
  const script = await readFile(path.join(root, "scripts", "sync-market-snapshot.ts"), "utf8");
  const workflow = await readFile(path.join(root, ".github", "workflows", "update-market-snapshot.yml"), "utf8");
  assert.match(script, /keyWord: ""/);
  assert.match(script, /monthWindows\(dateFrom, dateTo\)/);
  assert.match(script, /firstSeenAt/);
  assert.match(script, /daily-changes\.json/);
  assert.match(script, /mode === "reclassify"/);
  assert.match(workflow, /cron: "30 18 \* \* \*"/);
  assert.match(workflow, /git add public\/data\/market-snapshot/);
});

