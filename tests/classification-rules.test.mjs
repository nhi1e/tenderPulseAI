import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const runtimeModule = path.join(root, "lib", `.classification-rules-test-${process.pid}.ts`);
const searchConfigRuntimeModule = path.join(root, "lib", `.market-overview-config-test-${process.pid}.mjs`);
const source = (await readFile(path.join(root, "lib", "classification-rules.ts"), "utf8"))
  .replace(
    'from "@/data/classification-rules.json";',
    'from "../data/classification-rules.json" with { type: "json" };',
  )
  .replace(
    'from "@/data/manufacturer-aliases.json";',
    'from "../data/manufacturer-aliases.json" with { type: "json" };',
  )
  .replace(
    'from "@/data/manufacturer-mapping.json";',
    'from "../data/manufacturer-mapping.json" with { type: "json" };',
  )
  .replace(
    'from "@/data/staff-classification-overrides.json";',
    'from "../data/staff-classification-overrides.json" with { type: "json" };',
  );

await writeFile(runtimeModule, source);
const searchConfigSource = (await readFile(path.join(root, "lib", "market-overview-config.ts"), "utf8"))
  .replace("export const MARKET_OVERVIEW_SEARCH_SEEDS: Record<string, string[]> =", "export const MARKET_OVERVIEW_SEARCH_SEEDS =");
await writeFile(searchConfigRuntimeModule, searchConfigSource);
const rules = await import(`${pathToFileURL(runtimeModule).href}?test=${Date.now()}`);
const searchConfig = await import(`${pathToFileURL(searchConfigRuntimeModule).href}?test=${Date.now()}`);
const staffOverrides = JSON.parse(
  await readFile(path.join(root, "data", "staff-classification-overrides.json"), "utf8"),
);

after(async () => {
  await Promise.all([
    rm(runtimeModule, { force: true }),
    rm(searchConfigRuntimeModule, { force: true }),
  ]);
});

test("imports every completed staff-review row exactly once", () => {
  assert.equal(staffOverrides.decisions.length, 167);
  assert.equal(new Set(staffOverrides.decisions.map((row) => row.sourceId)).size, 167);
  assert.deepEqual(staffOverrides.source.decisionCounts, {
    classify: 137,
    exclude: 26,
    review: 4,
  });
});

test("exposes consolidated Sheet 05 companies to dashboard autocomplete", () => {
  const names = new Set(rules.manufacturerDirectoryNames());
  assert.ok(names.has("AMNOTEC International Medical GmbH"));
  assert.ok(names.has("KARL STORZ"));
  assert.ok(names.has("Sutter Medizintechnik"));
  assert.ok(names.has("Solventum Corporation"));
  assert.ok(names.has("3M Company"));
  ["10", "1500", "200", "2024", "2025", "3006.xx.xx", "50", "60 tháng", "Hãng sản xuất:", "Beijing", "Jiangsu", "Shenzhen", "Zhejiang"].forEach((name) => {
    assert.ok(!names.has(name), name);
  });
});

test("enforces all 167 staff decisions", () => {
  for (const decision of staffOverrides.decisions) {
    const result = rules.classifyProductRecord({
      sourceId: decision.sourceId,
      productName: decision.productName,
    });
    if (decision.action === "classify") {
      assert.equal(result?.rule.subOu, decision.subOu, decision.sourceId);
      assert.equal(result?.rule.productGroup, decision.productGroup, decision.sourceId);
      assert.equal(result?.evaluation.reason, "staff-review", decision.sourceId);
    } else {
      assert.equal(result, undefined, decision.sourceId);
    }
  }
});

test("staff classifications take precedence over text rules", () => {
  const result = rules.classifyProductRecord({
    sourceId: "98909688-c78d-4afc-9dbe-22005841cb60",
    productName: "unrelated text",
  });
  assert.equal(result?.rule.subOu, "Open Stapling");
  assert.equal(result?.rule.productGroup, "Dụng cụ khâu nối tròn");
  assert.equal(result?.evaluation.reason, "staff-review");
});

