#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");

const SOURCE_AUDIT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_BOUNDED_POLL_RESULT_AUDIT_V1";
const DISPATCH_CHECKPOINT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_DISPATCH_CHECKPOINT_V1";
const PREVIEW_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPLACEMENT_REVIEW_EXECUTION_PREVIEW_V1";
const SOURCE_PAYLOAD_CONTRACT =
  "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_SOURCE_V1";
const REVIEW_PAYLOAD_CONTRACT =
  "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_REVIEW_V1";
const REVIEW_CONTRACT = "GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1";
const EXPECTATION_CONTRACT =
  "GENERATED_MEDIA_PERCEPTUAL_EXPECTATION_V1";
const FRAME_CONTRACT = "OPENAI_VIDEO_ANALYSIS_FRAME_SET_V1";
const MATERIALIZATION_CONTRACT =
  "CREATIVE_PRODUCTION_TASK_MATERIALIZATION_V1";
const FRAME_FRACTIONS = [0.02, 0.18, 0.34, 0.5, 0.66, 0.82, 0.98];
const THRESHOLD_KEYS = [
  "minimum_overall_score",
  "minimum_story_score",
  "minimum_environment_score",
  "minimum_camera_score",
  "minimum_anatomy_score",
  "minimum_identity_score",
  "minimum_product_fidelity_score",
  "minimum_music_energy_score",
  "minimum_performance_score",
  "minimum_continuity_score",
  "minimum_physics_score",
  "minimum_artifact_score",
];

const text = (value) => String(value ?? "").trim();
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const list = (value) => Array.isArray(value) ? value.filter(Boolean) : [];
const money = (value) => Number(Number(value || 0).toFixed(6));

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stable(value[key])]),
  );
}

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(stable(value)))
    .digest("hex");
}

function readJson(filePath, label) {
  const absolute = path.resolve(text(filePath));
  if (!absolute || !fs.existsSync(absolute)) {
    throw new Error(`${label}_NOT_FOUND:${absolute || "MISSING"}`);
  }
  const raw = fs.readFileSync(absolute, "utf8");
  return {
    absolute,
    raw,
    file_sha256: sha256(raw),
    value: JSON.parse(raw),
  };
}

