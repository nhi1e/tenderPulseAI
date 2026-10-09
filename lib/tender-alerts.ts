export type TenderAlertKind = "new" | "updated";

export type TenderAlertSource = {
  key?: string;
  sourceId?: string;
  contentHash?: string;
  subOu?: string;
  productGroup?: string;
  classificationKeyword?: string;
  company?: string;
  supplier?: string;
  supplierCode?: string;
  hospital?: string;
  sourceHospital?: string;
  buyerId?: string;
  tender?: string;
  tenderNotice?: string;
  product?: string;
  productName?: string;
  productCode?: string;
  model?: string;
  brand?: string;
  manufacturer?: string;
  origin?: string;
  hsCode?: string;
  circulationNumber?: string;
  productionYear?: string;
  configuration?: string;
  unitOfMeasure?: string;
  unitPrice?: number;
  bidForm?: string;
  publishedAt?: string;
  decisionNumber?: string;
  decisionDate?: string;
  participantCount?: number;
  location?: string;
  value?: number;
  units?: number;
};

export type TenderAlert = Required<Pick<TenderAlertSource,
  "key" | "sourceId" | "contentHash" | "subOu" | "productGroup" |
  "company" | "hospital" | "buyerId" | "productName" | "tenderNotice" |
  "decisionDate" | "value" | "units"
>> & TenderAlertSource & {
  id: string;
  kind: TenderAlertKind;
  detectedAt: string;
  readAt?: string | null;
};

function cleanText(value: unknown, max = 20_000) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function stableHash(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function tenderAlertFromChange(
  kind: TenderAlertKind,
  source: TenderAlertSource,
  generatedAt: string,
): TenderAlert | undefined {
  const key = cleanText(source.key || source.sourceId, 500);
  const sourceId = cleanText(source.sourceId || source.key, 500);
  if (!key || !sourceId) return undefined;
  const detectedAt = cleanText(generatedAt, 40) || new Date().toISOString();
  const contentHash = cleanText(source.contentHash, 128) || stableHash(JSON.stringify(source));
  const textFields = {
    subOu: cleanText(source.subOu, 100),
    productGroup: cleanText(source.productGroup, 240),
    classificationKeyword: cleanText(source.classificationKeyword, 240),
    company: cleanText(source.company, 300) || "Unknown / review needed",
    supplier: cleanText(source.supplier, 1_000),
    supplierCode: cleanText(source.supplierCode, 500),
    hospital: cleanText(source.hospital, 500),
    sourceHospital: cleanText(source.sourceHospital, 500),
    buyerId: cleanText(source.buyerId, 160),
    tender: cleanText(source.tender, 300),
    tenderNotice: cleanText(source.tenderNotice, 160),
    product: cleanText(source.product, 500),
    productName: cleanText(source.productName, 2_000),
    productCode: cleanText(source.productCode, 1_000),
    model: cleanText(source.model, 1_000),
    brand: cleanText(source.brand, 500),
    manufacturer: cleanText(source.manufacturer, 1_000),
    origin: cleanText(source.origin, 500),
    hsCode: cleanText(source.hsCode, 160),
    circulationNumber: cleanText(source.circulationNumber, 500),
    productionYear: cleanText(source.productionYear, 100),
    configuration: cleanText(source.configuration),
    unitOfMeasure: cleanText(source.unitOfMeasure, 160),
    bidForm: cleanText(source.bidForm, 300),
    publishedAt: cleanText(source.publishedAt, 80),
    decisionNumber: cleanText(source.decisionNumber, 300),
    decisionDate: cleanText(source.decisionDate, 80),
    location: cleanText(source.location, 1_000),
  };

  return {
    ...textFields,
    key,
    sourceId,
    contentHash,
    id: `${kind}:${contentHash}`,
    kind,
    detectedAt,
    unitPrice: cleanNumber(source.unitPrice),
    participantCount: cleanNumber(source.participantCount),
    value: cleanNumber(source.value),
    units: cleanNumber(source.units),
  };
}

export function alertsFromDailyChanges(input: {
  generatedAt?: string;
  new?: TenderAlertSource[];
  changed?: TenderAlertSource[];
}) {
  const generatedAt = cleanText(input.generatedAt, 40) || new Date().toISOString();
  return [
    ...(Array.isArray(input.new) ? input.new : []).map((row) => tenderAlertFromChange("new", row, generatedAt)),
    ...(Array.isArray(input.changed) ? input.changed : []).map((row) => tenderAlertFromChange("updated", row, generatedAt)),
  ].filter((alert): alert is TenderAlert => Boolean(alert));
}