test("staff exclusions and unresolved rows stay out of KPIs", () => {
  assert.equal(rules.classifyProductRecord({
    sourceId: "0884765e-413f-472e-9f41-87a5f3a82740",
    productName: "Dụng cụ khâu nối tròn",
  }), undefined);
  assert.equal(rules.classifyProductRecord({
    sourceId: "2d2cd187-c058-421f-8a52-e989f9db37c7",
    productName: "Bộ máy cắt nối tự động thẳng",
  }), undefined);
});

test("staff general rules separate circular stapling from Endo Stapling", () => {
  const result = rules.classifyProductRecord({
    productName: "Dụng cụ khâu nối tròn dùng một lần",
  });
  assert.equal(result?.rule.subOu, "Open Stapling");
  assert.equal(result?.rule.productGroup, "Dụng cụ khâu nối tròn");
});

test("staff general rules prioritize hernia fixation over generic Endo terms", () => {
  const result = rules.classifyProductRecord({
    productName: "Dụng cụ nội soi cố định lưới thoát vị",
  });
  assert.equal(result?.rule.subOu, "Hernia");
  assert.equal(result?.rule.productGroup, "Dụng cụ cố định lưới thoát vị");
});

test("approved Trocar exclusion holds closing-hole products for review", () => {
  assert.equal(rules.classifyProductRecord({
    productName: "Dụng cụ nội soi đóng lỗ trocar",
  }), undefined);
});

test("classifies Meril Endo Stapling devices and cartridges from the staff sample", () => {
  const device = rules.classifyProductRecord({
    productName: "Dụng cụ cắt nối thẳng an toàn các cỡ",
    brand: "MEC065/ MEC160/ MEC255",
    configuration: "Dụng cụ tích hợp với tất cả các loại băng ghim cho dụng cụ cắt nối thẳng nội soi",
  });
  assert.equal(device?.rule.subOu, "Endo Stapling");
  assert.equal(device?.rule.productGroup, "Dụng cụ khâu cắt nối nội soi");

  const cartridge = rules.classifyProductRecord({
    productName: "Băng ghim cho dụng cụ cắt nối thẳng an toàn các cỡ",
    brand: "MECRW30/ MECRW45/ MECRW60",
    configuration: "Băng ghim tương thích với dụng cụ cắt nối thẳng nội soi an toàn các cỡ",
  });
  assert.equal(cartridge?.rule.subOu, "Endo Stapling");
  assert.equal(cartridge?.rule.productGroup, "Băng ghim nội soi");
});

test("classifies Lexington Endo Stapling devices and cartridges from the staff sample", () => {
  const device = rules.classifyProductRecord({
    productName: "Dụng cụ cắt khâu nối nội soi tích hợp trợ lực",
    brand: "Lexington Medical, Inc",
    configuration: "Có chế độ trợ lực dùng trong phẫu thuật nội soi",
  });
  assert.equal(device?.rule.subOu, "Endo Stapling");
  assert.equal(device?.rule.productGroup, "Dụng cụ khâu cắt nối nội soi");

  const cartridge = rules.classifyProductRecord({
    productName: "Băng ghim có trợ lực các cỡ",
    brand: "Lexington Medical, Inc",
    configuration: "Tương thích với dụng cụ cắt khâu nối nội soi tích hợp trợ lực",
  });
  assert.equal(cartridge?.rule.subOu, "Endo Stapling");
  assert.equal(cartridge?.rule.productGroup, "Băng ghim nội soi");
});


test("loads the 01.10 staff rule revision", () => {
  assert.equal(rules.classificationSource.version, "2026-10-06");
  assert.equal(rules.classificationSource.sheet, "Danh mục rule keyword cần edit");
});

