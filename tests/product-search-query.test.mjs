import assert from "node:assert/strict";
import test from "node:test";
import {
  customProductSearchSeeds,
  customProductSearchTokens,
  recordMatchesCustomProductSearch,
} from "../lib/product-search-query.ts";

test("uses a specific fallback when a custom phrase spans portal fields", () => {
  assert.deepEqual(customProductSearchSeeds("Băng ghim Lexington"), [
    "Băng ghim Lexington",
    "lexington",
  ]);
});

test("matches every custom-search term across product and brand fields", () => {
  const record = {
    tenThietBi: "Băng ghim cắt khâu các cỡ có trợ lực",
    nhanHieu: "Lexington Medical, Inc.",
    cauHinh: "Tương thích với dụng cụ cắt khâu nối nội soi",
  };
  assert.equal(recordMatchesCustomProductSearch(record, "Băng ghim Lexington"), true);
  assert.equal(recordMatchesCustomProductSearch(record, "Băng ghim Meril"), false);
});

test("normalizes Vietnamese accents and searches model/configuration fields", () => {
  assert.deepEqual(customProductSearchTokens("Dụng cụ EC45A"), ["dung", "cu", "ec45a"]);
  assert.equal(recordMatchesCustomProductSearch({
    tenThietBi: "Dụng cụ khâu cắt nối nội soi",
    kyMaHieu: "EC45A",
    cauHinh: "Cấu hình dùng một lần",
  }, "dung cu ec45a"), true);
});

test("does not return a Lexington row that is not a băng ghim product", () => {
  assert.equal(recordMatchesCustomProductSearch({
    tenThietBi: "Dụng cụ khâu cắt nối nội soi",
    nhanHieu: "Lexington Medical, Inc.",
  }, "Băng ghim Lexington"), false);
});