function writeJson(filePath, value) {
  const absolute = path.resolve(filePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function taskState(task = {}) {
  return {
    id: task.id,
    status: task.status,
    provider_id: task.provider_id ?? null,
    cost: task.cost || {},
    error: task.error || null,
    depends_on: task.depends_on || [],
    review: task.review || {},
    metadata: task.metadata || {},
    output: task.output || {},
    timing: task.timing || {},
    updated_at: task.updated_at || null,
  };
}

function taskFingerprint(tasks = []) {
  return sha256(
    [...tasks]
      .sort((left, right) => text(left.id).localeCompare(text(right.id)))
      .map(taskState),
  );
}

function taskCounts(tasks = []) {
  return tasks.reduce((result, task) => {
    const status = text(task.status) || "UNKNOWN";
    result[status] = Number(result[status] || 0) + 1;
    return result;
  }, {});
}

function outputMediaUrl(value, seen = new Set()) {
  if (!value) return null;
  if (typeof value === "string") {
    return /^(https?:\/\/|storage:\/\/|s3:\/\/|gs:\/\/)/i.test(value)
      ? value
      : null;
  }
  if (typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => outputMediaUrl(item, seen)).find(Boolean) || null;
  }
  for (const key of [
    "url",
    "file_url",
    "fileUrl",
    "video_url",
    "videoUrl",
    "download_url",
    "downloadUrl",
    "output",
    "outputs",
    "result",
    "results",
    "data",
    "files",
    "videos",
    "provider_poll",
    "provider_submission",
  ]) {
    const found = outputMediaUrl(value[key], seen);
    if (found) return found;
  }
  return null;
}

function directUrl(value) {
  if (!value) return null;
  if (typeof value === "string") return text(value) || null;
  if (typeof value !== "object") return null;
  return text(
    value.video_url ||
      value.videoUrl ||
      value.file_url ||
      value.fileUrl ||
      value.image_url ||
      value.imageUrl ||
      value.url,
  ) || null;
}

function expectedContract(task = {}) {
  return object(
    task.input?.requirements?.expected_contract ||
      task.metadata?.requirements?.expected_contract,
  );
}

function thresholds(task = {}) {
  return {
    ...object(expectedContract(task).thresholds),
    ...object(task.input?.requirements?.thresholds),
    ...object(task.metadata?.thresholds),
  };
}

function referenceValues(task = {}, source = {}) {
  const expected = expectedContract(task);
  const values = [];
  const add = (value, role) => {
    if (!value) return;
    if (typeof value === "string") values.push({ url: value, role });
    else if (value.url) values.push({ ...value, role: value.role || role });
    else if (value.asset_id || value.id) {
      values.push({ ...value, role: value.role || role });
    }
  };

  add(
    expected.identity_requirements?.identity_atlas_url ||
      expected.identity_requirements?.identityAtlasUrl ||
      source.input?.identity_atlas_url ||
      source.input?.generation?.identity_lock?.identity_atlas_url,
    "IDENTITY_ATLAS",
  );
  add(
    source.input?.generation?.identity_lock?.approved_keyframe_url ||
      source.input?.identity_lock?.approved_keyframe_url,
    "APPROVED_IDENTITY_KEYFRAME",
  );
  for (const value of list(
    expected.identity_requirements?.reference_images ||
      source.input?.reference_images,
  )) add(value, "IDENTITY_REFERENCE");
  for (const value of list(expected.reference_asset_ids)) {
    add({ asset_id: value }, "REFERENCE_ASSET");
  }
  for (const value of list(expected.product_requirements?.reference_images)) {
    add(value, "PRODUCT_REFERENCE");
  }

  const seen = new Set();
  return values.filter((value) => {
    const key = text(value.url || value.asset_id || value.id);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function credentialRecordReady(record = {}) {
  if (!record || typeof record !== "object") return false;
  const status = text(record.status).toUpperCase();
  if (status && status !== "ACTIVE") return false;
  return Boolean(text(record.secret_reference));
}

async function exactState({
  supabaseAdmin,
  ProductionTaskRuntime,
  organizationId,
  projectId,
  graphId,
}) {
  const [tasks, usage, wallet] = await Promise.all([
    ProductionTaskRuntime.list({
      organization_id: organizationId,
      creative_project_id: projectId,
      production_graph_id: graphId,
    }),
    supabaseAdmin
      .from("platform_service_usage")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    supabaseAdmin
      .from("organization_wallets")
      .select("available_balance,reserved_balance,currency,updated_at")
      .eq("organization_id", organizationId)
      .single(),
  ]);

  if (usage.error) throw usage.error;
  if (wallet.error) throw wallet.error;

  const scopedTasks = tasks.filter(
    (task) => text(task.production_graph_id) === graphId,
  );

  return {
    tasks: scopedTasks,
    task_count: scopedTasks.length,
    task_status_counts: taskCounts(scopedTasks),
    task_state_sha256: taskFingerprint(scopedTasks),
    usage_count: Number(usage.count || 0),
    wallet_balance: money(wallet.data?.available_balance),
    wallet_reserved_balance: money(wallet.data?.reserved_balance),
    wallet_currency: text(wallet.data?.currency) || "THB",
    wallet_updated_at: wallet.data?.updated_at || null,
  };
}

const sourceAuditFile = readJson(
  process.argv[2],
  "COMPLETED_SOURCE_RESULT_AUDIT",
);
const dispatchCheckpointFile = readJson(
  process.argv[3],
  "SOURCE_DISPATCH_CHECKPOINT",
);
const sourceAudit = object(sourceAuditFile.value);
const dispatchCheckpoint = object(dispatchCheckpointFile.value);

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
const graphId = text(process.env.PRODUCTION_GRAPH_ID);
const outputPath = path.resolve(
  text(process.env.OPENAI_PERCEPTUAL_REPLACEMENT_REVIEW_PREVIEW_OUTPUT) ||
    "/tmp/churchill-openai-perceptual-replacement-review-execution-preview.json",
);

if (!organizationId || !projectId || !graphId) {
  throw new Error("REPLACEMENT_REVIEW_PREVIEW_SCOPE_REQUIRED");
}

const [
  { supabaseAdmin },
  { ProductionTaskRuntime },
  { signCreativeStorageReference },
  { prepareOpenAIVideoAnalysisInput },
  { OpenAIProviderSanitizedRuntime },
  { resolveCreativeService },
  { OrganizationServiceRuntime },
  { resolveServiceCapabilities },
  { resolvePrimaryExecutionCapability },
  { resolveProvider },
  { PricingRuntime },
  { CredentialRuntime },
  { CreativeProductionTaskMaterializationRuntime },
] = await Promise.all([
  import("@/lib/shared/supabase/admin"),
  import("@/lib/operations/tasks/runtime/ProductionTaskRuntime"),
  import("@/lib/creative/assets/storage/CreativePrivateStorageRuntime"),
  import("@/lib/platform/service-runtime/providers/openai/OpenAIVideoAnalysisFrameRuntime"),
  import("@/lib/platform/service-runtime/providers/openai/OpenAIProviderSanitizedRuntime"),
  import("@/lib/creative/services/CreativeServiceResolver"),
  import("@/lib/platform/service-runtime/services/runtime/OrganizationServiceRuntime"),
  import("@/lib/platform/service-runtime/services/resolver/ServiceCapabilityResolver"),
  import("@/lib/platform/service-runtime/services/resolver/CapabilityExecutionResolver"),
  import("@/lib/platform/service-runtime/providers/ProviderResolver"),
  import("@/lib/platform/service-runtime/pricing/PricingRuntime"),
  import("@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime"),
  import("@/lib/creative/execution/runtime/CreativeProductionTaskMaterializationRuntime"),
]);

const blockers = [];
const requireValue = (condition, label) => {
  if (!condition) blockers.push(label);
};

requireValue(
  text(sourceAudit.contract) === SOURCE_AUDIT_CONTRACT,
  "SOURCE_AUDIT_CONTRACT_INVALID",
);
requireValue(
  text(dispatchCheckpoint.contract) === DISPATCH_CHECKPOINT_CONTRACT,
  "DISPATCH_CHECKPOINT_CONTRACT_INVALID",
);
for (const [label, value] of [
  ["SOURCE_AUDIT", sourceAudit],
  ["DISPATCH_CHECKPOINT", dispatchCheckpoint],
]) {
  requireValue(
    text(value.organization_id) === organizationId &&
      text(value.creative_project_id) === projectId &&
      text(value.production_graph_id) === graphId,
    `${label}_SCOPE_INVALID`,
  );
}
requireValue(
  text(sourceAudit.decision) ===
    "REPAIR_SOURCE_9_COMPLETED_VIDEO_ASSETS_CONFIRMED" &&
    text(sourceAudit.readiness) ===
      "READY_FOR_REPLACEMENT_PERCEPTUAL_REVIEW_EXECUTION_PREVIEW" &&
    Number(sourceAudit.completed_source_count) === 9 &&
    Number(sourceAudit.waiting_review_count) === 9 &&
    Number(sourceAudit.successful_usage_count) === 9 &&
    Number(sourceAudit.invoiced_usage_count) === 9 &&
    Number(sourceAudit.video_asset_count) === 9 &&
    Number(sourceAudit.generated_asset_count) === 9 &&
    Number(sourceAudit.source_ready_count) === 9 &&
    Number(sourceAudit.source_failure_count) === 0 &&
    list(sourceAudit.blockers).length === 0 &&
    sourceAudit.state_unchanged === true,
  "SOURCE_AUDIT_NOT_READY",
);
requireValue(
  text(dispatchCheckpoint.status) === "SUBMITTED" &&
    list(dispatchCheckpoint.protected_task_ids).length === 36,
  "DISPATCH_CHECKPOINT_INVALID",
);

const before = await exactState({
  supabaseAdmin,
  ProductionTaskRuntime,
  organizationId,
  projectId,
  graphId,
});
const taskMap = new Map(before.tasks.map((task) => [text(task.id), task]));
const sourceRows = list(sourceAudit.source_audits);
const assetIds = sourceRows.map((row) => text(row.asset_node_id));
const assetResponse = await supabaseAdmin
  .from("creative_asset_nodes")
  .select("*")
  .in("id", assetIds);
if (assetResponse.error) throw assetResponse.error;
const assetMap = new Map(
  list(assetResponse.data).map((asset) => [text(asset.id), asset]),
);

requireValue(before.task_count === 45, "LIVE_TASK_COUNT_INVALID");
requireValue(
  Number(before.task_status_counts.COMPLETED || 0) === 18 &&
    Number(before.task_status_counts.FAILED || 0) === 18 &&
    Number(before.task_status_counts.WAITING || 0) === 9 &&
    Number(before.task_status_counts.RUNNING || 0) === 0,
  "LIVE_TASK_STATUS_COUNTS_INVALID",
);
requireValue(
  before.task_state_sha256 ===
      text(sourceAudit.exact_state_after?.task_state_sha256) &&
    before.usage_count === 2667 &&
    before.wallet_balance === 9253.629142 &&
    before.wallet_reserved_balance === 0 &&
    before.wallet_currency === "THB",
  "LIVE_SOURCE_RESULT_STATE_CHANGED",
);

const plans = [];
for (const row of sourceRows) {
  const source = taskMap.get(text(row.source_task_id));
  const review = taskMap.get(text(row.review_task_id));
  const asset = assetMap.get(text(row.asset_node_id));
  const issues = [];

  if (!source) issues.push("SOURCE_TASK_MISSING");
  if (!review) issues.push("REVIEW_TASK_MISSING");
  if (!asset) issues.push("SOURCE_ASSET_MISSING");

  if (source) {
    if (text(source.status) !== "COMPLETED") issues.push("SOURCE_NOT_COMPLETED");
    if (text(source.provider_id) !== "runway") issues.push("SOURCE_PROVIDER_INVALID");
    if (text(source.metadata?.repair_payload_contract) !== SOURCE_PAYLOAD_CONTRACT) {
      issues.push("SOURCE_PAYLOAD_CONTRACT_INVALID");
    }
    if (text(source.output?.asset_node_id) !== text(asset?.id)) {
      issues.push("SOURCE_ASSET_LINK_INVALID");
    }
    if (text(source.error)) issues.push("SOURCE_ERROR_PRESENT");
  }

  if (review) {
    if (text(review.status) !== "WAITING") issues.push("REVIEW_NOT_WAITING");
    if (text(review.metadata?.contract) !== REVIEW_CONTRACT) {
      issues.push("REVIEW_GATE_CONTRACT_INVALID");
    }
    if (text(review.metadata?.repair_payload_contract) !== REVIEW_PAYLOAD_CONTRACT) {
      issues.push("REVIEW_PAYLOAD_CONTRACT_INVALID");
    }
    if (
      list(review.depends_on).length !== 1 ||
      text(review.depends_on[0]) !== text(source?.id)
    ) {
      issues.push("REVIEW_DEPENDENCY_INVALID");
    }
    if (review.provider_id !== null) issues.push("REVIEW_ALREADY_PROVIDER_BOUND");
    if (review.cost?.approved === true) issues.push("REVIEW_COST_ALREADY_APPROVED");
    if (Number(review.cost?.actual || 0) !== 0) issues.push("REVIEW_COST_ALREADY_USED");
    if (review.timing?.started_at || review.timing?.completed_at) {
      issues.push("REVIEW_TIMING_ALREADY_CHANGED");
    }
    if (Object.keys(object(review.output)).length !== 0) {
      issues.push("REVIEW_OUTPUT_ALREADY_PRESENT");
    }
    if (text(review.error)) issues.push("REVIEW_ERROR_PRESENT");
  }

  if (asset) {
    if (text(asset.type) !== "VIDEO") issues.push("ASSET_TYPE_INVALID");
    if (text(asset.status) !== "GENERATED") issues.push("ASSET_STATUS_INVALID");
    if (text(asset.metadata?.inspection_status) !== "COMPLETE") {
      issues.push("ASSET_INSPECTION_INCOMPLETE");
    }
    if (text(asset.production_task_id) !== text(source?.id)) {
      issues.push("ASSET_SOURCE_TASK_INVALID");
    }
  }

  const expected = expectedContract(review);
  const minimums = thresholds(review);
  const materialization = object(
    review?.input?.requirements?.task_materialization_contract,
  );
  if (text(expected.contract) !== EXPECTATION_CONTRACT) {
    issues.push("EXPECTED_CONTRACT_INVALID");
  }
  if (text(expected.media_kind) !== "VIDEO") {
    issues.push("EXPECTED_MEDIA_KIND_INVALID");
  }
  if (
    !THRESHOLD_KEYS.every(
      (key) => Number.isFinite(Number(minimums[key])) && Number(minimums[key]) >= 0,
    )
  ) {
    issues.push("REVIEW_THRESHOLDS_INVALID");
  }
  if (
    text(materialization.contract) !== MATERIALIZATION_CONTRACT ||
    !CreativeProductionTaskMaterializationRuntime.verify(materialization) ||
    text(materialization.node_id) !== text(review?.metadata?.execution_node_id)
  ) {
    issues.push("REVIEW_MATERIALIZATION_CONTRACT_INVALID");
  }

  const sourceUrl =
    text(asset?.url) ||
    text(asset?.storage_path) ||
    outputMediaUrl(source?.output);
  let signedSourceUrl = null;
  let prepared = null;
  let localized = null;
  let preparedFrameContract = {};
  let frameAssets = [];
  let localizedFrameAssets = [];
  let references = [];

  if (!sourceUrl) {
    issues.push("SOURCE_MEDIA_URL_MISSING");
  } else {
    try {
      signedSourceUrl = await signCreativeStorageReference({
        organization_id: organizationId,
        reference: sourceUrl,
      });
      for (const value of referenceValues(review, source)) {
        if (value.url) {
          references.push({
            ...value,
            url: await signCreativeStorageReference({
              organization_id: organizationId,
              reference: value.url,
            }),
          });
        } else {
          references.push(value);
        }
      }

      const baseInput = {
        ...object(review?.input),
        capability: "ai.image.analyze",
        media_kind: "VIDEO",
        image: signedSourceUrl,
        media: signedSourceUrl,
        source: signedSourceUrl,
        video: signedSourceUrl,
        assets: [
          {
            url: signedSourceUrl,
            role: "GENERATED_MEDIA_UNDER_REVIEW",
          },
          ...references,
        ],
        reference_images: references.filter((item) => item.url),
        context: {
          ...object(review?.input?.context),
          organization_id: organizationId,
          creative_project_id: projectId,
          production_graph_id: graphId,
          production_task_id: review?.id,
        },
      };
      prepared = await prepareOpenAIVideoAnalysisInput(baseInput);
      preparedFrameContract = object(
        prepared.openai_video_analysis_frame_contract,
      );
      frameAssets = list(prepared.assets).filter(
        (item) => text(item.role) === "GENERATED_VIDEO_FRAME_UNDER_REVIEW",
      );
      localized = await OpenAIProviderSanitizedRuntime.localizeAnalysisMedia(
        OpenAIProviderSanitizedRuntime.sanitizeResponses(prepared),
      );
      localizedFrameAssets = list(localized.assets).filter(
        (item) => text(item.role) === "GENERATED_VIDEO_FRAME_UNDER_REVIEW",
      );

      const frames = list(preparedFrameContract.frames);
      const frameMetricsValid =
        frames.length === 7 &&
        frames.every(
          (frame, index) =>
            Number(frame.index) === index + 1 &&
            Number(frame.width) > 0 &&
            Number(frame.height) > 0 &&
            Number(frame.jpeg_bytes) > 0 &&
            Number(frame.encoded_bytes) > 0 &&
            Number(frame.encoded_bytes) <= 2 * 1024 * 1024 &&
            Number(frame.timestamp_seconds) >= 0,
        );
      const preparedFrameDataValid = frameAssets.every((item) =>
        /^data:image\/jpeg;base64,/i.test(text(item.url)),
      );
      const localizedFrameDataValid = localizedFrameAssets.every((item) =>
        /^data:image\/jpeg;base64,/i.test(text(item.url)),
      );
      const rawVideoAbsent =
        prepared.image === undefined &&
        prepared.media === undefined &&
        prepared.source === undefined &&
        !list(prepared.assets).some(
          (item) => directUrl(item) === signedSourceUrl,
        );
      if (
        text(preparedFrameContract.contract) !== FRAME_CONTRACT ||
        preparedFrameContract.prepared !== true ||
        text(preparedFrameContract.source_media_kind) !== "video" ||
        Number(preparedFrameContract.frame_count) !== 7 ||
        preparedFrameContract.source_url_persisted !== false ||
        preparedFrameContract.frame_data_persisted !== false ||
        text(preparedFrameContract.boundary) !==
          "OPENAI_ANALYSIS_TRANSPORT_ONLY" ||
        Number(preparedFrameContract.source_duration_seconds) <= 0 ||
        Number(preparedFrameContract.source_file_size_bytes) <= 0 ||
        JSON.stringify(list(preparedFrameContract.fractions)) !==
          JSON.stringify(FRAME_FRACTIONS) ||
        frameAssets.length !== 7 ||
        localizedFrameAssets.length !== 7 ||
        !preparedFrameDataValid ||
        !localizedFrameDataValid ||
        !frameMetricsValid ||
        !rawVideoAbsent
      ) {
        issues.push("OPENAI_VIDEO_FRAME_CONTRACT_INVALID");
      }
    } catch (error) {
      issues.push(`OPENAI_VIDEO_FRAME_PREPARATION_FAILED:${error.message}`);
    }
  }

  let serviceId = null;
  let executionCapability = null;
  let selectedProvider = null;
  let selectedCredential = null;
  let pricing = null;
  try {
    serviceId = resolveCreativeService(review);
    const organizationService = await OrganizationServiceRuntime.get({
      organization_id: organizationId,
      service_id: serviceId,
    });
    if (!organizationService) throw new Error("ORGANIZATION_SERVICE_NOT_ENABLED");
    const capabilities = resolveServiceCapabilities(serviceId);
    executionCapability = resolvePrimaryExecutionCapability(
      capabilities?.capabilities || [],
    );
    if (!executionCapability) throw new Error("EXECUTION_CAPABILITY_UNRESOLVED");

    selectedProvider = await resolveProvider({
      organization_id: organizationId,
      capability: executionCapability,
      preferredProvider: "openai",
      country: review?.input?.country ?? null,
      currency: review?.input?.currency ?? null,
      policy: {
        ...object(organizationService.provider_policy),
        ...object(
          review?.input?.provider_policy ||
            review?.metadata?.provider_policy,
        ),
      },
    });
    if (text(selectedProvider?.provider) !== "openai") {
      throw new Error("SELECTED_PROVIDER_NOT_OPENAI");
    }
    if (selectedProvider.credential_id) {
      selectedCredential = await CredentialRuntime.resolve(
        selectedProvider.credential_id,
      );
    }
    const credentialReady =
      credentialRecordReady(selectedCredential) ||
      Boolean(text(process.env.OPENAI_API_KEY));
    if (!credentialReady) throw new Error("OPENAI_CREDENTIAL_UNAVAILABLE");

    pricing = await PricingRuntime.resolve({
      provider: "openai",
      capability: executionCapability,
      model: selectedProvider.model,
      country: review?.input?.country ?? null,
      currency: review?.input?.currency ?? null,
      usage: { quantity: 1 },
    });
    if (!pricing?.pricing_id || money(pricing.customer_price) <= 0) {
      throw new Error("OPENAI_REVIEW_PRICING_INVALID");
    }
  } catch (error) {
    issues.push(`OPENAI_REVIEW_RESOLUTION_FAILED:${error.message}`);
  }

  const credentialSource = credentialRecordReady(selectedCredential)
    ? "CREDENTIAL_RECORD"
    : text(process.env.OPENAI_API_KEY)
      ? "OPENAI_API_KEY"
      : "NONE";

  plans.push({
    source_task_id: source?.id || null,
    review_task_id: review?.id || null,
    asset_node_id: asset?.id || null,
    source_status: source?.status || null,
    review_status: review?.status || null,
    inspection_status: asset?.metadata?.inspection_status || null,
    source_media_present: Boolean(sourceUrl),
    source_url_logged: false,
    expected_contract: expected.contract || null,
    threshold_count: THRESHOLD_KEYS.filter((key) =>
      Number.isFinite(Number(minimums[key])),
    ).length,
    reference_count: references.length,
    reference_url_count: references.filter((item) => item.url).length,
    frame_contract: preparedFrameContract.contract || null,
    frame_count: Number(preparedFrameContract.frame_count || 0),
    localized_frame_count: localizedFrameAssets.length,
    source_duration_seconds: Number(
      preparedFrameContract.source_duration_seconds || 0,
    ),
    source_file_size_bytes: Number(
      preparedFrameContract.source_file_size_bytes || 0,
    ),
    frame_dimensions: list(preparedFrameContract.frames).map(
      (frame) => `${Number(frame.width || 0)}x${Number(frame.height || 0)}`,
    ),
    frame_encoded_bytes: list(preparedFrameContract.frames).map(
      (frame) => Number(frame.encoded_bytes || 0),
    ),
    raw_video_absent: Boolean(
      prepared &&
        prepared.image === undefined &&
        prepared.media === undefined &&
        prepared.source === undefined,
    ),
    service_id: serviceId,
    execution_capability: executionCapability,
    selected_provider: selectedProvider?.provider || null,
    selected_model: selectedProvider?.model || null,
    selected_pricing_id:
      pricing?.pricing_id || selectedProvider?.pricing_id || null,
    credential_id: selectedProvider?.credential_id || null,
    credential_source: credentialSource,
    credential_ready: credentialSource !== "NONE",
    secret_value_exposed: false,
    estimated_supplier_cost: money(pricing?.supplier_cost),
    estimated_customer_price: money(pricing?.customer_price),
    estimated_currency: pricing?.currency || null,
    pricing_estimated: pricing?.estimated === true,
    provider_binding_authorized: false,
    cost_approval_authorized: false,
    review_execution_authorized: false,
    issues,
    ready: issues.length === 0,
  });
}

const readyCount = plans.filter((plan) => plan.ready).length;
const failureCount = plans.filter((plan) => !plan.ready).length;
const credentialReadyCount = plans.filter(
  (plan) => plan.credential_ready,
).length;
const frameReadyCount = plans.filter(
  (plan) =>
    plan.frame_contract === FRAME_CONTRACT &&
    plan.frame_count === 7 &&
    plan.localized_frame_count === 7 &&
    plan.raw_video_absent === true,
).length;
const providerSet = [...new Set(plans.map((plan) => plan.selected_provider))];
const modelSet = [...new Set(plans.map((plan) => plan.selected_model))];
const pricingIdSet = [...new Set(plans.map((plan) => plan.selected_pricing_id))];
const currencySet = [...new Set(plans.map((plan) => plan.estimated_currency))];
const estimatedTotal = money(
  plans.reduce(
    (sum, plan) => sum + Number(plan.estimated_customer_price || 0),
    0,
  ),
);
const estimatedSupplierTotal = money(
  plans.reduce(
    (sum, plan) => sum + Number(plan.estimated_supplier_cost || 0),
    0,
  ),
);

requireValue(
  sourceRows.length === 9 &&
    plans.length === 9 &&
    readyCount === 9 &&
    failureCount === 0 &&
    credentialReadyCount === 9 &&
    frameReadyCount === 9 &&
    providerSet.length === 1 &&
    providerSet[0] === "openai" &&
    modelSet.length === 1 &&
    Boolean(modelSet[0]) &&
    pricingIdSet.length === 1 &&
    Boolean(pricingIdSet[0]) &&
    currencySet.length === 1 &&
    currencySet[0] === "THB" &&
    estimatedTotal > 0 &&
    before.wallet_balance >= estimatedTotal,
  "REPLACEMENT_REVIEW_PLAN_SET_INVALID",
);

const protectedIds = new Set(
  list(dispatchCheckpoint.protected_task_ids).map(text),
);
const protectedStateSha = taskFingerprint(
  before.tasks.filter((task) => protectedIds.has(task.id)),
);
requireValue(
  protectedIds.size === 36 &&
    protectedStateSha === text(dispatchCheckpoint.protected_task_state_sha256),
  "PROTECTED_TASK_STATE_CHANGED",
);

const executionContract = {
  contract:
    "CHURCHILL_OPENAI_PERCEPTUAL_REPLACEMENT_REVIEW_EXECUTION_CONTRACT_V1",
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  source_task_ids: plans.map((plan) => plan.source_task_id),
  review_task_ids: plans.map((plan) => plan.review_task_id),
  asset_node_ids: plans.map((plan) => plan.asset_node_id),
  provider: "openai",
  model: modelSet[0] || null,
  pricing_id: pricingIdSet[0] || null,
  currency: currencySet[0] || null,
  estimated_supplier_total: estimatedSupplierTotal,
  maximum_authorized_spend: estimatedTotal,
  task_count: 9,
  maximum_provider_calls: 9,
  maximum_calls_per_task: 1,
  frames_per_video: 7,
  source_regeneration_permitted: 0,
  runway_polling_permitted: 0,
  retries_permitted: 0,
  finalisation_permitted: 0,
  publication_permitted: 0,
  current_task_state_sha256: before.task_state_sha256,
  protected_task_state_sha256: protectedStateSha,
  source_audit_file_sha256: sourceAuditFile.file_sha256,
  dispatch_checkpoint_file_sha256: dispatchCheckpointFile.file_sha256,
};
const executionContractSha = sha256(executionContract);
const expectedAuthorization =
  `AUTHORIZE REPLACEMENT PERCEPTUAL REVIEWS OPENAI 9 TASKS MAX ` +
  `${estimatedTotal.toFixed(6)} THB ${executionContractSha}`;

const after = await exactState({
  supabaseAdmin,
  ProductionTaskRuntime,
  organizationId,
  projectId,
  graphId,
});
const stateUnchanged =
  before.task_count === after.task_count &&
  before.task_state_sha256 === after.task_state_sha256 &&
  before.usage_count === after.usage_count &&
  before.wallet_balance === after.wallet_balance &&
  before.wallet_reserved_balance === after.wallet_reserved_balance &&
  before.wallet_updated_at === after.wallet_updated_at;
if (!stateUnchanged) blockers.push("READ_ONLY_REVIEW_PREVIEW_CHANGED_STATE");

const decision = blockers.length
  ? "REPLACEMENT_PERCEPTUAL_REVIEW_EXECUTION_PREVIEW_BLOCKED"
  : "REPLACEMENT_PERCEPTUAL_REVIEW_9_TASK_EXECUTION_PREVIEW_CONFIRMED";
const readiness = blockers.length
  ? "REPLACEMENT_PERCEPTUAL_REVIEW_EXECUTION_PREVIEW_BLOCKED"
  : "READY_FOR_GUARDED_REPLACEMENT_PERCEPTUAL_REVIEW_IMPLEMENTATION";
const instruction = blockers.length
  ? "Resolve every review-preview blocker. Do not regenerate sources, poll Runway, call OpenAI, approve review cost, finalise, or publish."
  : "Implement one guarded checkpointed execution for these exact nine waiting review tasks. Require the exact authorization string, bind OpenAI and the resolved pricing snapshot, allow at most one OpenAI call per review, preserve source videos, never retry, and never finalise or publish.";

const report = {
  contract: PREVIEW_CONTRACT,
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  source_audit_file: sourceAuditFile.absolute,
  source_audit_file_sha256: sourceAuditFile.file_sha256,
  dispatch_checkpoint_file: dispatchCheckpointFile.absolute,
  dispatch_checkpoint_file_sha256: dispatchCheckpointFile.file_sha256,
  source_task_count: sourceRows.length,
  review_task_count: plans.length,
  ready_count: readyCount,
  failure_count: failureCount,
  frame_ready_count: frameReadyCount,
  credential_ready_count: credentialReadyCount,
  selected_provider_values: providerSet,
  selected_model_values: modelSet,
  selected_pricing_id_values: pricingIdSet,
  currency_values: currencySet,
  estimated_supplier_total: estimatedSupplierTotal,
  maximum_authorized_spend: estimatedTotal,
  wallet_sufficient: before.wallet_balance >= estimatedTotal,
  plans,
  execution_contract: executionContract,
  execution_contract_sha256: executionContractSha,
  expected_authorization: expectedAuthorization,
  protected_task_count: protectedIds.size,
  protected_task_state_sha256: protectedStateSha,
  blockers,
  decision,
  instruction,
  exact_state_before: {
    task_count: before.task_count,
    task_status_counts: before.task_status_counts,
    task_state_sha256: before.task_state_sha256,
    usage_count: before.usage_count,
    wallet_balance: before.wallet_balance,
    wallet_reserved_balance: before.wallet_reserved_balance,
  },
  exact_state_after: {
    task_count: after.task_count,
    task_status_counts: after.task_status_counts,
    task_state_sha256: after.task_state_sha256,
    usage_count: after.usage_count,
    wallet_balance: after.wallet_balance,
    wallet_reserved_balance: after.wallet_reserved_balance,
  },
  state_unchanged: stateUnchanged,
  database_writes_executed: false,
  provider_calls_executed: false,
  provider_polls_executed: false,
  wallet_mutations_executed: false,
  source_regeneration_executed: false,
  review_execution_executed: false,
  finalisation_executed: false,
  publication_executed: false,
  readiness,
};

writeJson(outputPath, report);

console.log("============================================================");
console.log("READ-ONLY REPLACEMENT PERCEPTUAL REVIEW EXECUTION PREVIEW");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`TASK_COUNT=${before.task_count}`);
console.log(`TASK_STATUS_COUNTS=${JSON.stringify(before.task_status_counts)}`);
console.log(`SOURCE_TASK_COUNT=${sourceRows.length}`);
console.log(`REVIEW_TASK_COUNT=${plans.length}`);
console.log(`READY_COUNT=${readyCount}`);
console.log(`FAILURE_COUNT=${failureCount}`);
console.log(`FRAME_READY_COUNT=${frameReadyCount}`);
console.log(`CREDENTIAL_READY_COUNT=${credentialReadyCount}`);
console.log(`SELECTED_PROVIDER_VALUES=${JSON.stringify(providerSet)}`);
console.log(`SELECTED_MODEL_VALUES=${JSON.stringify(modelSet)}`);
console.log(`SELECTED_PRICING_ID_VALUES=${JSON.stringify(pricingIdSet)}`);
console.log(`CURRENCY_VALUES=${JSON.stringify(currencySet)}`);
console.log(`ESTIMATED_SUPPLIER_TOTAL=${estimatedSupplierTotal}`);
console.log(`MAXIMUM_AUTHORIZED_SPEND=${estimatedTotal}`);
console.log(`WALLET_SUFFICIENT=${before.wallet_balance >= estimatedTotal ? "YES" : "NO"}`);
console.log("SOURCE_REGENERATION_PERMITTED=NO");
console.log("RUNWAY_POLLING_PERMITTED=NO");
console.log("MAXIMUM_OPENAI_CALLS=9");
console.log("MAXIMUM_CALLS_PER_REVIEW=1");
console.log("RETRIES_PERMITTED=NO");

for (const plan of plans) {
  console.log([
    `REVIEW_EXECUTION_PLAN=${plan.review_task_id || ""}`,
    `source=${plan.source_task_id || ""}`,
    `asset=${plan.asset_node_id || ""}`,
    `source_status=${plan.source_status || ""}`,
    `review_status=${plan.review_status || ""}`,
    `inspection=${plan.inspection_status || ""}`,
    `frame_contract=${plan.frame_contract || ""}`,
    `frames=${plan.frame_count}`,
    `localized_frames=${plan.localized_frame_count}`,
    `duration=${plan.source_duration_seconds}`,
    `references=${plan.reference_count}`,
    `provider=${plan.selected_provider || ""}`,
    `model=${plan.selected_model || ""}`,
    `pricing=${plan.selected_pricing_id || ""}`,
    `credential_source=${plan.credential_source}`,
    `credential_ready=${plan.credential_ready ? "YES" : "NO"}`,
    `estimated_price=${plan.estimated_customer_price}`,
    `currency=${plan.estimated_currency || ""}`,
    `source_url_logged=NO`,
    `secret_exposed=NO`,
    `issues=${plan.issues.join(",")}`,
    `ready=${plan.ready ? "YES" : "NO"}`,
  ].join("|"));
}

console.log(`EXECUTION_CONTRACT_SHA256=${executionContractSha}`);
console.log(`EXPECTED_REVIEW_AUTHORIZATION=${expectedAuthorization}`);
console.log(`REVIEW_PREVIEW_BLOCKERS=${JSON.stringify(blockers)}`);
console.log(`REVIEW_PREVIEW_DECISION=${decision}`);
console.log(`REVIEW_PREVIEW_INSTRUCTION=${instruction}`);
console.log(`TASK_STATE_SHA256_BEFORE=${before.task_state_sha256}`);
console.log(`TASK_STATE_SHA256_AFTER=${after.task_state_sha256}`);
console.log(`USAGE_COUNT_BEFORE=${before.usage_count}`);
console.log(`USAGE_COUNT_AFTER=${after.usage_count}`);
console.log(`WALLET_BALANCE_BEFORE=${before.wallet_balance}`);
console.log(`WALLET_BALANCE_AFTER=${after.wallet_balance}`);
console.log(`WALLET_RESERVED_BALANCE_BEFORE=${before.wallet_reserved_balance}`);
console.log(`WALLET_RESERVED_BALANCE_AFTER=${after.wallet_reserved_balance}`);
console.log(`STATE_UNCHANGED=${stateUnchanged ? "YES" : "NO"}`);
console.log("DATABASE_WRITES_EXECUTED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("PROVIDER_POLLS_EXECUTED=NO");
console.log("WALLET_MUTATIONS_EXECUTED=NO");
console.log("SOURCE_REGENERATION_EXECUTED=NO");
console.log("REVIEW_EXECUTION_EXECUTED=NO");
console.log("FINALISATION_EXECUTED=NO");
console.log("PUBLICATION_EXECUTED=NO");
console.log(`AUDIT_READINESS=${readiness}`);
console.log("TERMINAL_REMAINS_OPEN=YES");

if (blockers.length || !stateUnchanged) process.exitCode = 2;
