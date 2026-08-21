export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

import crypto from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  CREATIVE_TOOL_CAPABILITIES,
} from "@/lib/creative/tools/registry/CreativeToolRegistry";
import {
  CreativeToolExecutionRuntime,
} from "@/lib/creative/tools/runtime/CreativeToolExecutionRuntime";
import {
  creativeStorageUri,
} from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";

const TOKEN = "avq-spatial-product-twin-proof-20260821";
const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT_ID = "37ca49f2-210d-4665-af6b-6b5fa834f750";
const BUCKET = "creative-assets";
const ROOT = `${ORGANIZATION_ID}/avantiqo-investor-film-20260820`;
const OUTPUT_PATH = `${ORGANIZATION_ID}/${PROJECT_ID}/proofs/spatial-product-twin-proof-v1.mp4`;

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store, private" },
  });
}

function storage(reference) {
  return `storage://${BUCKET}/${reference}`;
}

const SCENES = Object.freeze([
  {
    id: "intelligence",
    source_reference: storage(`${ROOT}/founder-v7/founder-opening-origin-synced-approved-v7.mp4`),
    duration_seconds: 6.4,
    source_in_seconds: 0,
    kicker: "AVANTIQO INTELLIGENCE",
    domain: "Organization Intelligence",
    capabilities: ["Live Context", "Risk Signals", "Recommendations", "Approvals"],
    ai_signal: "AI connects business context to the next accountable action.",
    side: "right",
    accent: "ice",
  },
  {
    id: "operations",
    source_reference: storage(`${ROOT}/founder-v7/founder-opening-built-synced-approved-v7.mp4`),
    duration_seconds: 2.2,
    source_in_seconds: 0,
    kicker: "CONNECTED EXECUTION",
    domain: "Operations",
    capabilities: ["Work Queues", "Incidents", "Assignments"],
    ai_signal: "Attention becomes governed execution.",
    side: "left",
    accent: "gold",
  },
  {
    id: "integration",
    source_reference: storage(`${ROOT}/founder-v7/founder-mid-integration-synced-approved-v7.mp4`),
    duration_seconds: 3.6,
    source_in_seconds: 0,
    kicker: "ONE OPERATING CONTEXT",
    domain: "Supply Chain + Finance",
    capabilities: ["Procurement", "Receiving", "Inventory", "Ledger"],
    ai_signal: "A transaction moves through the business without losing context.",
    side: "right",
    accent: "ice",
  },
  {
    id: "governed-ai",
    source_reference: storage(`${ROOT}/founder-v7/founder-mid-ai-synced-approved-v7.mp4`),
    duration_seconds: 5.7,
    source_in_seconds: 0,
    kicker: "GOVERNED AUTONOMY",
    domain: "Avantiqo AI",
    capabilities: ["Observe", "Reason", "Recommend", "Execute"],
    ai_signal: "Every autonomous action stays inside business rules, permissions and evidence.",
    side: "left",
    accent: "gold",
  },
  {
    id: "close",
    source_reference: storage(`${ROOT}/founder-v7/founder-close-synced-approved-v7.mp4`),
    duration_seconds: 6.1,
    source_in_seconds: 0,
    kicker: "THE INTELLIGENT ENTERPRISE",
    domain: "One System. One Truth.",
    capabilities: ["Finance", "Operations", "People", "Commercial"],
    ai_signal: "Different domains become one continuously learning operating system.",
    side: "right",
    accent: "ice",
  },
]);

async function loadProject() {
  const { data, error } = await supabaseAdmin
    .from("creative_projects")
    .select("*")
    .eq("id", PROJECT_ID)
    .eq("organization_id", ORGANIZATION_ID)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("SPATIAL_PRODUCT_TWIN_PROJECT_NOT_FOUND");
  return data;
}

async function outputReady() {
  const dir = OUTPUT_PATH.slice(0, OUTPUT_PATH.lastIndexOf("/"));
  const name = OUTPUT_PATH.slice(OUTPUT_PATH.lastIndexOf("/") + 1);
  const { data } = await supabaseAdmin.storage.from(BUCKET).list(dir, { search: name, limit: 10 });
  return (data || []).some((item) => item.name === name);
}

async function signedUrl(seconds = 86400) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(OUTPUT_PATH, seconds);
  if (error) throw error;
  return data?.signedUrl || null;
}

