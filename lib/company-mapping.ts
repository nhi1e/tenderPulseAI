import { mappedManufacturerFromMaster, normalizedManufacturerName } from "@/lib/classification-rules";

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

export function mappedCompanyName(searchableText: string, fallback = "") {
  const workbookMappedManufacturer = mappedManufacturerFromMaster(fallback);
  if (workbookMappedManufacturer) return workbookMappedManufacturer;

  const normalized = normalizeCompanyText(searchableText);
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

  return collapseRepeatedCompanyName(normalizedManufacturerName(fallback));
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
