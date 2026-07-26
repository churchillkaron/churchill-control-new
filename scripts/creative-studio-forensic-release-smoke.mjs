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

function frameContractComplete(shot = {}) {
  return Boolean(
    Object.keys(object(shot.opening_frame)).length &&
    list(shot.progression_frames).length &&
    Object.keys(object(shot.closing_frame)).length &&
    Object.keys(object(shot.camera)).length &&
    Object.keys(object(shot.lighting)).length &&
    Object.keys(object(shot.production_design)).length &&
    Object.keys(object(shot.continuity)).length &&
    Object.keys(object(shot.sound_design)).length &&
    list(shot.negative_constraints).length &&
    text(shot.provider_prompt) &&
    Object.keys(object(shot.repair_contract)).length &&
    text(shot.generation?.service) &&
    text(shot.generation?.capability)
  );
}

function planAssertions(plan = {}) {
  const validation = object(plan.validation);
  const manifest = list(plan.asset_manifest);
  const selectedAssetIds = list(validation.selected_asset_ids);
  const decisions = list(plan.agency_decisions);
  const scenes = list(plan.scenes);
  const shots = scenes.flatMap((scene) => list(scene.shots));
  const sceneObjectives = new Set(scenes.map((scene) => text(scene.objective)).filter(Boolean));
  const sceneEmotions = new Set(scenes.map((scene) => text(scene.emotion)).filter(Boolean));
  const manifestIds = new Set(
    manifest.map((item) => text(item.asset_id || item.id)).filter(Boolean),
  );
  const unaccounted = selectedAssetIds.filter((id) => !manifestIds.has(text(id)));

  return [
    assertion(
      "master_plan_validation_passed",
      validation.passed === true,
      validation,
      "Master-plan validation did not pass",
    ),
    assertion(
      "master_plan_not_degraded",
      plan.degraded !== true,
      { degraded: plan.degraded, release_blocked: plan.release_blocked },
      "Degraded or fallback direction reached production",
    ),
    assertion(
      "workflow_kind_explicit",
      Boolean(text(plan.workflow_kind)),
      plan.workflow_kind,
      "workflow_kind missing",
    ),
    assertion(
      "agency_roles_complete",
      decisions.length >= REQUIRED_AGENCY_ROLE_COUNT &&
        decisions.every((item) => text(item.role_id) && text(item.decision) && list(item.evidence).length),
      { count: decisions.length, decisions },
      "All accountable agency roles require decisions and evidence",
    ),
    assertion(
      "selected_assets_accounted",
      unaccounted.length === 0,
      { selected_asset_ids: selectedAssetIds, manifest, unaccounted },
      "One or more selected assets are missing from the master asset manifest",
    ),
    assertion(
      "deliverable_graph_present",
      list(plan.deliverables).length > 0 &&
        list(plan.deliverables).every((item) => text(item.id) && text(item.type) && Object.keys(object(item.output_spec)).length),
      plan.deliverables,
      "Executable deliverable graph missing",
    ),
    assertion(
      "story_progression_present",
      scenes.length >= 2 && sceneObjectives.size >= 2 && sceneEmotions.size >= 2,
      { scene_count: scenes.length, objectives: [...sceneObjectives], emotions: [...sceneEmotions] },
      "Scenes do not demonstrate genuine progression",
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
      shots.map((shot) => ({ title: shot.title, complete: frameContractComplete(shot) })),
      "One or more shots lack executable frame, camera, lighting, continuity, sound, negative, provider or repair direction",
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
  if (!client) return null;
  const wallet = await rows(client, "organization_wallets", (query) =>
    query.eq("organization_id", organizationId).limit(1));
  const transactions = await rows(client, "wallet_transactions", (query) =>
    query.eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(250));
  const usage = await rows(client, "platform_service_usage", (query) =>
    query.eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(250));
  const billing = await rows(client, "billing_invoice_lines", (query) =>
    query.eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(250));
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

function qualityAssertions(evidence, nodes) {
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
      semantic?.metadata?.passed === true || semantic?.passed === true,
      semantic || null,
      "Semantic quality review did not pass",
    ),
    assertion(
      "semantic_samples_present",
      list(semantic?.metadata?.sampled_frames).length > 0 ||
        list(semantic?.metadata?.sampled_clips).length > 0,
      {
        sampled_frames: semantic?.metadata?.sampled_frames || [],
        sampled_clips: semantic?.metadata?.sampled_clips || [],
        sampled_audio_segments: semantic?.metadata?.sampled_audio_segments || [],
      },
      "Semantic review lacks sampled visual evidence",
    ),
    assertion(
      "semantic_repairs_closed",
      list(semantic?.metadata?.failed_checks).length === 0 &&
        list(semantic?.metadata?.validation_failures).length === 0 &&
        list(semantic?.metadata?.repair_plan).length === 0,
      semantic?.metadata || null,
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

function settlementAssertions(snapshotAfter, publishExecution) {
  if (!publishExecution) {
    return [
      assertion(
        "publication_execution_required",
        false,
        null,
        "Publication execution was not performed",
      ),
    ];
  }
  const metadata = publishExecution.metadata || {};
  const usageId = metadata.usage_id || null;
  const usage = snapshotAfter?.service_usage?.filter((row) => row.id === usageId) || [];
  const transactions = snapshotAfter?.wallet_transactions?.filter((row) =>
    usageId && (row.usage_id === usageId || row.reference === usageId)) || [];
  const billing = snapshotAfter?.billing_lines?.filter((row) =>
    row.usage_id === usageId || row.service_usage_id === usageId) || [];
  const transactionTypes = countBy(transactions, "type");

  return [
    assertion("publication_usage_id_present", Boolean(usageId), usageId, "Publication usage ID missing"),
    assertion("publication_usage_settled_once", usage.length === 1 && usage[0]?.status === "SUCCESS", usage, "Publication usage is missing, duplicated or not successful"),
    assertion("wallet_charge_exactly_once", Number(transactionTypes.CHARGE || 0) === 1, transactionTypes, "Publication wallet charge must exist exactly once"),
    assertion("wallet_reservation_not_duplicated", Number(transactionTypes.RESERVE || 0) <= 1, transactionTypes, "Publication wallet reservation duplicated"),
    assertion("billing_line_present", billing.length > 0 || Boolean(metadata.billing_invoice_id), { billing, billing_invoice_id: metadata.billing_invoice_id || null }, "Publication billing evidence missing"),
    assertion("external_publication_evidence_present", Boolean(metadata.external_publication_id || metadata.external_publication_url), { id: metadata.external_publication_id || null, url: metadata.external_publication_url || null }, "External publication evidence missing"),
  ];
}

async function main() {
  const baseUrl = required("CREATIVE_SMOKE_BASE_URL");
  const organizationId = required("CREATIVE_SMOKE_ORGANIZATION_ID");
  const publishTargetId = required("CREATIVE_SMOKE_PUBLISH_TARGET_ID");
  const selectedAssetIds = text(required("CREATIVE_SMOKE_SELECTED_ASSET_IDS"))
    .split(",")
    .map(text)
    .filter(Boolean);
  const outputPath = env(
    "CREATIVE_SMOKE_OUTPUT",
    `creative-studio-forensic-release-smoke-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  const pollIntervalMs = integer("CREATIVE_SMOKE_POLL_INTERVAL_MS", 10000);
  const maxPolls = integer("CREATIVE_SMOKE_MAX_POLLS", 60);
  const command = required("CREATIVE_SMOKE_INTENT");
  const channels = text(required("CREATIVE_SMOKE_CHANNELS"))
    .split(",")
    .map(text)
    .filter(Boolean);
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

  report.database_before = await snapshot(supabase, organizationId);
  const created = await request(baseUrl, "/api/creative/create", {
    organization_id: organizationId,
    intent: command,
    title: env("CREATIVE_SMOKE_TITLE", `Creative forensic release smoke ${Date.now()}`),
    production_type: required("CREATIVE_SMOKE_PRODUCTION_TYPE"),
    target_duration: Number(required("CREATIVE_SMOKE_DURATION_SECONDS")),
    target_languages: text(required("CREATIVE_SMOKE_LANGUAGES")).split(",").map(text).filter(Boolean),
    channels,
    requested_outputs: channels,
    quality_profile: required("CREATIVE_SMOKE_QUALITY_PROFILE"),
    selected_asset_ids: selectedAssetIds,
    metadata: {
      forensic_smoke_test: true,
      smoke_started_at: report.started_at,
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
    report.phases.push({ phase: "pipeline_resume", attempt: attempt + 1, status: productionStatus(current), response: current });
  }

  const plan = masterPlan(current);
  report.master_plan = plan;
  report.assertions.push(...planAssertions(plan));
  let evidence = releaseEvidence(current);
  report.release_before_approvals = evidence;
  report.assertions.push(
    assertion("timeline_created", Boolean(evidence.timeline?.id), evidence.timeline || null, "Timeline missing"),
    assertion("final_render_created", Boolean(evidence.render?.id), evidence.render || null, "Final render missing"),
  );

  if (!evidence.render?.id) throw new Error("FINAL_RENDER_REQUIRED_FOR_APPROVAL");
  if (evidence.release_gate?.metadata?.passed === true) {
    report.phases.push({ phase: "approve_release_gate", response: await request(baseUrl, "/api/creative/release/approve", {
      organization_id: organizationId,
      subject_asset_node_id: evidence.release_gate.id,
      scope: "RELEASE_GATE",
      notes: "Forensic Creative release smoke approval",
    }) });
  }
  report.phases.push({ phase: "approve_final_render", response: await request(baseUrl, "/api/creative/release/approve", {
    organization_id: organizationId,
    subject_asset_node_id: evidence.render.id,
    scope: "FINAL_RENDER",
    notes: "Forensic Creative final-render smoke approval",
  }) });

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
  report.assertions.push(...qualityAssertions(evidence, list(afterQuality?.creative_asset_nodes)));
  if (readiness.report?.metadata?.passed !== true) {
    throw new Error(`RELEASE_READINESS_FAILED:${list(readiness.report?.metadata?.failed_checks).join(",")}`);
  }

  report.phases.push({ phase: "approve_publish", response: await request(baseUrl, "/api/creative/release/approve", {
    organization_id: organizationId,
    subject_asset_node_id: readiness.report.id,
    scope: "PUBLISH_RELEASE",
    notes: "Forensic Creative publish smoke approval",
  }) });
  const commandResponse = await request(baseUrl, "/api/creative/release/publish/command", {
    organization_id: organizationId,
    release_readiness_report_id: readiness.report.id,
    publish_target_id: publishTargetId,
  });
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
  report.publish = { command: commandResponse.command, execution: publish.execution, duplicate_check: duplicate.execution };
  report.assertions.push(
    assertion("publication_completed", publish.execution?.metadata?.execution_status === "COMPLETED", publish.execution?.metadata || null, "Publication did not complete"),
    assertion("duplicate_execution_reused", duplicate.reused === true && duplicate.execution?.id === publish.execution?.id, { first: publish.execution?.id || null, repeated: duplicate.execution?.id || null, reused: duplicate.reused === true }, "Repeated publication did not reuse the same execution"),
  );

  report.database_after = await snapshot(supabase, organizationId, projectId);
  report.assertions.push(...settlementAssertions(report.database_after, publish.execution));
  report.assertions.push(
    assertion("database_snapshot_clean", list(report.database_after?.errors).length === 0, report.database_after?.errors || [], "Database evidence queries failed"),
    assertion("asset_graph_evidence_present", list(report.database_after?.creative_asset_nodes).length > 0, countBy(list(report.database_after?.creative_asset_nodes), "type"), "No Creative asset graph evidence found"),
  );

  report.completed_at = new Date().toISOString();
  report.passed = report.assertions.every((item) => item.passed);
  report.failed_assertions = report.assertions.filter((item) => !item.passed).map((item) => item.id);
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
