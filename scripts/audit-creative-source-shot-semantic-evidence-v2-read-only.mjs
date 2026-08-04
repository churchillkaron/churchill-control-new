#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const list = (v) => Array.isArray(v) ? v.filter(Boolean) : [];
const obj = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
const txt = (v) => String(v ?? "").trim();
const norm = (v) => txt(v).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

function readJson(file, label) {
  const absolute = path.resolve(file);
  if (!fs.existsSync(absolute)) throw new Error(`${label}_FILE_NOT_FOUND:${absolute}`);
  return { absolute, value: JSON.parse(fs.readFileSync(absolute, "utf8")) };
}

function flatten(value, out = []) {
  if (value == null) return out;
  if (["string", "number", "boolean"].includes(typeof value)) {
    const n = norm(value); if (n) out.push(n); return out;
  }
  if (Array.isArray(value)) { for (const item of value) flatten(item, out); return out; }
  if (typeof value === "object") { for (const item of Object.values(value)) flatten(item, out); }
  return out;
}

const ANCHORS = [
  ["DOOR_OR_THRESHOLD", ["door", "doorway", "threshold", "door handle", "creaks open"], ["door", "doorway", "threshold", "door handle"]],
  ["ENTRANCE_OR_EXTERIOR", ["entrance", "exterior", "outside", "facade"], ["entrance", "exterior", "outside", "facade", "street"]],
  ["HANDSHAKE", ["handshake", "shake hands"], ["handshake", "shaking hands"]],
  ["FOOD_DISH", ["dish", "plate", "food", "meal"], ["dish", "plate", "food", "meal"]],
  ["DRINKS_OR_TOAST", ["drink", "drinks", "toast", "glasses", "cocktail"], ["drink", "glass", "glasses", "cocktail", "beer", "toast"]],
  ["POOL_TABLE", ["pool table", "pool balls", "cue", "billiard"], ["pool table", "pool balls", "cue", "billiard"]],
  ["SHUFFLEBOARD", ["shuffleboard", "puck", "scoring lane"], ["shuffleboard", "puck"]],
  ["WAITSTAFF_OR_SERVICE", ["waitstaff", "waiter", "waitress", "server", "staff serving"], ["waitstaff", "waiter", "waitress", "server", "staff serving"]],
  ["LIVE_BAND_OR_STAGE", ["live band", "band", "stage", "musician", "live music"], ["band", "stage", "musician", "live music", "singer", "guitar", "drums"]],
  ["CROWD_OR_GUEST_GROUP", ["crowd", "guests", "group of guests", "people celebrating"], ["crowd", "guests", "group of people", "audience", "customers"]],
  ["CHURCHILL_LOGO", ["churchill logo", "logo", "brand mark"], ["churchill", "logo", "brand mark"]],
].map(([id, triggers, evidence]) => ({ id, triggers, evidence }));

function shotText(shot = {}) {
  return norm(flatten({
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
  }).join(" "));
}

function visualEvidenceText(asset = {}) {
  const a = obj(asset.analysis);
  return norm(flatten({
    description: a.description,
    summary: a.summary,
    tags: a.tags,
    visible_subjects: a.visible_subjects,
    objects: a.objects,
    activities: a.activities,
    environments: a.environments,
    visible_text: a.visible_text,
    logos: a.logos,
    evidence: a.evidence,
    frame_samples: a.frame_samples,
  }).join(" "));
}

function sourceId(shot = {}) {
  return txt(shot.primary_source_asset_id || shot.generation?.primary_source_asset_id || shot.metadata?.primary_source_asset_id);
}

const direction = readJson(process.argv[2], "DIRECTION");
const review = readJson(process.argv[3], "HUMAN_REVIEW");
const organizationId = txt(process.env.ORGANIZATION_ID);
const projectId = txt(process.env.CREATIVE_PROJECT_ID);
if (!organizationId) throw new Error("ORGANIZATION_ID_REQUIRED");
if (!projectId) throw new Error("CREATIVE_PROJECT_ID_REQUIRED");

