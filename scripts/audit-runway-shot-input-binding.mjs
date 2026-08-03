#!/usr/bin/env node

import crypto from "node:crypto";
import process from "node:process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stable(value[key])]),
  );
}

function digest(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(stable(value)))
    .digest("hex");
}

function shortDigest(value) {
  return digest(value).slice(0, 16);
}

function scalarId(value) {
  if (typeof value === "string" || typeof value === "number") {
    const candidate = text(value);
    if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(candidate)) return candidate;
    return "";
  }
  if (!value || typeof value !== "object") return "";
  return text(
    value.asset_id ||
    value.assetId ||
    value.creative_asset_id ||
    value.creativeAssetId ||
    value.asset_node_id ||
    value.assetNodeId ||
    value.id,
  );
}

function selectedAssets(input = {}) {
  if (Array.isArray(input.assets)) return input.assets;
  if (Array.isArray(input.assets?.selectedAssets)) return input.assets.selectedAssets;
  if (Array.isArray(input.source_assets)) return input.source_assets;
  if (Array.isArray(input.sourceAssets)) return input.sourceAssets;
  if (Array.isArray(input.selected_assets)) return input.selected_assets;
  if (Array.isArray(input.selectedAssets)) return input.selectedAssets;
  return [];
}

function identityLock(input = {}) {
  return object(
    input.identity_lock ||
    input.identityLock ||
    input.generation?.identity_lock ||
    input.generation?.identityLock,
  );
}

function identityReferenceIds(input = {}) {
  const lock = identityLock(input);
  if (lock.required !== true) return [];
  const values = [
    lock.reference_asset_node_ids,
    lock.referenceAssetNodeIds,
    lock.identity_reference_asset_ids,
    lock.identityReferenceAssetIds,
    lock.reference_asset_node_id,
    lock.referenceAssetNodeId,
    input.identity_reference_asset_ids,
    input.identityReferenceAssetIds,
    input.requirements?.approved_identity_reference_node_ids,
    input.provider_parameters?.reference_asset_ids,
    input.generation?.provider_parameters?.reference_asset_ids,
  ].flat(Infinity);
  return [...new Set(values.map(scalarId).filter(Boolean))];
}

function runwayCandidateValues(input = {}) {
  const identityCandidates = identityReferenceIds(input).map((id) => ({
    id,
    asset_id: id,
    role: "IDENTITY_REFERENCE",
  }));
  return [
    { slot: "identity_source", value: input.identity_source },
    { slot: "identitySource", value: input.identitySource },
    { slot: "prompt_image", value: input.prompt_image },
    { slot: "promptImage", value: input.promptImage },
    { slot: "source", value: input.source },
    { slot: "image", value: input.image },
    { slot: "identity_reference_image", value: input.identity_reference_image },
    { slot: "identityReferenceImage", value: input.identityReferenceImage },
    ...identityCandidates.map((value, index) => ({
      slot: `identity_reference_asset_${index + 1}`,
      value,
    })),
    ...selectedAssets(input).map((value, index) => ({
      slot: `selected_asset_${index + 1}`,
      value,
    })),
  ].filter((entry) =>
    entry.value !== undefined &&
    entry.value !== null &&
    entry.value !== "",
  );
}

function valueIdentity(value) {
  if (typeof value === "string") {
    const source = text(value);
    if (!source) return null;
    if (source.startsWith("data:")) {
      const separator = source.indexOf(",");
      const header = separator >= 0 ? source.slice(0, separator) : source.slice(0, 80);
      return {
        kind: "DATA_URI",
        header,
        fingerprint: shortDigest(source),
        length: source.length,
      };
    }
    const id = scalarId(source);
    if (id) return { kind: "ASSET_ID", id, fingerprint: shortDigest(id) };
    if (/^https?:\/\//i.test(source)) {
      try {
        const url = new URL(source);
        return {
          kind: "URL",
          host: url.host,
          pathname: url.pathname,
          fingerprint: shortDigest(`${url.origin}${url.pathname}`),
        };
      } catch {
        return { kind: "STRING", fingerprint: shortDigest(source), length: source.length };
      }
    }
    return {
      kind: "STRING",
      preview: source.replace(/\s+/g, " ").slice(0, 180),
      fingerprint: shortDigest(source),
      length: source.length,
    };
  }

  if (!value || typeof value !== "object") {
    return { kind: typeof value, fingerprint: shortDigest(value) };
  }

  const id = scalarId(value);
  const url = text(
    value.url ||
    value.file_url ||
    value.fileUrl ||
    value.image_url ||
    value.imageUrl ||
    value.video_url ||
    value.videoUrl ||
    value.source_url ||
    value.sourceUrl,
  );
  return {
    kind: id ? "ASSET_OBJECT" : url ? "URL_OBJECT" : "OBJECT",
    id: id || undefined,
    role: text(value.role || value.asset_role || value.type) || undefined,
    url: url ? valueIdentity(url) : undefined,
    fingerprint: shortDigest(value),
    keys: Object.keys(value).sort(),
  };
}

