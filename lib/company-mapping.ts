import {
  isPlausibleManufacturerName,
  mappedManufacturerDirectoryName,
  mappedManufacturerFromMaster,
  normalizedManufacturerName,
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
  return String(value || "")
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
      /\s*[/,-]\s*(?:đức|anh|mỹ|hoa kỳ|tây ban nha|thụy sĩ|ấn độ|nhật bản|trung quốc|việt nam|thổ nhĩ kỳ|turkey|ý|pháp|bỉ|hàn quốc|hy lạp|đài loan|austria|peru|bulgaria|pakistan|vương quốc anh|united kingdom|cộng hòa séc|germany|uk|usa)\s*$/iu,
      "",
    )
    .replace(/^[.,;:]+\s*/u, "")
    .replace(/\s*["'“”‘’;,|]+\s*$/u, "")
    .trim();
}

function explicitOwnerCandidate(value: string) {
  const match = String(value || "").match(
    /(?:hãng\s+chủ\s+sở\s+hữu(?:\s+máy\s+chính)?|chủ\s+sở\s+hữu|brand\s+owner|legal\s+manufacturer)\s*:\s*(.+?)(?=\s+-\s*(?:(?:hãng|nhà)\s+sản\s+xuất|hãng\s+chủ\s+sở\s+hữu)|$)/iu,
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
  const source = String(value || "").trim();
  const enumerated = enumeratedCompanyParts(source);
  if (enumerated.length > 1 && new Set(enumerated.map(normalizeCompanyText)).size > 1) return true;
  if (/[;|\n]/u.test(source) || /\s+hoặc\s+/iu.test(source)) return true;

  const entityMentions = source.match(
    /\b(?:ltd|limited|inc|incorporated|gmbh|corp|corporation|company|co|plc|llc|pvt|ag|s\.?a\.?|s\.r\.l\.?|medizintechnik)\b/giu,
  )?.length || 0;
  return entityMentions > 1 && (/\s+-\s+/u.test(source) || /\s+\/\s+/u.test(source));
}

export function mappedCompanyName(searchableText: string, fallback = "") {
  const rawFallback = String(fallback || "").trim();
  const workbookMappedManufacturer = mappedManufacturerFromMaster(rawFallback);
  const ownerCandidate = explicitOwnerCandidate(rawFallback);
  const repeatedEnumeratedCandidate = singleEnumeratedCompany(rawFallback);
  const cleanedFallback = cleanCompanyCandidate(
    workbookMappedManufacturer || ownerCandidate || repeatedEnumeratedCandidate || rawFallback,
  );

  if (!workbookMappedManufacturer && !ownerCandidate && !repeatedEnumeratedCandidate && looksLikeCompoundManufacturerCell(rawFallback)) {
    return "";
  }

  const remappedCandidate = mappedManufacturerFromMaster(cleanedFallback) || cleanedFallback;
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

  const finalName = collapseRepeatedCompanyName(
    workbookMappedManufacturer || mappedManufacturerFromMaster(remappedCandidate) || normalizedManufacturerName(remappedCandidate),
  );
  return isPlausibleManufacturerName(finalName) ? finalName : "";
}

export function companyDirectoryName(value: string) {
  const directoryMapping = (source: string) => {
    const first = mappedManufacturerDirectoryName(source);
    if (!first) return undefined;
    const second = mappedManufacturerDirectoryName(first);
    return second && second.length > first.length ? second : first;
  };
  const reviewed = directoryMapping(value);
  if (reviewed && isPlausibleManufacturerName(reviewed)) return collapseRepeatedCompanyName(reviewed).trim();

  // Portal values often prepend a field label to an otherwise reviewed
  // manufacturer name. Remove only the leading label, then consult the same
  // master again instead of maintaining company-specific exceptions.
  const withoutLeadingLabel = value.replace(
    /^\s*[-•"'“”‘’]?\s*(?:(?:hãng\s*\/\s*nhà|hãng|nhà)\s+sản\s+xuất(?:\s+(?:máy|thiết bị)\s+chính)?|hãng\s+sản\s+xuất\s*\/\s*cơ\s+sở\s+sản\s+xuất|manufacturer)\s*:\s*/iu,
    "",
  ).trim();
  if (withoutLeadingLabel !== value.trim()) {
    const reviewedWithoutLabel = directoryMapping(withoutLeadingLabel);
    if (reviewedWithoutLabel) return collapseRepeatedCompanyName(reviewedWithoutLabel).trim();
  }

  const mapped = mappedCompanyName(withoutLeadingLabel || value, withoutLeadingLabel || value).trim();
  // Unreviewed compound portal cells are not one company. Keep them out of
  // autocomplete until item-level attribution is available.
  if (!isPlausibleManufacturerName(mapped)) return "";
  return mapped;
}

export function companyGroupingKey(value: string) {
  const mapped = mappedCompanyName(value, value);
  return normalizeCompanyText(mapped)
    .replace(/\bjoint stock company\b/g, "jsc")
    .replace(/\bcompany\b/g, "co")
    .replace(/\bcorporation\b/g, "corp")
    .replace(/\blimited\b/g, "ltd")
    .replace(/\bincorporated\b/g, "inc")
    .replace(/\bcong ty( co phan| trach nhiem huu han| tnhh)?\b/g, "")
    .replace(/\s/g, "") || "unknown";
}
