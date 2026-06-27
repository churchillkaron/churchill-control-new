/**
 * TAX RULE RESOLVER (CONFIG DRIVEN)
 * In real ERP: comes from DB per entity/country
 */

// temporary fallback config (WILL BE DB DRIVEN LATER)
const TAX_RULES = {
  TH: { type: "VAT", rate: 0.07 },
  SG: { type: "GST", rate: 0.09 },
  AU: { type: "GST", rate: 0.10 },
  IN: { type: "GST", rate: 0.18 },
  US: { type: "SALES_TAX", rate: 0.0 },
  DEFAULT: { type: "NONE", rate: 0 }
};

export function resolveTaxRule(country = "DEFAULT") {
  return TAX_RULES[country] || TAX_RULES.DEFAULT;
}