async function persistProof(project, output) {
  const buffer = output.buffer;
  const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(OUTPUT_PATH, buffer, {
    contentType: "video/mp4",
    upsert: true,
    cacheControl: "3600",
    metadata: {
      organization_id: ORGANIZATION_ID,
      creative_project_id: PROJECT_ID,
      studio_capability: CREATIVE_TOOL_CAPABILITIES.SPATIAL_PRODUCT_TWIN,
      full_screen_ui_ratio: "0",
      spatial_glass_tracking_proven: String(output.spatial_glass_tracking_proven === true),
      contract: output.contract,
    },
  });
  if (error) throw error;

  const identity = crypto.createHash("sha256").update(JSON.stringify({
    project_id: PROJECT_ID,
    checksum,
    contract: output.contract,
    scenes: SCENES.map((scene) => scene.id),
  })).digest("hex");

  const result = await AssetGraphRepository.createOrFindByMetadataIdentity({
    metadata_key: "spatial_product_twin_proof_identity",
    metadata_value: identity,
    node: createCreativeAssetNode({
      organization_id: ORGANIZATION_ID,
      creative_project_id: PROJECT_ID,
      type: CREATIVE_ASSET_NODE_TYPES.VIDEO,
      status: CREATIVE_ASSET_NODE_STATUS.REVIEW,
      name: "Spatial Product Twin — Studio Proof v1",
      description: "Live-environment spatial AI proof. Full-screen product UI is forbidden; business domains and capabilities are expressed as tracked optical-glass objects.",
      url: creativeStorageUri(BUCKET, OUTPUT_PATH),
      storage_path: OUTPUT_PATH,
      lineage: {
        source: "creative_spatial_product_twin",
        capability: CREATIVE_TOOL_CAPABILITIES.SPATIAL_PRODUCT_TWIN,
        generation_version: 1,
      },
      technical: {
        mime_type: "video/mp4",
        width: 1920,
        height: 1080,
        duration_seconds: output.duration_seconds,
        checksum,
      },
      intelligence: {
        tags: ["spatial-glass", "product-twin", "live-environment", "investor-film-proof"],
      },
      review: {
        ai_reviewed: false,
        human_reviewed: false,
        approved: false,
        notes: "Proof only. Must be visually reviewed before full-film propagation.",
      },
      metadata: {
        spatial_product_twin_proof_identity: identity,
        spatial_product_twin_contract: output.contract,
        full_screen_ui_ratio: 0,
        spatial_glass_tracking_proven: output.spatial_glass_tracking_proven === true,
        design_policy: output.design_policy,
        scene_count: output.scene_count,
        proof_gate_required: true,
      },
    }),
  });

  const metadata = project.metadata || {};
  const { error: projectError } = await supabaseAdmin
    .from("creative_projects")
    .update({
      metadata: {
        ...metadata,
        spatial_product_twin_proof: {
          contract: output.contract,
          asset_node_id: result.node.id,
          storage_path: OUTPUT_PATH,
          checksum,
          duration_seconds: output.duration_seconds,
          full_screen_ui_ratio: 0,
          spatial_glass_tracking_proven: output.spatial_glass_tracking_proven === true,
          status: "REVIEW_REQUIRED",
          updated_at: new Date().toISOString(),
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", PROJECT_ID)
    .eq("organization_id", ORGANIZATION_ID);
  if (projectError) throw projectError;

  return {
    asset_node_id: result.node.id,
    checksum,
    bytes: buffer.length,
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const action = url.searchParams.get("action") || "status";

    if (action === "status") {
      const project = await loadProject();
      return json({
        success: true,
        contract: "CREATIVE_SPATIAL_PRODUCT_TWIN_PROOF_V1",
        output_ready: await outputReady(),
        output_path: OUTPUT_PATH,
        proof_duration_seconds: SCENES.reduce((sum, scene) => sum + scene.duration_seconds, 0),
        full_screen_ui_ratio: 0,
        studio_source_of_truth: project.metadata?.studio_source_of_truth === true,
        tool_snapshots: project.metadata?.creative_tool_snapshots || {},
        signed_url: (await outputReady()) ? await signedUrl() : null,
      });
    }

    if (action === "render") {
      const project = await loadProject();
      const execution = await CreativeToolExecutionRuntime.execute({
        organization_id: ORGANIZATION_ID,
        creative_project_id: PROJECT_ID,
        project,
        capability: CREATIVE_TOOL_CAPABILITIES.SPATIAL_PRODUCT_TWIN,
        input: {
          scenes: SCENES,
          width: 1920,
          height: 1080,
          fps: 24,
        },
      });
      const output = execution.output;
      if (!output?.buffer?.length) throw new Error("SPATIAL_PRODUCT_TWIN_RENDER_EMPTY");
      const saved = await persistProof(project, output);
      return json({
        success: true,
        contract: output.contract,
        execution_contract: execution.contract,
        resolution: execution.resolution,
        output_path: OUTPUT_PATH,
        signed_url: await signedUrl(),
        duration_seconds: output.duration_seconds,
        full_screen_ui_ratio: output.full_screen_ui_ratio,
        spatial_glass_tracking_proven: output.spatial_glass_tracking_proven,
        design_policy: output.design_policy,
        ...saved,
      });
    }

    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json({
      success: false,
      error: error?.message || String(error),
      details: error?.details || null,
    }, 500);
  }
}
