export type OverviewNamedValue = {
  name: string;
  value: number;
  units: number;
};

export type OverviewHospital = OverviewNamedValue & {
  products: number;
  tenders: number;
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
  hospitals: OverviewHospital[];
  suppliers: OverviewNamedValue[];
  tenders: OverviewTender[];
  sourceRecords: number;
  sourceTotalElements: number;
  truncated: boolean;
  failedQueries: string[];
};

export type OverviewFact = {
  key: string;
  company: string;
  supplier: string;
  hospital: string;
  tender: string;
  product: string;
  value: number;
  units: number;
};

function addNamedValue(
  map: Map<string, OverviewNamedValue>,
  name: string,
  value: number,
  units: number,
) {
  const key = name.trim() || "Chưa xác định";
  const current = map.get(key) || { name: key, value: 0, units: 0 };
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
  const hospitalTotals = new Map<string, OverviewHospital & { productKeys: Set<string>; tenderKeys: Set<string> }>();
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
    addNamedValue(companyTotals, fact.company, fact.value, fact.units);
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
      productKeys: new Set<string>(),
      tenderKeys: new Set<string>(),
    };
    hospitalEntry.value += fact.value;
    hospitalEntry.units += fact.units;
    hospitalEntry.productKeys.add(fact.product);
    hospitalEntry.tenderKeys.add(fact.tender);
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
    .map(({ productKeys, tenderKeys, ...entry }) => ({ ...entry, products: productKeys.size, tenders: tenderKeys.size }))
    .sort((left, right) => right.value - left.value);
  const tenders = [...tenderTotals.values()]
    .map(({ productKeys, ...entry }) => ({ ...entry, products: productKeys.size }))
    .sort((left, right) => right.value - left.value);
  const competitors = [...companyTotals.values()]
    .filter((entry) => entry.name !== "Medtronic" && entry.name !== "Chưa xác định")
    .sort((left, right) => right.value - left.value)
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
    hospitals,
    suppliers: [...supplierTotals.values()].sort((left, right) => right.value - left.value),
    tenders,
    sourceRecords: facts.length,
    sourceTotalElements: metadata.sourceTotalElements,
    truncated: metadata.truncated,
    failedQueries: metadata.failedQueries,
  };
}
