import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const rulesRuntime = path.join(root, "lib", `.classification-company-test-${process.pid}.ts`);
const mappingRuntime = path.join(root, "lib", `.company-mapping-test-${process.pid}.ts`);

const rulesSource = (await readFile(path.join(root, "lib", "classification-rules.ts"), "utf8"))
  .replace('from "@/data/classification-rules.json";', 'from "../data/classification-rules.json" with { type: "json" };')
  .replace('from "@/data/manufacturer-aliases.json";', 'from "../data/manufacturer-aliases.json" with { type: "json" };')
  .replace('from "@/data/manufacturer-mapping.json";', 'from "../data/manufacturer-mapping.json" with { type: "json" };')
  .replace('from "@/data/staff-classification-overrides.json";', 'from "../data/staff-classification-overrides.json" with { type: "json" };');
await writeFile(rulesRuntime, rulesSource);

const mappingSource = (await readFile(path.join(root, "lib", "company-mapping.ts"), "utf8"))
  .replace('"@/lib/classification-rules"', `"./${path.basename(rulesRuntime)}"`);
await writeFile(mappingRuntime, mappingSource);

const mapping = await import(`${pathToFileURL(mappingRuntime).href}?test=${Date.now()}`);

after(async () => {
  await Promise.all([rm(rulesRuntime, { force: true }), rm(mappingRuntime, { force: true })]);
});

test("collapses a manufacturer phrase repeated by dirty portal data", () => {
  const repeated = Array(12).fill("AMNOTEC International Medical GmbH").join(" ");
  assert.equal(mapping.collapseRepeatedCompanyName(repeated), "AMNOTEC International Medical GmbH");
  assert.equal(mapping.mappedCompanyName(repeated, repeated), "AMNOTEC International Medical GmbH");
});

test("does not shorten a legitimate unrepeated manufacturer name", () => {
  assert.equal(
    mapping.collapseRepeatedCompanyName("FEG Textiltechnik Forschungs- und Entwicklungsgesellschaft mbH"),
    "FEG Textiltechnik Forschungs- und Entwicklungsgesellschaft mbH",
  );
});

test("groups Sheet 05 punctuation variants under one canonical manufacturer", () => {
  assert.equal(
    mapping.mappedCompanyName("B.Braun Surgical S.A/ Tây Ban Nha", "B.Braun Surgical S.A/ Tây Ban Nha"),
    "B. Braun",
  );
});

test("uses the reviewed canonical name for an otherwise unmapped manufacturer", () => {
  assert.equal(
    mapping.mappedCompanyName("Changzhou Haiers Medical Devices", '"Changzhou Haiers Medical Devices"'),
    "Changzhou Haiers Medical Devices",
  );
});

test("maps NPA de México manufacturer variants to Medtronic", () => {
  assert.equal(
    mapping.mappedCompanyName("NPA de México S. de R.L. de C.V.", "NPA de México S. de R.L. de C.V."),
    "Medtronic",
  );
  assert.equal(
    mapping.mappedCompanyName("NPA de Mexico S.de R.L. de C.V", "NPA de Mexico S.de R.L. de C.V"),
    "Medtronic",
  );
});

test("shows reviewed AMNOTEC spellings as one autocomplete company", () => {
  const variants = [
    "AMNOTEC",
    "Amnotec/ Đức",
    "Hãng sản xuất máy chính: Amnotec International Medical GmbH",
  ];
  variants.forEach((value) => {
    assert.equal(mapping.companyDirectoryName(value), "AMNOTEC International Medical GmbH", value);
  });
});

test("uses reviewed parent mappings for every company, not only AMNOTEC", () => {
  assert.equal(
    mapping.companyDirectoryName("Karl Storz/ Đức - BOWA - Electronic GmbH & Co.KG - Rominger Medizintechnik GmbH - HUPEER Metallwerke GmbH & Co.KG - Tecomet,Inc/ Mỹ - Devon Innovations Private Limited/ Ấn Độ"),
    "KARL STORZ",
  );
});

test("removes portal occurrence suffixes before alias lookup", () => {
  assert.equal(mapping.companyDirectoryName("Sutter Medizintechnik GmbH (12)"), "Sutter Medizintechnik");
  assert.equal(mapping.companyDirectoryName("Sutter (2)"), "Sutter Medizintechnik");
});

