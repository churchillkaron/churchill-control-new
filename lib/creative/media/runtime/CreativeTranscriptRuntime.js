import {
  runAIService,
} from "@/lib/platform/service-runtime/ai";

import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";

import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";

function transcriptOutput(result = {}) {
  let current = result?.output || result;
  const seen = new Set();

  while (
    current &&
    typeof current === "object" &&
    current.output &&
    typeof current.output === "object" &&
    !seen.has(current)
  ) {
    seen.add(current);
    current = current.output;
  }

  return current || {};
}

function timestamped(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => ({
      id: item.id ?? index,
      start_seconds:
        Number.isFinite(Number(item.start_seconds ?? item.start))
          ? Number(item.start_seconds ?? item.start)
          : null,
      end_seconds:
        Number.isFinite(Number(item.end_seconds ?? item.end))
          ? Number(item.end_seconds ?? item.end)
          : null,
      text: item.text ?? item.word ?? "",
      speaker: item.speaker ?? item.speaker_id ?? null,
      confidence:
        Number.isFinite(Number(item.confidence))
          ? Number(item.confidence)
          : null,
    }))
    .filter((item) => item.text || item.start_seconds !== null || item.end_seconds !== null);
}

function transcriptIdentity(parent, input = {}) {
  return [
    parent.id,
    parent.technical?.checksum || parent.technical?.checksum_sha256 || "",
    input.language || "",
    input.response_format || input.responseFormat || "",
    JSON.stringify(input.timestamp_granularities || input.timestampGranularities || []),
  ].join(":");
}

export const CreativeTranscriptRuntime = {
  async create({
    organization_id,
    parent_asset_node_id,
    provider_id = null,
    input = {},
    provider_policy = {},
    force = false,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!parent_asset_node_id) throw new Error("parent_asset_node_id required");

    const parent = await AssetGraphRepository.getById(parent_asset_node_id);
    if (!parent || parent.organization_id !== organization_id) {
      throw new Error("Parent asset node not found");
    }
    if (!parent.url) throw new Error("Parent asset node has no media URL");

    const identity = transcriptIdentity(parent, input);
    const existing = !force
      ? (await AssetGraphRepository.listByProject({
          organization_id,
          creative_project_id: parent.creative_project_id,
        })).find((node) =>
          node.parent_asset_node_id === parent.id &&
          node.type === CREATIVE_ASSET_NODE_TYPES.SUBTITLE &&
          node.metadata?.transcript_identity === identity,
        )
      : null;

    if (existing) {
      return {
        node: existing,
        reused: true,
      };
    }

    const execution = await runAIService.execute({
      organization_id,
      service_id: "ai.speech.to.text",
      provider_id,
      input: {
        ...input,
        source: parent.url,
        file_name: input.file_name || input.fileName || parent.name || null,
        mime_type:
          input.mime_type ||
          input.mimeType ||
          parent.technical?.mime_type ||
          null,
      },
      metadata: {
        source_asset_node_id: parent.id,
        creative_project_id: parent.creative_project_id,
        operation: "TRANSCRIBE_MEDIA",
      },
      provider_policy,
    });

    if (execution.pending) {
      throw new Error("ASYNCHRONOUS_TRANSCRIPTION_REQUIRES_TASK_COMPLETION_ADAPTER");
    }

    const transcript = transcriptOutput(execution);
    const segments = timestamped(transcript.segments);
    const words = timestamped(transcript.words);
    const node = createCreativeAssetNode({
      organization_id,
      creative_project_id: parent.creative_project_id,
      creative_asset_id: parent.creative_asset_id,
      parent_asset_node_id: parent.id,
      type: CREATIVE_ASSET_NODE_TYPES.SUBTITLE,
      status: CREATIVE_ASSET_NODE_STATUS.DERIVED,
      name: input.name || `${parent.name || "Asset"} transcript`,
      description: input.description || "",
      url: null,
      storage_path: null,
      lineage: {
        source: "speech_to_text",
        provider_id: execution.provider || null,
        capability: "ai.speech.to.text",
        generation_version: input.version || 1,
      },
      technical: {
        mime_type: "application/json",
        duration_seconds:
          Number.isFinite(Number(transcript.duration_seconds))
            ? Number(transcript.duration_seconds)
            : parent.technical?.duration_seconds || null,
        checksum: transcript.checksum_sha256 || null,
      },
      intelligence: {
        tags: Array.isArray(input.tags) ? input.tags : [],
        safety_status: "UNKNOWN",
      },
      cost: {
        currency: execution.pricing?.currency || execution.usage?.currency || null,
        estimated: 0,
        actual: Number(execution.pricing?.customer_price || 0),
        saved_by_reuse: 0,
      },
      reuse: {
        reusable: false,
        approved_for_reuse: false,
      },
      review: {
        ai_reviewed: false,
        human_reviewed: false,
        approved: false,
      },
      metadata: {
        transcript_identity: identity,
        source_asset_node_id: parent.id,
        text: transcript.text || "",
        language: transcript.language || input.language || null,
        segments,
        words,
        speakers: transcript.speakers || null,
        provider: execution.provider || null,
        model: execution.model || null,
        pricing: execution.pricing || null,
        usage: execution.usage || null,
        billing: execution.billing || null,
        created_at: new Date().toISOString(),
      },
    });

    return {
      node: await AssetGraphRepository.create(node),
      reused: false,
    };
  },
};
