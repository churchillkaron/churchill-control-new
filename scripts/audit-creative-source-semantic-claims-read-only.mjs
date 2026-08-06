#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const text = (value) => String(value ?? "").trim();
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const list = (value) => Array.isArray(value) ? value.filter(Boolean) : [];
const normalize = (value) => text(value)
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

function leaves(value, prefix = "analysis", output = []) {
  if (value === null || value === undefined) return output;
  if (["string", "number", "boolean"].includes(typeof value)) {
    const rendered = text(value);
    if (rendered) output.push({ path: prefix, value: rendered });
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => leaves(item, `${prefix}[${index}]`, output));
    return output;
  }
  if (typeof value === "object") {
    Object.entries(value).forEach(([key, child]) =>
      leaves(child, `${prefix}.${key}`, output));
  }
  return output;
}

function semanticOnly(analysis = {}) {
  return {
    status: analysis.status,
    verification_reason: analysis.verification_reason,
    media_kind: analysis.media_kind,
    scene_type: analysis.scene_type,
    description: analysis.description,
    summary: analysis.summary,
    tags: analysis.tags,
    visible_subjects: analysis.visible_subjects,
    objects: analysis.objects,
    activities: analysis.activities,
    environments: analysis.environments,
    visible_text: analysis.visible_text,
    logos: analysis.logos,
    evidence: analysis.evidence,
    location_anchors: analysis.location_anchors,
    frame_samples: analysis.frame_samples,
  };
}

function matches(rows, phrases) {
  const normalized = phrases.map(normalize);
  return rows.filter((row) => {
    const value = normalize(row.value);
    return normalized.some((phrase) => value.includes(phrase));
  });
}

const organizationId = text(process.env.ORGANIZATION_ID);
const assetId = text(process.argv[2]);
if (!organizationId) throw new Error("ORGANIZATION_ID_REQUIRED");
if (!assetId) throw new Error("SOURCE_ASSET_ID_REQUIRED");

const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");
const { data: asset, error } = await supabaseAdmin
  .from("creative_assets")
  .select("id,file_name,asset_type,analysis,metadata,updated_at")
  .eq("organization_id", organizationId)
  .eq("id", assetId)
  .single();
if (error) throw error;

const analysis = object(asset.analysis);
const semantic = semanticOnly(analysis);
const allLeaves = leaves(semantic);
const doorPhrases = ["door", "doorway", "threshold", "door handle"];
const entrancePhrases = ["entrance", "exterior", "facade", "outside", "street"];
const logoPhrases = ["churchill", "logo", "brand mark"];
const doorMentions = matches(allLeaves, doorPhrases);
const entranceMentions = matches(allLeaves, entrancePhrases);
const logoMentions = matches(allLeaves, logoPhrases);
const objectLeaves = leaves(list(analysis.objects), "analysis.objects");
const structuredDoorMentions = matches(objectLeaves, doorPhrases);

const report = {
  contract: "CREATIVE_SOURCE_SEMANTIC_CLAIM_DISCLOSURE_V1",
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  asset: {
    id: asset.id,
    file_name: asset.file_name,
    asset_type: asset.asset_type,
    updated_at: asset.updated_at,
  },
  status: analysis.status || null,
  semantic,
  counts: {
    semantic_leaf_count: allLeaves.length,
    door_mention_count: doorMentions.length,
    structured_door_object_mention_count: structuredDoorMentions.length,
    entrance_mention_count: entranceMentions.length,
    logo_mention_count: logoMentions.length,
  },
  door_mentions: doorMentions,
  structured_door_object_mentions: structuredDoorMentions,
  entrance_mentions: entranceMentions,
  logo_mentions: logoMentions,
  database_writes_executed: false,
  provider_calls_executed: false,
  wallet_changed: false,
  production_authorized: false,
};

const output = path.resolve(
  text(process.env.SOURCE_SEMANTIC_CLAIM_AUDIT_OUTPUT) ||
    `/tmp/churchill-source-semantic-claims-${assetId}.json`,
);
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log("============================================================");
console.log("READ-ONLY SOURCE SEMANTIC CLAIM DISCLOSURE");
console.log("============================================================");
console.log(`OUTPUT=${output}`);
console.log(`ASSET_ID=${asset.id}`);
console.log(`FILE_NAME=${asset.file_name || "NONE"}`);
console.log(`ANALYSIS_STATUS=${analysis.status || "NONE"}`);
console.log(`SEMANTIC_LEAF_COUNT=${report.counts.semantic_leaf_count}`);
console.log(`DOOR_MENTION_COUNT=${report.counts.door_mention_count}`);
console.log(`STRUCTURED_DOOR_OBJECT_MENTION_COUNT=${report.counts.structured_door_object_mention_count}`);
console.log(`ENTRANCE_MENTION_COUNT=${report.counts.entrance_mention_count}`);
console.log(`LOGO_MENTION_COUNT=${report.counts.logo_mention_count}`);
console.log("DATABASE_WRITES_EXECUTED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("WALLET_CHANGED=NO");
console.log("PRODUCTION_AUTHORIZED=NO");

for (const row of doorMentions) {
  console.log(`DOOR_CLAIM|${row.path}|${row.value.replaceAll("|", "/")}`);
}
for (const row of structuredDoorMentions) {
  console.log(`STRUCTURED_DOOR_OBJECT_CLAIM|${row.path}|${row.value.replaceAll("|", "/")}`);
}
for (const row of entranceMentions) {
  console.log(`ENTRANCE_CLAIM|${row.path}|${row.value.replaceAll("|", "/")}`);
}
