#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const CONTRACT = "AVANTIQO_MUSIC_ELASTIC_PRODUCTION_RUNTIME_PROMOTION_V1";
const CERTIFICATION_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_PRODUCTION_CERTIFICATION_V1";
const CAPABILITY = "ai.audio.elastic-warp";
const PROVIDER = "avantiqo-audio";
const MODEL = "signalsmith-stretch";
const QUALITY_PROFILE = "SIGNALSMITH_REVIEWED_TRANSIENT_WARP_V1";
const ENGINE_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_AUDIO_ENGINE_V1";
const TECHNICAL_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_CONTROLLED_RENDER_CERTIFICATION_V1";
const HUMAN_REVIEW_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_HUMAN_LISTENING_REVIEW_V1";
const APPROVAL_ENV = "AVANTIQO_MUSIC_ELASTIC_RUNTIME_PROMOTION_APPROVED";
const ENDPOINT_ENV = "RUNPOD_AVANTIQO_MUSIC_ELASTIC_ENDPOINT_ID";
const ENABLED_ENV = "AVANTIQO_MUSIC_ELASTIC_ENGINE_ENABLED";
const CERTIFIED_ENV = "AVANTIQO_MUSIC_ELASTIC_ENGINE_CERTIFIED";
const EXPECTED_PROJECT_ID = "prj_5K2x3kGkhs3d2PU8VOQQPyNT24A9";
const EXPECTED_ORG_ID = "team_40jy42BqQOs4U6pVdkawwEfp";

const text = (value) => String(value ?? "").trim();
const yes = (value) => text(value).toUpperCase() === "YES";
const enabled = (value) => ["1", "true", "yes", "on"].includes(text(value).toLowerCase());
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const hashText = (value) => sha256(Buffer.from(text(value), "utf8"));

function arg(prefix) {
  return text(process.argv.slice(2).find((entry) => entry.startsWith(prefix))?.slice(prefix.length));
}

function fileJson(filePath) {
  const bytes = fs.readFileSync(filePath);
  return { bytes, json: JSON.parse(bytes.toString("utf8")) };
}

function findLatestCertification() {
  const explicit = arg("--certification=") || text(process.env.AVANTIQO_MUSIC_ELASTIC_PRODUCTION_CERTIFICATION_OUTPUT);
  if (explicit) {
    const resolved = path.resolve(explicit);
    if (!fs.existsSync(resolved)) throw new Error("AVANTIQO_MUSIC_ELASTIC_PRODUCTION_CERTIFICATION_FILE_NOT_FOUND");
    return resolved;
  }

  const dirs = [...new Set([os.tmpdir(), "/tmp"])];
  const matches = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith(".json")) continue;
      const candidate = path.join(dir, name);
      try {
        const stat = fs.statSync(candidate);
        if (!stat.isFile()) continue;
        const value = JSON.parse(fs.readFileSync(candidate, "utf8"));
        if (
          value?.success === true &&
          text(value?.contract) === CERTIFICATION_CONTRACT &&
          value?.production_certified === true
        ) matches.push({ path: candidate, mtime: stat.mtimeMs });
      } catch {}
    }
  }
  matches.sort((a, b) => b.mtime - a.mtime);
  if (!matches.length) throw new Error("AVANTIQO_MUSIC_ELASTIC_PRODUCTION_CERTIFICATION_NOT_FOUND");
  return matches[0].path;
}

