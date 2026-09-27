import classificationRulesJson from "@/data/classification-rules.json";
import manufacturerAliasesJson from "@/data/manufacturer-aliases.json";
import manufacturerMappingJson from "@/data/manufacturer-mapping.json";
import staffClassificationOverridesJson from "@/data/staff-classification-overrides.json";

export type ClassificationField = "productName" | "brand" | "configuration";
export type ClassificationRecord = Partial<Record<ClassificationField, string | undefined>> & {
  sourceId?: string;
};
export type ExclusionMatch = "contains" | "startsWith" | "startsWithUnlessContains";

export type RuleExclusion = {
  fields: ClassificationField[];
  match: ExclusionMatch;
  terms: string[];
  unlessTerms?: string[];
};

export type ProductClassificationRule = {
  id: number;
  priority: number;
  subOu: string;
  productGroup: string;
  keywords: string[];
  confirmations: string[];
  exclusions: RuleExclusion[];
  method: string;
};

export type RuleEvaluation = {
  matched: boolean;
  reason: "matched" | "staff-review" | "product-keyword" | "confirmation" | "exclusion";
  matchedKeyword?: string;
  matchedConfirmation?: string;
  matchedExclusion?: string;
};

export type StaffClassificationDecision = {
  sourceId: string;
  action: "classify" | "exclude" | "review";
  subOu?: string;
  productGroup?: string;
  tenderId?: string;
  productName?: string;
  matchedRules?: string[] | string;
  rationale?: string;
  reviewer?: string;
  confirmedAt?: string;
};

type ManufacturerMappingEntry = {
  sourceRow: number;
  source: string;
  target: string;
};

type ManufacturerAliasEntry = {
  sourceRow: number;
  lookupKey: string;
  aliases?: string[];
  canonical: string;
  reportingName?: string;
  parent?: string;
  scope?: string;
  status?: string;
};

export const classificationRules = (classificationRulesJson.rules as ProductClassificationRule[])
  .slice()
  .sort((left, right) => left.priority - right.priority);

export const classificationSource = classificationRulesJson.source;
export const manufacturerMappingSource = manufacturerMappingJson.source;
export const manufacturerAliasSource = manufacturerAliasesJson.source;
export const manufacturerAliasRows = (manufacturerAliasesJson.entries as ManufacturerAliasEntry[]).length;
export const manufacturerMappingRows = (manufacturerMappingJson.entries as ManufacturerMappingEntry[]).length;
export const manufacturerMappedRows = (manufacturerMappingJson.entries as ManufacturerMappingEntry[])
  .filter((entry) => entry.source.trim() && entry.target.trim()).length;
export const manufacturerUnmappedRows = manufacturerMappingRows - manufacturerMappedRows;
export const staffClassificationSource = staffClassificationOverridesJson.source;

const staffClassificationDecisions = new Map(
  (staffClassificationOverridesJson.decisions as StaffClassificationDecision[])
    .filter((decision) => decision.sourceId)
    .map((decision) => [decision.sourceId, decision]),
);

export function staffReviewDecisionFor(sourceId: string | undefined) {
  return sourceId ? staffClassificationDecisions.get(sourceId) : undefined;
}

