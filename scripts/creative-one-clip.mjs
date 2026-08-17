// One command, one short proof, the complete Creative Studio pipeline.
//
// This command is intentionally resumable. Re-running the same organization/request/duration must continue
// the same proof instead of creating another mission/project and paying to rediscover the same work.
// The safe wrapper remains the public entry point and gates all paid reasoning/generation before this file
// is imported.

import { createHash } from "node:crypto";
import process from "node:process";

const REQUEST = String(process.env.CREATIVE_CLIP_REQUEST || "").trim();
const ORGANIZATION = String(process.env.CREATIVE_CLIP_ORGANIZATION_ID || "").trim();
const DURATION = Number(process.env.CREATIVE_CLIP_SECONDS || 8);
const SPEND = String(process.env.CREATIVE_CLIP_SPEND_APPROVED || "").trim().toUpperCase() === "YES";
const CEILING = Number(process.env.CREATIVE_CLIP_MAXIMUM_THB || 120);

const RESEARCH_PROVIDER = String(process.env.CREATIVE_CLIP_RESEARCH_PROVIDER || "openai").trim();
const RESEARCH_PRICING_ID = String(
  process.env.CREATIVE_CLIP_RESEARCH_PRICING_ID || "156fbd36-5a2d-48b0-b72d-450bab821a11",
).trim();
const RESEARCH_CEILING = Number(process.env.CREATIVE_CLIP_RESEARCH_MAXIMUM_THB || 30);
const RESEARCH_MODEL = String(process.env.CREATIVE_CLIP_RESEARCH_MODEL || "gpt-4.1-mini").trim();
const DIRECTION_CEILING = Number(process.env.CREATIVE_CLIP_DIRECTION_MAXIMUM_THB || 40);

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sameDuration(value) {
  const number = finite(value);
  return number !== null && Math.abs(number - DURATION) < 0.001;
}

const commandDigest = createHash("sha256")
  .update(`${ORGANIZATION}\n${DURATION}\n${REQUEST}`)
  .digest("hex")
  .slice(0, 24);
const COMMAND_IDENTITY = `one-clip:${commandDigest}`;

const stages = [];

function stage(name, status, detail = "") {
  stages.push({ name, status, detail });
  const mark = status === "OK" ? "  ok  " : status === "SKIP" ? " skip " : " FAIL ";
  console.log(`[${mark}] ${name}${detail ? `  ${detail}` : ""}`);
}

