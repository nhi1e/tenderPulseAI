import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const css = await readFile(path.join(root, "app", "globals.css"), "utf8");
const page = await readFile(path.join(root, "app", "page.tsx"), "utf8");

test("gives the competitor column more room than market size and share combined", () => {
  assert.match(css, /th:nth-child\(2\) \{ width: 11%; \}/);
  assert.match(css, /th:nth-child\(3\) \{ width: 13%; \}/);
  assert.match(css, /th:nth-child\(4\) \{ width: 36%; \}/);
  assert.match(css, /th:nth-child\(6\) \{ width: 16%; \}/);
});

test("keeps the first column as a table cell so its divider spans the full row", () => {
  assert.match(page, /className="subou-name-cell"/);
  assert.match(css, /\.subou-name-cell \{ display: flex;/);
  assert.match(css, /\.subou-name-cell > div \{ display: grid;/);
  assert.doesNotMatch(css, /td:first-child \{ display: flex;/);
});

test("keeps the hospital action label inside its cell", () => {
  assert.match(css, /\.hospital-expand > b \{[^}]*white-space: nowrap;/s);
});

test("allows full competitor names to wrap instead of truncating", () => {
  assert.match(css, /\.competitor-toggle span \{[^}]*overflow-wrap: anywhere;[^}]*white-space: normal;/s);
  assert.doesNotMatch(css, /\.competitor-toggle span \{[^}]*text-overflow: ellipsis;/s);
});
