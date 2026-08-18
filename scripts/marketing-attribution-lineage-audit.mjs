import fs from "node:fs";

const outcomePath = "lib/marketing/intelligence/MarketingOutcomeAttributionRuntime.js";
const projectionPath = "lib/marketing/intelligence/MarketingBusinessOutcomeProjectionRuntime.js";

for (const file of [outcomePath, projectionPath]) {
  if (!fs.existsSync(file)) throw new Error(`Missing attribution lineage file: ${file}`);
}

const outcome = fs.readFileSync(outcomePath, "utf8");
const projection = fs.readFileSync(projectionPath, "utf8");

for (const signal of [
  "resolveLineage",
  "source_document_type",
  "source_document_id",
  "lead_id",
  "reservation_id",
  "order_id",
  "invoice_id",
]) {
  if (!outcome.includes(signal)) throw new Error(`Missing deterministic lineage signal: ${signal}`);
}

for (const signal of [
  "attribution_parent",
  "INHERITED_DIRECT",
  "inherited_attribution",
  "inherited_from_attribution_id",
  "ATTRIBUTION_SIGNATURE_INVALID",
]) {
  if (!projection.includes(signal)) throw new Error(`Missing lineage projection control: ${signal}`);
}

if (/executeProvider|WalletRuntime|ManagedMediaSpendRuntime/.test(outcome + projection)) {
  throw new Error("Attribution lineage must not execute providers or touch advertising funds");
}

if (!projection.includes("if (direct.invalidExternalReason || direct.marketingCampaignId) return direct;")) {
  throw new Error("Invalid signed attribution must not fall back to inherited lineage");
}

console.log("PASS marketing attribution lineage audit");
