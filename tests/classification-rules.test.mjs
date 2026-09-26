import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const runtimeModule = path.join(
	root,
	"lib",
	`.classification-rules-test-${process.pid}.ts`,
);
const source = (
	await readFile(path.join(root, "lib", "classification-rules.ts"), "utf8")
)
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
const rules = await import(
	`${pathToFileURL(runtimeModule).href}?test=${Date.now()}`
);
const staffOverrides = JSON.parse(
	await readFile(
		path.join(root, "data", "staff-classification-overrides.json"),
		"utf8",
	),
);

after(async () => {
	await rm(runtimeModule, { force: true });
});

test("imports every completed staff-review row exactly once", () => {
	assert.equal(staffOverrides.decisions.length, 167);
	assert.equal(
		new Set(staffOverrides.decisions.map((row) => row.sourceId)).size,
		167,
	);
	assert.deepEqual(staffOverrides.source.decisionCounts, {
		classify: 137,
		exclude: 26,
		review: 4,
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
			assert.equal(
				result?.rule.productGroup,
				decision.productGroup,
				decision.sourceId,
			);
			assert.equal(
				result?.evaluation.reason,
				"staff-review",
				decision.sourceId,
			);
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
	assert.equal(
		rules.classifyProductRecord({
			sourceId: "0884765e-413f-472e-9f41-87a5f3a82740",
			productName: "Dụng cụ khâu nối tròn",
		}),
		undefined,
	);
	assert.equal(
		rules.classifyProductRecord({
			sourceId: "2d2cd187-c058-421f-8a52-e989f9db37c7",
			productName: "Bộ máy cắt nối tự động thẳng",
		}),
		undefined,
	);
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
	assert.equal(
		rules.classifyProductRecord({
			productName: "Dụng cụ nội soi đóng lỗ trocar",
		}),
		undefined,
	);
});

test("classifies Meril Endo Stapling devices and cartridges from the staff sample", () => {
	const device = rules.classifyProductRecord({
		productName: "Dụng cụ cắt nối thẳng an toàn các cỡ",
		brand: "MEC065/ MEC160/ MEC255",
		configuration:
			"Dụng cụ tích hợp với tất cả các loại băng ghim cho dụng cụ cắt nối thẳng nội soi",
	});
	assert.equal(device?.rule.subOu, "Endo Stapling");
	assert.equal(device?.rule.productGroup, "Dụng cụ khâu cắt nối nội soi");

	const cartridge = rules.classifyProductRecord({
		productName: "Băng ghim cho dụng cụ cắt nối thẳng an toàn các cỡ",
		brand: "MECRW30/ MECRW45/ MECRW60",
		configuration:
			"Băng ghim tương thích với dụng cụ cắt nối thẳng an toàn các cỡ",
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
		productName: "Băng ghim cắt khâu các cỡ có trợ lực",
		brand: "Lexington Medical, Inc",
		configuration:
			"Tương thích với dụng cụ cắt khâu nối nội soi tích hợp trợ lực",
	});
	assert.equal(cartridge?.rule.subOu, "Endo Stapling");
	assert.equal(cartridge?.rule.productGroup, "Băng ghim nội soi");
});
