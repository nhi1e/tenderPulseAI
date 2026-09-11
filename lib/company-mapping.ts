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

  return normalizedManufacturerName(fallback);
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