function validateCertification(certificationPath) {
  const { bytes, json: certification } = fileJson(certificationPath);
  const failures = [];
  const check = (name, condition) => { if (!condition) failures.push(name); };

  check("success", certification?.success === true);
  check("contract", text(certification?.contract) === CERTIFICATION_CONTRACT);
  check("capability", text(certification?.capability) === CAPABILITY);
  check("provider", text(certification?.provider) === PROVIDER);
  check("model", text(certification?.model) === MODEL);
  check("quality_profile", text(certification?.quality_profile) === QUALITY_PROFILE);
  check("engine_contract", text(certification?.engine_contract) === ENGINE_CONTRACT);
  check("technical_contract", text(certification?.technical_contract) === TECHNICAL_CONTRACT);
  check("human_review_contract", text(certification?.human_review_contract) === HUMAN_REVIEW_CONTRACT);
  check("production_certified", certification?.production_certified === true);
  check("production_routing_allowed", certification?.production_routing_allowed_after_runtime_configuration === true);
  check("automatic_apply_forbidden", certification?.automatic_apply_forbidden === true);
  check("musician_plan_required", certification?.explicit_musician_warp_plan_required === true);
  check("provider_not_activated_by_certification", certification?.provider_activation_performed === false);
  check("runtime_not_mutated_by_certification", certification?.production_runtime_configuration_mutation_performed === false);
  check("endpoint_not_mutated_by_certification", certification?.endpoint_mutation_performed === false);
  check("provider_job_not_submitted", certification?.provider_job_submitted === false);
  check("production_not_deployed", certification?.production_deploy_performed === false);
  check("next_action", text(certification?.next_action) === "EXPLICIT_PRODUCTION_RUNTIME_CONFIGURATION_PROMOTION");
  check("runtime_enabled_target", text(certification?.runtime_configuration_required?.[ENABLED_ENV]).toLowerCase() === "true");
  check("runtime_certified_target", text(certification?.runtime_configuration_required?.[CERTIFIED_ENV]).toLowerCase() === "true");
  check("runtime_endpoint_required", Boolean(text(certification?.runtime_configuration_required?.[ENDPOINT_ENV])));

  for (const gate of [
    "controlled_runtime_render",
    "exact_engine_contract",
    "pitch_preservation",
    "transient_boundary_protection",
    "original_source_preserved",
    "human_listening_review",
    "provider_parked_after_certification",
    "explicit_operator_certification_approval",
  ]) check(`gate_${gate}`, certification?.certification_gates?.[gate] === true);

  const technicalPath = text(certification?.evidence?.technical_result_path);
  const humanReviewPath = text(certification?.evidence?.human_review_path);
  if (!technicalPath || !fs.existsSync(technicalPath)) failures.push("technical_evidence_file");
  if (!humanReviewPath || !fs.existsSync(humanReviewPath)) failures.push("human_review_evidence_file");

  if (technicalPath && fs.existsSync(technicalPath)) {
    const technicalBytes = fs.readFileSync(technicalPath);
    check("technical_evidence_sha256", sha256(technicalBytes) === text(certification?.evidence?.technical_result_sha256));
  }
  if (humanReviewPath && fs.existsSync(humanReviewPath)) {
    const reviewBytes = fs.readFileSync(humanReviewPath);
    check("human_review_evidence_sha256", sha256(reviewBytes) === text(certification?.evidence?.human_review_sha256));
  }

  if (failures.length) throw new Error(`${CONTRACT}_CERTIFICATION_INVALID:${failures.join(",")}`);
  return { certification, certification_sha256: sha256(bytes) };
}

const cliEnv = {
  ...process.env,
  VERCEL_PROJECT_ID: EXPECTED_PROJECT_ID,
  VERCEL_ORG_ID: EXPECTED_ORG_ID,
};

function runVercel(args, { input = undefined, allowFailure = false } = {}) {
  const result = spawnSync("vercel", args, {
    cwd: process.cwd(),
    env: cliEnv,
    encoding: "utf8",
    input,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error?.code === "ENOENT") throw new Error("AVANTIQO_MUSIC_ELASTIC_VERCEL_CLI_REQUIRED");
  const stdout = text(result.stdout);
  const stderr = text(result.stderr);
  if (!allowFailure && result.status !== 0) {
    const detail = text([stdout, stderr].filter(Boolean).join("\n")).slice(-2000);
    throw new Error(`${CONTRACT}_VERCEL_COMMAND_FAILED:${args.slice(0, 3).join("_")}:${detail}`);
  }
  return { status: result.status ?? 1, stdout, stderr };
}

function readProductionState() {
  const probe = `
const crypto = require("node:crypto");
const text = (v) => String(v ?? "").trim();
const on = (v) => ["1","true","yes","on"].includes(text(v).toLowerCase());
const endpoint = text(process.env.${ENDPOINT_ENV});
const value = {
  endpoint_configured: Boolean(endpoint),
  endpoint_sha256: endpoint ? crypto.createHash("sha256").update(endpoint).digest("hex") : null,
  enabled_present: Object.prototype.hasOwnProperty.call(process.env, "${ENABLED_ENV}"),
  enabled_true: on(process.env.${ENABLED_ENV}),
  certified_present: Object.prototype.hasOwnProperty.call(process.env, "${CERTIFIED_ENV}"),
  certified_true: on(process.env.${CERTIFIED_ENV}),
};
console.log("AVANTIQO_MUSIC_ELASTIC_RUNTIME_STATE=" + JSON.stringify(value));
`;
  const result = runVercel(["env", "run", "-e", "production", "--", "node", "-e", probe]);
  const combined = `${result.stdout}\n${result.stderr}`;
  const match = combined.match(/AVANTIQO_MUSIC_ELASTIC_RUNTIME_STATE=(\{[^\n]+\})/);
  if (!match) throw new Error(`${CONTRACT}_PRODUCTION_STATE_PROBE_MISSING`);
  return JSON.parse(match[1]);
}

function setBooleanEnv(name, present) {
  const action = present ? "update" : "add";
  runVercel(["env", action, name, "production"], { input: "true\n" });
  return action;
}

const apply = process.argv.includes("--apply");
const certificationPath = findLatestCertification();
const validated = validateCertification(certificationPath);

runVercel(["--version"]);
const before = readProductionState();
if (!before.endpoint_configured || !before.endpoint_sha256) {
  throw new Error(`${CONTRACT}_${ENDPOINT_ENV}_REQUIRED_IN_PRODUCTION`);
}

const proposedChanges = [];
if (!before.enabled_true) proposedChanges.push({ key: ENABLED_ENV, action: before.enabled_present ? "update" : "add", value: "true" });
if (!before.certified_true) proposedChanges.push({ key: CERTIFIED_ENV, action: before.certified_present ? "update" : "add", value: "true" });

const base = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  project_id: EXPECTED_PROJECT_ID,
  organization_id: EXPECTED_ORG_ID,
  target_environment: "production",
  capability: CAPABILITY,
  provider: PROVIDER,
  model: MODEL,
  engine_contract: ENGINE_CONTRACT,
  certification_path: certificationPath,
  certification_sha256: validated.certification_sha256,
  certification_verified: true,
  production_endpoint_configured: true,
  production_endpoint_sha256_before: before.endpoint_sha256,
  current_configuration: {
    engine_enabled: before.enabled_true,
    engine_certified: before.certified_true,
  },
  proposed_changes: proposedChanges,
  endpoint_mutation_planned: false,
  provider_job_submission_planned: false,
  production_deploy_planned: false,
};

