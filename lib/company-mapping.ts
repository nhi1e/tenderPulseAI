import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const rulesRuntime = path.join(
	root,
	"lib",
	`.classification-company-test-${process.pid}.ts`,
);
const mappingRuntime = path.join(
	root,
	"lib",
	`.company-mapping-test-${process.pid}.ts`,
);

const rulesSource = (
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
await writeFile(rulesRuntime, rulesSource);

const mappingSource = (
	await readFile(path.join(root, "lib", "company-mapping.ts"), "utf8")
).replace(
	'from "@/lib/classification-rules";',
	`from "./${path.basename(rulesRuntime)}";`,
);
await writeFile(mappingRuntime, mappingSource);

const mapping = await import(
	`${pathToFileURL(mappingRuntime).href}?test=${Date.now()}`
);

after(async () => {
	await Promise.all([
		rm(rulesRuntime, { force: true }),
		rm(mappingRuntime, { force: true }),
	]);
});

test("collapses a manufacturer phrase repeated by dirty portal data", () => {
	const repeated = Array(12)
		.fill("AMNOTEC International Medical GmbH")
		.join(" ");
	assert.equal(
		mapping.collapseRepeatedCompanyName(repeated),
		"AMNOTEC International Medical GmbH",
	);
	assert.equal(
		mapping.mappedCompanyName(repeated, repeated),
		"AMNOTEC International Medical GmbH",
	);
});

test("does not shorten a legitimate unrepeated manufacturer name", () => {
	assert.equal(
		mapping.collapseRepeatedCompanyName(
			"FEG Textiltechnik Forschungs- und Entwicklungsgesellschaft mbH",
		),
		"FEG Textiltechnik Forschungs- und Entwicklungsgesellschaft mbH",
	);
});

test("groups Sheet 05 punctuation variants under one canonical manufacturer", () => {
	assert.equal(
		mapping.mappedCompanyName(
			"B.Braun Surgical S.A/ Tây Ban Nha",
			"B.Braun Surgical S.A/ Tây Ban Nha",
		),
		"B. Braun",
	);
});

test("uses the reviewed canonical name for an otherwise unmapped manufacturer", () => {
	assert.equal(
		mapping.mappedCompanyName(
			"Changzhou Haiers Medical Devices",
			'"Changzhou Haiers Medical Devices"',
		),
		"Changzhou Haiers Medical Devices",
	);
});

test("maps NPA de México manufacturer variants to Medtronic", () => {
	assert.equal(
		mapping.mappedCompanyName(
			"NPA de México S. de R.L. de C.V.",
			"NPA de México S. de R.L. de C.V.",
		),
		"Medtronic",
	);
	assert.equal(
		mapping.mappedCompanyName(
			"NPA de Mexico S.de R.L. de C.V",
			"NPA de Mexico S.de R.L. de C.V",
		),
		"Medtronic",
	);
});
