import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { AvantiqoVideoProvider } from "@/lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProvider.js";
import { CreativeProjectRuntime } from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import { AVANTIQO_INVESTOR_STUDIO_GENERATION_PLAN } from "@/lib/creative/post-production/runtime/AvantiqoInvestorStudioGenerationPlan";
import {
  AVANTIQO_INVESTOR_CAPABILITY_VISUAL_CHOREOGRAPHY,
  investorSceneVisualChoreography,
} from "@/lib/creative/post-production/runtime/AvantiqoInvestorCapabilityVisualChoreography";

const SCENE = 9;
const PROJECT_ID = process.env.INVESTOR_STUDIO_SCENE9_PROJECT_ID ||
  "c75e5e5a-8e8a-4a3c-919f-2be943c2ec4c";
const ORGANIZATION_ID = AVANTIQO_INVESTOR_STUDIO_GENERATION_PLAN.organization_id;
const POLL_INTERVAL_MS = Math.max(1000, Number(process.env.INVESTOR_STUDIO_PREVIEW_POLL_MS || 5000));
const MAX_WAIT_MS = Math.max(POLL_INTERVAL_MS, Number(process.env.INVESTOR_STUDIO_PREVIEW_TIMEOUT_MS || 30 * 60 * 1000));
const OUTPUT_PATH = process.env.INVESTOR_STUDIO_RESULT_PATH ||
  "artifacts/investor-scene9-studio-live.json";

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function scenePlan() {
  const plan = AVANTIQO_INVESTOR_STUDIO_GENERATION_PLAN.scene_generation
    .find((entry) => Number(entry.scene) === SCENE);
  if (!plan) throw new Error("INVESTOR_SCENE9_PLAN_REQUIRED");
  return plan;
}

function studioInstruction(plan, choreography) {
  return [
    "AVANTIQO CREATIVE STUDIO INVESTOR FILM - SCENE 9 OWNED PREVIEW",
    "This is a transport instruction serialized from the Studio scene specification, not a user prompt.",
    `Objective: ${plan.objective}`,
    "Required visual beats:",
    ...list(choreography?.beats).map((beat, index) => `${index + 1}. ${beat}`),
    "Film language:",
    ...list(AVANTIQO_INVESTOR_CAPABILITY_VISUAL_CHOREOGRAPHY.film_language?.composition)
      .map((rule) => `- ${rule}`),
    "Hard negative constraints:",
    ...list(AVANTIQO_INVESTOR_CAPABILITY_VISUAL_CHOREOGRAPHY.film_language?.forbidden)
      .map((rule) => `- ${rule}`),
    "Create one continuous premium cinematic shot or internally coherent short sequence.",
    "The physical business world is the hero. Context traces are subtle spatial motion graphics attached to real actions.",
    "No software screen, no browser, no dashboard, no fake metrics, no generic AI orb, no giant text.",
    "Photorealistic, believable people and materials, restrained luxury lighting, world-class investor-film cinematography.",
  ].join("\n");
}

function storagePath(storageReference) {
  const source = text(storageReference);
  const prefix = "storage://creative-assets/";
  return source.startsWith(prefix) ? source.slice(prefix.length) : null;
}

async function registerReviewAsset({ project, usageId, completed, plan, choreography }) {
  const output = completed.output || {};
  const stableUrl = text(output.storage_reference) || text(output.video_url);
  if (!stableUrl) throw new Error("INVESTOR_SCENE9_PREVIEW_STORAGE_REFERENCE_REQUIRED");

  const node = await AssetGraphRepository.create(createCreativeAssetNode({
    organization_id: ORGANIZATION_ID,
    creative_project_id: project.id,
    type: CREATIVE_ASSET_NODE_TYPES.VIDEO,
    status: CREATIVE_ASSET_NODE_STATUS.REVIEW,
    name: "Investor Film Scene 9 - Avantiqo-owned preview",
    description: "Fresh Scene 9 preview generated from the canonical Avantiqo Creative Studio capability choreography using the Avantiqo-owned Cinema engine.",
    url: stableUrl,
    storage_path: storagePath(output.storage_reference),
    lineage: {
      source: "avantiqo_investor_owned_preview",
      provider_id: "avantiqo-video",
      capability: "ai.video.generate",
      generation_version: 1,
    },
    intelligence: {
      tags: [
        "investor-film",
        "scene-9",
        "avantiqo-owned",
        "studio-generated",
        "preview-not-certified",
      ],
      safety_status: "HUMAN_REVIEW_REQUIRED",
    },
    reuse: {
      reusable: false,
      approved_for_reuse: false,
    },
    review: {
      ai_reviewed: false,
      human_reviewed: false,
      approved: false,
      notes: "Owned-engine preview only. Requires visual review and explicit user approval before lock or master use.",
    },
    metadata: {
      contract: "AVANTIQO_INVESTOR_SCENE_PREVIEW_V1",
      investor_project_id: AVANTIQO_INVESTOR_STUDIO_GENERATION_PLAN.investor_project_id,
      investor_scene: SCENE,
      usage_id: usageId,
      provider_job_id: completed.provider_job_id || null,
      engine: "avantiqo-video",
      capability: "ai.video.generate",
      owned_only_execution: true,
      external_ai_provider_used: false,
      production_certified: false,
      approval_required: true,
      visual_choreography_contract:
        AVANTIQO_INVESTOR_CAPABILITY_VISUAL_CHOREOGRAPHY.contract,
      visual_choreography: choreography,
      generation_objective: plan.objective,
      generated_at: new Date().toISOString(),
    },
  }));

  await CreativeProjectRuntime.update(project.id, {
    metadata: {
      ...(project.metadata || {}),
      investor_scene: SCENE,
      investor_owned_preview_asset_node_id: node.id,
      investor_owned_preview_status: "READY_FOR_REVIEW",
      investor_owned_preview_generated_at: new Date().toISOString(),
      investor_owned_preview_production_certified: false,
      investor_owned_preview_approved: false,
    },
  });

  return node;
}

