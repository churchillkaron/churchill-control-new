import { createHash } from "node:crypto";

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => value[key] !== undefined)
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

export function canonicalCampaignPlanJson(plan) {
  return JSON.stringify(canonical(plan || {}));
}

export function campaignPlanFingerprint(plan) {
  return createHash("sha256")
    .update(canonicalCampaignPlanJson(plan))
    .digest("hex");
}

export default campaignPlanFingerprint;