test("groups Systagenix spelling, spacing, legal-name and country variants", () => {
  const variants = [
    "Systagenix Wound Managemen t Manufacturi ng Limited",
    "Systagenix Wound Management Limited",
    "Systagenix Wound Management Manufacturing Limited",
    "Systagenix Wound Management Manufacturing Limited/ Anh",
    "Systagenix Wound Management Manufacturing Limited/ United Kingdom",
    "Systagenix Wound ManagementManufacturing Limited",
  ];
  variants.forEach((value) => {
    assert.equal(mapping.mappedCompanyName(value, value), "Solventum Corporation", value);
    assert.equal(mapping.companyDirectoryName(value), "Solventum Corporation", value);
  });
});

test("groups KARL STORZ legal entities and field-label variants", () => {
  const variants = [
    "KARL STORZ SE & Co. KG",
    "Karl Storz Imaging Inc.",
    "Storz Endoskop Produktions GmbH",
    "Hãng sản xuất máy chính: Karl Storz Imaging Inc. (6)",
  ];
  variants.forEach((value) => assert.equal(mapping.companyDirectoryName(value), "KARL STORZ", value));
});

test("does not expose a multi-manufacturer source cell as one autocomplete company", () => {
  assert.equal(
    mapping.companyDirectoryName("KARL STORZ SE & Co. KG; AMNOTEC International Medical GmbH; AS Medizintechnik GmbH; HUPFER Metallwerke GmbH & Co. KG; Tecomet, Inc."),
    "",
  );
});

test("removes non-company values imported from the manufacturer review sheet", () => {
  const invalidValues = ["10", "1500", "200", "2024", "2025", "3006.xx.xx", "50", "60 tháng", "Hãng sản xuất:"];
  invalidValues.forEach((value) => assert.equal(mapping.companyDirectoryName(value), "", value));
});

test("cleans portal field labels and uses an explicit owner", () => {
  assert.equal(
    mapping.companyDirectoryName("Hãng/ nhà sản xuất máy chính: GE Ultrasound Korea, Ltd - Hãng chủ sở hữu máy chính: GE Ultrasound Korea, Ltd"),
    "GE Ultrasound Korea, Ltd",
  );
  assert.equal(
    mapping.companyDirectoryName('" Hãng sản xuất: Intuitive Surgical, Inc. "'),
    "Intuitive Surgical, Inc.",
  );
});

test("collapses a numbered list when every item names the same company", () => {
  assert.equal(
    mapping.companyDirectoryName("1. Nexxmed Equipamentos Ltda 2. Nexxmed Equipamentos Ltda 3. Nexxmed Equipamentos Ltda"),
    "Nexxmed Equipamentos Ltda",
  );
});

test("keeps a numbered list of different manufacturers out of autocomplete", () => {
  assert.equal(
    mapping.companyDirectoryName("1. Pearsalls Ltd 2. Arthrex Manufacturing, Inc. 3. Arthrex, Inc. 4. Arthrex, Inc. 5. Viant Costa Rica, S.A."),
    "",
  );
});

test("groups the misspelled Medipac legal-name variant with the reviewed company", () => {
  assert.equal(
    mapping.companyDirectoryName(". TH. KAZANTZIDI S S.AMEDIPAC"),
    "TH. KAZANTZIDIS S.A",
  );
});

test("removes embedded origin metadata from a manufacturer name", () => {
  assert.equal(
    mapping.companyDirectoryName("3A Medical Xuất xứ: Việt Nam"),
    "3A Medical",
  );
});

test("groups 3M country, factory and legal entities under 3M Company", () => {
  const variants = [
    "3M",
    "3M Company",
    "3M Brookings Manufacturing Facility",
    "3M Deutschland GmbH",
    "3M Edumex S.A de C.V",
    "3M Medical Devices and Materials Manufacturing (Shanghai) Company Limited",
  ];
  variants.forEach((value) => {
    assert.equal(mapping.mappedCompanyName(value, value), "3M Company", value);
    assert.equal(mapping.companyDirectoryName(value), "3M Company", value);
  });
});
