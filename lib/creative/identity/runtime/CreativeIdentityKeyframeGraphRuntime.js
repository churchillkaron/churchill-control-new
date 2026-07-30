import "@/lib/creative/identity/runtime/CreativeIdentityKeyframeExecutionGate";

import {
  createProductionNode,
  createProductionEdge,
} from "@/lib/creative/production-graph/documents/ProductionGraph";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function outputUrl(output = {}) {
  const value = output?.output || output;
  return value?.image_url ||
    value?.imageUrl ||
    value?.file_url ||
    value?.fileUrl ||
    value?.url ||
    value?.result?.url ||
    value?.images?.[0]?.url ||
    null;
}

function keyframeReviewPrompt(shot = {}, contract = {}) {
  return `
Return strict JSON only:
{
  "passed": true,
  "identity_score": 0,
  "story_score": 0,
  "total_score": 0,
  "person_count_correct": true,
  "requested_angle_correct": true,
  "background_is_new_story_environment": true,
  "identity_failures": [],
  "story_failures": [],
  "repair_instructions": []
}

Evaluate the generated story keyframe against the approved identity atlas and shot direction.
The person must be recognisably the exact same real individual across facial geometry, eye shape and spacing, nose, lips, jawline, skin tone, age, hairline, body type and body proportions.
The atlas is identity evidence only. The generated image must not copy the atlas grid, source-photo backgrounds, source-photo lighting or source-photo composition.
Reject generic lookalikes, identity averaging, beauty-filter drift, altered ethnicity or age, body-shape changes, duplicate people, synthetic skin, wrong requested angle, wrong environment, weak acting or a frame that does not execute the story.

Minimum identity score: ${Number(contract.validation?.minimum_identity_score || 90)}.
Minimum story score: ${Number(contract.validation?.minimum_story_score || 85)}.
Minimum total score: ${Number(contract.validation?.minimum_total_score || 88)}.
Shot purpose: ${text(shot.purpose)}.
Shot subject: ${text(shot.subject)}.
Opening frame: ${text(shot.frame_plan?.opening_frame || shot.opening_frame)}.
Identity profile: ${text(contract.identity_profile_id)}.
Identity atlas hash: ${text(contract.identity_atlas_hash)}.
`;
}

