import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { resolveCreativeProviderAssetUrl } from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";
import {
  normalizeCreativeBlenderScene,
  createCreativeBlenderScriptSource,
} from "@/lib/creative/tools/runtime/CreativeBlenderRuntime";

const CONTRACT = "CREATIVE_BLENDER_LOCAL_NODE_RUNTIME_V1";
const CAPABILITY = "creative.3d.render";
const NODE_ID = "avantiqo-node-01";
const OUTPUT_BUCKET = "creative-assets";
const NODE_FRESHNESS_MS = 120000;

function text(value) { return String(value ?? "").trim(); }
function enabled(value) { return ["1","true","yes","on"].includes(text(value).toLowerCase()); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }

async function healthyNode() {
  if (!enabled(process.env.AVANTIQO_LOCAL_COMPUTE_QUEUE_ENABLED)) return null;
  const { data, error } = await supabaseAdmin.from("avantiqo_local_compute_nodes")
    .select("id,enabled,capabilities,last_seen_at").eq("id", NODE_ID).maybeSingle();
  if (error) throw error;
  if (!data?.enabled || !Array.isArray(data.capabilities) || !data.capabilities.includes(CAPABILITY)) return null;
  const seen = Date.parse(data.last_seen_at || "");
  if (!Number.isFinite(seen) || Date.now() - seen > NODE_FRESHNESS_MS) return null;
  return data;
}

async function outputTarget({ organizationId, creativeProjectId, token, frames }) {
  const extension = frames === 1 ? "png" : "mp4";
  const path = `${organizationId}/generated/local-node01-blender/${creativeProjectId}/${token}.${extension}`;
  const storage = getServiceSupabase();
  const upload = await storage.storage.from(OUTPUT_BUCKET).createSignedUploadUrl(path, { upsert: false });
  if (upload.error || !upload.data?.signedUrl) throw upload.error || new Error("CREATIVE_BLENDER_LOCAL_UPLOAD_REQUIRED");
  return {
    signed_url: upload.data.signedUrl,
    storage_reference: `storage://${OUTPUT_BUCKET}/${path}`,
    extension,
  };
}

async function waitForJob(id, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data, error } = await supabaseAdmin.from("avantiqo_local_compute_jobs")
      .select("status,result,metrics,error_code,node_id,model").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("CREATIVE_BLENDER_LOCAL_JOB_NOT_FOUND");
    const status = text(data.status).toUpperCase();
    if (status === "COMPLETED") return data;
    if (["FAILED","CANCELLED"].includes(status)) {
      throw new Error(text(data.error_code) || `CREATIVE_BLENDER_LOCAL_${status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("CREATIVE_BLENDER_LOCAL_TIMEOUT");
}

export async function renderCreativeBlenderOnLocalNode({
  organization_id,
  creative_project_id,
  scene,
} = {}) {
  const organizationId = text(organization_id);
  const projectId = text(creative_project_id);
  if (!organizationId || !projectId) throw new Error("CREATIVE_BLENDER_LOCAL_SCOPE_REQUIRED");
  const node = await healthyNode();
  if (!node) throw new Error("CREATIVE_BLENDER_LOCAL_NODE_UNAVAILABLE");

  const normalized = normalizeCreativeBlenderScene(scene || {});
  const token = crypto.createHash("sha256")
    .update(JSON.stringify({ organizationId, projectId, normalized, now: Date.now() }))
    .digest("hex").slice(0, 20);
  const base = `C:/Avantiqo/jobs/blender/${token}`;
  const outputPath = normalized.frames === 1 ? `${base}/render.png` : `${base}/render.mp4`;
  const encodedScene = Buffer.from(JSON.stringify(normalized), "utf8").toString("base64");
  const script = createCreativeBlenderScriptSource(encodedScene, outputPath);
  const outputUpload = await outputTarget({
    organizationId, creativeProjectId: projectId, token, frames: normalized.frames,
  });

  const inserted = await supabaseAdmin.from("avantiqo_local_compute_jobs").insert({
    organization_id: organizationId,
    usage_id: `blender-${token}`,
    capability: CAPABILITY,
    lane: "gpu",
    workload: "blender_render",
    model: "blender-5.0.1",
    payload: {
      contract: CONTRACT,
      token,
      script,
      frames: normalized.frames,
      fps: normalized.fps,
      output_upload: outputUpload,
    },
    priority: 80,
    max_attempts: 1,
  }).select("id").single();
  if (inserted.error || !inserted.data?.id) {
    throw inserted.error || new Error("CREATIVE_BLENDER_LOCAL_QUEUE_INSERT_FAILED");
  }

  const row = await waitForJob(
    inserted.data.id,
    normalized.frames === 1 ? 10 * 60 * 1000 : 60 * 60 * 1000,
  );
  const result = object(row.result);
  const storageReference = text(result.storage_reference || outputUpload.storage_reference);
  const assetUrl = await resolveCreativeProviderAssetUrl({
    organization_id: organizationId,
    value: storageReference,
  });
  if (!assetUrl) throw new Error("CREATIVE_BLENDER_LOCAL_ASSET_URL_REQUIRED");
  const response = await fetch(assetUrl);
  if (!response.ok) throw new Error(`CREATIVE_BLENDER_LOCAL_DOWNLOAD_FAILED:${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());

  return {
    contract: CONTRACT,
    tool_id: "blender",
    mime_type: normalized.frames === 1 ? "image/png" : "video/mp4",
    buffer,
    bytes: buffer.length,
    scene: normalized,
    metadata: {
      infrastructure_provider: "AVANTIQO_LOCAL_NODE_V1",
      node_id: row.node_id || NODE_ID,
      model: text(row.model) || "blender-5.0.1",
      storage_reference: storageReference,
      metrics: object(row.metrics),
      external_provider_used: false,
    },
  };
}

export async function creativeBlenderLocalNodeAvailable() {
  return Boolean(await healthyNode());
}

export const CreativeBlenderLocalNodeRuntime = Object.freeze({
  contract: CONTRACT,
  capability: CAPABILITY,
  available: creativeBlenderLocalNodeAvailable,
  render: renderCreativeBlenderOnLocalNode,
});
