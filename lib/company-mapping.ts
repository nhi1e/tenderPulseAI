import {
  isPlausibleManufacturerName,
  mappedManufacturerFromMaster,
  normalizedManufacturerName,
  requiresManufacturerItemSplit,
  stripManufacturerCountrySuffix,
} from "@/lib/classification-rules";

export function normalizeCompanyText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function collapseRepeatedCompanyName(value: string) {
  const cleaned = String(value || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  const tokens = cleaned.split(" ").filter(Boolean);
  if (tokens.length < 2) return cleaned;

  const tokenKey = (token: string) => normalizeCompanyText(token);
  const maxPhraseLength = Math.min(16, Math.floor(tokens.length / 2));
  for (let phraseLength = 1; phraseLength <= maxPhraseLength; phraseLength += 1) {
    const phrase = tokens.slice(0, phraseLength).map(tokenKey);
    let offset = phraseLength;
    let repetitions = 1;
    while (offset + phraseLength <= tokens.length) {
      const candidate = tokens.slice(offset, offset + phraseLength).map(tokenKey);
      if (!candidate.every((token, index) => token === phrase[index])) break;
      repetitions += 1;
      offset += phraseLength;
    }
    if (repetitions >= 2 && offset >= tokens.length - 1) {
      return tokens.slice(0, phraseLength).join(" ").replace(/[;,|]+$/, "").trim();
    }
  }

  return cleaned;
}

function cleanCompanyCandidate(value: string) {
  const cleaned = String(value || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^\s*[-•"'“”‘’]+\s*/u, "")
    .replace(
      /^\s*(?:(?:hãng\s*\/\s*nhà|hãng|nhà)\s+sản\s+xuất(?:\s+(?:máy|thiết bị)\s+chính)?|hãng\s+chủ\s+sở\s+hữu(?:\s+máy\s+chính)?|chủ\s+sở\s+hữu|manufacturer)\s*:\s*/iu,
      "",
    )
    .replace(/\s*\(\s*\d+(?:[.,]\d+)?\s*\)\s*$/u, "")
    .replace(/\s*\/?\s*(?:việt nam\s*)?mã\s+hàng\s*:.*$/iu, "")
    .replace(
      /\s+(?:xuất\s+xứ|nước\s+sản\s+xuất|quốc\s+gia\s+sản\s+xuất)\s*:\s*.+$/iu,
      "",
    )
    .replace(
      /\s*\(\s*(?:hệ\s+thống\s+máy\s+chính|máy\s+chính|thiết\s+bị\s+chính|hệ\s+thống\s+thiết\s+bị\s+chính)\s*\)\s*$/iu,
      "",
    )
    .replace(/^[.,;:]+\s*/u, "")
    .replace(/\s*["'“”‘’;,|]+\s*$/u, "")
    .trim();
  return stripManufacturerCountrySuffix(cleaned);
}

function canonicalCompanyDisplayName(value: string) {
  return cleanCompanyCandidate(collapseRepeatedCompanyName(value))
    .replace(/\bLexing\s+ton\b/giu, "Lexington")
    .replace(/\bMedica\s+l\b/giu, "Medical")
    .replace(/\bInstrumentations\b/giu, "Instrumentation")
    .replace(/\bIndustries\b/giu, "Industry")
    .replace(/\s+Industry\s*$/iu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function explicitOwnerCandidate(value: string) {
  const match = String(value || "").match(
    /(?:hãng(?:\s*\/\s*nước)?\s+chủ\s+sở\s+hữu(?:\s+máy\s+chính)?|chủ\s+sở\s+hữu|brand\s+owner|legal\s+manufacturer)\s*:\s*(.+?)(?=\s+-\s*(?:(?:hãng|nhà)\s+sản\s+xuất|hãng(?:\s*\/\s*nước)?\s+chủ\s+sở\s+hữu)|$)/iu,
  );
  if (!match) return "";
  const owner = cleanCompanyCandidate(match[1]);
  const parent = owner.match(/(?:subsidiary\s+of|thuộc)\s+(.+)$/iu);
  return cleanCompanyCandidate(parent?.[1] || owner);
}

function enumeratedCompanyParts(value: string) {
  const source = String(value || "").trim();
  const markers = [...source.matchAll(/(?:^|\s)\d{1,3}\.\s+/gu)];
  if (markers.length < 2) return [];
  return source
    .split(/(?:^|\s)\d{1,3}\.\s+/u)
    .map(cleanCompanyCandidate)
    .filter(Boolean);
}

function singleEnumeratedCompany(value: string) {
  const parts = enumeratedCompanyParts(value);
  if (!parts.length) return "";
  const unique = new Map(parts.map((part) => [normalizeCompanyText(part), part]));
  return unique.size === 1 ? [...unique.values()][0] : "";
}

function looksLikeCompoundManufacturerCell(value: string) {
  const source = stripManufacturerCountrySuffix(String(value || "").trim());
  const enumerated = enumeratedCompanyParts(source);
  if (enumerated.length > 1 && new Set(enumerated.map(normalizeCompanyText)).size > 1) return true;
  if (/[;|\n]/u.test(source) || /\s+hoặc\s+/iu.test(source)) return true;

  // Count company-bearing segments, not legal suffix tokens. "Co., Ltd." is
  // one company, while "Adler Ortho S.p.A, Tecres S.p.A." is two.
  const legalSuffix = /\b(?:ltd|limited|inc|incorporated|gmbh|corp|corporation|company|co|plc|llc|pvt|ag|s\.?a\.?|s\.?p\.?a\.?|s\.?r\.?l\.?|medizintechnik)\b/iu;
  const bareLegalSuffix = /^(?:and|&|ltd|limited|inc|incorporated|gmbh|corp|corporation|company|co|plc|llc|pvt|ag|kg|s\.?a\.?|s\.?p\.?a\.?|s\.?r\.?l\.?)\.?$/iu;
  const companyBearingSegments = source
    .split(/\s*(?:,|\/|\s+-\s+|\s+\+\s+)\s*/u)
    .map((part) => part.trim())
    .filter((part) => part && legalSuffix.test(part) && !bareLegalSuffix.test(part));
  return companyBearingSegments.length > 1;
}

export function mappedCompanyName(searchableText: string, fallback = "") {
  const rawFallback = String(fallback || "").trim();
  if (requiresManufacturerItemSplit(rawFallback)) return "";
  const workbookMappedManufacturer = mappedManufacturerFromMaster(rawFallback);
  const ownerCandidate = explicitOwnerCandidate(rawFallback);
  const repeatedEnumeratedCandidate = singleEnumeratedCompany(rawFallback);
  const cleanedFallback = cleanCompanyCandidate(
    workbookMappedManufacturer || ownerCandidate || repeatedEnumeratedCandidate || rawFallback,
  );

  if (!workbookMappedManufacturer && !ownerCandidate && !repeatedEnumeratedCandidate && looksLikeCompoundManufacturerCell(rawFallback)) {
    return "";
  }

  const remappedCandidate = mappedManufacturerFromMaster(cleanedFallback) || canonicalCompanyDisplayName(cleanedFallback);
  const normalized = normalizeCompanyText(
    [searchableText, workbookMappedManufacturer, remappedCandidate].filter(Boolean).join(" | "),
  );
  const compact = normalized.replace(/\s/g, "");

  if (/medtronic|covidien|coviden|covididen|ligasure/.test(compact)) return "Medtronic";
  if (/johnsonjohnson|ethicon|harmonic/.test(compact) || /(^|\s)j\s*j(\s|$)/.test(normalized)) {
    return "Johnson & Johnson";
  }
  if (/bbraun|aesculap/.test(compact)) return "B. Braun";
  if (/bostonscientific/.test(compact)) return "Boston Scientific";
  if (/appliedmedical/.test(compact)) return "Applied Medical";
  if (/olympus/.test(compact)) return "Olympus";
  if (/miconvey/.test(compact)) return "Miconvey";
  if (/innolcon/.test(compact)) return "Innolcon";

  const finalName = canonicalCompanyDisplayName(
    workbookMappedManufacturer || mappedManufacturerFromMaster(remappedCandidate) || normalizedManufacturerName(remappedCandidate),
  );
  return isPlausibleManufacturerName(finalName) ? finalName : "";
}

export function companyDirectoryName(value: string) {
  const mapped = mappedCompanyName(value, value).trim();
  // Unreviewed compound portal cells are not one company. Keep them out of
  // autocomplete until item-level attribution is available.
  if (!isPlausibleManufacturerName(mapped)) return "";
  return canonicalCompanyDisplayName(mapped);
}

export function companyGroupingKey(value: string) {
  const mapped = canonicalCompanyDisplayName(mappedCompanyName(value, value) || value);
  const normalized = normalizeCompanyText(mapped)
    .replace(/\b(?:he thong may chinh|may chinh|thiet bi chinh|he thong thiet bi chinh)\b/g, " ")
    .replace(/\b(?:joint stock company|company|corporation|limited|incorporated|inc|corp|co|ltd|llc|plc|pte|gmbh|ag|sa|spa|srl|jsc)\b/g, " ")
    .replace(/\bcong ty( co phan| trach nhiem huu han| tnhh)?\b/g, " ")
    .replace(/\b(?:medical|healthcare|instrument|instruments|instrumentation|instrumentations|industry|industries|technology|technologies|device|devices|equipment|system|systems|manufacturing)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const familyKey = normalized.replace(/\s/g, "");
  if (familyKey) return familyKey;

  return normalizeCompanyText(mapped).replace(/\s/g, "") || "unknown";
}
