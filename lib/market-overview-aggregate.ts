import { companyGroupingKey } from "@/lib/company-mapping";

export type OverviewNamedValue = {
  name: string;
  value: number;
  units: number;
};

export type OverviewHospital = OverviewNamedValue & {
  products: number;
  tenders: number;
  competitors: OverviewNamedValue[];
};

export type OverviewTender = {
  id: string;
  hospital: string;
  value: number;
  products: number;
};

export type OverviewSubOu = {
  name: string;
  marketSize: number;
  totalUnits: number;
  medtronicValue: number;
  medtronicUnits: number;
  medtronicValueShare: number;
  medtronicUnitShare: number;
  tenderCount: number;
  hospitalCount: number;
  productCount: number;
  competitors: OverviewNamedValue[];
  companies: OverviewNamedValue[];
  hospitals: OverviewHospital[];
  suppliers: OverviewNamedValue[];
  tenders: OverviewTender[];
  sourceRecords: number;
  sourceTotalElements: number;
  truncated: boolean;
  failedQueries: string[];
  facts?: OverviewFact[];
};

export type OverviewFact = {
  key: string;
  subOu: string;
  productGroup: string;
  classificationKeyword: string;
  company: string;
  supplier: string;
  supplierCode: string;
  hospital: string;
  buyerId: string;
  tender: string;
  product: string;
  productName: string;
  productCode: string;
  model: string;
  brand: string;
  manufacturer: string;
  origin: string;
  hsCode: string;
  circulationNumber: string;
  productionYear: string;
  configuration: string;
  unitOfMeasure: string;
  unitPrice: number;
  bidForm: string;
  publishedAt: string;
  decisionNumber: string;
  decisionDate: string;
  participantCount: number;
  location: string;
  value: number;
  units: number;
};

function addNamedValue(
  map: Map<string, OverviewNamedValue>,
  name: string,
  value: number,
  units: number,
  groupSimilarNames = false,
) {
  const displayName = name.trim() || "Chưa xác định";
  const key = groupSimilarNames ? companyGroupingKey(displayName) : displayName;
  const current = map.get(key) || { name: displayName, value: 0, units: 0 };
  current.value += value;
  current.units += units;
  map.set(key, current);
}

export function aggregateOverviewFacts(
  subOu: string,
  facts: OverviewFact[],
  metadata: {
    sourceTotalElements: number;
    truncated: boolean;
    failedQueries: string[];
  },
): OverviewSubOu {
  const companyTotals = new Map<string, OverviewNamedValue>();
  const supplierTotals = new Map<string, OverviewNamedValue>();
  const hospitalTotals = new Map<string, OverviewHospital & {
    productKeys: Set<string>;
    tenderKeys: Set<string>;
    companyTotals: Map<string, OverviewNamedValue>;
  }>();
  const tenderTotals = new Map<string, OverviewTender & { productKeys: Set<string> }>();
  const allProducts = new Set<string>();
  const allTenders = new Set<string>();
  let marketSize = 0;
  let totalUnits = 0;
  let medtronicValue = 0;
  let medtronicUnits = 0;

  facts.forEach((fact) => {
    marketSize += fact.value;
    totalUnits += fact.units;
    allProducts.add(fact.product);
    allTenders.add(fact.tender);
    addNamedValue(companyTotals, fact.company, fact.value, fact.units, true);
    addNamedValue(supplierTotals, fact.supplier, fact.value, fact.units);

    if (fact.company === "Medtronic") {
      medtronicValue += fact.value;
      medtronicUnits += fact.units;
    }

    const hospitalEntry = hospitalTotals.get(fact.hospital) || {
      name: fact.hospital,
      value: 0,
      units: 0,
      products: 0,
      tenders: 0,
      competitors: [],
      productKeys: new Set<string>(),
      tenderKeys: new Set<string>(),
      companyTotals: new Map<string, OverviewNamedValue>(),
    };
    hospitalEntry.value += fact.value;
    hospitalEntry.units += fact.units;
    hospitalEntry.productKeys.add(fact.product);
    hospitalEntry.tenderKeys.add(fact.tender);
    addNamedValue(hospitalEntry.companyTotals, fact.company, fact.value, fact.units, true);
    hospitalTotals.set(fact.hospital, hospitalEntry);

    const tenderEntry = tenderTotals.get(fact.tender) || {
      id: fact.tender,
      hospital: fact.hospital,
      value: 0,
      products: 0,
      productKeys: new Set<string>(),
    };
    tenderEntry.value += fact.value;
    tenderEntry.productKeys.add(fact.product);
    tenderTotals.set(fact.tender, tenderEntry);
  });

  const hospitals = [...hospitalTotals.values()]
    .map(({ productKeys, tenderKeys, companyTotals: hospitalCompanyTotals, ...entry }) => ({
      ...entry,
      products: productKeys.size,
      tenders: tenderKeys.size,
      competitors: [...hospitalCompanyTotals.values()]
        .filter((company) => company.name !== "Medtronic" && company.name !== "Chưa xác định" && company.name !== "Unknown / review needed")
        .sort((left, right) => right.value - left.value)
        .slice(0, 3),
    }))
    .sort((left, right) => right.value - left.value);
  const tenders = [...tenderTotals.values()]
    .map(({ productKeys, ...entry }) => ({ ...entry, products: productKeys.size }))
    .sort((left, right) => right.value - left.value);
  const companies = [...companyTotals.values()]
    .filter((entry) => entry.name !== "Chưa xác định" && entry.name !== "Unknown / review needed")
    .sort((left, right) => right.value - left.value);
  const competitors = companies
    .filter((entry) => entry.name !== "Medtronic")
    .slice(0, 3);

  return {
    name: subOu,
    marketSize,
    totalUnits,
    medtronicValue,
    medtronicUnits,
    medtronicValueShare: marketSize ? (medtronicValue / marketSize) * 100 : 0,
    medtronicUnitShare: totalUnits ? (medtronicUnits / totalUnits) * 100 : 0,
    tenderCount: allTenders.size,
    hospitalCount: hospitals.filter((entry) => entry.name !== "Chưa xác định").length,
    productCount: allProducts.size,
    competitors,
    companies,
    hospitals,
    suppliers: [...supplierTotals.values()].sort((left, right) => right.value - left.value),
    tenders,
    sourceRecords: facts.length,
    sourceTotalElements: metadata.sourceTotalElements,
    truncated: metadata.truncated,
    failedQueries: metadata.failedQueries,
    facts,
  };
}
