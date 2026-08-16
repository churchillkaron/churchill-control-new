// One command, one clip, the whole pipeline.
//
// Everything the studio has been measured on this session stopped at direction: research, story, scenes and
// shots were produced and nothing was ever generated. That leaves the half of the pipeline that turns a plan
// into a file completely unexercised, so no amount of direction quality tells you whether the studio can
// make a video. This runs all of it for one short clip and reports each stage separately, so a failure names
// the stage that failed instead of the run.
//
// Nothing here is a new pipeline. buildCreativePipeline already walks understanding, research, strategy,
// concept, storyboard, scenes, shots, the production graph, the execution plan and the task set;
// ProductionQueueRuntime.dispatchAll already dispatches those tasks to real providers, polls them, and ends
// in CreativeFinalisationRouter for post production. This is the single entry point that was missing, plus
// the stage-by-stage reporting that makes the result readable.
//
//   CREATIVE_CLIP_REQUEST="8 second clip for Churchill when staff welcome a customer in the entrance" \
//   CREATIVE_CLIP_ORGANIZATION_ID=<uuid> \
//   CREATIVE_CLIP_SPEND_APPROVED=YES \
//     node --loader ./scripts/next-alias-loader.mjs scripts/creative-one-clip.mjs
//
// Without CREATIVE_CLIP_SPEND_APPROVED it plans and prices and dispatches nothing, because generation is
// where the money is: reasoning runs about 1.2 THB a call and a video clip has cost between 20 and 45.

import process from "node:process";

const REQUEST = String(process.env.CREATIVE_CLIP_REQUEST || "").trim();
const ORGANIZATION = String(process.env.CREATIVE_CLIP_ORGANIZATION_ID || "").trim();
const DURATION = Number(process.env.CREATIVE_CLIP_SECONDS || 8);
const SPEND = String(process.env.CREATIVE_CLIP_SPEND_APPROVED || "").trim().toUpperCase() === "YES";
const CEILING = Number(process.env.CREATIVE_CLIP_MAXIMUM_THB || 120);

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

const stages = [];

