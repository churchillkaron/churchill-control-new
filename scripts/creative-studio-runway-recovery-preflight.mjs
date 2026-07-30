#!/usr/bin/env node

import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

function text(value) {
  return String(value ?? "").trim();
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function corpus(value) {
  try {
    return JSON.stringify(value || {}).toLowerCase();
  } catch {
    return text(value).toLowerCase();
  }
}

function isColeTask(task = {}) {
  const source = corpus({
    title: task.title,
    description: task.description,
    input: task.input,
    metadata: task.metadata,
  });
  return source.includes("cole ley") || /(^|[^a-z])cole([^a-z]|$)/i.test(source);
}

function isColeReference(node = {}) {
  const metadata = object(node.metadata);
  const identities = list(metadata.identity_reference_for).map((item) => text(item).toLowerCase());
  return (
    text(metadata.identity_subject).toLowerCase() === "cole ley" ||
    identities.includes("cole ley") ||
    corpus({ name: node.name, description: node.description, metadata }).includes("cole ley identity reference")
  );
}

function identityReferenceScore(node = {}) {
  let score = 0;
  if (node.review?.approved === true) score += 1000;
  if (node.review?.human_reviewed === true) score += 500;
  if (node.status === "APPROVED") score += 500;
  if (node.metadata?.selected_for_project === true) score += 250;
  if (node.metadata?.identity_evidence?.status === "VERIFIED") score += 1000;
  if (text(node.url)) score += 100;
  return score;
}

function infrastructureFailure(task = {}) {
  const error = text(task.error);
  return [
    "RUNWAY_ENDPOINT_REQUIRED",
    "RUNWAY_STATUS_ENDPOINT_REQUIRED",
    "No priced executable provider available for ai.video.generate",
    "Unknown provider: grok",
  ].some((pattern) => error.includes(pattern));
}

function activeRepairCandidate(task = {}) {
  if (task.capability !== "ai.video.generate") return false;
  if (["COMPLETED", "RUNNING"].includes(task.status)) return false;
  if (task.metadata?.superseded_by_repair_task_id) return false;
  if (task.metadata?.superseded_by_repair_review_task_id) return false;
  return (
    infrastructureFailure(task) ||
    task.metadata?.infrastructure_retry === true ||
    ["WAITING", "READY"].includes(task.status)
  );
}

function canonicalTask(tasks = []) {
  return [...tasks].sort((left, right) => {
    const statusScore = (task) => ({ READY: 4, WAITING: 3, FAILED: 2, PLANNING: 1 }[task.status] || 0);
    const byStatus = statusScore(right) - statusScore(left);
    if (byStatus) return byStatus;
    const rightCreated = Date.parse(right.created_at || right.updated_at || "") || 0;
    const leftCreated = Date.parse(left.created_at || left.updated_at || "") || 0;
    return rightCreated - leftCreated;
  })[0] || null;
}

const organizationId = text(
  process.env.CREATIVE_ORGANIZATION_ID ||
  process.env.ORGANIZATION_ID,
);
const projectId = text(
  process.env.CREATIVE_PROJECT_ID ||
  process.env.CREATIVE_FULL_SONG_PROJECT_ID,
);
const missionId = text(
  process.env.CREATIVE_MISSION_ID ||
  process.env.CREATIVE_FULL_SONG_MISSION_ID,
);

if (!organizationId) throw new Error("CREATIVE_ORGANIZATION_ID required");
if (!projectId) throw new Error("CREATIVE_PROJECT_ID required");
if (!missionId) throw new Error("CREATIVE_MISSION_ID required");

const [
  { supabaseAdmin },
  AssetGraphRepository,
  { CreativeStateEngine },
] = await Promise.all([
  import("@/lib/shared/supabase/admin"),
  import("@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository"),
  import("@/lib/creative/state/CreativeStateEngine"),
]);

console.log("============================================================");
console.log("RUNWAY AND COLE IDENTITY RECOVERY PREFLIGHT");
console.log("============================================================");

const { data: pricingRows, error: pricingError } = await supabaseAdmin
  .from("provider_pricing")
  .select("*")
  .eq("provider", "runway")
  .eq("capability", "ai.video.generate")
  .order("created_at", { ascending: false });

if (pricingError) throw pricingError;

const validRows = (pricingRows || []).filter((row) =>
  text(row.model) &&
  text(row.currency) &&
  (
    positive(row.cost_per_unit) ||
    positive(row.supplier_cost) ||
    positive(row.customer_price)
  ),
);
const activeRows = validRows.filter((row) => row.active === true);

let pricing = activeRows[0] || null;
let activated = false;

if (!pricing) {
  if (validRows.length !== 1) {
    throw new Error(
      `RUNWAY_PRICING_CONFIGURATION_REQUIRED:VALID_ROWS=${validRows.length}:IDS=${validRows.map((row) => row.id).join(",")}`,
    );
  }

  pricing = validRows[0];
  const { error } = await supabaseAdmin
    .from("provider_pricing")
    .update({ active: true })
    .eq("id", pricing.id);
  if (error) throw error;
  activated = true;
}

console.log(`RUNWAY_PRICING_ID=${pricing.id}`);
console.log(`RUNWAY_PRICING_MODEL=${text(pricing.model)}`);
console.log(`RUNWAY_PRICING_CURRENCY=${text(pricing.currency)}`);
console.log(`RUNWAY_PRICING_ACTIVATED=${activated ? "YES" : "NO"}`);

const [nodes, taskResponse] = await Promise.all([
  AssetGraphRepository.listByProject({
    organization_id: organizationId,
    creative_project_id: projectId,
  }),
  supabaseAdmin
    .from("production_tasks")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("creative_project_id", projectId)
    .order("created_at", { ascending: false }),
]);

if (taskResponse.error) throw taskResponse.error;
const tasks = taskResponse.data || [];

const coleReferences = nodes
  .filter((node) => text(node.url) && isColeReference(node))
  .sort((left, right) => identityReferenceScore(right) - identityReferenceScore(left));
const identityReference = coleReferences[0] || null;

if (!identityReference) {
  throw new Error("COLE_IDENTITY_REFERENCE_REQUIRED_BEFORE_VIDEO_RECOVERY");
}

console.log(`COLE_IDENTITY_REFERENCE_NODE_ID=${identityReference.id}`);
console.log(`COLE_IDENTITY_REFERENCE_ASSET_ID=${identityReference.creative_asset_id || ""}`);
console.log(`COLE_IDENTITY_REFERENCE_STATUS=${identityReference.status || ""}`);
console.log(`COLE_IDENTITY_REFERENCE_APPROVED=${identityReference.review?.approved === true ? "YES" : "NO"}`);
console.log(`COLE_IDENTITY_REFERENCE_SCORE=${identityReferenceScore(identityReference)}`);

const runningTasks = tasks.filter((task) => task.status === "RUNNING");
const stateInput = {
  organization_id: organizationId,
  creative_project_id: projectId,
  creative_mission_id: missionId,
};
const state = await CreativeStateEngine.get(stateInput);
let staleLockReleased = false;
if (state?.execution_lock === true && runningTasks.length === 0) {
  await CreativeStateEngine.releaseExecutionLock(stateInput);
  staleLockReleased = true;
}
console.log(`STALE_EXECUTION_LOCK_RELEASED=${staleLockReleased ? "YES" : "NO"}`);
console.log(`RUNNING_PROVIDER_TASK_COUNT=${runningTasks.length}`);

const completedShots = new Set(
  tasks
    .filter((task) => task.status === "COMPLETED" && task.capability === "ai.video.generate" && task.shot_id)
    .map((task) => task.shot_id),
);
const candidatesByShot = new Map();
for (const task of tasks.filter(activeRepairCandidate)) {
  const key = text(task.shot_id) || `task:${task.id}`;
  const current = candidatesByShot.get(key) || [];
  current.push(task);
  candidatesByShot.set(key, current);
}

let canonicalCount = 0;
let duplicateCount = 0;
let completedShotSuppressionCount = 0;
let coleLockedCount = 0;
let nonColeCount = 0;

for (const [shotKey, group] of candidatesByShot.entries()) {
  const canonical = canonicalTask(group);
  if (!canonical) continue;

  if (canonical.shot_id && completedShots.has(canonical.shot_id)) {
    for (const task of group) {
      const metadata = object(task.metadata);
      const { error } = await supabaseAdmin
        .from("production_tasks")
        .update({
          metadata: {
            ...metadata,
            superseded_by_completed_shot: true,
            infrastructure_recovery_suppressed_at: new Date().toISOString(),
          },
        })
        .eq("id", task.id);
      if (error) throw error;
      completedShotSuppressionCount += 1;
    }
    continue;
  }

  const coleVisible = isColeTask(canonical);
  const input = object(canonical.input);
  const providerPolicy = object(input.provider_policy);
  const metadata = object(canonical.metadata);
  const prompt = text(input.prompt || input.provider_prompt);
  const identityInstruction = [
    "COLE LEY IDENTITY IS IMMUTABLE.",
    "Use the supplied Cole Ley identity reference image as the visual source for image-to-video generation.",
    "Keep the exact same real person: facial geometry, eyes, nose, lips, jawline, skin tone, hairline, hairstyle, age and body proportions.",
    "Never substitute a look-alike, redesign the face, change ethnicity or age, beautify into another person, duplicate Cole, or allow identity drift between frames.",
  ].join(" ");

  const canonicalInput = {
    ...input,
    model: input.model || pricing.model,
    provider_policy: {
      ...providerPolicy,
      allowed_providers: ["runway"],
      preferred_providers: ["runway"],
      blocked_providers: [
        ...new Set([
          ...list(providerPolicy.blocked_providers),
          "grok",
          "veo",
          "seedance",
        ]),
      ],
    },
  };

  if (coleVisible) {
    canonicalInput.identity_source = identityReference.url;
    canonicalInput.prompt_image = identityReference.url;
    canonicalInput.image = identityReference.url;
    canonicalInput.assets = [
      {
        id: identityReference.id,
        asset_node_id: identityReference.id,
        creative_asset_id: identityReference.creative_asset_id || null,
        url: identityReference.url,
        role: "cole_ley_identity_reference",
      },
      ...list(input.assets).filter((asset) =>
        text(asset?.id || asset?.asset_node_id) !== text(identityReference.id),
      ),
    ];
    canonicalInput.identity_lock = {
      required: true,
      subject: "Cole Ley",
      reference_asset_node_id: identityReference.id,
      reference_creative_asset_id: identityReference.creative_asset_id || null,
      verification_required: true,
      image_to_video_required: true,
      reject_lookalike: true,
      reject_identity_drift: true,
    };
    canonicalInput.prompt = [prompt, identityInstruction].filter(Boolean).join("\n\n");
    coleLockedCount += 1;
  } else {
    nonColeCount += 1;
  }

  const { error: canonicalError } = await supabaseAdmin
    .from("production_tasks")
    .update({
      status: "WAITING",
      provider_id: null,
      error: null,
      output: {},
      input: canonicalInput,
      timing: {
        ...object(canonical.timing),
        started_at: null,
        completed_at: null,
      },
      metadata: {
        ...metadata,
        infrastructure_retry: true,
        infrastructure_retry_reason: text(canonical.error) || metadata.infrastructure_retry_reason || null,
        infrastructure_retry_at: new Date().toISOString(),
        infrastructure_retry_provider: "runway",
        infrastructure_retry_canonical: true,
        infrastructure_retry_shot_key: shotKey,
        cole_identity_locked: coleVisible,
        cole_identity_reference_node_id: coleVisible ? identityReference.id : null,
        cole_identity_reference_asset_id: coleVisible
          ? identityReference.creative_asset_id || null
          : null,
      },
    })
    .eq("id", canonical.id);
  if (canonicalError) throw canonicalError;
  canonicalCount += 1;

  for (const duplicate of group.filter((task) => task.id !== canonical.id)) {
    const duplicateMetadata = object(duplicate.metadata);
    const { error } = await supabaseAdmin
      .from("production_tasks")
      .update({
        metadata: {
          ...duplicateMetadata,
          superseded_by_repair_task_id: canonical.id,
          infrastructure_duplicate_collapsed: true,
          infrastructure_duplicate_collapsed_at: new Date().toISOString(),
          infrastructure_canonical_task_id: canonical.id,
        },
      })
      .eq("id", duplicate.id);
    if (error) throw error;
    duplicateCount += 1;
  }
}

console.log(`RECOVERY_SHOT_GROUP_COUNT=${candidatesByShot.size}`);
console.log(`CANONICAL_VIDEO_TASKS_REQUEUED=${canonicalCount}`);
console.log(`DUPLICATE_VIDEO_TASKS_SUPERSEDED=${duplicateCount}`);
console.log(`COMPLETED_SHOT_TASKS_SUPPRESSED=${completedShotSuppressionCount}`);
console.log(`COLE_IDENTITY_LOCKED_TASKS=${coleLockedCount}`);
console.log(`NON_COLE_VIDEO_TASKS=${nonColeCount}`);
console.log("COMPLETED_TASKS_REQUEUED=0");
console.log("COLE_IDENTITY_GENERATION_GATE=PASS");
console.log("RUNWAY_RECOVERY_PREFLIGHT=PASS");
console.log("============================================================");