if (!apply) {
  console.log(JSON.stringify({
    ...base,
    production_runtime_configuration_mutation_performed: false,
    endpoint_mutation_performed: false,
    provider_job_submitted: false,
    production_deploy_performed: false,
    next_action: proposedChanges.length ? "APPLY_REQUIRES_EXPLICIT_OPERATOR_APPROVAL" : "PRODUCTION_RUNTIME_CONFIGURATION_ALREADY_PROMOTED",
  }, null, 2));
  console.log(`AVANTIQO_MUSIC_ELASTIC_RUNTIME_PROMOTION_MODE=PLAN`);
  console.log(`AVANTIQO_MUSIC_ELASTIC_RUNTIME_PROMOTION_CHANGES_REQUIRED=${proposedChanges.length ? "true" : "false"}`);
  console.log("AVANTIQO_MUSIC_ELASTIC_ENDPOINT_MUTATION_PERFORMED=false");
  console.log("AVANTIQO_MUSIC_ELASTIC_PROVIDER_JOB_SUBMITTED=false");
  console.log("AVANTIQO_MUSIC_ELASTIC_PRODUCTION_DEPLOY_PERFORMED=false");
  process.exit(0);
}

if (!yes(process.env[APPROVAL_ENV])) throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);

const applied = [];
for (const change of proposedChanges) {
  const action = setBooleanEnv(change.key, change.action === "update");
  applied.push({ key: change.key, action, value: "true" });
}

const after = readProductionState();
const failures = [];
if (!after.endpoint_configured) failures.push("ENDPOINT_NOT_CONFIGURED_AFTER_PROMOTION");
if (after.endpoint_sha256 !== before.endpoint_sha256) failures.push("ENDPOINT_CHANGED_DURING_PROMOTION");
if (!after.enabled_true) failures.push("ENGINE_ENABLED_NOT_TRUE_AFTER_PROMOTION");
if (!after.certified_true) failures.push("ENGINE_CERTIFIED_NOT_TRUE_AFTER_PROMOTION");
if (failures.length) throw new Error(`${CONTRACT}_POST_APPLY_VERIFY_FAILED:${failures.join(",")}`);

console.log(JSON.stringify({
  ...base,
  applied_changes: applied,
  production_endpoint_sha256_after: after.endpoint_sha256,
  production_endpoint_unchanged: after.endpoint_sha256 === before.endpoint_sha256,
  final_configuration: {
    engine_enabled: after.enabled_true,
    engine_certified: after.certified_true,
  },
  production_runtime_configuration_promoted: true,
  production_runtime_configuration_mutation_performed: applied.length > 0,
  endpoint_mutation_performed: false,
  provider_job_submitted: false,
  production_deploy_performed: false,
  effective_on_next_production_deployment: true,
  current_production_deployment_rebuilt: false,
  next_action: "KEEP_PRODUCTION_DEPLOY_LOCKED_UNTIL_FINAL_RELEASE",
}, null, 2));

console.log("AVANTIQO_MUSIC_ELASTIC_RUNTIME_PROMOTION=PASS");
console.log("AVANTIQO_MUSIC_ELASTIC_PRODUCTION_RUNTIME_CONFIGURATION_PROMOTED=true");
console.log(`AVANTIQO_MUSIC_ELASTIC_PRODUCTION_RUNTIME_CONFIGURATION_MUTATION_PERFORMED=${applied.length ? "true" : "false"}`);
console.log("AVANTIQO_MUSIC_ELASTIC_ENDPOINT_MUTATION_PERFORMED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_PROVIDER_JOB_SUBMITTED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_PRODUCTION_DEPLOY_PERFORMED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_EFFECTIVE_ON_NEXT_PRODUCTION_DEPLOYMENT=true");
console.log("AVANTIQO_MUSIC_ELASTIC_NEXT=KEEP_PRODUCTION_DEPLOY_LOCKED_UNTIL_FINAL_RELEASE");
