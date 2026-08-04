#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const target = path.resolve(
  process.cwd(),
  "lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js",
);

const source = fs.readFileSync(target, "utf8");

const oldSchema = String.raw`  "reference_assets": [{"asset_id":"exact asset id", "role":"specific role"}],
  "reference_asset_ids": [],
  "negative_constraints": [],`;

const newSchema = String.raw`  "primary_source_asset_id": "exact asset id or null for a fully synthetic source-free shot",
  "reference_assets": [{
    "asset_id": "exact supplied asset id",
    "role": "PRIMARY_SOURCE|IDENTITY_REFERENCE|LOCATION_REFERENCE|CONTINUITY_REFERENCE|PRODUCT_REFERENCE|STYLE_REFERENCE|BRAND_REFERENCE|SUBJECT_REFERENCE|AUDIO_REFERENCE",
    "reason": "specific evidence-based reason this asset is required for this shot"
  }],
  "reference_asset_ids": [],
  "negative_constraints": [],`;

const oldRules = String.raw`- Use exact supplied asset ids only; do not invent assets.
- Generated pixels must not be trusted for final logos, typography, subtitles or legal text.`;

const newRules = String.raw`- Use exact supplied asset ids only; do not invent assets.
- reference_assets is the only authoritative shot-reference field and every entry must be a typed object.
- reference_asset_ids must always be an empty array in fresh direction output; it is legacy context only.
- Every shot using any uploaded source or reference must declare exactly one PRIMARY_SOURCE entry.
- primary_source_asset_id must exactly match that one PRIMARY_SOURCE entry.
- Fully synthetic source-free shots must use primary_source_asset_id null and reference_assets [].
- Never use PRIMARY_SOURCE for audio; soundtrack and audio evidence use AUDIO_REFERENCE.
- Use IDENTITY_REFERENCE only when the asset evidence contains a person or identity.
- Use LOCATION_REFERENCE only when the asset evidence contains a location or environment.
- Use PRODUCT_REFERENCE only when the asset evidence contains a product or physical item.
- Use BRAND_REFERENCE only when the asset evidence contains a logo, wordmark, signage or brand mark.
- CONTINUITY_REFERENCE, STYLE_REFERENCE and SUBJECT_REFERENCE are contextual references and never replace PRIMARY_SOURCE.
- Do not emit repair_version, legacy_repair_version or any metadata copied from an earlier plan.
- Do not populate provider source arrays such as source_asset_ids, image_urls, reference_images or asset_ids.
- Generated pixels must not be trusted for final logos, typography, subtitles or legal text.`;

const schemaCount = source.split(oldSchema).length - 1;
const rulesCount = source.split(oldRules).length - 1;

if (schemaCount === 0 && source.includes(newSchema)) {
  console.log("TYPED_REFERENCE_SCHEMA_ALREADY_APPLIED=YES");
} else if (schemaCount !== 1) {
  throw new Error(`TYPED_REFERENCE_SCHEMA_MATCH_COUNT_INVALID:${schemaCount}`);
}

if (rulesCount === 0 && source.includes(newRules)) {
  console.log("TYPED_REFERENCE_RULES_ALREADY_APPLIED=YES");
} else if (rulesCount !== 1) {
  throw new Error(`TYPED_REFERENCE_RULES_MATCH_COUNT_INVALID:${rulesCount}`);
}

let updated = source;
if (schemaCount === 1) updated = updated.replace(oldSchema, newSchema);
if (rulesCount === 1) updated = updated.replace(oldRules, newRules);

if (updated !== source) {
  fs.writeFileSync(target, updated, "utf8");
  console.log("TYPED_REFERENCE_PROMPT_PATCH_APPLIED=YES");
} else {
  console.log("TYPED_REFERENCE_PROMPT_PATCH_APPLIED=NO");
}

const finalSchemaCount = updated.split(newSchema).length - 1;
const finalRulesCount = updated.split(newRules).length - 1;
const oldSchemaRemaining = updated.split(oldSchema).length - 1;
const oldRulesRemaining = updated.split(oldRules).length - 1;

console.log(`TYPED_REFERENCE_SCHEMA_COUNT=${finalSchemaCount}`);
console.log(`TYPED_REFERENCE_RULES_COUNT=${finalRulesCount}`);
console.log(`LEGACY_MIXED_SCHEMA_COUNT=${oldSchemaRemaining}`);
console.log(`LEGACY_RULE_BLOCK_COUNT=${oldRulesRemaining}`);

if (finalSchemaCount !== 1) throw new Error("TYPED_REFERENCE_SCHEMA_REQUIRED");
if (finalRulesCount !== 1) throw new Error("TYPED_REFERENCE_RULES_REQUIRED");
if (oldSchemaRemaining !== 0) throw new Error("LEGACY_MIXED_SCHEMA_REMAINS");
if (oldRulesRemaining !== 0) throw new Error("LEGACY_RULE_BLOCK_REMAINS");

console.log("FRESH_DIRECTION_TYPED_REFERENCE_PROMPT=PASS");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("WALLET_CHANGED=NO");
console.log("DIRECTION_CREATED=NO");
console.log("GRAPH_CREATED=NO");
console.log("TASKS_CREATED=NO");