const plan = obj(direction.value.plan || direction.value.direction?.plan || direction.value.output?.plan || direction.value);
const shots = [];
for (const [si, scene] of list(plan.scenes).entries()) {
  for (const [qi, shot] of list(scene.shots).entries()) {
    shots.push({ scene_number: scene.scene_number ?? si + 1, shot_number: shot.shot_number ?? qi + 1, shot });
  }
}
const ids = [...new Set(shots.map((x) => sourceId(x.shot)).filter(Boolean))];
const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");
const { data, error } = await supabaseAdmin.from("creative_assets").select("id,analysis").eq("organization_id", organizationId).in("id", ids);
if (error) throw error;
const byId = new Map(list(data).map((a) => [txt(a.id), a]));

const results = [];
const blockers = [];
for (const entry of shots) {
  const id = sourceId(entry.shot);
  const asset = byId.get(id);
  const corpus = asset ? visualEvidenceText(asset) : "";
  const semanticVerified = txt(asset?.analysis?.status).toUpperCase() === "VERIFIED" && corpus.length > 0;
  const required = ANCHORS.filter((a) => a.triggers.some((p) => shotText(entry.shot).includes(norm(p))));
  const checks = required.map((a) => ({
    anchor: a.id,
    passed: a.evidence.some((p) => corpus.includes(norm(p))),
    matched: a.evidence.filter((p) => corpus.includes(norm(p))),
  }));
  const failed = checks.filter((x) => !x.passed).map((x) => x.anchor);
  const passed = Boolean(id && asset && semanticVerified && failed.length === 0);
  const shotId = txt(entry.shot.id) || `scene-${entry.scene_number}-shot-${entry.shot_number}`;
  results.push({ ...entry, shot_id: shotId, source_asset_id: id || null, semantic_verified: semanticVerified, required_anchors: checks, failed_anchors: failed, passed });
  if (!id) blockers.push(`PRIMARY_SOURCE_MISSING:${shotId}`);
  else if (!asset) blockers.push(`PRIMARY_SOURCE_NOT_FOUND:${shotId}:${id}`);
  else if (!semanticVerified) blockers.push(`PRIMARY_SOURCE_SEMANTIC_NOT_VERIFIED:${shotId}:${id}`);
  for (const anchor of failed) blockers.push(`SOURCE_DOES_NOT_EVIDENCE_REQUIRED_ANCHOR:${shotId}:${id}:${anchor}`);
}
if (review.value.readiness !== "PASS") blockers.push("HUMAN_REVIEW_NOT_READY");

const report = {
  contract: "CREATIVE_SOURCE_SHOT_SEMANTIC_EVIDENCE_AUDIT_V2",
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  source_asset_count: ids.length,
  shot_count: results.length,
  passed_shot_count: results.filter((x) => x.passed).length,
  failed_shot_count: results.filter((x) => !x.passed).length,
  results,
  blockers,
  readiness: blockers.length ? "FAIL" : "PASS",
  database_writes_executed: false,
  provider_calls_executed: false,
  wallet_changed: false,
  production_authorized: false,
  publication_authorized: false,
};
const output = path.resolve(txt(process.env.SOURCE_SHOT_EVIDENCE_AUDIT_OUTPUT) || "/tmp/churchill-source-shot-semantic-evidence-v2-audit.json");
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);

console.log("============================================================");
console.log("READ-ONLY SOURCE-TO-SHOT SEMANTIC EVIDENCE AUDIT V2");
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
for (const r of results) console.log(`SHOT_SOURCE_EVIDENCE=${r.scene_number}.${r.shot_number}|${r.shot_id}|source=${r.source_asset_id || "NONE"}|verified=${r.semantic_verified ? "YES" : "NO"}|required=${r.required_anchors.map((x) => x.anchor).join(",") || "NONE"}|failed=${r.failed_anchors.join(",") || "NONE"}|result=${r.passed ? "PASS" : "FAIL"}`);
if (blockers.length) process.exitCode = 2;