export function normalizeRuleText(value: string | undefined) {
  return String(value || "")
    .normalize("NFC")
    .toLocaleLowerCase("vi-VN")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedRecord(record: ClassificationRecord) {
  return {
    productName: normalizeRuleText(record.productName),
    brand: normalizeRuleText(record.brand),
    configuration: normalizeRuleText(record.configuration),
  };
}

function exclusionMatch(
  record: ReturnType<typeof normalizedRecord>,
  exclusion: RuleExclusion,
) {
  const fields = exclusion.fields.map((field) => record[field]);
  const terms = exclusion.terms.map(normalizeRuleText).filter(Boolean);
  const unlessTerms = (exclusion.unlessTerms || []).map(normalizeRuleText).filter(Boolean);

  for (const text of fields) {
    for (const term of terms) {
      if (exclusion.match === "contains" && text.includes(term)) return term;
      if (exclusion.match === "startsWith" && text.startsWith(term)) return term;
      if (
        exclusion.match === "startsWithUnlessContains" &&
        text.startsWith(term) &&
        !unlessTerms.some((unlessTerm) => text.includes(unlessTerm))
      ) {
        return term;
      }
    }
  }

  return undefined;
}

export function evaluateProductRule(
  sourceRecord: ClassificationRecord,
  rule: ProductClassificationRule,
): RuleEvaluation {
  const record = normalizedRecord(sourceRecord);
  const matchedKeywords = rule.keywords
    .map((keyword) => ({ keyword, normalized: normalizeRuleText(keyword) }))
    .filter(({ normalized }) => normalized && record.productName.includes(normalized))
    .sort((left, right) => right.normalized.length - left.normalized.length);

  if (!matchedKeywords.length) return { matched: false, reason: "product-keyword" };

  const confirmationFields = [record.productName, record.brand, record.configuration];
  const matchedConfirmation = rule.confirmations
    .map((term) => ({ term, normalized: normalizeRuleText(term) }))
    .find(({ normalized }) => normalized && confirmationFields.some((field) => field.includes(normalized)));

  if (rule.confirmations.length && !matchedConfirmation) {
    return {
      matched: false,
      reason: "confirmation",
      matchedKeyword: matchedKeywords[0].keyword,
    };
  }

  for (const exclusion of rule.exclusions) {
    const matchedExclusion = exclusionMatch(record, exclusion);
    if (matchedExclusion) {
      return {
        matched: false,
        reason: "exclusion",
        matchedKeyword: matchedKeywords[0].keyword,
        matchedConfirmation: matchedConfirmation?.term,
        matchedExclusion,
      };
    }
  }

  return {
    matched: true,
    reason: "matched",
    matchedKeyword: matchedKeywords[0].keyword,
    matchedConfirmation: matchedConfirmation?.term,
  };
}

export function classifyProductRecord(
  record: ClassificationRecord,
  rules: ProductClassificationRule[] = classificationRules,
) {
  const uniqueRules = [...new Map(rules.map((rule) => [rule.id, rule])).values()]
    .sort((left, right) => left.priority - right.priority);

  const staffDecision = staffReviewDecisionFor(record.sourceId);
  if (staffDecision) {
    if (staffDecision.action !== "classify") return undefined;
    const rule = uniqueRules.find((candidate) =>
      candidate.subOu === staffDecision.subOu &&
      candidate.productGroup === staffDecision.productGroup
    );
    if (!rule) return undefined;
    return {
      rule,
      evaluation: {
        matched: true,
        reason: "staff-review" as const,
        matchedKeyword: "Staff review 23.9",
      },
    };
  }

  const matches = uniqueRules
    .map((rule) => ({ rule, evaluation: evaluateProductRule(record, rule) }))
    .filter(({ evaluation }) => evaluation.matched);

  // A first-rule-wins result can silently assign the wrong Sub-OU. Only a
  // unique rule match is safe unless staff supplied an exact override above.
  return matches.length === 1 ? matches[0] : undefined;
}

export function ruleForSearchTerm(value: string) {
  const normalized = normalizeRuleText(value);
  return classificationRules.find((rule) =>
    rule.keywords.some((keyword) => normalizeRuleText(keyword) === normalized),
  );
}

export function flattenedExclusionTerms(rule: ProductClassificationRule) {
  return [...new Set(rule.exclusions.flatMap((exclusion) => exclusion.terms))];
}

function manufacturerLookupKey(value: string) {
  return normalizeRuleText(value)
    .replace(/\s*\(\s*\d+(?:[.,]\d+)?\s*\)\s*$/u, "")
    .replace(/[“”‘’'"`´]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanManufacturerDisplayName(value: string) {
  return String(value || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^\s*[-•"'“”‘’]+\s*/u, "")
    .replace(/\s*["'“”‘’]+\s*$/u, "")
    .replace(/\s*\(\s*\d+(?:[.,]\d+)?\s*\)\s*$/u, "")
    .replace(/\s*\/?\s*(?:việt nam\s*)?mã\s+hàng\s*:.*$/iu, "")
    .replace(
      /\s+(?:xuất\s+xứ|nước\s+sản\s+xuất|quốc\s+gia\s+sản\s+xuất)\s*:\s*.+$/iu,
      "",
    )
    .replace(
      /\s*[/,-]\s*(?:đức|anh|mỹ|hoa kỳ|tây ban nha|thụy sĩ|ấn độ|nhật bản|trung quốc|việt nam|thổ nhĩ kỳ|turkey|ý|pháp|bỉ|hàn quốc|hy lạp|đài loan|austria|peru|bulgaria|pakistan|vương quốc anh|united kingdom|cộng hòa séc|germany|uk|usa)\s*$/iu,
      "",
    )
    .replace(/^[.,;:]+\s*/u, "")
    .replace(/\s*[;,|]+\s*$/u, "")
    .trim();
}

export function isPlausibleManufacturerName(value: string | undefined) {
  const cleaned = cleanManufacturerDisplayName(String(value || ""));
  if (!cleaned || cleaned.length > 120 || !/[\p{L}]/u.test(cleaned)) return false;

  const key = manufacturerLookupKey(cleaned)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d");
  if (!key) return false;
  if (/^\d+(?:\s*(?:\d+|xx|thang|nam))*$/u.test(key)) return false;
  if (/^[a-z]\d+$/u.test(key)) return false;
  if (/^(?:hang|nha) san xuat$/u.test(key)) return false;
  if (/^(?:khong xac dinh|chua xac dinh|unknown|n a|na)$/u.test(key)) return false;
  if (/^(?:chi tiet|thong tin chi tiet|theo|nhu bang|gom nhieu ma hang|cung cap khi giao hang)/u.test(key)) return false;
  if (/^bang danh muc hang hoa/u.test(key)) return false;
  if (/^(?:nhieu hang|ao|an do|duc|my|trung quoc|viet nam|cai|soi|beijing|fujian|gangzhou|guangzhou|jiangsu|shaoxing|shenzhen|tianjin|tonglu|zhejiang)$/u.test(key)) return false;
  if (/[;|+]/u.test(cleaned)) return false;

  const entityMentions = cleaned.match(
    /\b(?:ltd|limited|inc|incorporated|gmbh|corp|corporation|company|co|plc|llc|pvt|ag|s\.?a\.?|s\.r\.l\.?|medizintechnik)\b/giu,
  )?.length || 0;
  if (entityMentions > 1 && (/\s+-\s+/u.test(cleaned) || /\s*\/\s*/u.test(cleaned) || /,\s*/u.test(cleaned))) {
    return false;
  }
  if ((cleaned.match(/\//g)?.length || 0) >= 2) return false;
  return true;
}

function manufacturerLookupKeys(value: string) {
  const raw = cleanManufacturerDisplayName(value);
  const withoutLabel = raw.replace(
    /^\s*[-•"'“”‘’]?\s*(?:(?:hãng\s*\/\s*nhà|hãng|nhà)\s+sản\s+xuất(?:\s+(?:máy|thiết bị)\s+chính)?|hãng\s+chủ\s+sở\s+hữu(?:\s+máy\s+chính)?|chủ\s+sở\s+hữu|manufacturer)\s*:\s*/iu,
    "",
  );
  const withoutCountry = withoutLabel.replace(
    /\s*[/,-]\s*(?:đức|anh|mỹ|hoa kỳ|tây ban nha|thụy sĩ|ấn độ|nhật bản|trung quốc|united kingdom|germany|uk|usa)\s*$/iu,
    "",
  );
  return [...new Set([raw, withoutLabel, withoutCountry].map(manufacturerLookupKey).filter(Boolean))];
}

function explicitManufacturerOwner(value: string) {
  const match = String(value || "").match(
    /(?:hãng\s+chủ\s+sở\s+hữu(?:\s+máy\s+chính)?|chủ\s+sở\s+hữu|brand\s+owner|legal\s+manufacturer)\s*:\s*(.+)$/iu,
  );
  if (!match) return "";
  const owner = cleanManufacturerDisplayName(match[1]);
  const parent = owner.match(/(?:subsidiary\s+of|thuộc)\s+(.+)$/iu);
  return cleanManufacturerDisplayName(parent?.[1] || owner);
}

function canonicalManufacturerName(value: string) {
  const cleaned = explicitManufacturerOwner(value) || cleanManufacturerDisplayName(value);
  const key = manufacturerLookupKey(cleaned).replace(/\s/g, "");
  // Portal records can name a 3M subsidiary, factory or country entity rather
  // than the reporting parent. These all belong under one dashboard company.
  if (/^3m(?:\b|[\s,./-])/iu.test(cleaned)) return "3M Company";
  if (/^(covidien|coviden|covididen|medtronic)$/.test(key)) return "Medtronic";
  if (/^johnson(&|and)?johnson$/.test(key) || key === "ethicon") return "Johnson & Johnson";
  if (key === "bbraun") return "B. Braun";
  if (key === "conmed") return "Conmed";
  if (key === "smithnephew") return "Smith & Nephew";
  if (key === "nhânxuân") return "Nhân Xuân";
  if (key.includes("thkazantzidi") || key.includes("thkazatzidi")) return "TH. KAZANTZIDIS S.A";
  return cleaned.replace(/\s+/g, " ").replace(/,+$/, "").trim();
}

const manufacturerMappings = new Map<string, string>();
for (const entry of manufacturerMappingJson.entries as ManufacturerMappingEntry[]) {
  const target = canonicalManufacturerName(entry.target);
  // Later non-empty rows win when the workbook contains a repeated source name.
  if (isPlausibleManufacturerName(target)) {
    manufacturerLookupKeys(entry.source).forEach((key) => manufacturerMappings.set(key, target));
  }
}

const reviewedManufacturerAliases = new Map<string, string>();
const reviewedManufacturerDirectory = new Map<string, string | null>();
const reviewedManufacturerSplitKeys = new Set<string>();
for (const entry of manufacturerAliasesJson.entries as ManufacturerAliasEntry[]) {
  const keys = [...new Set([
    ...manufacturerLookupKeys(entry.lookupKey),
    ...(entry.aliases || []).flatMap(manufacturerLookupKeys),
    ...manufacturerLookupKeys(entry.canonical),
  ])];
  const canonical = canonicalManufacturerName(entry.canonical);
  const needsItemSplit = normalizeRuleText([entry.parent, entry.status].filter(Boolean).join(" "))
    .includes("can tach");
  if (needsItemSplit) {
    keys.forEach((key) => {
      reviewedManufacturerSplitKeys.add(key);
      reviewedManufacturerDirectory.set(key, null);
    });
    continue;
  }
  const reportingName = canonicalManufacturerName(entry.reportingName || entry.parent || entry.canonical);
  if (!isPlausibleManufacturerName(reportingName)) {
    keys.forEach((key) => {
      reviewedManufacturerSplitKeys.add(key);
      reviewedManufacturerDirectory.set(key, null);
    });
    continue;
  }
  keys.forEach((key) => {
    if (key && reportingName) reviewedManufacturerAliases.set(key, reportingName);
    if (key && reportingName) reviewedManufacturerDirectory.set(key, reportingName);
  });
}

export function mappedManufacturerFromMaster(value: string | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return undefined;
  // The original manufacturer master remains authoritative. Sheet 05 fills
  // the previously unmapped spelling clusters with one reporting identity.
  for (const key of manufacturerLookupKeys(raw)) {
    const master = manufacturerMappings.get(key);
    if (master) return master;
  }
  for (const key of manufacturerLookupKeys(raw)) {
    if (reviewedManufacturerSplitKeys.has(key)) return undefined;
    const alias = reviewedManufacturerAliases.get(key);
    if (alias) return alias;
  }
  if (!/[;|+]/.test(raw)) {
    const compact = manufacturerLookupKey(raw).replace(/\s/g, "");
    if (compact.startsWith("amnotec")) return "AMNOTEC International Medical GmbH";
    if (compact.startsWith("sutter")) return "Sutter Medizintechnik";
    if (compact.includes("systagenixwoundmanage")) return "Solventum Corporation";
    if (compact.startsWith("karlstorz") || compact.startsWith("storzendoskop")) return "KARL STORZ";
  }
  return undefined;
}

export function mappedManufacturerDirectoryName(value: string | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return undefined;
  for (const key of manufacturerLookupKeys(raw)) {
    if (reviewedManufacturerDirectory.has(key)) {
      return reviewedManufacturerDirectory.get(key) || undefined;
    }
  }
  for (const key of manufacturerLookupKeys(raw)) {
    const mapped = manufacturerMappings.get(key);
    if (mapped) return mapped;
  }
  if (!/[;|+]/.test(raw)) {
    const compact = manufacturerLookupKey(raw).replace(/\s/g, "");
    if (compact.startsWith("amnotec")) return "AMNOTEC International Medical GmbH";
    if (compact.startsWith("sutter")) return "Sutter Medizintechnik";
    if (compact.includes("systagenixwoundmanage")) return "Solventum Corporation";
    if (compact.startsWith("karlstorz") || compact.startsWith("storzendoskop")) return "KARL STORZ";
  }
  return undefined;
}

export function normalizedManufacturerName(value: string | undefined) {
  const raw = String(value || "").trim();
  const mapped = mappedManufacturerFromMaster(raw) || canonicalManufacturerName(raw);
  return isPlausibleManufacturerName(mapped) ? mapped : "";
}

export function manufacturerDirectoryNames() {
  const names = new Map<string, string>();
  const add = (value: string | null | undefined) => {
    const source = String(value || "").trim();
    const name = canonicalManufacturerName(mappedManufacturerFromMaster(source) || source);
    if (!isPlausibleManufacturerName(name)) return;
    names.set(manufacturerLookupKey(name), name);
  };
  manufacturerMappings.forEach(add);
  reviewedManufacturerDirectory.forEach(add);
  return [...names.values()].sort((left, right) => left.localeCompare(right, "vi"));
}