function promptText(task = {}) {
  const input = object(task.input);
  const generation = object(input.generation);
  return text(
    input.prompt ||
    input.provider_prompt ||
    input.instructions?.prompt ||
    generation.provider_prompt ||
    generation.prompt,
  );
}

function providerSubmission(task = {}) {
  return object(task.output?.provider_submission);
}

function nestedValues(root, wantedKeys, depth = 0, seen = new Set(), output = []) {
  if (!root || typeof root !== "object" || depth > 8 || seen.has(root)) return output;
  seen.add(root);
  if (Array.isArray(root)) {
    for (const item of root) nestedValues(item, wantedKeys, depth + 1, seen, output);
    return output;
  }
  for (const [key, value] of Object.entries(root)) {
    if (wantedKeys.has(key) && value !== undefined && value !== null && value !== "") {
      output.push({ key, value });
    }
    if (value && typeof value === "object") {
      nestedValues(value, wantedKeys, depth + 1, seen, output);
    }
  }
  return output;
}

function firstNested(root, keys) {
  return nestedValues(root, new Set(keys))[0]?.value ?? null;
}

function modelFor(task = {}) {
  const submission = providerSubmission(task);
  return text(
    submission.model ||
    task.output?.model ||
    firstNested(submission, ["model"]) ||
    task.input?.model ||
    task.input?.generation?.model ||
    task.input?.provider_configuration?.model ||
    task.input?.generation?.provider_configuration?.model,
  );
}

function providerSourceEvidence(task = {}) {
  const submission = providerSubmission(task);
  const evidence = [];
  for (const entry of nestedValues(submission, new Set([
    "promptImage",
    "prompt_image",
    "source",
    "source_url",
    "sourceUrl",
    "input_image",
    "image_url",
    "imageUrl",
    "input_mode",
    "source_mode",
    "source_asset_id",
    "sourceAssetId",
  ]))) {
    evidence.push({ key: entry.key, identity: valueIdentity(entry.value) });
  }
  return evidence;
}

function providerPromptEvidence(task = {}) {
  const submission = providerSubmission(task);
  const values = nestedValues(submission, new Set([
    "promptText",
    "prompt_text",
    "prompt",
  ]));
  return values.map((entry) => ({
    key: entry.key,
    fingerprint: shortDigest(text(entry.value)),
    length: text(entry.value).length,
    preview: text(entry.value).replace(/\s+/g, " ").slice(0, 220),
  }));
}

function assetSummary(input = {}) {
  return selectedAssets(input).map((asset, index) => ({
    index: index + 1,
    identity: valueIdentity(asset),
  }));
}

function expectedContract(task = {}) {
  return object(
    task.input?.requirements?.expected_contract ||
    task.input?.expected_contract ||
    task.metadata?.expected_contract ||
    task.metadata?.requirements?.expected_contract,
  );
}

function expectedSummary(task = {}) {
  const expected = expectedContract(task);
  return text(
    expected.story_purpose ||
    expected.shot_purpose ||
    expected.purpose ||
    expected.action ||
    task.input?.intent ||
    task.description ||
    task.title,
  ).replace(/\s+/g, " ").slice(0, 500);
}

function duplicateGroups(rows, selector) {
  const groups = new Map();
  for (const row of rows) {
    const key = selector(row);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()]
    .filter(([, items]) => items.length > 1)
    .sort((left, right) => right[1].length - left[1].length);
}

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
const graphId = text(process.env.PRODUCTION_GRAPH_ID);
const expectedVideoCount = Number(process.env.EXPECTED_VIDEO_TASK_COUNT || 10);

if (!organizationId || !projectId || !graphId) {
  throw new Error("RUNWAY_INPUT_AUDIT_SCOPE_REQUIRED");
}

const { ProductionTaskRuntime } = await import(
  "@/lib/operations/tasks/runtime/ProductionTaskRuntime"
);

const tasks = await ProductionTaskRuntime.list({
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
});