export const CreativeIdentityKeyframeGraphRuntime = {
  apply({ graph, shots = [] } = {}) {
    if (!graph) throw new Error("production graph required");
    const shotMap = new Map(list(shots).map((shot) => [shot.id, shot]));
    const nodes = [...list(graph.nodes)];
    const edges = [...list(graph.edges)];
    const inserted = [];

    for (const shotNode of nodes.filter((node) => node.type === "SHOT")) {
      const shot = shotMap.get(shotNode.id);
      const contract = object(shot?.keyframe_contract);
      if (contract.required !== true) continue;
      const keyframeId = text(contract.id || `${shotNode.id}:identity-keyframe`);
      const reviewId = `${keyframeId}:review`;
      if (nodes.some((node) => node.id === keyframeId || node.id === reviewId)) continue;

      const keyframeNode = createProductionNode({
        id: keyframeId,
        type: "IDENTITY_KEYFRAME",
        title: `Identity story keyframe for ${shotNode.title || shotNode.id}`,
        description: "Generate a story-specific still from the approved multi-angle identity atlas before video generation.",
        priority: Math.max(0, Number(shotNode.priority || 100) - 2),
        intent: {
          shot_id: shotNode.id,
          identity_profile_id: contract.identity_profile_id,
          purpose: shot?.purpose || shotNode.intent?.purpose || "",
          opening_frame: shot?.frame_plan?.opening_frame || shot?.opening_frame || {},
        },
        requirements: {
          contract: contract.contract,
          identity_profile_id: contract.identity_profile_id,
          identity_atlas_asset_node_id: contract.identity_atlas_asset_node_id,
          identity_atlas_url: contract.identity_atlas_url,
          identity_atlas_hash: contract.identity_atlas_hash,
          reference_images: list(contract.reference_images),
          human_approval_required: true,
          output_spec: contract.output_spec || {},
        },
        assets: [],
        generation: {
          required: true,
          service: contract.service || "ai.image.generate",
          capability: contract.capability || "ai.image.generate",
          provider: contract.provider || "openai",
          provider_prompt: contract.prompt,
          provider_parameters: {
            reference_images: list(contract.reference_images),
            identity_profile_id: contract.identity_profile_id,
            identity_atlas_asset_node_id: contract.identity_atlas_asset_node_id,
            identity_atlas_url: contract.identity_atlas_url,
            identity_atlas_hash: contract.identity_atlas_hash,
            input_fidelity: contract.input_fidelity || "high",
          },
          output_spec: contract.output_spec || {},
          estimated_cost: Number(contract.estimated_cost || 0),
          estimated_seconds: Number(contract.estimated_seconds || 0),
          status: "WAITING",
        },
        metadata: {
          scene_id: shotNode.metadata?.scene_id || null,
          shot_id: shotNode.id,
          workflow_kind: graph.metadata?.workflow_kind || "TEMPORAL",
          contract: "IDENTITY_STORY_KEYFRAME_V1",
          identity_keyframe_for_shot_id: shotNode.id,
          identity_profile_id: contract.identity_profile_id,
          identity_atlas_asset_node_id: contract.identity_atlas_asset_node_id,
          identity_atlas_url: contract.identity_atlas_url,
          identity_atlas_hash: contract.identity_atlas_hash,
          human_approval_required: true,
        },
      });

      const reviewNode = createProductionNode({
        id: reviewId,
        type: "IDENTITY_KEYFRAME_REVIEW",
        title: `Review identity keyframe for ${shotNode.title || shotNode.id}`,
        description: "Verify identity, requested angle, story environment and keyframe quality before any video task may start.",
        priority: Math.max(0, Number(shotNode.priority || 100) - 1),
        intent: {
          shot_id: shotNode.id,
          identity_profile_id: contract.identity_profile_id,
          review: "IDENTITY_AND_STORY_KEYFRAME",
        },
        requirements: {
          validation: contract.validation || {},
          identity_atlas_asset_node_id: contract.identity_atlas_asset_node_id,
          identity_atlas_url: contract.identity_atlas_url,
          identity_atlas_hash: contract.identity_atlas_hash,
          human_approval_required: true,
        },
        assets: [],
        generation: {
          required: true,
          service: contract.validation?.service || "ai.image.analyze",
          capability: contract.validation?.capability || "ai.image.analyze",
          provider: contract.validation?.provider || "openai",
          provider_prompt: keyframeReviewPrompt(shot, contract),
          provider_parameters: {
            response_format: { type: "json_object" },
            identity_keyframe_node_id: keyframeId,
            identity_atlas_asset_node_id: contract.identity_atlas_asset_node_id,
            identity_atlas_url: contract.identity_atlas_url,
            identity_atlas_hash: contract.identity_atlas_hash,
            minimum_identity_score: Number(contract.validation?.minimum_identity_score || 90),
            minimum_story_score: Number(contract.validation?.minimum_story_score || 85),
            minimum_total_score: Number(contract.validation?.minimum_total_score || 88),
          },
          output_spec: { type: "IDENTITY_KEYFRAME_REVIEW_V1" },
          estimated_cost: Number(contract.validation?.estimated_cost || 0),
          estimated_seconds: Number(contract.validation?.estimated_seconds || 0),
          status: "WAITING",
        },
        metadata: {
          scene_id: shotNode.metadata?.scene_id || null,
          shot_id: shotNode.id,
          workflow_kind: graph.metadata?.workflow_kind || "TEMPORAL",
          contract: "IDENTITY_KEYFRAME_REVIEW_V1",
          identity_keyframe_node_id: keyframeId,
          identity_keyframe_review_for_shot_id: shotNode.id,
          identity_profile_id: contract.identity_profile_id,
          identity_atlas_asset_node_id: contract.identity_atlas_asset_node_id,
          identity_atlas_url: contract.identity_atlas_url,
          identity_atlas_hash: contract.identity_atlas_hash,
          minimum_identity_score: Number(contract.validation?.minimum_identity_score || 90),
          minimum_story_score: Number(contract.validation?.minimum_story_score || 85),
          minimum_total_score: Number(contract.validation?.minimum_total_score || 88),
          human_approval_required: true,
        },
      });

      nodes.push(keyframeNode, reviewNode);
      edges.push(
        createProductionEdge({
          from: keyframeId,
          to: reviewId,
          type: "DEPENDS_ON",
        }),
        createProductionEdge({
          from: reviewId,
          to: shotNode.id,
          type: "DEPENDS_ON",
        }),
      );

      shotNode.generation = {
        ...object(shotNode.generation),
        provider_parameters: {
          ...object(shotNode.generation?.provider_parameters),
          identity_keyframe_node_id: keyframeId,
          identity_keyframe_review_node_id: reviewId,
          identity_keyframe_required: true,
          identity_keyframe_human_approval_required: true,
        },
      };
      shotNode.requirements = {
        ...object(shotNode.requirements),
        identity_keyframe_node_id: keyframeId,
        identity_keyframe_review_node_id: reviewId,
        identity_keyframe_required: true,
        identity_keyframe_human_approval_required: true,
      };
      shotNode.metadata = {
        ...object(shotNode.metadata),
        identity_keyframe_node_id: keyframeId,
        identity_keyframe_review_node_id: reviewId,
      };

      inserted.push({
        shot_id: shotNode.id,
        keyframe_node_id: keyframeId,
        review_node_id: reviewId,
      });
    }

    return {
      ...graph,
      nodes,
      edges,
      metadata: {
        ...object(graph.metadata),
        identity_keyframe_contract: inserted.length
          ? "IDENTITY_KEYFRAME_GRAPH_V1"
          : null,
        identity_keyframe_count: inserted.length,
        identity_keyframes: inserted,
      },
    };
  },

  outputUrl,
};
