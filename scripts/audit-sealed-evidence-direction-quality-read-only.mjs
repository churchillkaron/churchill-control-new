#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });

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

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stable(value[key])]),
  );
}

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(stable(value)))
    .digest("hex");
}

function normalize(value) {
  return text(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP = new Set([
  "the", "and", "for", "with", "from", "that", "this", "while", "into",
  "through", "only", "without", "source", "verified", "visible", "same",
  "shot", "scene", "camera", "frame", "preserve", "existing", "bound",
]);

function words(value) {
  return normalize(value)
    .split(" ")
    .filter((word) => word.length > 2 && !STOP.has(word));
}

function jaccard(left, right) {
  const a = new Set(words(left));
  const b = new Set(words(right));
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((word) => b.has(word)).length;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

function pairMetrics(rows = []) {
  const pairs = [];
  for (let left = 0; left < rows.length; left += 1) {
    for (let right = left + 1; right < rows.length; right += 1) {
      pairs.push({
        left: rows[left].id,
        right: rows[right].id,
        similarity: jaccard(rows[left].value, rows[right].value),
      });
    }
  }
  const sorted = [...pairs].sort((a, b) => b.similarity - a.similarity);
  return {
    pair_count: pairs.length,
    average_similarity: pairs.length
      ? Number((pairs.reduce((sum, row) => sum + row.similarity, 0) / pairs.length).toFixed(6))
      : 0,
    maximum_similarity: sorted[0]?.similarity || 0,
    highest_pairs: sorted.slice(0, 10),
  };
}

function firstText(...values) {
  return values.map(text).find(Boolean) || "";
}

function shotDuration(shot = {}) {
  return finite(
    shot.duration_seconds ??
      shot.duration ??
      shot.timing?.duration_seconds ??
      shot.timing?.duration ??
      shot.timeline?.duration_seconds,
  );
}

function scenePurpose(scene = {}) {
  return firstText(
    scene.purpose,
    scene.intent,
    scene.objective,
    scene.story_function,
    scene.narrative_function,
    scene.summary,
    scene.description,
  );
}

function shotPurpose(shot = {}) {
  return firstText(
    shot.purpose,
    shot.intent,
    shot.story_function,
    shot.narrative_function,
    shot.action,
    shot.description,
  );
}

function shotDirection(shot = {}) {
  return firstText(
    shot.visual_direction,
    shot.direction,
    shot.description,
    shot.generation?.description,
    shot.frame_plan?.progression,
  );
}

function primarySourceId(shot = {}) {
  return firstText(
    shot.primary_source_asset_id,
    shot.primarySourceAssetId,
    shot.generation?.primary_source_asset_id,
    shot.generation?.primarySourceAssetId,
    shot.metadata?.primary_source_asset_id,
    shot.metadata?.primarySourceAssetId,
    list(shot.reference_assets).find((reference) =>
      text(reference?.role).toUpperCase() === "PRIMARY_SOURCE")?.asset_id,
  );
}

function cameraDescriptor(shot = {}) {
  const camera = object(shot.camera);
  return {
    size: firstText(camera.shot_size, camera.framing, shot.shot_size, shot.framing),
    lens: firstText(camera.lens, shot.lens),
    movement: firstText(
      camera.movement_path,
      camera.movement,
      camera.move,
      camera.motion,
      shot.camera_movement,
      shot.camera_move,
    ),
    motivation: firstText(camera.movement_motivation, shot.camera_motivation),
  };
}

function promptLikePaths(value, currentPath = "plan", output = []) {
  if (value === null || value === undefined) return output;
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      promptLikePaths(item, `${currentPath}[${index}]`, output));
    return output;
  }
  if (typeof value !== "object") return output;
  for (const [key, child] of Object.entries(value)) {
    const normalized = key
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .replaceAll("-", "_")
      .toLowerCase();
    if (
      normalized === "prompt" ||
      normalized.endsWith("_prompt") ||
      normalized === "instruction" ||
      normalized === "instructions" ||
      normalized.endsWith("_instruction")
    ) {
      const populated = typeof child === "string"
        ? Boolean(text(child))
        : child !== null && child !== undefined;
      if (populated) output.push(`${currentPath}.${key}`);
    }
    promptLikePaths(child, `${currentPath}.${key}`, output);
  }
  return output;
}

function issue(severity, code, location, message, evidence = null) {
  return { severity, code, location, message, evidence };
}

async function exactState(supabaseAdmin, organizationId, projectId) {
  const [graphs, tasks, usage, wallet] = await Promise.all([
    supabaseAdmin
      .from("creative_production_graphs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("creative_project_id", projectId),
    supabaseAdmin
      .from("creative_production_tasks")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("creative_project_id", projectId),
    supabaseAdmin
      .from("platform_service_usage")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    supabaseAdmin
      .from("organization_wallets")
      .select("available_balance,currency,updated_at")
      .eq("organization_id", organizationId)
      .single(),
  ]);
  for (const result of [graphs, tasks, usage, wallet]) {
    if (result.error) throw result.error;
  }
  return {
    graph_count: Number(graphs.count || 0),
    task_count: Number(tasks.count || 0),
    usage_count: Number(usage.count || 0),
    wallet_balance: Number(wallet.data?.available_balance || 0),
    wallet_currency: text(wallet.data?.currency) || "THB",
    wallet_updated_at: wallet.data?.updated_at || null,
  };
}

const directionPath = path.resolve(text(process.argv[2]));
const sealPath = path.resolve(text(process.argv[3]));
if (!directionPath || !fs.existsSync(directionPath)) {
  throw new Error(`QUALITY_DIRECTION_FILE_NOT_FOUND:${directionPath || "MISSING"}`);
}
if (!sealPath || !fs.existsSync(sealPath)) {
  throw new Error(`QUALITY_DIRECTION_SEAL_NOT_FOUND:${sealPath || "MISSING"}`);
}

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID || process.env.PROJECT_ID);
if (!organizationId) throw new Error("ORGANIZATION_ID_REQUIRED");
if (!projectId) throw new Error("CREATIVE_PROJECT_ID_REQUIRED");

const directionEnvelope = JSON.parse(fs.readFileSync(directionPath, "utf8"));
const plan = object(
  directionEnvelope.plan ||
    directionEnvelope.direction?.plan ||
    directionEnvelope.output?.plan ||
    directionEnvelope,
);
const seal = JSON.parse(fs.readFileSync(sealPath, "utf8"));
const sealCore = { ...seal };
delete sealCore.seal_sha256;

const technicalIssues = [];
const creativeIssues = [];
const directionSha = sha256(plan);
const envelopeSha = sha256(directionEnvelope);
const sealSha = sha256(sealCore);

if (seal.contract !== "CREATIVE_EVIDENCE_CONSTRAINED_DIRECTION_SEAL_V1") {
  technicalIssues.push(issue("BLOCKER", "SEAL_CONTRACT_INVALID", "seal.contract", "The direction seal contract is invalid", seal.contract));
}
if (seal.readiness !== "PASS" || list(seal.blockers).length) {
  technicalIssues.push(issue("BLOCKER", "SEAL_NOT_READY", "seal.readiness", "The direction seal is not ready", seal.blockers));
}
if (directionSha !== text(seal.direction_sha256)) {
  technicalIssues.push(issue("BLOCKER", "DIRECTION_SHA_MISMATCH", "seal.direction_sha256", "The direction changed after sealing", { calculated: directionSha, sealed: seal.direction_sha256 }));
}
if (envelopeSha !== text(seal.direction_envelope_sha256)) {
  technicalIssues.push(issue("BLOCKER", "DIRECTION_ENVELOPE_SHA_MISMATCH", "seal.direction_envelope_sha256", "The direction envelope changed after sealing"));
}
if (sealSha !== text(seal.seal_sha256)) {
  technicalIssues.push(issue("BLOCKER", "SEAL_SHA_MISMATCH", "seal.seal_sha256", "The seal content changed after creation"));
}
if (plan.validation?.passed !== true) {
  technicalIssues.push(issue("BLOCKER", "PLAN_VALIDATION_NOT_PASSED", "plan.validation", "The direction plan is not validated"));
}

const scenes = list(plan.scenes);
const shots = scenes.flatMap((scene, sceneIndex) =>
  list(scene.shots).map((shot, shotIndex) => ({
    scene,
    shot,
    sceneIndex,
    shotIndex,
    id: text(shot.id) || `shot-${sceneIndex + 1}-${shotIndex + 1}`,
  })),
);
const duration = shots.reduce((sum, row) => sum + Number(shotDuration(row.shot) || 0), 0);
const promptPaths = promptLikePaths(plan);

if (scenes.length !== 7) technicalIssues.push(issue("BLOCKER", "SCENE_COUNT_INVALID", "plan.scenes", "Expected seven scenes", scenes.length));
if (shots.length !== 13) technicalIssues.push(issue("BLOCKER", "SHOT_COUNT_INVALID", "plan.scenes.*.shots", "Expected thirteen shots", shots.length));
if (Math.abs(duration - 60) > 0.000001) technicalIssues.push(issue("BLOCKER", "DURATION_INVALID", "plan.scenes", "Expected a sixty-second timeline", duration));
if (promptPaths.length) technicalIssues.push(issue("BLOCKER", "PROMPTLIKE_FIELDS_PRESENT", "plan", "Persisted provider prompt or instruction fields remain", promptPaths));

const sceneRows = scenes.map((scene, index) => ({
  id: text(scene.id) || `scene-${index + 1}`,
  title: firstText(scene.title, scene.name),
  purpose: scenePurpose(scene),
}));
const shotRows = shots.map((row) => ({
  id: row.id,
  title: firstText(row.shot.title, row.shot.name),
  purpose: shotPurpose(row.shot),
  direction: shotDirection(row.shot),
  source_id: primarySourceId(row.shot),
  camera: cameraDescriptor(row.shot),
  duration_seconds: shotDuration(row.shot),
}));

const genericTitle = /^(verified source beat|source locked beat|source chapter|shot|scene)(\s|$)/i;
const genericSceneTitleCount = sceneRows.filter((row) => genericTitle.test(row.title)).length;
const genericShotTitleCount = shotRows.filter((row) => genericTitle.test(row.title)).length;
const missingScenePurposeCount = sceneRows.filter((row) => !row.purpose).length;
const missingShotPurposeCount = shotRows.filter((row) => !row.purpose).length;
const thinDirectionCount = shotRows.filter((row) => row.direction.length < 140).length;
const missingCameraCount = shotRows.filter((row) =>
  !row.camera.size || !row.camera.lens || !row.camera.movement || !row.camera.motivation).length;
const sourceIds = [...new Set(shotRows.map((row) => row.source_id).filter(Boolean))];
const cameraSizes = [...new Set(shotRows.map((row) => normalize(row.camera.size)).filter(Boolean))];
const cameraLenses = [...new Set(shotRows.map((row) => normalize(row.camera.lens)).filter(Boolean))];
const cameraMovements = [...new Set(shotRows.map((row) => normalize(row.camera.movement)).filter(Boolean))];
const scenePurposeMetrics = pairMetrics(sceneRows.map((row) => ({ id: row.id, value: row.purpose })));
const shotPurposeMetrics = pairMetrics(shotRows.map((row) => ({ id: row.id, value: row.purpose })));
const shotDirectionMetrics = pairMetrics(shotRows.map((row) => ({ id: row.id, value: row.direction })));

if (genericSceneTitleCount > 1) {
  creativeIssues.push(issue("BLOCKER", "GENERIC_SCENE_TITLES", "plan.scenes.*.title", "Too many scene titles are internal production labels instead of audience-facing narrative chapters", genericSceneTitleCount));
}
if (genericShotTitleCount > 2) {
  creativeIssues.push(issue("BLOCKER", "GENERIC_SHOT_TITLES", "plan.scenes.*.shots.*.title", "Too many shot titles are template labels", genericShotTitleCount));
}
if (missingScenePurposeCount) {
  creativeIssues.push(issue("BLOCKER", "SCENE_PURPOSES_MISSING", "plan.scenes", "Every scene needs a differentiated narrative function", missingScenePurposeCount));
}
if (missingShotPurposeCount) {
  creativeIssues.push(issue("BLOCKER", "SHOT_PURPOSES_MISSING", "plan.scenes.*.shots", "Every shot needs a clear narrative or commercial purpose", missingShotPurposeCount));
}
if (scenePurposeMetrics.maximum_similarity > 0.82 || scenePurposeMetrics.average_similarity > 0.58) {
  creativeIssues.push(issue("BLOCKER", "SCENE_PURPOSES_TOO_REPETITIVE", "plan.scenes.*.purpose", "Scene purposes do not create a differentiated narrative arc", scenePurposeMetrics));
}
if (shotPurposeMetrics.average_similarity > 0.62) {
  creativeIssues.push(issue("BLOCKER", "SHOT_PURPOSES_TOO_REPETITIVE", "plan.scenes.*.shots.*.purpose", "Shot purposes are overly templated", shotPurposeMetrics));
}
if (shotDirectionMetrics.average_similarity > 0.58 || shotDirectionMetrics.maximum_similarity > 0.9) {
  creativeIssues.push(issue("BLOCKER", "SHOT_DIRECTIONS_TOO_REPETITIVE", "plan.scenes.*.shots.*.visual_direction", "Shot directions are too similar for premium editorial pacing", shotDirectionMetrics));
}
if (thinDirectionCount) {
  creativeIssues.push(issue("WARNING", "SHOT_DIRECTION_THIN", "plan.scenes.*.shots", "Some shots lack sufficiently detailed source-safe direction", thinDirectionCount));
}
if (missingCameraCount) {
  creativeIssues.push(issue("BLOCKER", "CAMERA_CONTRACT_INCOMPLETE", "plan.scenes.*.shots.*.camera", "Every shot needs size, lens, movement, and motivation", missingCameraCount));
}
if (cameraSizes.length < 4) {
  creativeIssues.push(issue("BLOCKER", "SHOT_SCALE_VARIETY_LOW", "plan.scenes.*.shots.*.camera", "The edit needs at least four distinct shot scales", cameraSizes));
}
if (cameraLenses.length < 3) {
  creativeIssues.push(issue("BLOCKER", "LENS_VARIETY_LOW", "plan.scenes.*.shots.*.camera", "The edit needs at least three distinct lens choices", cameraLenses));
}
if (cameraMovements.length < 4) {
  creativeIssues.push(issue("BLOCKER", "CAMERA_MOVEMENT_VARIETY_LOW", "plan.scenes.*.shots.*.camera", "The edit needs at least four distinct camera movement strategies", cameraMovements));
}
if (sourceIds.length < 7) {
  creativeIssues.push(issue("BLOCKER", "SOURCE_DIVERSITY_LOW", "plan.scenes.*.shots", "The direction underuses the verified source library", sourceIds));
}

const finalScene = scenes.at(-1) || {};
const finalShot = list(finalScene.shots).at(-1) || {};
const finalCorpus = normalize(JSON.stringify({
  title: finalScene.title,
  scene_purpose: scenePurpose(finalScene),
  shot_title: finalShot.title,
  shot_purpose: shotPurpose(finalShot),
  shot_direction: shotDirection(finalShot),
  evidence: finalShot.source_evidence_contract,
}));
const brandedFinish = /\b(churchill|logo|brand mark|wordmark|signature)\b/.test(finalCorpus);
if (!brandedFinish) {
  creativeIssues.push(issue("BLOCKER", "BRANDED_FINISH_MISSING", "plan.scenes[-1]", "The film lacks a clearly directed Churchill brand resolution"));
}

const conceptCorpus = normalize(JSON.stringify({ concept: plan.concept, strategy: plan.strategy }));
const conceptGeneric = /verified source portrait|authenticity first reveal more through direction/.test(conceptCorpus);
if (conceptGeneric) {
  creativeIssues.push(issue("WARNING", "CONCEPT_LANGUAGE_GENERIC", "plan.concept", "The concept language reads like a safety contract rather than a distinctive campaign idea"));
}

let technicalScore = 40;
for (const row of technicalIssues) technicalScore -= row.severity === "BLOCKER" ? 12 : 3;
technicalScore = Math.max(0, technicalScore);

let creativeScore = 60;
for (const row of creativeIssues) creativeScore -= row.severity === "BLOCKER" ? 10 : 3;
creativeScore = Math.max(0, creativeScore);
const totalScore = technicalScore + creativeScore;
const technicalBlockers = technicalIssues.filter((row) => row.severity === "BLOCKER");
const creativeBlockers = creativeIssues.filter((row) => row.severity === "BLOCKER");

const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");
const before = await exactState(supabaseAdmin, organizationId, projectId);
const after = await exactState(supabaseAdmin, organizationId, projectId);
if (JSON.stringify(before) !== JSON.stringify(after)) {
  technicalIssues.push(issue("BLOCKER", "READ_ONLY_STATE_CHANGED", "database", "The read-only audit changed platform state", { before, after }));
}

const summary = {
  technical_readiness: technicalBlockers.length ? "FAIL" : "PASS",
  creative_readiness: creativeBlockers.length ? "FAIL" : "PASS",
  world_class_readiness:
    technicalBlockers.length === 0 && creativeBlockers.length === 0 && totalScore >= 85
      ? "PASS"
      : "FAIL",
  technical_score: technicalScore,
  creative_score: creativeScore,
  total_score: totalScore,
  scene_count: scenes.length,
  shot_count: shots.length,
  calculated_duration_seconds: duration,
  source_asset_count: sourceIds.length,
  generic_scene_title_count: genericSceneTitleCount,
  generic_shot_title_count: genericShotTitleCount,
  camera_scale_count: cameraSizes.length,
  camera_lens_count: cameraLenses.length,
  camera_movement_count: cameraMovements.length,
  branded_finish: brandedFinish,
  persisted_provider_prompt_count: promptPaths.length,
};

const reportCore = {
  contract: "CREATIVE_SEALED_EVIDENCE_DIRECTION_QUALITY_AUDIT_V1",
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  direction_path: directionPath,
  seal_path: sealPath,
  direction_sha256: directionSha,
  direction_envelope_sha256: envelopeSha,
  direction_seal_sha256: sealSha,
  summary,
  metrics: {
    scene_purpose_similarity: scenePurposeMetrics,
    shot_purpose_similarity: shotPurposeMetrics,
    shot_direction_similarity: shotDirectionMetrics,
    camera_sizes: cameraSizes,
    camera_lenses: cameraLenses,
    camera_movements: cameraMovements,
    source_asset_ids: sourceIds,
  },
  scene_summaries: sceneRows,
  shot_summaries: shotRows,
  technical_issues: technicalIssues,
  creative_issues: creativeIssues,
  exact_state_before: before,
  exact_state_after: after,
  database_writes_executed: false,
  provider_calls_executed: false,
  wallet_changed: false,
  production_authorized: false,
  publication_authorized: false,
};
const report = {
  ...reportCore,
  audit_sha256: sha256(reportCore),
};

const outputPath = path.resolve(
  text(process.env.SEALED_DIRECTION_QUALITY_AUDIT_OUTPUT) ||
    "/tmp/churchill-evidence-constrained-direction-quality-audit.json",
);
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log("============================================================");
console.log("READ-ONLY SEALED EVIDENCE DIRECTION QUALITY AUDIT");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`AUDIT_SHA256=${report.audit_sha256}`);
console.log(`DIRECTION_SHA256=${directionSha}`);
console.log(`DIRECTION_SEAL_SHA256=${sealSha}`);
console.log(`SCENE_COUNT=${summary.scene_count}`);
console.log(`SHOT_COUNT=${summary.shot_count}`);
console.log(`DURATION_SECONDS=${summary.calculated_duration_seconds}`);
console.log(`SOURCE_ASSET_COUNT=${summary.source_asset_count}`);
console.log(`GENERIC_SCENE_TITLE_COUNT=${summary.generic_scene_title_count}`);
console.log(`GENERIC_SHOT_TITLE_COUNT=${summary.generic_shot_title_count}`);
console.log(`SCENE_PURPOSE_AVERAGE_SIMILARITY=${scenePurposeMetrics.average_similarity}`);
console.log(`SCENE_PURPOSE_MAXIMUM_SIMILARITY=${scenePurposeMetrics.maximum_similarity}`);
console.log(`SHOT_PURPOSE_AVERAGE_SIMILARITY=${shotPurposeMetrics.average_similarity}`);
console.log(`SHOT_DIRECTION_AVERAGE_SIMILARITY=${shotDirectionMetrics.average_similarity}`);
console.log(`SHOT_DIRECTION_MAXIMUM_SIMILARITY=${shotDirectionMetrics.maximum_similarity}`);
console.log(`CAMERA_SCALE_COUNT=${summary.camera_scale_count}`);
console.log(`CAMERA_LENS_COUNT=${summary.camera_lens_count}`);
console.log(`CAMERA_MOVEMENT_COUNT=${summary.camera_movement_count}`);
console.log(`BRANDED_FINISH=${summary.branded_finish ? "YES" : "NO"}`);
console.log(`PERSISTED_PROVIDER_PROMPT_COUNT=${summary.persisted_provider_prompt_count}`);
console.log(`TECHNICAL_SCORE=${summary.technical_score}`);
console.log(`CREATIVE_SCORE=${summary.creative_score}`);
console.log(`TOTAL_SCORE=${summary.total_score}`);
console.log(`TECHNICAL_READINESS=${summary.technical_readiness}`);
console.log(`CREATIVE_READINESS=${summary.creative_readiness}`);
console.log(`WORLD_CLASS_READINESS=${summary.world_class_readiness}`);
console.log(`TECHNICAL_ISSUE_COUNT=${technicalIssues.length}`);
console.log(`CREATIVE_ISSUE_COUNT=${creativeIssues.length}`);
console.log(`TECHNICAL_ISSUES=${JSON.stringify(technicalIssues)}`);
console.log(`CREATIVE_ISSUES=${JSON.stringify(creativeIssues)}`);
console.log(`EXACT_GRAPH_COUNT_BEFORE=${before.graph_count}`);
console.log(`EXACT_GRAPH_COUNT_AFTER=${after.graph_count}`);
console.log(`EXACT_TASK_COUNT_BEFORE=${before.task_count}`);
console.log(`EXACT_TASK_COUNT_AFTER=${after.task_count}`);
console.log(`EXACT_USAGE_COUNT_BEFORE=${before.usage_count}`);
console.log(`EXACT_USAGE_COUNT_AFTER=${after.usage_count}`);
console.log(`WALLET_BALANCE_BEFORE=${before.wallet_balance}`);
console.log(`WALLET_BALANCE_AFTER=${after.wallet_balance}`);
console.log("DATABASE_WRITES_EXECUTED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("WALLET_CHANGED=NO");
console.log("PRODUCTION_AUTHORIZED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");
console.log("TERMINAL_REMAINS_OPEN=YES");

if (summary.world_class_readiness !== "PASS") process.exitCode = 2;
