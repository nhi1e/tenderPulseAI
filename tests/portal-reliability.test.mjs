import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const worker = await readFile(path.join(root, "worker", "index.ts"), "utf8");
const page = await readFile(path.join(root, "app", "page.tsx"), "utf8");

test("allows slow public-portal searches to finish beyond the old 25-second boundary", () => {
  assert.match(worker, /PORTAL_REQUEST_TIMEOUT_MS\s*=\s*45_000/);
  assert.match(worker, /AbortSignal\.timeout\(PORTAL_REQUEST_TIMEOUT_MS\)/);
});

test("retries transient portal proxy failures once in the browser", () => {
  assert.match(page, /const maxAttempts = 2/);
  assert.match(page, /response\.status !== 429 && response\.status < 500/);
});

test("resumes an incomplete overview from cached successful Sub-OUs", () => {
  assert.match(page, /const pendingTargets = targets\.filter/);
  assert.match(page, /writeOverviewCache\(nextFilters/);
  assert.match(page, /pendingTargets\.length/);
});
