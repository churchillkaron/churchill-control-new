#!/usr/bin/env node
import process from "node:process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";
loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");

async function main() {
const ORG = "9a148429-b6a0-4bc6-ac83-a35c64fb7045";
const DURATION = 270;
const objective = `Create a completely fresh 4-5 minute Avantiqo investor film. Build one strong story across the entire film. Chapter One is approximately the first 60 seconds and must be beautiful, tense, mysterious, imaginative and cinematic: a global/worldwide intelligent system awakening across the real world. Show scale, geography, infrastructure, technology, people and connected consequence without explaining the software yet. The audience should feel that something vast and intelligent is already moving through the world before they understand what it is. End Chapter One with an earned threshold/reveal that makes the viewer need Chapter Two. Later chapters progressively reveal Avantiqo, how the system works, governed intelligence, business context, cross-domain execution and investor value. Avoid generic AI imagery, SaaS montage, dashboard demos, floating holograms and feature-list storytelling. Use strong imagination and fantasy only where it remains physically credible and premium. The Studio must originate the story itself.`;
const [{ CreativeMissionRuntime }, { CreativeProjectRuntime }, { CreativeBriefRuntime }, { CreativeAssetsRuntime }, { CreativeWorkflowResolutionRuntime }, { buildCreativePipeline }] = await Promise.all([
  import("@/lib/creative/missions/runtime/CreativeMissionRuntime.js"),
  import("@/lib/creative/projects/runtime/CreativeProjectRuntime.js"),
  import("@/lib/creative/brief/runtime/CreativeBriefRuntime.js"),
  import("@/lib/creative/assets/runtime/CreativeAssetsRuntime.js"),
  import("@/lib/creative/director/runtime/CreativeWorkflowResolutionRuntime.js"),
  import("@/lib/creative/director/orchestrator/CreativePipelineOrchestrator.js"),
]);
const existingFresh = (await CreativeMissionRuntime.list({ organization_id: ORG }))
  .filter((item) => item?.metadata?.source === "fresh-investor-chapter-one-test")
  .sort((a,b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0] || null;
const mission = existingFresh || await CreativeMissionRuntime.create({
  organization_id: ORG,
  title: `Avantiqo Global Intelligence Investor Film - Fresh ${new Date().toISOString()}`,
  business_goal: "Make investors feel the scale and inevitability of Avantiqo before progressively proving the system.",
  objective,
  audience: { primary: "serious investors and strategic partners" },
  channels: ["INVESTOR_FILM", "PRIVATE_SCREENING", "WEB"],
  metadata: {
    source: "fresh-investor-chapter-one-test",
    production_type: "VIDEO",
    target_duration: DURATION,
    target_languages: ["en"],
    quality_profile: "WORLD_CLASS",
    aspect_ratio: "16:9",
    master_resolution: "4K",
    temporal_contract: { duration_seconds: DURATION, mode: "MASTER_DURATION" },
    chapter_one_target_seconds: 60,
    old_investor_script_authority: false,
    creative_solution_source: "AVANTIQO_STUDIO_AUTONOMOUS_FRESH_DIRECTION",
    first_generation_stop_required: true,
  },
});
const started = await CreativeMissionRuntime.start(mission.id);
const projectId = String(started.runtime_context?.creative_project_id || "").trim();
if (!projectId) throw new Error("FRESH_INVESTOR_PROJECT_NOT_MATERIALIZED");
let project = await CreativeProjectRuntime.get(projectId);
project = await CreativeProjectRuntime.update(project.id, {
  target_duration: DURATION,
  quality_profile: "WORLD_CLASS",
  objective,
  metadata: {
    ...(project.metadata || {}),
    temporal_contract: { ...(project.metadata?.temporal_contract || {}), duration_seconds: DURATION, mode: "MASTER_DURATION" },
    full_master_duration: DURATION,
    chapter_one_target_seconds: 60,
    chapter_one_direction: "GLOBAL_MYSTIC_INTELLIGENCE_AWAKENING",
    defer_product_explanation_until_later_chapters: true,
    old_investor_script_authority: false,
    first_generation_stop_required: true,
  },
});
const briefs = await CreativeBriefRuntime.list({ organization_id: ORG, creative_mission_id: mission.id, creative_project_id: project.id });
let brief = briefs[0];
if (!brief?.id) throw new Error("FRESH_INVESTOR_BRIEF_NOT_MATERIALIZED");
brief = await CreativeBriefRuntime.update(brief.id, {
  duration_seconds: DURATION,
  creative_objective: objective,
  business_goal: mission.business_goal,
  metadata: {
    ...(brief.metadata || {}),
    creative_constraints: [
    "Fresh concept and story only; do not reuse prior investor-film scene order or narration.",
    "The complete film must tell one coherent story across roughly 4-5 minutes.",
    "Chapter One is approximately 60 seconds and must build tension, mystery and global scale before explaining Avantiqo.",
    "Show a worldwide intelligent system through geography, infrastructure, technology, people and consequence.",
    "Use imagination and fantasy only when physically credible, premium and story-motivated.",
    "Do not use generic AI orbs, floating dashboards, random holograms, SaaS feature montages, browser captures or static dashboard demos.",
    "The first minute must end on an earned threshold/reveal into Chapter Two.",
    "Later chapters progressively reveal the system, business context, governed intelligence, cross-domain action and investor value.",
    "Minimum visual craft must meet the Studio premium-reference benchmark family already encoded in quality policy.",
  ],
    target_duration: DURATION,
    chapter_one_target_seconds: 60,
    first_generation_stop_required: true,
    user_preapproved_pre_generation_planning: true,
  },
});
const assets = await CreativeAssetsRuntime.list({ organization_id: ORG, creative_project_id: project.id, creative_mission_id: mission.id, limit: 1000 });
console.log(`FRESH_MISSION_ID=${mission.id}`);
console.log(`FRESH_PROJECT_ID=${project.id}`);
console.log(`FRESH_BRIEF_ID=${brief.id}`);
const resolved = await CreativeWorkflowResolutionRuntime.resolve({
  organization_id: ORG,
  creative_mission_id: mission.id,
  creative_project_id: project.id,
  brief,
});
console.log(`WORKFLOW_KIND=${resolved.workflow?.workflow_kind || "UNKNOWN"}`);
console.log(`COUNCIL_READY=${resolved.master?.independent_concept_council ? "YES" : "NO"}`);
console.log(`TRIBUNAL_PASS=${resolved.master?.plan?.creative_tribunal?.passed === true ? "YES" : "NO"}`);
const pipeline = await buildCreativePipeline({
  organization_id: ORG,
  creative_mission_id: mission.id,
  creative_project_id: project.id,
  brief,
  master: resolved.master,
});
const dossier = pipeline?.execution?.production_dossier || {};
console.log(`PIPELINE_STATUS=${pipeline?.status || "UNKNOWN"}`);
console.log(`DOSSIER_CONTRACT=${dossier.contract || "NONE"}`);
console.log(`DOSSIER_APPROVAL_REQUIRED=${dossier.approval_required === true ? "YES" : "NO"}`);
console.log(`GENERATION_STARTED=NO`);
console.log("FRESH_INVESTOR_PREGEN_READY=YES");
console.log(JSON.stringify({ mission_id: mission.id, project_id: project.id, brief_id: brief.id, plan: resolved.master?.plan, dossier }, null, 2));

}
main().catch((error) => { console.error(error?.stack || error); process.exit(1); });
