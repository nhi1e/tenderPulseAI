import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const runtimeModule = path.join(root, "lib", `.tender-alerts-test-${process.pid}.ts`);
await writeFile(runtimeModule, await readFile(path.join(root, "lib", "tender-alerts.ts"), "utf8"));
const alerts = await import(`${pathToFileURL(runtimeModule).href}?test=${Date.now()}`);

after(async () => {
  await rm(runtimeModule, { force: true });
});

const source = {
  key: "row-1",
  sourceId: "portal-row-1",
  contentHash: "hash-1",
  subOu: "Endo Stapling",
  productGroup: "Băng ghim nội soi",
  hospital: "Bệnh viện K",
  buyerId: "vn001",
  productName: "Băng ghim nội soi",
  manufacturer: "Lexington Medical",
  company: "Lexington Medical",
  tenderNotice: "IB2600000001",
  decisionDate: "2026-10-07",
  value: 1_250_000,
  units: 10,
};

test("creates stable new-entry alert IDs from the classified content hash", () => {
  const first = alerts.tenderAlertFromChange("new", source, "2026-10-07T18:00:00.000Z");
  const second = alerts.tenderAlertFromChange("new", source, "2026-10-08T18:00:00.000Z");
  assert.equal(first.id, "new:hash-1");
  assert.equal(second.id, first.id);
  assert.equal(first.subOu, "Endo Stapling");
  assert.equal(first.value, 1_250_000);
});

test("keeps new and updated portal entries as separate alert events", () => {
  const feed = alerts.alertsFromDailyChanges({
    generatedAt: "2026-10-07T18:00:00.000Z",
    new: [source],
    changed: [{ ...source, contentHash: "hash-2", value: 1_500_000 }],
  });
  assert.deepEqual(feed.map((alert) => alert.kind), ["new", "updated"]);
  assert.deepEqual(feed.map((alert) => alert.id), ["new:hash-1", "updated:hash-2"]);
});

test("rejects alert rows without a stable source key", () => {
  assert.equal(alerts.tenderAlertFromChange("new", { productName: "Unknown" }, "2026-10-07T18:00:00.000Z"), undefined);
});
