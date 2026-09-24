import historicalNames from "@/data/hospital-names-by-buyer-id.json";

type HistoricalHospital = { name: string; aliases: string[] };
const namesById: Record<string, HistoricalHospital> = historicalNames;

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").replace(/\s+/g, " ").trim().toLowerCase();
}

const idsByAlias = new Map<string, Set<string>>();
Object.entries(namesById).forEach(([id, entry]) => {
  [entry.name, ...entry.aliases].forEach((name) => {
    const key = normalized(name);
    if (key) idsByAlias.set(key, (idsByAlias.get(key) || new Set()).add(id));
  });
});

export function hospitalName(buyerId: string, sourceName: string) {
  return namesById[normalized(buyerId)]?.name || sourceName.replace(/\s+/g, " ").trim() || "Chưa xác định";
}

// The buyer ID is the identity. Identical names with distinct IDs stay separate.
export function hospitalKey(buyerId: string, sourceName: string) {
  const id = normalized(buyerId);
  return id ? `id:${id}` : `name:${normalized(sourceName) || "unknown"}`;
}

export function hospitalDirectoryEntries() {
  return Object.entries(namesById).map(([id, entry]) => ({ name: entry.name, id }));
}

export function hospitalSelectionLabel(name: string, id?: string) {
  return id ? `${name} [${id}]` : name;
}

export function hospitalPortalQuery(selection: string) {
  const input = selection.trim();
  const explicit = input.match(/\[([^\]]+)\]$/);
  if (explicit && /^vn[a-z0-9]+$/i.test(explicit[1])) return explicit[1].toLowerCase();
  if (/^vn[a-z0-9]+$/i.test(input)) return input.toLowerCase();
  const ids = idsByAlias.get(normalized(input));
  // A shared name cannot identify one buyer safely; leave it as a portal name query.
  return ids?.size === 1 ? [...ids][0] : input;
}
