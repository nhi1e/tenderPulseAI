import classificationRulesJson from "@/data/classification-rules.json";
import manufacturerMappingJson from "@/data/manufacturer-mapping.json";

export type ClassificationField = "productName" | "brand" | "configuration";
export type ClassificationRecord = Partial<Record<ClassificationField, string | undefined>>;
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
  reason: "matched" | "product-keyword" | "confirmation" | "exclusion";
  matchedKeyword?: string;
  matchedConfirmation?: string;
  matchedExclusion?: string;
};

type ManufacturerMappingEntry = {
  sourceRow: number;
  source: string;
  target: string;
};

export const classificationRules = (classificationRulesJson.rules as ProductClassificationRule[])
  .slice()
  .sort((left, right) => left.priority - right.priority);

export const classificationSource = classificationRulesJson.source;
export const manufacturerMappingSource = manufacturerMappingJson.source;
export const manufacturerMappingRows = (manufacturerMappingJson.entries as ManufacturerMappingEntry[]).length;
export const manufacturerMappedRows = (manufacturerMappingJson.entries as ManufacturerMappingEntry[])
  .filter((entry) => entry.source.trim() && entry.target.trim()).length;
export const manufacturerUnmappedRows = manufacturerMappingRows - manufacturerMappedRows;

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

  for (const rule of uniqueRules) {
    const evaluation = evaluateProductRule(record, rule);
    if (evaluation.matched) return { rule, evaluation };
  }

  return undefined;
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
    .replace(/[“”‘’'"`´]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalManufacturerName(value: string) {
  const key = manufacturerLookupKey(value).replace(/\s/g, "");
  if (/^(covidien|coviden|covididen|medtronic)$/.test(key)) return "Medtronic";
  if (/^johnson(&|and)?johnson$/.test(key) || key === "ethicon") return "Johnson & Johnson";
  if (key === "bbraun") return "B. Braun";
  if (key === "conmed") return "Conmed";
  if (key === "smithnephew") return "Smith & Nephew";
  if (key === "nhânxuân") return "Nhân Xuân";
  return value.replace(/\s+/g, " ").replace(/,+$/, "").trim();
}

const manufacturerMappings = new Map<string, string>();
for (const entry of manufacturerMappingJson.entries as ManufacturerMappingEntry[]) {
  const key = manufacturerLookupKey(entry.source);
  const target = canonicalManufacturerName(entry.target);
  // Later non-empty rows win when the workbook contains a repeated source name.
  if (key && target) manufacturerMappings.set(key, target);
}

export function mappedManufacturerFromMaster(value: string | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return undefined;
  return manufacturerMappings.get(manufacturerLookupKey(raw));
}

export function normalizedManufacturerName(value: string | undefined) {
  const raw = String(value || "").trim();
  return mappedManufacturerFromMaster(raw) || canonicalManufacturerName(raw);
}