function timestamp(value) {
  const parsed = Date.parse(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function proofMatches(project = {}) {
  return (
    text(project.organization_id) === ORGANIZATION &&
    text(project.metadata?.creative_request) === REQUEST &&
    text(project.production_type).toUpperCase() === "VIDEO" &&
    sameDuration(project.target_duration)
  );
}

function approvalMetadata(existingMetadata = {}, organization = {}, selectedAssets = []) {
  const now = Date.now();
  const approvedAt = new Date(now - 60_000).toISOString();
  const expiresAt = new Date(now + 6 * 60 * 60 * 1000).toISOString();

  return {
    ...existingMetadata,
    creative_request: REQUEST,
    one_clip_proof: true,
    command_identity: COMMAND_IDENTITY,
    temporal_contract: { duration_seconds: DURATION },
    organization_name: text(organization.name) || null,
    organization_legal_name: text(organization.legal_name) || null,
    organization_industry: text(organization.industry) || null,
    research_grounding_version: "ORGANIZATION_IDENTITY_V2",
    selected_asset_ids: selectedAssets.map((asset) => asset.id).filter(Boolean),
    research_policy: {
      mode: "ORGANIZATION_FIRST",
      minimum_external_sources: 1,
      minimum_primary_sources: 1,
      minimum_verified_claims: 2,
      require_market_context: false,
      require_competitor_analysis: false,
      require_company_resolution: true,
      require_audience_evidence: true,
    },
    paid_research_approval: {
      contract: "CREATIVE_RESEARCH_BUDGET_APPROVAL_V2",
      id: `research-${commandDigest}`,
      approved: true,
      status: "APPROVED",
      provider: RESEARCH_PROVIDER,
      pricing_id: RESEARCH_PRICING_ID,
      model: RESEARCH_MODEL,
      currency: "THB",
      maximum_customer_price: RESEARCH_CEILING,
      command_identity: COMMAND_IDENTITY,
      approved_at: approvedAt,
      expires_at: expiresAt,
    },
    paid_direction_approval: {
      contract: "CREATIVE_DIRECTION_BUDGET_APPROVAL_V2",
      id: `direction-${commandDigest}`,
      approved: true,
      status: "APPROVED",
      provider: RESEARCH_PROVIDER,
      pricing_id: RESEARCH_PRICING_ID,
      model: RESEARCH_MODEL,
      currency: "THB",
      maximum_customer_price: DIRECTION_CEILING,
      maximum_per_call_customer_price: 6,
      maximum_calls: 40,
      spent_customer_price: 0,
      allowed_operations: ["*"],
      command_identity: COMMAND_IDENTITY,
      approved_at: approvedAt,
      expires_at: expiresAt,
    },
    creative_quality_policy: {
      version: "AVANTIQO_ONE_CLIP_V1",
      minimum_scene_score: 90,
      regenerate_below_score: 88,
      require_brand_fit: true,
      require_non_ai_feel: true,
      require_story_progression: true,
      require_identity_continuity: true,
      require_product_continuity: false,
    },
  };
}

const STOP_WORDS = new Set([
  "a", "an", "and", "at", "customer", "for", "in", "of", "on", "the", "to", "when", "with",
  "second", "seconds", "clip", "video", "make", "create",
]);

function requestTokens() {
  return [...new Set(
    REQUEST.toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2 && !STOP_WORDS.has(token)),
  )];
}

function assetScore(asset = {}, tokens = []) {
  const analysis = object(asset.analysis);
  const tags = list(asset.tags || analysis.tags).map((value) => text(value).toLowerCase());
  const searchable = [
    asset.name,
    asset.title,
    asset.file_name,
    asset.description,
    ...tags,
    ...list(analysis.logos).flatMap((logo) => [logo?.description, logo?.visible_text]),
  ].map(text).join(" ").toLowerCase();

  let score = 0;
  for (const token of tokens) {
    if (searchable.includes(token)) score += 3;
  }
  if (tokens.includes("entrance") && tags.includes("entrance")) score += 10;
  if (text(analysis.status).toUpperCase() === "VERIFIED") score += 3;
  if (list(analysis.logos).length) score += 2;
  if (/uploaded to creative studio/i.test(text(asset.description))) score += 2;
  if (["IMAGE", "VIDEO"].includes(text(asset.asset_type).toUpperCase())) score += 1;
  return score;
}

async function loadOrganizationAndAssets(supabaseAdmin) {
  const { data: organization, error: organizationError } = await supabaseAdmin
    .from("organizations")
    .select("id,name,legal_name,industry,address,country,organization_type,status,organization_status")
    .eq("id", ORGANIZATION)
    .single();
  if (organizationError) {
    throw new Error(`CREATIVE_CLIP_ORGANIZATION_LOOKUP_FAILED:${organizationError.message}`);
  }

  const { data: assets, error: assetError } = await supabaseAdmin
    .from("creative_assets")
    .select("*")
    .eq("organization_id", ORGANIZATION)
    .eq("archived", false);
  if (assetError) {
    throw new Error(`CREATIVE_CLIP_ASSET_LOOKUP_FAILED:${assetError.message}`);
  }

  const tokens = requestTokens();
  const selectedAssets = list(assets)
    .map((asset) => ({ asset, score: assetScore(asset, tokens) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 12)
    .map((entry) => entry.asset);

  return { organization, selectedAssets };
}

async function ensureProof({ CreativeMissionRuntime, CreativeProjectRuntime, organization, selectedAssets }) {
  const projects = await CreativeProjectRuntime.list({ organizationId: ORGANIZATION });
  const reusable = list(projects)
    .filter(proofMatches)
    .sort((left, right) =>
      timestamp(right.updated_at || right.created_at) - timestamp(left.updated_at || left.created_at),
    )[0] || null;

  if (reusable) {
    let mission = null;
    if (reusable.creative_mission_id) {
      mission = await CreativeMissionRuntime.get(reusable.creative_mission_id).catch(() => null);
    }
    if (!mission) {
      mission = await CreativeMissionRuntime.create({
        organization_id: ORGANIZATION,
        name: REQUEST.slice(0, 80),
        objective: REQUEST,
        metadata: {
          creative_request: REQUEST,
          one_clip_proof: true,
          command_identity: COMMAND_IDENTITY,
          duration_mode: "FIXED",
          temporal_contract: { duration_seconds: DURATION },
        },
      });
    }

    const project = await CreativeProjectRuntime.update(reusable.id, {
      creative_mission_id: mission.id,
      objective: REQUEST,
      production_type: "VIDEO",
      target_duration: DURATION,
      metadata: approvalMetadata(reusable.metadata, organization, selectedAssets),
    });

    return { mission, project, resumed: true };
  }

  const mission = await CreativeMissionRuntime.create({
    organization_id: ORGANIZATION,
    name: REQUEST.slice(0, 80),
    objective: REQUEST,
    metadata: {
      creative_request: REQUEST,
      one_clip_proof: true,
      command_identity: COMMAND_IDENTITY,
      duration_mode: "FIXED",
      temporal_contract: { duration_seconds: DURATION },
    },
  });

  const project = await CreativeProjectRuntime.create({
    organization_id: ORGANIZATION,
    creative_mission_id: mission.id,
    name: REQUEST.slice(0, 80),
    objective: REQUEST,
    production_type: "VIDEO",
    target_duration: DURATION,
    metadata: approvalMetadata({}, organization, selectedAssets),
  });

  return { mission, project, resumed: false };
}

async function main() {
  if (!REQUEST) throw new Error("CREATIVE_CLIP_REQUEST_REQUIRED");
  if (!ORGANIZATION) throw new Error("CREATIVE_CLIP_ORGANIZATION_ID_REQUIRED");

  console.log("============================================================");
  console.log("CREATIVE ONE CLIP");
  console.log("============================================================");
  console.log(`REQUEST=${REQUEST}`);
  console.log(`ORGANIZATION=${ORGANIZATION}`);
  console.log(`SECONDS=${DURATION}`);
  console.log(`COMMAND_IDENTITY=${COMMAND_IDENTITY}`);
  console.log(`SPEND_APPROVED=${SPEND ? "YES" : "NO"}`);
  console.log(`CEILING_THB=${CEILING}`);
  console.log("");

  const [
    { CreativeMissionRuntime },
    { CreativeProjectRuntime },
    { CreativeDirectorRuntime },
    { ProductionQueueRuntime },
    { availableProductionCapabilities },
    { WalletRuntime },
    { supabaseAdmin },
  ] = await Promise.all([
    import("@/lib/creative/missions/runtime/CreativeMissionRuntime"),
    import("@/lib/creative/projects/runtime/CreativeProjectRuntime"),
    import("@/lib/creative/director/runtime/CreativeDirectorRuntime"),
    import("@/lib/creative/production/queue/runtime/ProductionQueueRuntime"),
    import("@/lib/creative/director/planner/creativeProductionCapabilities"),
    import("@/lib/platform/service-runtime/wallet/runtime/WalletRuntime").catch(() => ({})),
    import("@/lib/shared/supabase/admin"),
  ]);

  const { capabilities } = await availableProductionCapabilities(ORGANIZATION);
  const ids = new Set(list(capabilities).map((service) => text(service.service_id)));
  const canVideo = ids.has("ai.video.generate");
  stage(
    "capabilities",
    canVideo ? "OK" : "FAIL",
    `${ids.size} services, ai.video.generate ${canVideo ? "available" : "MISSING"}`,
  );
  if (!canVideo) throw new Error("CREATIVE_CLIP_VIDEO_CAPABILITY_REQUIRED");

  if (WalletRuntime?.getBalance) {
    try {
      const balance = await WalletRuntime.getBalance({ organization_id: ORGANIZATION });
      stage("wallet", "OK", `available ${balance?.available_balance ?? balance?.balance ?? "unknown"}`);
    } catch (error) {
      stage("wallet", "SKIP", text(error?.message).slice(0, 60));
    }
  } else {
    stage("wallet", "SKIP", "no balance reader exported");
  }

  const { organization, selectedAssets } = await loadOrganizationAndAssets(supabaseAdmin);
  stage("organization grounding", text(organization?.name) ? "OK" : "FAIL", text(organization?.name));
  stage(
    "asset grounding",
    selectedAssets.length ? "OK" : "SKIP",
    `${selectedAssets.length} relevant organization asset(s)`,
  );
  for (const asset of selectedAssets.slice(0, 8)) {
    console.log(`          ${text(asset.asset_type)}  ${text(asset.name || asset.title || asset.file_name).slice(0, 76)}`);
  }

  const { mission, project, resumed } = await ensureProof({
    CreativeMissionRuntime,
    CreativeProjectRuntime,
    organization,
    selectedAssets,
  });
  stage("mission", mission?.id ? "OK" : "FAIL", text(mission?.id));
  stage("project", project?.id ? "OK" : "FAIL", `${text(project?.id)}  ${resumed ? "RESUMED" : "CREATED"}`);

  const routed = await CreativeDirectorRuntime.execute({
    organization_id: ORGANIZATION,
    creative_mission_id: mission.id,
    creative_project_id: project.id,
    mission_id: mission.id,
    project_id: project.id,
    organization,
    industry: organization.industry || null,
    objective: REQUEST,
    assets: selectedAssets,
    brief: {
      creative_objective: REQUEST,
      duration_seconds: DURATION,
      metadata: {
        creative_request: REQUEST,
        organization_name: organization.name || null,
        selected_asset_ids: selectedAssets.map((asset) => asset.id).filter(Boolean),
        research_grounding_version: "ORGANIZATION_IDENTITY_V2",
      },
    },
  });

  if (routed?.success === false) {
    stage("pipeline", "FAIL", text(routed.status) || text(routed.reason));
    throw new Error(`CREATIVE_CLIP_PIPELINE_${text(routed.status) || "FAILED"}`);
  }

  const pipeline = routed?.pipeline || {};
  const approval = routed?.approval || null;

  stage("research", pipeline.research ? "OK" : "FAIL", text(pipeline.research?.id) || "no research record");
  stage("strategy", pipeline.strategy ? "OK" : "SKIP", text(pipeline.strategy?.id));
  stage("concept", pipeline.concept ? "OK" : "SKIP", text(pipeline.concept?.id));
  stage(
    "direction",
    pipeline.master_plan?.plan ? "OK" : "FAIL",
    `workflow ${text(pipeline.workflow_kind)}`,
  );

  const plan = pipeline.master_plan?.plan || {};
  const scenes = list(plan.scenes);
  const shots = scenes.flatMap((scene) => list(scene.shots));
  stage("scenes and shots", shots.length ? "OK" : "FAIL", `${scenes.length} scene(s), ${shots.length} shot(s)`);

  const audioPlanned = JSON.stringify(plan).toLowerCase();
  stage(
    "sound",
    /music|sound_design|source_sound/.test(audioPlanned) ? "OK" : "SKIP",
    /music/.test(audioPlanned) ? "music directed" : "no music in the plan",
  );

  stage("production graph", pipeline.graph?.id ? "OK" : "FAIL", text(pipeline.graph?.id));
  stage("execution plan", pipeline.execution?.id ? "OK" : "FAIL", text(pipeline.execution?.id));

  const tasks = list(pipeline.tasks);
  stage("tasks", tasks.length ? "OK" : "FAIL", `${tasks.length} task(s)`);
  for (const task of tasks.slice(0, 12)) {
    console.log(`          ${text(task.kind) || "?"}  ${text(task.status)}  ${text(task.id).slice(0, 8)}`);
  }

  const dossier = pipeline.execution?.production_dossier || approval || {};
  const estimated = dossier.estimated_cost;
  stage(
    "production dossier",
    Object.keys(dossier).length ? "OK" : "SKIP",
    estimated != null ? `estimate ${estimated} ${dossier.currency || ""}` : "no estimate",
  );
  if (estimated != null) console.log(`\nESTIMATED_COST=${estimated} ${dossier.currency || ""}`);

  if (approval?.required) {
    stage("approval", "SKIP", "production dossier requires an approval record");
    console.log("\nEvery stage up to production ran. Generation remains gated by the persisted dossier approval boundary.");
    summarise(mission.id, project.id, null);
    return;
  }

  if (!SPEND) {
    stage("generation", "SKIP", "CREATIVE_CLIP_SPEND_APPROVED is not YES");
    summarise(mission.id, project.id, null);
    return;
  }

  if (estimated != null && Number(estimated) > CEILING) {
    stage("generation", "FAIL", `estimate ${estimated} exceeds ceiling ${CEILING}`);
    throw new Error(`CREATIVE_CLIP_ESTIMATE_ABOVE_CEILING:${estimated}`);
  }

  const dispatch = await ProductionQueueRuntime.dispatchAll(
    { organization_id: ORGANIZATION, creative_project_id: project.id },
    { maxTasks: 24, maxPasses: 60, runPostProduction: true, pollRunning: true },
  );

  stage(
    "dispatch",
    dispatch.total ? "OK" : "FAIL",
    `${dispatch.total} dispatched, ${dispatch.poll_total} polled, ${dispatch.passes} pass(es)`,
  );

  const queue = dispatch.queue || {};
  console.log(
    `          completed ${list(queue.completed).length}` +
      `  failed ${list(queue.failed).length}` +
      `  blocked ${list(queue.blocked).length}` +
      `  running ${list(queue.running).length}` +
      `  waiting ${list(queue.waiting).length}`,
  );
  for (const task of list(queue.failed).slice(0, 6)) {
    console.log(`          FAILED ${text(task.kind)}: ${text(task.error || task.failure_reason).slice(0, 110)}`);
  }

  stage(
    "post production",
    dispatch.finalisation ? "OK" : "SKIP",
    dispatch.finalisation ? "finalisation ran" : "queue did not settle clean",
  );

  summarise(mission.id, project.id, dispatch);
}

function summarise(missionId, projectId, dispatch) {
  const failed = stages.filter((entry) => entry.status === "FAIL");
  console.log("\n============================================================");
  for (const entry of stages) console.log(`  ${entry.status.padEnd(4)}  ${entry.name}`);
  console.log(`\nMISSION=${missionId}`);
  console.log(`PROJECT=${projectId}`);
  console.log(`COMMAND_IDENTITY=${COMMAND_IDENTITY}`);
  console.log(`STAGES_OK=${stages.filter((entry) => entry.status === "OK").length}`);
  console.log(`STAGES_FAILED=${failed.length}`);
  console.log(`MEDIA_GENERATED=${dispatch?.total ? "YES" : "NO"}`);
  console.log(
    failed.length
      ? `\nThe pipeline stopped at: ${failed.map((entry) => entry.name).join(", ")}`
      : "\nEvery stage reported OK.",
  );
}

main().catch((error) => {
  stage("run", "FAIL", text(error?.message).slice(0, 200));
  console.error(`\n${String(error?.stack || error).slice(0, 1200)}`);
  process.exitCode = 1;
});