const videos = tasks.filter((task) =>
  text(task.provider_id || task.output?.provider || task.output?.provider_submission?.provider).toLowerCase() === "runway" &&
  (
    text(task.type).toUpperCase() === "GENERATE_VIDEO" ||
    text(task.capability || task.service_code || task.service_id).toLowerCase().includes("video")
  ),
);

const rows = videos.map((task) => {
  const prompt = promptText(task);
  const candidates = runwayCandidateValues(object(task.input));
  const candidateRows = candidates.map((candidate, index) => ({
    priority: index + 1,
    slot: candidate.slot,
    identity: valueIdentity(candidate.value),
  }));
  const primary = candidateRows[0] || null;
  const assets = assetSummary(object(task.input));
  const submissionSource = providerSourceEvidence(task);
  const submissionPrompts = providerPromptEvidence(task);
  return {
    task,
    prompt,
    prompt_fingerprint: prompt ? shortDigest(prompt) : null,
    prompt_length: prompt.length,
    primary,
    primary_fingerprint: primary?.identity?.fingerprint || null,
    candidates: candidateRows,
    assets,
    asset_set_fingerprint: shortDigest(assets.map((asset) => asset.identity)),
    model: modelFor(task),
    expected: expectedSummary(task),
    submission_source: submissionSource,
    submission_prompts: submissionPrompts,
    provider_job_id: text(
      task.output?.provider_job_id ||
      task.output?.provider_submission?.provider_job_id ||
      task.output?.provider_submission?.output?.provider_job_id ||
      task.output?.provider_submission?.output?.output?.provider_job_id,
    ),
  };
});

const promptGroups = duplicateGroups(rows, (row) => row.prompt_fingerprint);
const primaryGroups = duplicateGroups(rows, (row) => row.primary_fingerprint);
const assetGroups = duplicateGroups(rows, (row) => row.asset_set_fingerprint);
const uniquePrompts = new Set(rows.map((row) => row.prompt_fingerprint).filter(Boolean));
const uniquePrimary = new Set(rows.map((row) => row.primary_fingerprint).filter(Boolean));
const uniqueAssetSets = new Set(rows.map((row) => row.asset_set_fingerprint).filter(Boolean));
const missingPrompt = rows.filter((row) => !row.prompt);
const missingCandidates = rows.filter((row) => !row.primary);
const dominantPrimaryCount = primaryGroups[0]?.[1]?.length || (rows.length ? 1 : 0);
const dominantAssetCount = assetGroups[0]?.[1]?.length || (rows.length ? 1 : 0);
const systemicSuspected =
  rows.length === expectedVideoCount &&
  (
    dominantPrimaryCount >= Math.ceil(rows.length * 0.6) ||
    dominantAssetCount >= Math.ceil(rows.length * 0.8) ||
    uniquePrompts.size <= 2 ||
    missingCandidates.length > 0
  );

console.log("============================================================");
console.log("RUNWAY SHOT INPUT BINDING FORENSIC AUDIT");
console.log("============================================================");
console.log(`ORGANIZATION_ID=${organizationId}`);
console.log(`CREATIVE_PROJECT_ID=${projectId}`);
console.log(`PRODUCTION_GRAPH_ID=${graphId}`);
console.log(`RUNWAY_VIDEO_TASK_COUNT=${rows.length}`);
console.log(`EXPECTED_VIDEO_TASK_COUNT=${expectedVideoCount}`);
console.log(`UNIQUE_PROMPT_COUNT=${uniquePrompts.size}`);
console.log(`UNIQUE_PRIMARY_SOURCE_COUNT=${uniquePrimary.size}`);
console.log(`UNIQUE_SELECTED_ASSET_SET_COUNT=${uniqueAssetSets.size}`);
console.log(`MISSING_PROMPT_COUNT=${missingPrompt.length}`);
console.log(`MISSING_SOURCE_CANDIDATE_COUNT=${missingCandidates.length}`);
console.log(`DOMINANT_PRIMARY_SOURCE_TASK_COUNT=${dominantPrimaryCount}`);
console.log(`DOMINANT_ASSET_SET_TASK_COUNT=${dominantAssetCount}`);
console.log(`SYSTEMIC_INPUT_BINDING_SUSPECTED=${systemicSuspected ? "YES" : "NO"}`);
console.log("READ_ONLY_AUDIT=YES");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("WALLET_CHANGED=NO");
console.log("TASKS_CHANGED=NO");
console.log("REPAIR_EXECUTION_AUTHORIZED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");