async function run() {
  if (!text(process.env.RUNPOD_API_KEY)) throw new Error("RUNPOD_API_KEY_REQUIRED");
  if (!text(process.env.RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID)) {
    throw new Error("RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID_REQUIRED");
  }
  if (!text(process.env.NEXT_PUBLIC_SUPABASE_URL)) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL_REQUIRED");
  }
  if (!text(process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY_REQUIRED");
  }

  const project = await CreativeProjectRuntime.get(PROJECT_ID);
  if (!project || text(project.organization_id) !== ORGANIZATION_ID) {
    throw new Error("INVESTOR_SCENE9_STUDIO_PROJECT_REQUIRED");
  }
  if (Number(project.metadata?.investor_scene) !== SCENE) {
    throw new Error("INVESTOR_SCENE9_PROJECT_SCOPE_MISMATCH");
  }

  const plan = scenePlan();
  const choreography = investorSceneVisualChoreography(SCENE);
  if (!choreography) throw new Error("INVESTOR_SCENE9_CHOREOGRAPHY_REQUIRED");

  const usageId = `investor-scene9-${crypto.randomUUID()}`;
  const instruction = studioInstruction(plan, choreography);
  const submission = await AvantiqoVideoProvider.execute({
    capability: "ai.video.generate",
    model: process.env.AVANTIQO_VIDEO_T2V_MODEL || "Wan-AI/Wan2.2-T2V-A14B-Diffusers",
    context: {
      organization_id: ORGANIZATION_ID,
      usage_id: usageId,
    },
    instructions_text: instruction,
    duration_seconds: plan.duration_seconds,
    aspect_ratio: "16:9",
    resolution: "720p",
    provider_parameters: {
      quality_profile: "cinema",
    },
    negative_constraints: list(
      AVANTIQO_INVESTOR_CAPABILITY_VISUAL_CHOREOGRAPHY.film_language?.forbidden,
    ),
    shot_specification: {
      contract: "AVANTIQO_INVESTOR_SCENE9_SHOT_V1",
      purpose: plan.objective,
      beats: choreography.beats,
      camera: {
        movement: "controlled cinematic movement through a living business environment",
        framing: "human-scale, layered depth, no interface framing",
      },
      continuity: {
        single_business_reality: true,
        causal_context_traces: true,
      },
    },
  });

  const jobId = text(submission.output?.provider_job_id);
  if (!jobId) throw new Error("INVESTOR_SCENE9_PROVIDER_JOB_ID_REQUIRED");

  const deadline = Date.now() + MAX_WAIT_MS;
  let completed = null;
  while (Date.now() < deadline) {
    const status = await AvantiqoVideoProvider.getStatus({
      job_id: jobId,
      context: { organization_id: ORGANIZATION_ID },
    });
    if (status.status === "completed") {
      completed = status;
      break;
    }
    if (status.status === "failed") {
      throw new Error(`INVESTOR_SCENE9_OWNED_VIDEO_FAILED:${text(status.error) || "UNKNOWN"}`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
  if (!completed) throw new Error(`INVESTOR_SCENE9_OWNED_VIDEO_TIMEOUT:${jobId}`);

  const asset = await registerReviewAsset({
    project,
    usageId,
    completed,
    plan,
    choreography,
  });

  return {
    success: true,
    contract: "AVANTIQO_INVESTOR_SCENE9_OWNED_PREVIEW_EXECUTION_V1",
    organization_id: ORGANIZATION_ID,
    creative_project_id: project.id,
    scene: SCENE,
    provider: "avantiqo-video",
    capability: "ai.video.generate",
    external_ai_provider_used: false,
    production_certified: false,
    review_status: "READY_FOR_REVIEW",
    approved: false,
    provider_job_id: jobId,
    asset_node_id: asset.id,
    storage_reference: completed.output?.storage_reference || null,
  };
}

let result;
try {
  result = await run();
} catch (error) {
  result = {
    success: false,
    contract: "AVANTIQO_INVESTOR_SCENE9_OWNED_PREVIEW_EXECUTION_V1",
    scene: SCENE,
    provider: "avantiqo-video",
    external_ai_provider_used: false,
    error: text(error?.message || error),
  };
  process.exitCode = 1;
}

await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify(result, null, 2));