test("requires both Endo Stapling instrument confirmation groups", () => {
  const rule = rules.classificationRules.find((candidate) =>
    candidate.productGroup === "Dụng cụ khâu cắt nối nội soi"
  );
  assert.ok(rule);

  assert.equal(rules.evaluateProductRule({
    productName: "Dụng cụ phẫu thuật nội soi dùng một lần",
  }, rule).reason, "confirmation");

  assert.equal(rules.evaluateProductRule({
    productName: "Dụng cụ khâu cắt mô dùng trong phẫu thuật",
  }, rule).reason, "confirmation");

  assert.equal(rules.evaluateProductRule({
    productName: "Dụng cụ phẫu thuật nội soi",
    configuration: "Dùng để khâu cắt mô và cầm máu",
  }, rule).matched, true);
});

test("applies the expanded Endo Stapling exclusions after both confirmations", () => {
  const rule = rules.classificationRules.find((candidate) =>
    candidate.productGroup === "Dụng cụ khâu cắt nối nội soi"
  );
  assert.ok(rule);

  const specialty = rules.evaluateProductRule({
    productName: "Dụng cụ khâu cắt nội soi cột sống",
  }, rule);
  assert.equal(specialty.reason, "exclusion");
  assert.equal(specialty.matchedExclusion, "cột sống");

  const system = rules.evaluateProductRule({
    productName: "Hệ thống dụng cụ khâu cắt nối nội soi",
  }, rule);
  assert.equal(system.reason, "exclusion");
  assert.equal(system.matchedExclusion, "hệ thống");
});

test("requires both Open Stapling instrument confirmation groups", () => {
  const rule = rules.classificationRules.find((candidate) =>
    candidate.productGroup === "Dụng cụ khâu cắt nối mổ mở"
  );
  assert.ok(rule);

  assert.equal(rules.evaluateProductRule({
    productName: "Dụng cụ phẫu thuật mổ mở dùng một lần",
  }, rule).reason, "confirmation");

  assert.equal(rules.evaluateProductRule({
    productName: "Dụng cụ khâu cắt mô dùng một lần",
  }, rule).reason, "confirmation");

  assert.equal(rules.evaluateProductRule({
    productName: "Dụng cụ khâu cắt mô dùng trong mổ mở",
  }, rule).matched, true);
});

test("requires nội soi for Endo Stapling cartridges", () => {
  const rule = rules.classificationRules.find((candidate) =>
    candidate.productGroup === "Băng ghim nội soi"
  );
  assert.ok(rule);

  assert.equal(rules.evaluateProductRule({
    productName: "Băng ghim cho dụng cụ cắt nối thẳng",
  }, rule).reason, "confirmation");

  assert.equal(rules.evaluateProductRule({
    productName: "Băng ghim cho dụng cụ cắt nối thẳng",
    configuration: "Sử dụng trong phẫu thuật nội soi",
  }, rule).matched, true);
});

test("applies the approved narrow Meril exception when nội soi is omitted", () => {
  const rule = rules.classificationRules.find((candidate) =>
    candidate.productGroup === "Băng ghim nội soi"
  );
  assert.ok(rule);

  const straight = rules.evaluateProductRule({
    productName: "Băng ghim cho dụng cụ cắt nối thẳng an toàn các cỡ",
    manufacturer: "Meril Endo Surgery Pvt. Ltd",
    configuration: "Ghim Titan với 3 hàng ghim so le; lưỡi dao mới trên mỗi băng ghim",
  }, rule);
  assert.equal(straight.matched, true);
  assert.match(straight.matchedConfirmation, /Meril/);

  const curved = rules.classifyProductRecord({
    productName: "Băng ghim cho dụng cụ cắt nối thẳng an toàn các cỡ có đầu cong",
    brand: "Meril",
    configuration: "Xuất xứ Ấn Độ; chiều cao ghim đóng dùng cho mô trung bình đến dày",
  });
  assert.equal(curved?.rule.subOu, "Endo Stapling");
  assert.equal(curved?.rule.productGroup, "Băng ghim nội soi");
});