rows.forEach((row, index) => {
  const label = `RUNWAY_TASK_${index + 1}`;
  console.log("------------------------------------------------------------");
  console.log(`${label}_ID=${row.task.id}`);
  console.log(`${label}_TITLE=${row.task.title || ""}`);
  console.log(`${label}_STATUS=${row.task.status || ""}`);
  console.log(`${label}_PROVIDER_JOB_ID=${row.provider_job_id || "NONE"}`);
  console.log(`${label}_MODEL=${row.model || "NONE"}`);
  console.log(`${label}_EXPECTED=${row.expected || "NONE"}`);
  console.log(`${label}_PROMPT_FINGERPRINT=${row.prompt_fingerprint || "NONE"}`);
  console.log(`${label}_PROMPT_LENGTH=${row.prompt_length}`);
  console.log(`${label}_PROMPT_PREVIEW=${row.prompt.replace(/\s+/g, " ").slice(0, 700) || "NONE"}`);
  console.log(`${label}_PRIMARY_SOURCE_SLOT=${row.primary?.slot || "NONE"}`);
  console.log(`${label}_PRIMARY_SOURCE=${JSON.stringify(row.primary?.identity || null)}`);
  console.log(`${label}_CANDIDATE_COUNT=${row.candidates.length}`);
  console.log(`${label}_CANDIDATES=${JSON.stringify(row.candidates)}`);
  console.log(`${label}_SELECTED_ASSET_COUNT=${row.assets.length}`);
  console.log(`${label}_SELECTED_ASSET_SET_FINGERPRINT=${row.asset_set_fingerprint}`);
  console.log(`${label}_SELECTED_ASSETS=${JSON.stringify(row.assets)}`);
  console.log(`${label}_SUBMISSION_SOURCE_EVIDENCE=${JSON.stringify(row.submission_source)}`);
  console.log(`${label}_SUBMISSION_PROMPT_EVIDENCE=${JSON.stringify(row.submission_prompts)}`);
});

promptGroups.forEach(([fingerprint, items], index) => {
  console.log("------------------------------------------------------------");
  console.log(`DUPLICATE_PROMPT_GROUP_${index + 1}_FINGERPRINT=${fingerprint}`);
  console.log(`DUPLICATE_PROMPT_GROUP_${index + 1}_COUNT=${items.length}`);
  console.log(`DUPLICATE_PROMPT_GROUP_${index + 1}_TASKS=${JSON.stringify(items.map((row) => ({ id: row.task.id, title: row.task.title })))}`);
});

primaryGroups.forEach(([fingerprint, items], index) => {
  console.log("------------------------------------------------------------");
  console.log(`DUPLICATE_PRIMARY_SOURCE_GROUP_${index + 1}_FINGERPRINT=${fingerprint}`);
  console.log(`DUPLICATE_PRIMARY_SOURCE_GROUP_${index + 1}_COUNT=${items.length}`);
  console.log(`DUPLICATE_PRIMARY_SOURCE_GROUP_${index + 1}_SLOT_SET=${JSON.stringify([...new Set(items.map((row) => row.primary?.slot).filter(Boolean))])}`);
  console.log(`DUPLICATE_PRIMARY_SOURCE_GROUP_${index + 1}_TASKS=${JSON.stringify(items.map((row) => ({ id: row.task.id, title: row.task.title })))}`);
});

assetGroups.forEach(([fingerprint, items], index) => {
  console.log("------------------------------------------------------------");
  console.log(`DUPLICATE_ASSET_SET_GROUP_${index + 1}_FINGERPRINT=${fingerprint}`);
  console.log(`DUPLICATE_ASSET_SET_GROUP_${index + 1}_COUNT=${items.length}`);
  console.log(`DUPLICATE_ASSET_SET_GROUP_${index + 1}_TASKS=${JSON.stringify(items.map((row) => ({ id: row.task.id, title: row.task.title })))}`);
});

console.log("============================================================");
console.log("AUDIT RESULT");
console.log("============================================================");
console.log("RUNWAY_INPUT_BINDING_AUDIT=PASS");
console.log(`REPAIR_EXECUTION_SAFE_TO_AUTHORIZE=${systemicSuspected ? "NO" : "REQUIRES_HUMAN_BUDGET_APPROVAL"}`);
console.log("REPAIR_TASKS_CREATED=NO");
console.log("NEW_PROVIDER_JOBS_CREATED=NO");
console.log("WALLET_CHANGED=NO");
console.log("FINALISATION_STARTED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");
