import ThailandPayrollPack from "./thailand";
import UAEPayrollPack from "./uae";

const COUNTRY_ALIASES = Object.freeze({
  TH: "TH",
  THAILAND: "TH",
  AE: "AE",
  UAE: "AE",
  "UNITED ARAB EMIRATES": "AE",
});

const COUNTRY_PACKS = Object.freeze({
  TH: ThailandPayrollPack,
  AE: UAEPayrollPack,
});

export function normalizePayrollCountry(country) {
  const value = String(country || "").trim().toUpperCase();
  return COUNTRY_ALIASES[value] || value;
}

export function supportsPayrollCountry(country) {
  return Boolean(COUNTRY_PACKS[normalizePayrollCountry(country)]);
}

export default function loadPayrollCountryPack(country) {
  const normalizedCountry = normalizePayrollCountry(country);
  const countryPack = COUNTRY_PACKS[normalizedCountry];

  if (!countryPack) {
    throw new Error(
      `Unsupported payroll country: ${String(country || "not configured")}`
    );
  }

  return countryPack;
}
