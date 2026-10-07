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
