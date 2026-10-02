export type ProductSearchRecord = {
  tenThietBi?: unknown;
  maHs?: unknown;
  xuatXu?: unknown;
  maTbmt?: unknown;
  kyMaHieu?: unknown;
  nhanHieu?: unknown;
  hangSanXuat?: unknown;
  chungLoai?: unknown;
  cauHinh?: unknown;
};

function normalizeSearchValue(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function customProductSearchTokens(query: string) {
  return [...new Set(normalizeSearchValue(query).split(" ").filter((token) => token.length >= 2))];
}

export function customProductSearchSeeds(query: string) {
  const phrase = query.trim();
  if (!phrase) return [];

  const tokens = customProductSearchTokens(phrase);
  if (tokens.length <= 1) return [phrase];

  // The portal may not match words that live in different fields. Query the
  // most specific term separately, then intersect every term locally.
  const fallback = [...tokens]
    .filter((token) => token.length >= 3)
    .sort((left, right) => {
      const leftHasDigit = /\d/.test(left) ? 1 : 0;
      const rightHasDigit = /\d/.test(right) ? 1 : 0;
      return rightHasDigit - leftHasDigit || right.length - left.length;
    })[0];

  if (!fallback || normalizeSearchValue(phrase) === fallback) return [phrase];
  return [phrase, fallback];
}

export function recordMatchesCustomProductSearch(record: ProductSearchRecord, query: string) {
  const queryTokens = customProductSearchTokens(query);
  if (!queryTokens.length) return false;

  const searchableFields = [
    record.tenThietBi,
    record.maHs,
    record.xuatXu,
    record.maTbmt,
    record.kyMaHieu,
    record.nhanHieu,
    record.hangSanXuat,
    record.chungLoai,
    record.cauHinh,
  ];
  const recordTokens = new Set(
    searchableFields.flatMap((value) => normalizeSearchValue(value).split(" ").filter(Boolean)),
  );

  return queryTokens.every((token) => recordTokens.has(token));
}