test("does not broaden the Meril exception to unrelated or excluded cartridges", () => {
  const rule = rules.classificationRules.find((candidate) =>
    candidate.productGroup === "Băng ghim nội soi"
  );
  assert.ok(rule);

  assert.equal(rules.evaluateProductRule({
    productName: "Băng ghim cho dụng cụ cắt nối thẳng an toàn các cỡ",
    manufacturer: "Other Manufacturer",
  }, rule).reason, "confirmation");

  assert.equal(rules.evaluateProductRule({
    productName: "Băng ghim các cỡ",
    manufacturer: "Meril Endo Surgery Pvt. Ltd",
  }, rule).reason, "confirmation");

  const excluded = rules.evaluateProductRule({
    productName: "Băng ghim cho dụng cụ cắt nối thẳng an toàn các cỡ dùng trong mổ mở",
    manufacturer: "Meril Endo Surgery Pvt. Ltd",
  }, rule);
  assert.equal(excluded.reason, "exclusion");
  assert.equal(excluded.matchedExclusion, "mổ mở");
});

test("applies the new 01.10 accessory exclusions", () => {
  const ultrasonic = rules.classificationRules.find((candidate) => candidate.productGroup === "Dao siêu âm");
  const openCartridge = rules.classificationRules.find((candidate) => candidate.productGroup === "Băng ghim mổ mở");
  const neutralPad = rules.classificationRules.find((candidate) => candidate.productGroup === "Tấm điện cực trung tính");
  assert.ok(ultrasonic);
  assert.ok(openCartridge);
  assert.ok(neutralPad);

  assert.equal(rules.evaluateProductRule({
    productName: "Dây dao siêu âm",
  }, ultrasonic).reason, "exclusion");
  assert.equal(rules.evaluateProductRule({
    productName: "Bàn đạp cho dao siêu âm",
  }, ultrasonic).reason, "exclusion");
  assert.equal(rules.evaluateProductRule({
    productName: "Băng ghim tròn dùng trong mổ mở",
  }, openCartridge).reason, "exclusion");
  assert.equal(rules.evaluateProductRule({
    productName: "Dây cho tấm điện cực trung tính",
  }, neutralPad).reason, "exclusion");
});


test("retrieves Endo cartridges by product anchors without the broad nội soi query", () => {
  const seeds = searchConfig.MARKET_OVERVIEW_SEARCH_SEEDS["Băng ghim nội soi"];
  assert.ok(seeds.includes("băng ghim"));
  assert.ok(seeds.includes("băng đạn"));
  assert.ok(seeds.includes("ghim khâu"));
  assert.ok(seeds.includes("ghim nội soi"));
  assert.ok(!seeds.includes("nội soi"));
});

test("uses every required Endo instrument confirmation phrase as a retrieval seed", () => {
  const seeds = new Set(searchConfig.MARKET_OVERVIEW_SEARCH_SEEDS["Dụng cụ khâu cắt nối nội soi"]);
  ["khâu cắt", "cắt khâu", "khâu nối", "nối khâu", "cắt nối", "nối cắt"].forEach((term) => {
    assert.ok(seeds.has(term), `missing Endo retrieval seed: ${term}`);
  });
  assert.ok(!seeds.has("nội soi"));
});

test("uses approved Suture product phrases instead of generic portal searches", () => {
  const seeds = new Set(searchConfig.MARKET_OVERVIEW_SEARCH_SEEDS["Chỉ phẫu thuật"]);
  const rule = rules.classificationRules.find((candidate) => candidate.productGroup === "Chỉ phẫu thuật");
  assert.ok(rule);
  rule.keywords.forEach((term) => assert.ok(seeds.has(term.toLowerCase()), `missing Suture retrieval seed: ${term}`));
  assert.ok(!seeds.has("khâu"));
  assert.ok(!seeds.has("phẫu thuật"));
});

test("does not use the broad VS&D confirmation term as a portal query", () => {
  const seeds = searchConfig.MARKET_OVERVIEW_SEARCH_SEEDS["Dao siêu âm"];
  assert.deepEqual(seeds, ["dao siêu âm"]);
  assert.ok(!seeds.includes("siêu âm"));
});