function stage(name, status, detail = "") {
  stages.push({ name, status, detail });
  const mark = status === "OK" ? "  ok  " : status === "SKIP" ? " skip " : " FAIL ";
  console.log(`[${mark}] ${name}${detail ? `  ${detail}` : ""}`);
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
  ] = await Promise.all([
    import("@/lib/creative/missions/runtime/CreativeMissionRuntime"),
    import("@/lib/creative/projects/runtime/CreativeProjectRuntime"),
    import("@/lib/creative/director/runtime/CreativeDirectorRuntime"),
    import("@/lib/creative/production/queue/runtime/ProductionQueueRuntime"),
    import("@/lib/creative/director/planner/creativeProductionCapabilities"),
    import("@/lib/platform/service-runtime/wallet/runtime/WalletRuntime").catch(() => ({})),
  ]);

  // Capabilities first. A clip needs video generation, and until this session that was a per-organization
  // flag rather than a platform standard, so it is worth confirming rather than assuming.
  const { capabilities } = await availableProductionCapabilities(ORGANIZATION);
  const ids = new Set(list(capabilities).map((service) => text(service.service_id)));
  const canVideo = ids.has("ai.video.generate");
  stage(
    "capabilities",
    canVideo ? "OK" : "FAIL",
    `${ids.size} services, ai.video.generate ${canVideo ? "available" : "MISSING"}`,
  );
  if (!canVideo) throw new Error("CREATIVE_CLIP_VIDEO_CAPABILITY_REQUIRED");

  // Balance, reported rather than enforced here: the wallet refuses a reservation it cannot cover, and
  // seeing the number before a run is more useful than discovering it mid-dispatch.
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

  const mission = await CreativeMissionRuntime.create({
    organization_id: ORGANIZATION,
    name: REQUEST.slice(0, 80),
    objective: REQUEST,
    metadata: {
      creative_request: REQUEST,
      one_clip_proof: true,
      duration_mode: "FIXED",
      temporal_contract: { duration_seconds: DURATION },
    },
  });
  stage("mission", mission?.id ? "OK" : "FAIL", text(mission?.id));

  const project = await CreativeProjectRuntime.create({
    organization_id: ORGANIZATION,
    creative_mission_id: mission.id,
    name: REQUEST.slice(0, 80),
    objective: REQUEST,
    production_type: "VIDEO",
    target_duration: DURATION,
    metadata: {
      creative_request: REQUEST,
      temporal_contract: { duration_seconds: DURATION },
      creative_quality_policy: {
        version: "AVANTIQO_ONE_CLIP_V1",
        minimum_scene_score: 90,
        regenerate_below_score: 88,
        require_brand_fit: true,
        require_non_ai_feel: true,
        require_story_progression: true,
        // One shot of a welcome has a person in it and no product, so identity continuity matters and
        // product continuity does not. Declaring that is what stops the validator demanding continuity for
        // a thing the clip does not contain.
        require_identity_continuity: true,
        require_product_continuity: false,
      },
    },
  });
  stage("project", project?.id ? "OK" : "FAIL", text(project?.id));

  // The routed entry point, not the orchestrator underneath it.
  //
  // Calling CreativePipelineOrchestrator.buildCreativePipeline directly was my first attempt and it is a
  // trap: it takes an optional master plan and falls back to CreativeMasterPlanRuntime -- the universal
  // executor -- when none is supplied, then asserts the plan is temporal. A video therefore got planned by
  // the still executor and failed temporal shot validation on fields the universal prompt never asks for.
  // CreativeDirectorRuntime.execute resolves the workflow first, hands the right executor's master plan to
  // the right pipeline, and carries the production dossier approval boundary that governs spending.
  const routed = await CreativeDirectorRuntime.execute({
    organization_id: ORGANIZATION,
    creative_mission_id: mission.id,
    creative_project_id: project.id,
    mission_id: mission.id,
    project_id: project.id,
    brief: {
      creative_objective: REQUEST,
      duration_seconds: DURATION,
      metadata: { creative_request: REQUEST },
    },
  });

  if (routed?.success === false) {
    stage("pipeline", "FAIL", text(routed.status) || text(routed.reason));
    throw new Error(`CREATIVE_CLIP_PIPELINE_${text(routed.status) || "FAILED"}`);
  }

  const pipeline = routed?.pipeline || {};
  const approval = routed?.approval || null;

  stage("research", pipeline.research ? "OK" : "FAIL",
    text(pipeline.research?.id) || "no research record");
  stage("strategy", pipeline.strategy ? "OK" : "SKIP", text(pipeline.strategy?.id));
  stage("concept", pipeline.concept ? "OK" : "SKIP", text(pipeline.concept?.id));
  stage("direction", pipeline.master_plan?.plan ? "OK" : "FAIL",
    `workflow ${text(pipeline.workflow_kind)}`);

  const plan = pipeline.master_plan?.plan || {};
  const scenes = list(plan.scenes);
  const shots = scenes.flatMap((scene) => list(scene.shots));
  stage("scenes and shots", shots.length ? "OK" : "FAIL",
    `${scenes.length} scene(s), ${shots.length} shot(s)`);

  const audioPlanned = JSON.stringify(plan).toLowerCase();
  stage("sound", /music|sound_design|source_sound/.test(audioPlanned) ? "OK" : "SKIP",
    /music/.test(audioPlanned) ? "music directed" : "no music in the plan");

  stage("production graph", pipeline.graph?.id ? "OK" : "FAIL", text(pipeline.graph?.id));
  stage("execution plan", pipeline.execution?.id ? "OK" : "FAIL", text(pipeline.execution?.id));

  const tasks = list(pipeline.tasks);
  stage("tasks", tasks.length ? "OK" : "FAIL", `${tasks.length} task(s)`);
  for (const task of tasks.slice(0, 12)) {
    console.log(`          ${text(task.kind) || "?"}  ${text(task.status)}  ${text(task.id).slice(0, 8)}`);
  }

  const dossier = pipeline.execution?.production_dossier || approval || {};
  const estimated = dossier.estimated_cost;
  stage("production dossier", Object.keys(dossier).length ? "OK" : "SKIP",
    estimated != null ? `estimate ${estimated} ${dossier.currency || ""}` : "no estimate");
  if (estimated != null) {
    console.log(`\nESTIMATED_COST=${estimated} ${dossier.currency || ""}`);
  }

  // Dispatch is gated on a persisted production-dossier approval record, by design: the task dispatcher is
  // wrapped so it refuses to run without one. That record is an authorisation event and this script does not
  // manufacture one, so the honest end of an unapproved run is here, at a priced dossier.
  if (approval?.required) {
    stage("approval", "SKIP", "production dossier requires an approval record");
    console.log("\nEvery stage up to production ran. Generation is gated on a dossier approval record,");
    console.log("which is an authorisation event rather than a flag this script can set.");
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

  // Dispatch to real providers, poll them, and run post production when the queue settles.
  const dispatch = await ProductionQueueRuntime.dispatchAll(
    { organization_id: ORGANIZATION, creative_project_id: project.id },
    { maxTasks: 24, maxPasses: 60, runPostProduction: true, pollRunning: true },
  );

  stage("dispatch", dispatch.total ? "OK" : "FAIL",
    `${dispatch.total} dispatched, ${dispatch.poll_total} polled, ${dispatch.passes} pass(es)`);

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

  stage("post production", dispatch.finalisation ? "OK" : "SKIP",
    dispatch.finalisation ? "finalisation ran" : "queue did not settle clean");

  summarise(mission.id, project.id, dispatch);
}

function summarise(missionId, projectId, dispatch) {
  const failed = stages.filter((entry) => entry.status === "FAIL");
  console.log("\n============================================================");
  for (const entry of stages) {
    console.log(`  ${entry.status.padEnd(4)}  ${entry.name}`);
  }
  console.log(`\nMISSION=${missionId}`);
  console.log(`PROJECT=${projectId}`);
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
