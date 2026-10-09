import { companyGroupingKey } from "@/lib/company-mapping";
import type { OverviewFact } from "@/lib/market-overview-aggregate";

export const MARKET_SNAPSHOT_SCHEMA_VERSION = 1;
export const MARKET_SNAPSHOT_MANIFEST_URL = "/data/market-snapshot/manifest.json";
// Public winning-bid records begin on this date. Earlier user selections are
// clamped here instead of making a complete snapshot look incomplete and
// triggering a much slower live portal search.
export const MARKET_DATA_AVAILABLE_FROM = "2023-01-01";

export type MarketSnapshotPartition = {
  subOu: string;
  year: string;
  path: string;
  records: number;
};

export type MarketSnapshotManifest = {
  schemaVersion: number;
  status: "empty" | "ready";
  generatedAt: string | null;
  coverage: { dateFrom: string; dateTo: string } | null;
  records: number;
  partitions: MarketSnapshotPartition[];
  lastSync?: {
    mode: "full" | "incremental" | "reclassify" | "import";
    dateFrom: string;
    dateTo: string;
    newRecords: number;
    changedRecords: number;
    removedRecords: number;
  };
};

export type SnapshotFact = OverviewFact & {
  sourceId: string;
  firstSeenAt: string;
  lastSeenAt: string;
  contentHash: string;
};

export type SnapshotOverviewFilters = {
  dateFrom: string;
  dateTo: string;
  hospital: string;
  productGroup: string;
  company: string;
};

export type SnapshotFactResult = {
  facts: SnapshotFact[];
  generatedAt: string;
  sourceRecords: number;
};

let manifestPromise: Promise<MarketSnapshotManifest | undefined> | undefined;
const partitionPromises = new Map<string, Promise<SnapshotFact[]>>();

function normalized(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function dateKey(value: string) {
  const source = String(value || "").trim();
  const iso = source.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const local = source.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return local ? `${local[3]}-${local[2]}-${local[1]}` : "";
}

function selectedHospitalId(value: string) {
  return value.match(/\[([^\]]+)\]\s*$/)?.[1]?.trim().toLowerCase() || "";
}

function requestedYears(dateFrom: string, dateTo: string) {
  const start = Number(dateFrom.slice(0, 4));
  const end = Number(dateTo.slice(0, 4));
  if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) return [];
  return Array.from({ length: end - start + 1 }, (_, index) => String(start + index));
}

async function fetchJson<T>(url: string, fetcher: typeof fetch): Promise<T | undefined> {
  try {
    const response = await fetcher(url, { cache: "no-cache" });
    if (!response.ok) return undefined;
    return await response.json() as T;
  } catch {
    return undefined;
  }
}

export async function readMarketSnapshotManifest(
  fetcher: typeof fetch = fetch,
  forceReload = false,
) {
  if (forceReload) {
    manifestPromise = undefined;
    partitionPromises.clear();
  }
  manifestPromise ||= fetchJson<MarketSnapshotManifest>(MARKET_SNAPSHOT_MANIFEST_URL, fetcher);
  return manifestPromise;
}

async function readPartition(path: string, fetcher: typeof fetch) {
  if (!partitionPromises.has(path)) {
    partitionPromises.set(path, fetchJson<SnapshotFact[]>(path, fetcher).then((facts) => facts || []));
  }
  return partitionPromises.get(path)!;
}

/** Fill missing portal publication timestamps on alert rows using the snapshot partition. */
export async function addMissingAlertPostingTimes<T extends {
  key?: string;
  subOu?: string;
  decisionDate?: string;
  publishedAt?: string;
}>(alerts: T[], fetcher: typeof fetch = fetch): Promise<T[]> {
  const missing = alerts.filter((alert) => !alert.publishedAt && alert.key && alert.subOu);
  if (!missing.length) return alerts;

  const manifest = await readMarketSnapshotManifest(fetcher);
  if (!manifest?.partitions?.length) return alerts;

  const keysByPartition = new Map<string, Set<string>>();
  const partitionByPath = new Map(manifest.partitions.map((partition) => [partition.path, partition]));
  for (const alert of missing) {
    const year = dateKey(alert.decisionDate || "").slice(0, 4);
    if (!year) continue;
    const partition = manifest.partitions.find((candidate) => candidate.subOu === alert.subOu && candidate.year === year);
    if (!partition) continue;
    const keys = keysByPartition.get(partition.path) || new Set<string>();
    keys.add(alert.key!);
    keysByPartition.set(partition.path, keys);
  }

  if (!keysByPartition.size) return alerts;
  const postingTimes = new Map<string, string>();
  await Promise.all([...keysByPartition.entries()].map(async ([path, keys]) => {
    const partition = partitionByPath.get(path)!;
    const facts = await readPartition(partition.path, fetcher);
    for (const fact of facts) {
      if (keys.has(fact.key) && fact.publishedAt) postingTimes.set(fact.key, fact.publishedAt);
    }
  }));

  return alerts.map((alert) => {
    if (alert.publishedAt || !alert.key) return alert;
    const publishedAt = postingTimes.get(alert.key);
    return publishedAt ? { ...alert, publishedAt } : alert;
  });
}


export async function loadOverviewFactsFromSnapshot(
  subOu: string,
  filters: SnapshotOverviewFilters,
  fetcher: typeof fetch = fetch,
): Promise<SnapshotFactResult | undefined> {
  const manifest = await readMarketSnapshotManifest(fetcher);
  const effectiveDateFrom = filters.dateFrom < MARKET_DATA_AVAILABLE_FROM
    ? MARKET_DATA_AVAILABLE_FROM
    : filters.dateFrom;
  if (
    !manifest ||
    manifest.schemaVersion !== MARKET_SNAPSHOT_SCHEMA_VERSION ||
    manifest.status !== "ready" ||
    !manifest.generatedAt ||
    !manifest.coverage ||
    effectiveDateFrom < manifest.coverage.dateFrom ||
    filters.dateTo > manifest.coverage.dateTo
  ) {
    return undefined;
  }

  const years = new Set(requestedYears(effectiveDateFrom, filters.dateTo));
  const partitions = manifest.partitions.filter((partition) =>
    partition.subOu === subOu && years.has(partition.year)
  );
  const sourceRecords = partitions.reduce((total, partition) => total + partition.records, 0);
  const facts = (await Promise.all(partitions.map((partition) => readPartition(partition.path, fetcher)))).flat();
  const hospitalId = selectedHospitalId(filters.hospital);
  const hospitalQuery = normalized(filters.hospital.replace(/\s*\[[^\]]+\]\s*$/, ""));
  const companyKey = filters.company !== "all" ? companyGroupingKey(filters.company) : "";

  return {
    generatedAt: manifest.generatedAt,
    sourceRecords,
    facts: facts.filter((fact) => {
      const decisionDate = dateKey(fact.decisionDate);
      if (!decisionDate || decisionDate < effectiveDateFrom || decisionDate > filters.dateTo) return false;
      if (filters.productGroup !== "all" && fact.productGroup !== filters.productGroup) return false;
      if (companyKey && companyGroupingKey(fact.company) !== companyKey) return false;
      if (hospitalId && fact.buyerId.toLowerCase() !== hospitalId) return false;
      if (
        !hospitalId && hospitalQuery &&
        !normalized(`${fact.hospital} ${fact.sourceHospital} ${fact.buyerId}`).includes(hospitalQuery)
      ) return false;
      return true;
    }),
  };
}

