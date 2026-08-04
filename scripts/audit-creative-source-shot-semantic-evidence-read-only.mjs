#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function readJson(filePath, label) {
  const absolute = path.resolve(filePath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`${label}_FILE_NOT_FOUND:${absolute}`);
  }
  return {
    absolute,
    value: JSON.parse(fs.readFileSync(absolute, "utf8")),
  };
}

function directionPlan(value = {}) {
  return object(
    value.plan ||
      value.direction?.plan ||
      value.output?.plan ||
      value,
  );
}

function normalized(value) {
  return text(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function flattenStrings(value, output = [], depth = 0) {
  if (depth > 12 || value === null || value === undefined) return output;
  if (typeof value === "string" || typeof value === "number") {
    const item = normalized(value);
    if (item) output.push(item);
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) flattenStrings(item, output, depth + 1);
    return output;
  }
  if (typeof value === "object") {
    for (const child of Object.values(value)) {
      flattenStrings(child, output, depth + 1);
    }
  }
  return output;
}

function evidenceCorpus(asset = {}) {
  return normalized(flattenStrings({
    name: asset.name,
    title: asset.title,
    description: asset.description,
    tags: asset.tags,
    analysis: asset.analysis,
    metadata: asset.metadata,
  }).join(" "));
}

const ANCHORS = [
  {
    id: "DOOR_OR_THRESHOLD",
    triggers: ["door", "doorway", "threshold", "door handle", "opens", "opening"],
    evidence: ["door", "doorway", "entrance door", "threshold", "door handle", "gate"],
  },
  {
    id: "ENTRANCE_OR_EXTERIOR",
    triggers: ["entrance", "exterior", "outside", "facade", "front of churchill"],
    evidence: ["entrance", "exterior", "facade", "outside", "front", "street view"],
  },
  {
    id: "HANDSHAKE",
    triggers: ["handshake", "shake hands", "greeting hands"],
    evidence: ["handshake", "shake hands", "hands greeting", "greeting"],
  },
  {
    id: "FOOD_DISH",
    triggers: ["dish", "plate", "food", "served", "serving food", "signature dish"],
    evidence: ["food", "dish", "plate", "meal", "cuisine", "served food"],
  },
  {
    id: "DRINKS_OR_TOAST",
    triggers: ["drink", "drinks", "toast", "glasses", "clink glasses", "cocktail"],
    evidence: ["drink", "drinks", "glass", "glasses", "cocktail", "beer", "toast"],
  },
  {
    id: "POOL_TABLE",
    triggers: ["pool table", "pool balls", "cue", "billiard"],
    evidence: ["pool table", "billiard", "pool balls", "cue stick", "cue"],
  },
  {
    id: "SHUFFLEBOARD",
    triggers: ["shuffleboard", "puck", "scoring lane"],
    evidence: ["shuffleboard", "puck", "shuffle board"],
  },
  {
    id: "WAITSTAFF_OR_SERVICE",
    triggers: ["waitstaff", "waiter", "waitress", "server", "staff serving"],
    evidence: ["waitstaff", "waiter", "waitress", "server", "staff", "employee"],
  },
  {
    id: "LIVE_BAND_OR_STAGE",
    triggers: ["live band", "band", "stage", "musician", "live music"],
    evidence: ["band", "musician", "stage", "live music", "singer", "guitar", "drums"],
  },
  {
    id: "CROWD_OR_GUEST_GROUP",
    triggers: ["crowd", "guests", "group of guests", "people celebrating"],
    evidence: ["crowd", "guests", "group", "people", "audience", "customers"],
  },
  {
    id: "CHURCHILL_LOGO",
    triggers: ["churchill logo", "logo", "brand mark"],
    evidence: ["churchill logo", "logo", "brand mark", "churchill branding"],
  },
];

function shotCorpus(shot = {}, scene = {}) {
  return normalized(flattenStrings({
    title: shot.title,
    purpose: shot.purpose,
    subject: shot.subject,
    action: shot.action,
    performance: shot.performance,
    opening_frame: shot.opening_frame,
    closing_frame: shot.closing_frame,
    frame_plan: shot.frame_plan,
    camera: shot.camera,
    production_design: shot.production_design,
    props: shot.props,
    location: shot.location,
    scene_title: scene.title,
    scene_objective: scene.objective,
  }).join(" "));
}

function includesAny(corpus, phrases = []) {
  return phrases.some((phrase) => corpus.includes(normalized(phrase)));
}

function requiredAnchors(shot = {}, scene = {}) {
  const corpus = shotCorpus(shot, scene);
  return ANCHORS.filter((anchor) => includesAny(corpus, anchor.triggers));
}

function primarySourceId(shot = {}) {
  return text(
    shot.primary_source_asset_id ||
      shot.generation?.primary_source_asset_id ||
      shot.metadata?.primary_source_asset_id,
  );
}

function evidenceForAnchor(assetCorpus, anchor) {
  return anchor.evidence.filter((phrase) =>
    assetCorpus.includes(normalized(phrase)),
  );
}

const direction = readJson(process.argv[2], "DIRECTION");
const humanReview = readJson(process.argv[3], "HUMAN_REVIEW");
const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
if (!organizationId) throw new Error("ORGANIZATION_ID_REQUIRED");
if (!projectId) throw new Error("CREATIVE_PROJECT_ID_REQUIRED");

const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");
const plan = directionPlan(direction.value);
const shots = [];
for (const scene of list(plan.scenes)) {
  for (const shot of list(scene.shots)) {
    shots.push({ scene, shot });
  }
}

const sourceIds = [...new Set(
  shots.map(({ shot }) => primarySourceId(shot)).filter(Boolean),
)];

const { data: assets, error: assetError } = await supabaseAdmin
  .from("creative_assets")
  .select("id,organization_id,name,title,description,tags,analysis,metadata,archived,file_url,image_url,thumbnail_url")
  .eq("organization_id", organizationId)
  .in("id", sourceIds);
if (assetError) throw assetError;

const assetById = new Map(
  list(assets).map((asset) => [text(asset.id), asset]),
);
const results = [];
const blockers = [];

for (const [index, entry] of shots.entries()) {
  const { scene, shot } = entry;
  const sourceId = primarySourceId(shot);
  const asset = assetById.get(sourceId) || null;
  const corpus = asset ? evidenceCorpus(asset) : "";
  const anchors = requiredAnchors(shot, scene);
  const anchorResults = anchors.map((anchor) => {
    const evidence = evidenceForAnchor(corpus, anchor);
    return {
      anchor: anchor.id,
      passed: evidence.length > 0,
      evidence,
    };
  });
  const failedAnchors = anchorResults.filter((item) => !item.passed);
  const analysisStatus = text(
    asset?.analysis?.status ||
      asset?.metadata?.analysis_status ||
      asset?.analysis_status,
  ).toUpperCase();
  const semanticEvidencePresent = corpus.length >= 20;
  const passed = Boolean(
    sourceId &&
      asset &&
      semanticEvidencePresent &&
      failedAnchors.length === 0,
  );

  const result = {
    scene_number: scene.scene_number ?? null,
    shot_number: shot.shot_number ?? null,
    shot_id: text(shot.id) || `shot-${index + 1}`,
    title: text(shot.title),
    source_asset_id: sourceId || null,
    source_asset_found: Boolean(asset),
    source_asset_name: text(asset?.name || asset?.title) || null,
    analysis_status: analysisStatus || null,
    semantic_evidence_present: semanticEvidencePresent,
    required_anchors: anchorResults,
    failed_anchors: failedAnchors.map((item) => item.anchor),
    passed,
  };
  results.push(result);

  if (!sourceId) {
    blockers.push(`PRIMARY_SOURCE_MISSING:${result.shot_id}`);
  } else if (!asset) {
    blockers.push(`PRIMARY_SOURCE_NOT_FOUND:${result.shot_id}:${sourceId}`);
  } else if (!semanticEvidencePresent) {
    blockers.push(`PRIMARY_SOURCE_SEMANTIC_ANALYSIS_MISSING:${result.shot_id}:${sourceId}`);
  }
  for (const failed of failedAnchors) {
    blockers.push(
      `SOURCE_DOES_NOT_EVIDENCE_REQUIRED_ANCHOR:${result.shot_id}:${sourceId}:${failed.anchor}`,
    );
  }
}

if (humanReview.value.readiness !== "PASS") {
  blockers.push("HUMAN_REVIEW_NOT_READY");
}

const report = {
  contract: "CREATIVE_SOURCE_SHOT_SEMANTIC_EVIDENCE_AUDIT_V1",
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  direction_file: direction.absolute,
  human_review_file: humanReview.absolute,
  read_only: true,
  source_asset_count: sourceIds.length,
  shot_count: results.length,
  passed_shot_count: results.filter((item) => item.passed).length,
  failed_shot_count: results.filter((item) => !item.passed).length,
  results,
  blockers,
  readiness: blockers.length ? "FAIL" : "PASS",
  database_writes_executed: false,
  provider_calls_executed: false,
  wallet_changed: false,
  production_authorized: false,
};

const output = path.resolve(
  text(process.env.SOURCE_SHOT_EVIDENCE_AUDIT_OUTPUT) ||
    "/tmp/churchill-source-shot-semantic-evidence-audit.json",
);
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log("============================================================");
console.log("READ-ONLY SOURCE-TO-SHOT SEMANTIC EVIDENCE AUDIT");
console.log("============================================================");
console.log(`OUTPUT=${output}`);
console.log(`SOURCE_ASSET_COUNT=${report.source_asset_count}`);
console.log(`SHOT_COUNT=${report.shot_count}`);
console.log(`PASSED_SHOT_COUNT=${report.passed_shot_count}`);
console.log(`FAILED_SHOT_COUNT=${report.failed_shot_count}`);
console.log(`SOURCE_SHOT_EVIDENCE_READINESS=${report.readiness}`);
console.log(`SOURCE_SHOT_EVIDENCE_BLOCKER_COUNT=${blockers.length}`);
console.log(`SOURCE_SHOT_EVIDENCE_BLOCKERS=${JSON.stringify(blockers)}`);
console.log("DATABASE_WRITES_EXECUTED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("WALLET_CHANGED=NO");
console.log("PRODUCTION_AUTHORIZED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");
console.log("TERMINAL_REMAINS_OPEN=YES");

for (const result of results) {
  console.log(
    `SHOT_SOURCE_EVIDENCE=${result.scene_number}.${result.shot_number}|${result.shot_id}|source=${result.source_asset_id || "NONE"}|analysis=${result.analysis_status || "NONE"}|required=${result.required_anchors.map((item) => item.anchor).join(",") || "NONE"}|failed=${result.failed_anchors.join(",") || "NONE"}|result=${result.passed ? "PASS" : "FAIL"}`,
  );
}

if (blockers.length) process.exitCode = 2;
