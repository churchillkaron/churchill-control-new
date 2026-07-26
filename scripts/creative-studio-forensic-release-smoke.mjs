#!/usr/bin/env node

import fs from "node:fs/promises";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const TERMINAL_STATES = new Set([
  "READY_FOR_APPROVAL",
  "REVIEW_REQUIRED",
  "BLOCKED_BY_RELEASE_GATE",
  "BLOCKED_BY_PRODUCTION_FAILURE",
]);
const PUBLISH_TERMINAL_STATES = new Set([
  "COMPLETED",
  "FAILED",
  "EVIDENCE_REQUIRED",
]);
const REQUIRED_AGENCY_ROLE_COUNT = 19;

function env(name, fallback = null) {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

function required(name) {
  const value = env(name);
  if (!value) throw new Error(`${name} required`);
  return value;
}

function integer(name, fallback) {
  const value = Number(env(name, fallback));
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function json(name) {
  const raw = required(name);
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object") {
      throw new Error("must contain an object or array");
    }
    return value;
  } catch (error) {
    throw new Error(`${name} invalid JSON: ${error.message}`);
  }
}

function csv(name) {
  return text(required(name)).split(",").map(text).filter(Boolean);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function headers() {
  const result = {
    "content-type": "application/json",
    accept: "application/json",
  };
  const cookie = env("CREATIVE_SMOKE_COOKIE");
  const bearer = env("CREATIVE_SMOKE_BEARER_TOKEN");
  if (cookie) result.cookie = cookie;
  if (bearer) result.authorization = `Bearer ${bearer}`;
  const extra = env("CREATIVE_SMOKE_HEADERS_JSON");
  if (extra) Object.assign(result, JSON.parse(extra));
  return result;
}

async function request(baseUrl, path, body) {
  const response = await fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  let payload;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { raw };
  }
  if (!response.ok || payload.success === false) {
    const message = payload.error || payload.message || raw || response.statusText;
    const error = new Error(`${path} failed (${response.status}): ${message}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function postProduction(payload = {}) {
  return (
    payload.execution?.production?.post_production ||
    payload.production?.post_production ||
    payload.post_production ||
    null
  );
}

function productionStatus(payload = {}) {
  const post = postProduction(payload);
  return (
    post?.status ||
    payload.execution?.production?.status ||
    payload.production?.status ||
    payload.status ||
    null
  );
}

function pipeline(payload = {}) {
  return (
    payload.pipeline ||
    payload.execution?.pipeline ||
    payload.production?.pipeline ||
    {}
  );
}

function masterPlan(payload = {}) {
  const current = pipeline(payload).master_plan || payload.master_plan || {};
  return current.plan || current;
}

function releaseEvidence(payload = {}) {
  const post = postProduction(payload) || {};
  return {
    status: post.status || productionStatus(payload),
    timeline: post.timeline || null,
    render: post.render || null,
    release_gate: post.release_gate || null,
    technical_qc: post.technical_qc || null,
    perceptual_quality: post.perceptual_quality || null,
    semantic_quality: post.semantic_quality || null,
    release_readiness: post.release_readiness || null,
    repair_plan: post.repair_plan || null,
    repair_execution: post.repair_execution || null,
  };
}

function assertion(id, passed, evidence = null, reason = null) {
  return {
    id,
    passed: Boolean(passed),
    evidence,
    reason: passed ? null : reason,
  };
}

function policyMatches(actual = {}, expected = {}) {
  return Object.entries(expected).every(([key, value]) => {
    if (Array.isArray(value)) {
      return JSON.stringify(list(actual[key])) === JSON.stringify(value);
    }
    return actual[key] === value;
  });
}

function roleDecisionEntries(plan = {}) {
  return Object.entries(object(plan.role_decisions));
}

function frameContractComplete(shot = {}) {
  const framePlan = object(shot.frame_plan);
  const generation = object(shot.generation);
  const graphics = object(shot.graphics);
  return Boolean(
    text(shot.subject) &&
    text(shot.action) &&
    text(shot.performance) &&
    text(framePlan.opening_frame) &&
    text(framePlan.progression) &&
    text(framePlan.closing_frame) &&
    Object.keys(object(shot.camera)).length &&
    Object.keys(object(shot.lighting)).length &&
    Object.keys(object(shot.production_design)).length &&
    Object.keys(object(shot.continuity)).length &&
    Object.keys(object(shot.audio)).length &&
    Object.keys(graphics).length &&
    graphics.render_text_outside_generated_pixels === true &&
    Object.keys(object(shot.vfx)).length &&
    text(shot.transition_in) &&
    text(shot.transition_out) &&
    list(shot.negative_constraints).length &&
    list(shot.repair_instructions).length &&
    text(generation.service) &&
    text(generation.capability) &&
    text(generation.provider_prompt) &&
    text(generation.negative_prompt) &&
    Object.keys(object(generation.output_spec)).length
  );
}

function planAssertions(plan = {}, creativeQualityPolicy = {}) {
  const validation = object(plan.validation);
  const manifest = list(plan.asset_manifest);
  const selectedAssetIds = list(validation.selected_asset_ids);
  const decisions = roleDecisionEntries(plan);
  const scenes = list(plan.scenes);
  const shots = scenes.flatMap((scene) => list(scene.shots));
  const manifestIds = new Set(
    manifest.map((item) => text(item.asset_id || item.id)).filter(Boolean),
  );
  const unaccounted = selectedAssetIds.filter((id) => !manifestIds.has(text(id)));
  const activeDecisionFailures = decisions.filter(([, value]) => {
    const decision = object(value);
    const status = text(decision.status).toUpperCase();
    if (!["ACTIVE", "NOT_REQUIRED"].includes(status)) return true;
    if (status === "ACTIVE") {
      return !text(decision.decision) || !list(decision.evidence).length;
    }
    return false;
  });
  const stateFailures = scenes.filter((scene) =>
    !text(scene.story_state_before) ||
    !text(scene.state_change) ||
    !text(scene.story_state_after) ||
    !text(scene.transition_logic));
  const brokenSceneLinks = scenes.slice(0, -1).filter((scene, index) =>
    text(scene.story_state_after) !== text(scenes[index + 1]?.story_state_before));

  return [
    assertion(
      "master_plan_validation_passed",
      validation.passed === true,
      validation,
      "Master-plan validation did not pass",
    ),
    assertion(
      "master_plan_not_degraded",
      plan.degraded !== true && plan.release_blocked !== true,
      { degraded: plan.degraded, release_blocked: plan.release_blocked },
      "Degraded or release-blocked direction reached production",
    ),
    assertion(
      "workflow_kind_temporal",
      text(plan.workflow_kind).toUpperCase() === "TEMPORAL",
      plan.workflow_kind,
      "The forensic film smoke requires a TEMPORAL workflow",
    ),
    assertion(
      "agency_roles_complete",
      decisions.length >= REQUIRED_AGENCY_ROLE_COUNT && activeDecisionFailures.length === 0,
      { count: decisions.length, invalid: activeDecisionFailures, decisions },
      "All accountable agency roles require valid status, decisions and evidence",
    ),
    assertion(
      "selected_assets_accounted",
      selectedAssetIds.length > 0 && unaccounted.length === 0,
      { selected_asset_ids: selectedAssetIds, manifest, unaccounted },
      "One or more selected assets are missing from the master asset manifest",
    ),
    assertion(
      "deliverable_graph_present",
      list(plan.deliverables).length > 0 &&
        list(plan.deliverables).every((item) =>
          text(item.id) && text(item.type) && Object.keys(object(item.output_spec)).length),
      plan.deliverables,
      "Executable deliverable graph missing",
    ),
    assertion(
      "creative_quality_policy_preserved",
      policyMatches(object(plan.quality), creativeQualityPolicy),
      { expected: creativeQualityPolicy, actual: plan.quality || null },
      "Master plan changed the configured Creative quality policy",
    ),
    assertion(
      "story_architecture_complete",
      [
        "hook",
        "audience_tension",
        "escalation",
        "observable_proof",
        "turn",
        "resolution",
        "call_to_action",
        "emotional_arc",
        "anti_cliche_strategy",
      ].every((field) => text(plan.story?.[field])),
      plan.story || null,
      "Story architecture is incomplete",
    ),
    assertion(
      "story_state_progression_present",
      scenes.length >= 2 && stateFailures.length === 0 && brokenSceneLinks.length === 0,
      {
        scene_count: scenes.length,
        missing_state_fields: stateFailures.map((scene) => scene.id || scene.title),
        broken_links: brokenSceneLinks.map((scene) => scene.id || scene.title),
      },
      "Scene state progression is incomplete or discontinuous",
    ),
    assertion(
      "all_scenes_have_shots",
      scenes.length > 0 && scenes.every((scene) => list(scene.shots).length > 0),
      scenes.map((scene) => ({ title: scene.title, shot_count: list(scene.shots).length })),
      "One or more scenes have no directed shots",
    ),
    assertion(
      "all_shots_frame_complete",
      shots.length > 0 && shots.every(frameContractComplete),
      shots.map((shot) => ({ id: shot.id, title: shot.title, complete: frameContractComplete(shot) })),
      "One or more shots lack executable frame, camera, lighting, design, continuity, sound, graphics, VFX, provider or repair direction",
    ),
  ];
}

async function rows(client, table, configure) {
  let query = client.from(table).select("*");
  query = configure(query);
  const { data, error } = await query;
  if (error) return { table, error: error.message, rows: [] };
  return { table, error: null, rows: data || [] };
}

async function snapshot(client, organizationId, projectId = null) {
  const wallet = await rows(client, "organization_wallets", (query) =>
    query.eq("organization_id", organizationId).limit(1));
  const transactions = await rows(client, "wallet_transactions", (query) =>
    query.eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(500));
  const usage = await rows(client, "platform_service_usage", (query) =>
    query.eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(500));
  const billing = await rows(client, "billing_invoice_lines", (query) =>
    query.eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(500));
  const nodes = projectId
    ? await rows(client, "creative_asset_nodes", (query) =>
        query.eq("organization_id", organizationId)
          .eq("creative_project_id", projectId)
          .order("created_at", { ascending: true }))
    : { rows: [], error: null };
  return {
    wallet: wallet.rows[0] || null,
    wallet_transactions: transactions.rows,
    service_usage: usage.rows,
    billing_lines: billing.rows,
    creative_asset_nodes: nodes.rows,
    errors: [wallet.error, transactions.error, usage.error, billing.error, nodes.error].filter(Boolean),
  };
}

function countBy(rows, key) {
  return rows.reduce((result, row) => {
    const value = text(row?.[key] || "UNKNOWN").toUpperCase();
    result[value] = (result[value] || 0) + 1;
    return result;
  }, {});
}

function qualityAssertions(evidence, nodes, semanticPolicy) {
  const renderId = evidence.render?.id || null;
  const technical = nodes.find((node) =>
    node.parent_asset_node_id === renderId &&
    node.type === "QUALITY_REPORT" &&
    node.lineage?.source === "perceptual_qc",
  ) || evidence.technical_qc;
  const semantic = nodes.find((node) =>
    node.parent_asset_node_id === renderId &&
    node.type === "QUALITY_REPORT" &&
    node.lineage?.source === "semantic_quality_review",
  ) || evidence.semantic_quality;
  const readiness = evidence.release_readiness;
  const semanticMetadata = semantic?.metadata || semantic || {};

  return [
    assertion(
      "technical_qc_passed",
      technical?.metadata?.passed === true || technical?.passed === true,
      technical || null,
      "Technical quality evidence did not pass",
    ),
    assertion(
      "semantic_qc_present",
      Boolean(semantic),
      semantic || null,
      "Distinct semantic quality evidence missing",
    ),
    assertion(
      "semantic_qc_passed",
      semanticMetadata.passed === true,
      semantic || null,
      "Semantic quality review did not pass",
    ),
    assertion(
      "semantic_policy_preserved",
      policyMatches(object(semanticMetadata.policy), semanticPolicy),
      { expected: semanticPolicy, actual: semanticMetadata.policy || null },
      "Semantic review did not use the configured policy",
    ),
    assertion(
      "semantic_samples_present",
      list(semanticMetadata.sampled_frames).length > 0 ||
        list(semanticMetadata.sampled_clips).length > 0,
      {
        sampled_frames: semanticMetadata.sampled_frames || [],
        sampled_clips: semanticMetadata.sampled_clips || [],
        sampled_audio_segments: semanticMetadata.sampled_audio_segments || [],
      },
      "Semantic review lacks sampled visual evidence",
    ),
    assertion(
      "semantic_audio_samples_present_when_required",
      semanticPolicy.require_audio_review !== true ||
        list(semanticMetadata.sampled_audio_segments).length > 0,
      semanticMetadata.sampled_audio_segments || [],
      "Semantic review lacks required sampled audio evidence",
    ),
    assertion(
      "semantic_repairs_closed",
      list(semanticMetadata.failed_checks).length === 0 &&
        list(semanticMetadata.validation_failures).length === 0 &&
        list(semanticMetadata.repair_plan).length === 0,
      semanticMetadata,
      "Semantic review has unresolved failures or repairs",
    ),
    assertion(
      "release_readiness_passed",
      readiness?.metadata?.passed === true,
      readiness?.metadata || null,
      "Release readiness did not pass",
    ),
    assertion(
      "release_readiness_contains_both_quality_layers",
      Boolean(
        readiness?.metadata?.technical_quality_report_id &&
        readiness?.metadata?.semantic_quality_report_id,
      ),
      readiness?.metadata || null,
      "Release readiness does not reference both technical and semantic quality reports",
    ),
  ];
}

function settlementAssertions(before, after, publishExecution, maximumCost) {
  const beforeUsageIds = new Set(list(before?.service_usage).map((row) => row.id));
  const newUsage = list(after?.service_usage).filter((row) => !beforeUsageIds.has(row.id));
  const transactions = list(after?.wallet_transactions);
  const billingLines = list(after?.billing_lines);
  const usageSettlement = newUsage.map((usage) => {
    const relatedTransactions = transactions.filter((row) =>
      row.usage_id === usage.id || row.reference === usage.id);
    const charges = relatedTransactions.filter((row) =>
      text(row.type).toUpperCase() === "CHARGE");
    const reserves = relatedTransactions.filter((row) =>
      text(row.type).toUpperCase() === "RESERVE");
    const billing = billingLines.filter((row) =>
      row.usage_id === usage.id || row.service_usage_id === usage.id);
    return {
      usage_id: usage.id,
      status: usage.status,
      invoice_status: usage.invoice_status,
      charge_count: charges.length,
      reserve_count: reserves.length,
      billing_count: billing.length,
    };
  });
  const beforeBalance = Number(before?.wallet?.available_balance);
  const afterBalance = Number(after?.wallet?.available_balance);
  const walletDelta = Number.isFinite(beforeBalance) && Number.isFinite(afterBalance)
    ? beforeBalance - afterBalance
    : null;
  const publishMetadata = publishExecution?.metadata || {};

  return [
    assertion(
      "new_service_usage_present",
      newUsage.length > 0,
      usageSettlement,
      "No new service usage was recorded for the smoke",
    ),
    assertion(
      "all_service_usage_successful",
      newUsage.length > 0 && newUsage.every((row) => row.status === "SUCCESS"),
      usageSettlement,
      "One or more provider usages are pending or failed",
    ),
    assertion(
      "all_service_usage_charged_once",
      usageSettlement.length > 0 && usageSettlement.every((item) => item.charge_count === 1),
      usageSettlement,
      "Every successful provider usage must have exactly one wallet charge",
    ),
    assertion(
      "wallet_reservations_not_duplicated",
      usageSettlement.every((item) => item.reserve_count <= 1),
      usageSettlement,
      "One or more provider usages have duplicate reservations",
    ),
    assertion(
      "all_service_usage_billed",
      usageSettlement.length > 0 && usageSettlement.every((item) => item.billing_count > 0),
      usageSettlement,
      "One or more provider usages lack billing evidence",
    ),
    assertion(
      "wallet_spend_within_approved_maximum",
      walletDelta !== null && walletDelta >= 0 && walletDelta <= maximumCost,
      { before_balance: beforeBalance, after_balance: afterBalance, wallet_delta: walletDelta, approved_maximum: maximumCost },
      "Wallet spend exceeded the approved smoke maximum or could not be verified",
    ),
    assertion(
      "publication_completed",
      publishMetadata.execution_status === "COMPLETED",
      publishMetadata,
      "Publication did not complete",
    ),
    assertion(
      "external_publication_evidence_present",
      Boolean(
        publishMetadata.external_publication_id ||
        publishMetadata.external_publication_url,
      ),
      {
        id: publishMetadata.external_publication_id || null,
        url: publishMetadata.external_publication_url || null,
      },
      "External publication evidence missing",
    ),
  ];
}

async function main() {
  const baseUrl = required("CREATIVE_SMOKE_BASE_URL");
  const organizationId = required("CREATIVE_SMOKE_ORGANIZATION_ID");
  const publishTargetId = required("CREATIVE_SMOKE_PUBLISH_TARGET_ID");
  const publishTarget = json("CREATIVE_SMOKE_PUBLISH_TARGET_JSON");
  const creativeQualityPolicy = json("CREATIVE_SMOKE_CREATIVE_QUALITY_POLICY_JSON");
  const semanticPolicy = json("CREATIVE_SMOKE_SEMANTIC_POLICY_JSON");
  const technicalPolicy = json("CREATIVE_SMOKE_TECHNICAL_POLICY_JSON");
  const semanticReview = json("CREATIVE_SMOKE_SEMANTIC_REVIEW_JSON");
  const executionRequirements = json("CREATIVE_SMOKE_EXECUTION_REQUIREMENTS_JSON");
  if (!Array.isArray(executionRequirements) || !executionRequirements.length) {
    throw new Error("CREATIVE_SMOKE_EXECUTION_REQUIREMENTS_JSON must be a non-empty array");
  }
  const selectedAssetIds = csv("CREATIVE_SMOKE_SELECTED_ASSET_IDS");
  const estimatedMaximumCost = Number(required("CREATIVE_SMOKE_ESTIMATED_MAXIMUM_COST"));
  if (!Number.isFinite(estimatedMaximumCost) || estimatedMaximumCost <= 0) {
    throw new Error("CREATIVE_SMOKE_ESTIMATED_MAXIMUM_COST must be greater than zero");
  }
  const maximumCostCurrency = required("CREATIVE_SMOKE_ESTIMATED_MAXIMUM_COST_CURRENCY");
  const mediaKind = required("CREATIVE_SMOKE_MEDIA_KIND");
  const outputPath = env(
    "CREATIVE_SMOKE_OUTPUT",
    `creative-studio-forensic-release-smoke-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  const pollIntervalMs = integer("CREATIVE_SMOKE_POLL_INTERVAL_MS", 10000);
  const maxPolls = integer("CREATIVE_SMOKE_MAX_POLLS", 60);
  const command = required("CREATIVE_SMOKE_INTENT");
  const channels = csv("CREATIVE_SMOKE_CHANNELS");
  const supabaseUrl = env("SUPABASE_URL", env("NEXT_PUBLIC_SUPABASE_URL"));
  const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl) throw new Error("SUPABASE_URL required");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const report = {
    started_at: new Date().toISOString(),
    base_url: baseUrl,
    organization_id: organizationId,
    publish_target_id: publishTargetId,
    selected_asset_ids: selectedAssetIds,
    command,
    channels,
    assertions: [],
    phases: [],
  };

  const preflightBody = {
    organization_id: organizationId,
    execution_requirements: executionRequirements,
    selected_asset_ids: selectedAssetIds,
    publish_target_id: publishTargetId,
    publish_target: publishTarget,
    required_media_kind: mediaKind,
    creative_quality_policy: creativeQualityPolicy,
    semantic_quality_policy: semanticPolicy,
    estimated_maximum_cost: estimatedMaximumCost,
    estimated_maximum_cost_currency: maximumCostCurrency,
  };
  const preflight = await request(
    baseUrl,
    "/api/creative/release/preflight",
    preflightBody,
  );
  report.phases.push({ phase: "preflight", response: preflight });
  report.assertions.push(
    assertion(
      "preflight_ready",
      preflight.ready === true,
      preflight,
      "Creative live preflight did not pass",
    ),
  );
  if (preflight.ready !== true) {
    throw new Error(`CREATIVE_PREFLIGHT_BLOCKED:${list(preflight.blocking_checks).join(",")}`);
  }

  report.database_before = await snapshot(supabase, organizationId);
  const created = await request(baseUrl, "/api/creative/create", {
    organization_id: organizationId,
    intent: command,
    title: env("CREATIVE_SMOKE_TITLE", `Creative forensic release smoke ${Date.now()}`),
    production_type: required("CREATIVE_SMOKE_PRODUCTION_TYPE"),
    target_duration: Number(required("CREATIVE_SMOKE_DURATION_SECONDS")),
    target_languages: csv("CREATIVE_SMOKE_LANGUAGES"),
    channels,
    requested_outputs: channels,
    quality_profile: required("CREATIVE_SMOKE_QUALITY_PROFILE"),
    assets: selectedAssetIds,
    selected_asset_ids: selectedAssetIds,
    creative_quality_policy: creativeQualityPolicy,
    semantic_quality_policy: semanticPolicy,
    publish_target: publishTarget,
    metadata: {
      forensic_smoke_test: true,
      smoke_started_at: report.started_at,
      publish_targets: [publishTarget],
      creative_quality_policy: creativeQualityPolicy,
      semantic_quality_policy: semanticPolicy,
      execution_requirements: executionRequirements,
      approved_maximum_cost: estimatedMaximumCost,
      approved_maximum_cost_currency: maximumCostCurrency,
    },
  });
  report.phases.push({ phase: "create", response: created });
  const missionId = created.creative_mission_id;
  const projectId = created.creative_project_id;
  const briefId = created.creative_brief_id;
  report.creative_mission_id = missionId;
  report.creative_project_id = projectId;
  report.creative_brief_id = briefId;
  report.assertions.push(
    assertion("mission_created", Boolean(missionId), missionId, "Mission ID missing"),
    assertion("project_created", Boolean(projectId), projectId, "Project ID missing"),
    assertion("brief_created", Boolean(briefId), briefId, "Brief ID missing"),
    assertion(
      "selected_assets_locked",
      list(created.selected_asset_ids).length === selectedAssetIds.length &&
        selectedAssetIds.every((id) => list(created.selected_asset_ids).includes(id)),
      { requested: selectedAssetIds, locked: created.selected_asset_ids || [] },
      "The create endpoint did not lock every selected asset",
    ),
  );

  let current = created;
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    if (TERMINAL_STATES.has(productionStatus(current))) break;
    await sleep(pollIntervalMs);
    current = await request(baseUrl, "/api/creative/director/execute", {
      organization_id: organizationId,
      creative_mission_id: missionId,
      creative_project_id: projectId,
      creative_brief_id: briefId,
    });
    report.phases.push({
      phase: "pipeline_resume",
      attempt: attempt + 1,
      status: productionStatus(current),
      response: current,
    });
  }

  const plan = masterPlan(current);
  report.master_plan = plan;
  report.assertions.push(...planAssertions(plan, creativeQualityPolicy));
  let evidence = releaseEvidence(current);
  report.release_before_quality = evidence;
  report.assertions.push(
    assertion("timeline_created", Boolean(evidence.timeline?.id), evidence.timeline || null, "Timeline missing"),
    assertion("final_render_created", Boolean(evidence.render?.id), evidence.render || null, "Final render missing"),
  );

  if (!evidence.render?.id) throw new Error("FINAL_RENDER_REQUIRED_FOR_QUALITY_REVIEW");
  const quality = await request(
    baseUrl,
    "/api/creative/timeline/perceptual-quality",
    {
      organization_id: organizationId,
      render_asset_node_id: evidence.render.id,
      policy: technicalPolicy,
      semantic_review: semanticReview,
      semantic_policy: semanticPolicy,
      force: true,
    },
  );
  report.phases.push({ phase: "quality_review", response: quality });
  evidence = {
    ...evidence,
    technical_qc: quality.technical?.report || quality.technical || evidence.technical_qc,
    semantic_quality: quality.semantic?.report || quality.semantic || null,
  };

  if (evidence.release_gate?.metadata?.passed === true) {
    report.phases.push({
      phase: "approve_release_gate",
      response: await request(baseUrl, "/api/creative/release/approve", {
        organization_id: organizationId,
        subject_asset_node_id: evidence.release_gate.id,
        scope: "RELEASE_GATE",
        notes: "Forensic Creative release smoke approval",
      }),
    });
  }
  report.phases.push({
    phase: "approve_final_render",
    response: await request(baseUrl, "/api/creative/release/approve", {
      organization_id: organizationId,
      subject_asset_node_id: evidence.render.id,
      scope: "FINAL_RENDER",
      notes: "Forensic Creative final-render smoke approval",
    }),
  });

  const readiness = await request(baseUrl, "/api/creative/release/readiness", {
    organization_id: organizationId,
    creative_project_id: projectId,
    timeline_asset_node_id: evidence.timeline?.id || null,
    final_render_asset_node_id: evidence.render.id,
    force: true,
  });
  report.phases.push({ phase: "release_readiness", response: readiness });
  evidence = { ...evidence, release_readiness: readiness.report };

  const afterQuality = await snapshot(supabase, organizationId, projectId);
  report.database_after_quality = afterQuality;
  report.assertions.push(
    ...qualityAssertions(
      evidence,
      list(afterQuality?.creative_asset_nodes),
      semanticPolicy,
    ),
  );
  if (readiness.report?.metadata?.passed !== true) {
    throw new Error(
      `RELEASE_READINESS_FAILED:${list(readiness.report?.metadata?.failed_checks).join(",")}`,
    );
  }

  report.phases.push({
    phase: "approve_publish",
    response: await request(baseUrl, "/api/creative/release/approve", {
      organization_id: organizationId,
      subject_asset_node_id: readiness.report.id,
      scope: "PUBLISH_RELEASE",
      notes: "Forensic Creative publish smoke approval",
    }),
  });
  const commandResponse = await request(
    baseUrl,
    "/api/creative/release/publish/command",
    {
      organization_id: organizationId,
      release_readiness_report_id: readiness.report.id,
      publish_target_id: publishTargetId,
    },
  );
  report.phases.push({ phase: "publish_command", response: commandResponse });
  const publishCommandId = commandResponse.command?.id;
  if (!publishCommandId) throw new Error("PUBLISH_COMMAND_ID_REQUIRED");

  let publish = await request(baseUrl, "/api/creative/release/publish/execute", {
    organization_id: organizationId,
    publish_command_asset_node_id: publishCommandId,
  });
  report.phases.push({ phase: "publish_execute", response: publish });
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    const status = publish.execution?.metadata?.execution_status;
    if (PUBLISH_TERMINAL_STATES.has(status)) break;
    await sleep(pollIntervalMs);
    publish = await request(baseUrl, "/api/creative/release/publish/execute", {
      organization_id: organizationId,
      publish_command_asset_node_id: publishCommandId,
    });
    report.phases.push({ phase: "publish_resume", attempt: attempt + 1, response: publish });
  }
  const duplicate = await request(baseUrl, "/api/creative/release/publish/execute", {
    organization_id: organizationId,
    publish_command_asset_node_id: publishCommandId,
  });
  report.phases.push({ phase: "publish_duplicate_check", response: duplicate });
  report.publish = {
    command: commandResponse.command,
    execution: publish.execution,
    duplicate_check: duplicate.execution,
  };
  report.assertions.push(
    assertion(
      "duplicate_execution_reused",
      duplicate.reused === true && duplicate.execution?.id === publish.execution?.id,
      {
        first: publish.execution?.id || null,
        repeated: duplicate.execution?.id || null,
        reused: duplicate.reused === true,
      },
      "Repeated publication did not reuse the same execution",
    ),
  );

  report.database_after = await snapshot(supabase, organizationId, projectId);
  report.assertions.push(
    ...settlementAssertions(
      report.database_before,
      report.database_after,
      publish.execution,
      estimatedMaximumCost,
    ),
  );
  report.assertions.push(
    assertion(
      "database_snapshot_clean",
      list(report.database_after?.errors).length === 0,
      report.database_after?.errors || [],
      "Database evidence queries failed",
    ),
    assertion(
      "asset_graph_evidence_present",
      list(report.database_after?.creative_asset_nodes).length > 0,
      countBy(list(report.database_after?.creative_asset_nodes), "type"),
      "No Creative asset graph evidence found",
    ),
  );

  report.completed_at = new Date().toISOString();
  report.passed = report.assertions.every((item) => item.passed);
  report.failed_assertions = report.assertions
    .filter((item) => !item.passed)
    .map((item) => item.id);
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("============================================================");
  console.log("AVANTIQO CREATIVE STUDIO FORENSIC RELEASE SMOKE");
  console.log("============================================================");
  console.log(`MISSION=${missionId}`);
  console.log(`PROJECT=${projectId}`);
  console.log(`STATUS=${productionStatus(current) || "UNKNOWN"}`);
  console.log(`PUBLISH=${publish.execution?.metadata?.execution_status || "UNKNOWN"}`);
  console.log(`REPORT=${outputPath}`);
  console.log(`RESULT=${report.passed ? "PASS" : "FAIL"}`);
  if (!report.passed) {
    console.log(`FAILED_ASSERTIONS=${report.failed_assertions.join(",")}`);
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  const failurePath = env(
    "CREATIVE_SMOKE_OUTPUT",
    `creative-studio-forensic-release-smoke-failed-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  const failure = {
    passed: false,
    failed_at: new Date().toISOString(),
    error: error.message,
    status: error.status || null,
    payload: error.payload || null,
    stack: error.stack || null,
  };
  await fs.writeFile(failurePath, `${JSON.stringify(failure, null, 2)}\n`, "utf8").catch(() => null);
  console.error("CREATIVE STUDIO FORENSIC RELEASE SMOKE FAILED");
  console.error(error);
  console.error(`REPORT=${failurePath}`);
  process.exitCode = 1;
});
