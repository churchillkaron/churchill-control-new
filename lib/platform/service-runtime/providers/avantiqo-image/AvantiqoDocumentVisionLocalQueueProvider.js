import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { enqueueLocalComputeJob } from "../AvantiqoLocalComputeEnqueueRuntime.js";

export const AVANTIQO_DOCUMENT_VISION_LOCAL_JOB_PREFIX = "local-document-vision:";
const MODEL = "qwen2.5vl:3b";
const INFRASTRUCTURE = "AVANTIQO_LOCAL_NODE_V1";
const CAPABILITIES = new Set([
  "ai.image.analyze",
  "document.ocr",
  "document.classify",
  "creative.materials.estimate",
]);

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(text(value).toLowerCase());
}

function raw(value) {
  const id = text(value);
  if (!id.startsWith(AVANTIQO_DOCUMENT_VISION_LOCAL_JOB_PREFIX)) {
    throw new Error("AVANTIQO_DOCUMENT_VISION_LOCAL_JOB_ID_REQUIRED");
  }
  return id.slice(AVANTIQO_DOCUMENT_VISION_LOCAL_JOB_PREFIX.length);
}

function requestedCapability(input = {}) {
  const requested = text(input.requested_capability);
  if (CAPABILITIES.has(requested)) return requested;
  const capability = text(input.capability);
  return CAPABILITIES.has(capability) ? capability : "";
}

export function isDocumentVisionLocalJob(value) {
  return text(value).startsWith(AVANTIQO_DOCUMENT_VISION_LOCAL_JOB_PREFIX);
}

export function isDocumentVisionLocalCapability(value) {
  return CAPABILITIES.has(text(value));
}

async function available(capability = "document.ocr") {
  if (!enabled(process.env.AVANTIQO_LOCAL_COMPUTE_QUEUE_ENABLED)) return false;
  if (
    text(process.env.AVANTIQO_LOCAL_DOCUMENT_VISION_ENABLED) &&
    !enabled(process.env.AVANTIQO_LOCAL_DOCUMENT_VISION_ENABLED)
  ) {
    return false;
  }

  const requested = CAPABILITIES.has(text(capability)) ? text(capability) : "document.ocr";
  const query = await supabaseAdmin
    .from("avantiqo_local_compute_nodes")
    .select("id,last_seen_at,enabled,capabilities")
    .eq("enabled", true)
    .contains("capabilities", [requested])
    .order("last_seen_at", { ascending: false })
    .limit(4);
  if (query.error) throw query.error;

  const now = Date.now();
  return (query.data || []).some((node) => {
    const seen = new Date(node.last_seen_at || 0).getTime();
    return Number.isFinite(seen) && now - seen <= 90_000;
  });
}

export const AvantiqoDocumentVisionLocalQueueProvider = {
  id: "avantiqo-image",
  available,

  async execute(input = {}) {
    const capability = requestedCapability(input);
    if (!capability) {
      throw new Error(
        `AVANTIQO_DOCUMENT_VISION_LOCAL_CAPABILITY_NOT_SUPPORTED:${text(input.capability)}`,
      );
    }
    if (!(await available(capability))) {
      throw new Error("AVANTIQO_DOCUMENT_VISION_LOCAL_NODE_UNAVAILABLE");
    }

    const organizationId = text(input.context?.organization_id);
    const usageId = text(input.context?.usage_id);
    if (!organizationId || !usageId) {
      throw new Error("AVANTIQO_DOCUMENT_VISION_LOCAL_GOVERNED_CONTEXT_REQUIRED");
    }

    const sourceAssets = [
      ...(Array.isArray(input.source_assets) ? input.source_assets : []),
      ...(Array.isArray(input.assets) ? input.assets : []),
      ...(Array.isArray(input.images) ? input.images : []),
    ].filter(Boolean);
    const payload = {
      capability,
      requested_capability: capability,
      source_assets: sourceAssets,
      image:
        input.image ||
        input.image_url ||
        input.asset_url ||
        input.source_url ||
        sourceAssets[0] ||
        null,
      instructions_text: text(
        input.instructions_text || input.instructions || input.prompt,
      ),
    };
    const inserted = await enqueueLocalComputeJob({
      organization_id: organizationId,
      usage_id: usageId,
      capability,
      lane: "gpu",
      workload: "document_vision",
      model: MODEL,
      payload,
      priority: 72,
      max_attempts: 2,
      input: payload,
    });

    return {
      success: true,
      provider: "avantiqo-image",
      model: "avantiqo-image-v1",
      output: {
        provider_job_id: `${AVANTIQO_DOCUMENT_VISION_LOCAL_JOB_PREFIX}${inserted.id}`,
        status: "queued",
        capability,
        foundation_model: MODEL,
        infrastructure_provider: INFRASTRUCTURE,
        local_node: true,
        raw_reasoning_persisted: false,
      },
    };
  },

  async getStatus(input = {}) {
    const jobId = text(input.job_id || input.jobId || input.provider_job_id);
    const id = raw(jobId);
    const query = await supabaseAdmin
      .from("avantiqo_local_compute_jobs")
      .select("status,result,metrics,error_code,node_id,model")
      .eq("id", id)
      .maybeSingle();
    if (query.error) throw query.error;

    const row = query.data;
    if (!row) {
      return {
        status: "failed",
        provider_job_id: jobId,
        error: "AVANTIQO_DOCUMENT_VISION_LOCAL_JOB_NOT_FOUND",
      };
    }

    const status = text(row.status).toUpperCase();
    if (status === "COMPLETED") {
      const output = object(row.result);
      return {
        status: "completed",
        provider_job_id: jobId,
        output: {
          ...output,
          node_id: row.node_id,
          runtime_model: text(row.model) || MODEL,
          metrics: object(row.metrics),
          local_node: true,
          raw_reasoning_persisted: false,
        },
        infrastructure_provider: INFRASTRUCTURE,
      };
    }
    if (["FAILED", "CANCELLED"].includes(status)) {
      return {
        status: "failed",
        provider_job_id: jobId,
        error: text(row.error_code) || `AVANTIQO_DOCUMENT_VISION_LOCAL_${status}`,
      };
    }
    return {
      status: status === "RUNNING" ? "processing" : "queued",
      provider_job_id: jobId,
      infrastructure_provider: INFRASTRUCTURE,
      local_node: true,
    };
  },
};
