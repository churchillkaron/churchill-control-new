import {
  createProductionNode,
  createProductionEdge,
} from "@/lib/creative/production-graph/documents/ProductionGraph";

const CONTRACT = "CREATIVE_SHOT_CONTINUATION_GRAPH_V1";
const HANDOFF_CONTRACT = "CREATIVE_REVIEWED_CLOSING_FRAME_HANDOFF_V1";
const CLOSING_KEYFRAME_CONTRACT = "CREATIVE_CLOSING_KEYFRAME_V1";
const CLOSING_KEYFRAME_REVIEW_CONTRACT = "CREATIVE_CLOSING_KEYFRAME_REVIEW_V1";
const FLF2V_CAPABILITY = "ai.video.first_last_frame_to_video";

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

function number(value, fallback = 0) {
  const candidate = Number(value);
  return Number.isFinite(candidate) ? candidate : fallback;
}

function capability(node = {}, shot = {}) {
  return text(
    node.generation?.capability ||
    shot.generation?.capability ||
    shot.capability ||
    node.generation?.service,
  ).toLowerCase();
}

function explicitPreviousShotId(shot = {}) {
  const continuity = object(shot.continuity);
  return text(
    continuity.previous_shot_id ||
    continuity.previousShotId ||
    continuity.continue_from_shot_id ||
    continuity.continueFromShotId ||
    shot.metadata?.previous_shot_id,
  ) || null;
}

function continuationRequested(shot = {}) {
  const continuity = object(shot.continuity);
  return Boolean(
    explicitPreviousShotId(shot) ||
    continuity.from_previous === true ||
    continuity.fromPrevious === true ||
    continuity.continue_from_previous === true ||
    continuity.continueFromPrevious === true ||
    continuity.match_previous_closing_frame === true ||
    continuity.matchPreviousClosingFrame === true ||
    continuity.closing_to_opening_handoff_required === true ||
    continuity.closingToOpeningHandoffRequired === true
  );
}

function shotNode(graph = {}, shot = {}) {
  return list(graph.nodes).find((node) =>
    text(node.id) === text(shot.id) ||
    text(node.metadata?.shot_id) === text(shot.id) ||
    text(node.metadata?.final_shot_node_id) === text(shot.id),
  ) || null;
}

function perceptualReviewNode(graph = {}, sourceNode = {}) {
  return list(graph.nodes).find((node) =>
    text(node.metadata?.source_generation_node_id) === text(sourceNode.id) &&
    text(node.metadata?.contract) === "GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1",
  ) || null;
}

function edgeKey(edge = {}) {
  return [edge.from, edge.to, edge.type].join("::");
}

function addEdge(edges, edge) {
  const key = edgeKey(edge);
  if (!edges.some((candidate) => edgeKey(candidate) === key)) edges.push(edge);
}

function sceneShots(shots = [], sceneId) {
  return list(shots)
    .filter((shot) => text(shot.scene_id) === text(sceneId))
    .sort((left, right) =>
      number(left.shot_number, Number.MAX_SAFE_INTEGER) -
      number(right.shot_number, Number.MAX_SAFE_INTEGER),
    );
}

function explicitLastFrame(node = {}, shot = {}) {
  return text(
    node.generation?.provider_parameters?.last_frame ||
    node.generation?.provider_parameters?.lastFrame ||
    node.requirements?.last_frame ||
    node.requirements?.lastFrame ||
    shot.generation?.provider_parameters?.last_frame ||
    shot.generation?.provider_parameters?.lastFrame ||
    shot.last_frame ||
    shot.lastFrame,
  ) || null;
}

function closingFrameDirection(node = {}, shot = {}) {
  return shot.frame_plan?.closing_frame ||
    shot.closing_frame ||
    node.intent?.closing_frame ||
    node.requirements?.closing_frame ||
    null;
}

function closingReferenceContract(shot = {}) {
  const keyframe = object(shot.keyframe_contract);
  const identity = object(shot.identity_requirements);
  const references = [
    ...list(keyframe.reference_images),
    ...list(identity.reference_images),
  ];
  return {
    identity_expected: Boolean(
      keyframe.identity_profile_id ||
      keyframe.identity_atlas_asset_node_id ||
      keyframe.identity_atlas_url ||
      identity.required === true ||
      identity.profile_id ||
      identity.identity_profile_id,
    ),
    identity_profile_id:
      keyframe.identity_profile_id ||
      identity.identity_profile_id ||
      identity.profile_id ||
      null,
    identity_atlas_asset_node_id:
      keyframe.identity_atlas_asset_node_id ||
      identity.identity_atlas_asset_node_id ||
      null,
    identity_atlas_url:
      keyframe.identity_atlas_url ||
      identity.identity_atlas_url ||
      null,
    identity_atlas_hash:
      keyframe.identity_atlas_hash ||
      identity.identity_atlas_hash ||
      null,
    reference_images: references,
  };
}

function ensureClosingKeyframe({ nodes, edges, currentNode, shot } = {}) {
  if (explicitLastFrame(currentNode, shot)) {
    return {
      required: false,
      source: "EXPLICIT_LAST_FRAME",
      last_frame_already_bound: true,
    };
  }

  const keyframeId = `${currentNode.id}:closing-keyframe`;
  const reviewId = `${keyframeId}:review`;
  const existingKeyframe = nodes.find((node) => text(node.id) === keyframeId);
  const existingReview = nodes.find((node) => text(node.id) === reviewId);
  const references = closingReferenceContract(shot);
  const closingFrame = closingFrameDirection(currentNode, shot);

  if (!existingKeyframe) {
    nodes.push(createProductionNode({
      id: keyframeId,
      type: "CLOSING_KEYFRAME",
      title: `Closing keyframe for ${currentNode.title || currentNode.id}`,
      description: "Generate the governed final visual state required by first/last-frame Cinema inference from the immutable shot specification.",
      priority: Math.max(0, Number(currentNode.priority || 100) - 0.75),
      intent: {
        scene_id: shot.scene_id || currentNode.metadata?.scene_id || null,
        shot_id: shot.id || currentNode.id,
        purpose: shot.purpose || currentNode.intent?.purpose || "",
        closing_frame: closingFrame,
        action: shot.action || currentNode.intent?.action || "",
        camera: shot.camera || currentNode.requirements?.camera || {},
      },
      requirements: {
        contract: CLOSING_KEYFRAME_CONTRACT,
        closing_frame: closingFrame,
        purpose: shot.purpose || currentNode.intent?.purpose || "",
        action: shot.action || currentNode.requirements?.action || "",
        camera: shot.camera || currentNode.requirements?.camera || {},
        continuity: shot.continuity || currentNode.requirements?.continuity || {},
        production_design:
          shot.production_design || currentNode.requirements?.production_design || {},
        identity_expected: references.identity_expected,
        identity_profile_id: references.identity_profile_id,
        identity_atlas_asset_node_id: references.identity_atlas_asset_node_id,
        identity_atlas_url: references.identity_atlas_url,
        identity_atlas_hash: references.identity_atlas_hash,
        reference_images: references.reference_images,
        output_spec: {
          type: "IMAGE",
          purpose: "FLF2V_CLOSING_KEYFRAME",
          aspect_ratio:
            currentNode.generation?.output_spec?.aspect_ratio ||
            currentNode.requirements?.output_spec?.aspect_ratio ||
            shot.output_spec?.aspect_ratio ||
            null,
        },
      },
      assets: [],
      generation: {
        required: true,
        service: "ai.image.generate",
        capability: "ai.image.generate",
        provider: "avantiqo-image",
        instructions:
          "Render the immutable structured closing-frame specification exactly.",
        provider_parameters: {
          closing_keyframe_contract: CLOSING_KEYFRAME_CONTRACT,
          identity_profile_id: references.identity_profile_id,
          identity_atlas_asset_node_id: references.identity_atlas_asset_node_id,
          identity_atlas_url: references.identity_atlas_url,
          identity_atlas_hash: references.identity_atlas_hash,
          reference_images: references.reference_images,
          input_fidelity: "high",
        },
        output_spec: {
          type: "IMAGE",
          purpose: "FLF2V_CLOSING_KEYFRAME",
        },
        estimated_cost: 0,
        estimated_seconds: 0,
        status: "WAITING",
      },
      metadata: {
        contract: CLOSING_KEYFRAME_CONTRACT,
        scene_id: shot.scene_id || currentNode.metadata?.scene_id || null,
        shot_id: shot.id || currentNode.id,
        workflow_kind: currentNode.metadata?.workflow_kind || "TEMPORAL",
      },
    }));
  }

  if (!existingReview) {
    nodes.push(createProductionNode({
      id: reviewId,
      type: "CLOSING_KEYFRAME_REVIEW",
      title: `Review closing keyframe for ${currentNode.title || currentNode.id}`,
      description: "Verify that the governed closing keyframe executes the immutable final shot state, identity and camera handoff before Cinema inference.",
      priority: Math.max(0, Number(currentNode.priority || 100) - 0.5),
      intent: {
        scene_id: shot.scene_id || currentNode.metadata?.scene_id || null,
        shot_id: shot.id || currentNode.id,
        review: "CLOSING_KEYFRAME_VALIDATION",
      },
      requirements: {
        contract: CLOSING_KEYFRAME_REVIEW_CONTRACT,
        closing_frame: closingFrame,
        camera: shot.camera || currentNode.requirements?.camera || {},
        continuity: shot.continuity || currentNode.requirements?.continuity || {},
        identity_expected: references.identity_expected,
        identity_profile_id: references.identity_profile_id,
        identity_atlas_url: references.identity_atlas_url,
        reference_images: references.reference_images,
        minimum_story_score: 86,
        minimum_composition_score: 86,
        minimum_identity_score: references.identity_expected ? 90 : 0,
        response_schema: {
          passed: "boolean",
          story_score: "number_0_100",
          composition_score: "number_0_100",
          identity_score: "number_0_100",
          identity_preserved: "boolean",
          closing_state_correct: "boolean",
          camera_handoff_coherent: "boolean",
          artifacts_absent: "boolean",
          failures: "array",
          repair_instructions: "array",
        },
      },
      assets: [],
      generation: {
        required: true,
        service: "ai.image.analyze",
        capability: "ai.image.analyze",
        provider: "openai",
        instructions:
          "Evaluate the immutable closing-frame quality contract exactly and return strict JSON evidence.",
        provider_parameters: {
          response_format: { type: "json_object" },
          closing_keyframe_node_id: keyframeId,
        },
        output_spec: { type: CLOSING_KEYFRAME_REVIEW_CONTRACT },
        estimated_cost: 0,
        estimated_seconds: 0,
        status: "WAITING",
      },
      metadata: {
        contract: CLOSING_KEYFRAME_REVIEW_CONTRACT,
        scene_id: shot.scene_id || currentNode.metadata?.scene_id || null,
        shot_id: shot.id || currentNode.id,
        workflow_kind: currentNode.metadata?.workflow_kind || "TEMPORAL",
      },
    }));
  }

  addEdge(edges, createProductionEdge({
    from: keyframeId,
    to: reviewId,
    type: "DEPENDS_ON",
    metadata: {
      contract: CLOSING_KEYFRAME_REVIEW_CONTRACT,
      role: "CLOSING_KEYFRAME_GENERATION",
    },
  }));
  addEdge(edges, createProductionEdge({
    from: reviewId,
    to: currentNode.id,
    type: "DEPENDS_ON",
    metadata: {
      contract: CLOSING_KEYFRAME_REVIEW_CONTRACT,
      role: "APPROVED_CLOSING_KEYFRAME",
    },
  }));

  currentNode.requirements = {
    ...object(currentNode.requirements),
    closing_keyframe_required: true,
    closing_keyframe_node_id: keyframeId,
    closing_keyframe_review_node_id: reviewId,
    last_frame_binding_required_at_execution: true,
  };
  currentNode.generation = {
    ...object(currentNode.generation),
    provider_parameters: {
      ...object(currentNode.generation?.provider_parameters),
      closing_keyframe_required: true,
      closing_keyframe_node_id: keyframeId,
      closing_keyframe_review_node_id: reviewId,
    },
  };

  return {
    required: true,
    source: "GOVERNED_CLOSING_KEYFRAME",
    keyframe_node_id: keyframeId,
    review_node_id: reviewId,
    identity_expected: references.identity_expected,
    last_frame_binding_required_at_execution: true,
  };
}

export const CreativeShotContinuationGraphRuntime = Object.freeze({
  apply({ graph, shots = [] } = {}) {
    if (!graph) throw new Error("production graph required");

    const nodes = [...list(graph.nodes)];
    const workingGraph = { ...graph, nodes };
    const edges = [...list(graph.edges)];
    const bindings = [];
    const closingKeyframes = [];
    const sceneIds = [...new Set(list(shots).map((shot) => text(shot.scene_id)).filter(Boolean))];

    for (const sceneId of sceneIds) {
      const ordered = sceneShots(shots, sceneId);
      const byId = new Map(ordered.map((shot) => [text(shot.id), shot]));

      for (let index = 0; index < ordered.length; index += 1) {
        const shot = ordered[index];
        if (!continuationRequested(shot)) continue;

        const previousId = explicitPreviousShotId(shot) || text(ordered[index - 1]?.id);
        if (!previousId) {
          throw new Error(`CREATIVE_SHOT_CONTINUATION_PREVIOUS_SHOT_REQUIRED:${shot.id}`);
        }
        const previousShot = byId.get(previousId) || list(shots).find((candidate) =>
          text(candidate.id) === previousId,
        );
        if (!previousShot) {
          throw new Error(`CREATIVE_SHOT_CONTINUATION_PREVIOUS_SHOT_NOT_FOUND:${shot.id}:${previousId}`);
        }

        const previousNode = shotNode(workingGraph, previousShot);
        const currentNode = shotNode(workingGraph, shot);
        if (!previousNode || !currentNode) {
          throw new Error(`CREATIVE_SHOT_CONTINUATION_GRAPH_NODE_REQUIRED:${shot.id}`);
        }
        const reviewNode = perceptualReviewNode(workingGraph, previousNode);
        if (!reviewNode) {
          throw new Error(`CREATIVE_SHOT_CONTINUATION_REVIEW_REQUIRED:${shot.id}:${previousNode.id}`);
        }
        if (capability(currentNode, shot) !== FLF2V_CAPABILITY) {
          throw new Error(`CREATIVE_SHOT_CONTINUATION_FLF2V_REQUIRED:${shot.id}`);
        }

        const closingKeyframe = ensureClosingKeyframe({
          nodes,
          edges,
          currentNode,
          shot,
        });
        closingKeyframes.push({
          shot_id: shot.id,
          ...closingKeyframe,
        });

        const handoff = {
          contract: HANDOFF_CONTRACT,
          previous_shot_id: previousShot.id,
          previous_generation_node_id: previousNode.id,
          previous_perceptual_review_node_id: reviewNode.id,
          current_shot_id: shot.id,
          first_frame_source: "PREVIOUS_REVIEWED_CLOSING_FRAME",
          closing_frame_handoff_required: true,
          perceptual_review_pass_required: true,
          actual_frame_binding_required_at_execution: true,
          fail_closed_without_bound_first_frame: true,
          last_frame_source: closingKeyframe.source,
          closing_keyframe_node_id: closingKeyframe.keyframe_node_id || null,
          closing_keyframe_review_node_id: closingKeyframe.review_node_id || null,
          fail_closed_without_bound_last_frame: true,
        };

        currentNode.requirements = {
          ...object(currentNode.requirements),
          shot_continuation: handoff,
        };
        currentNode.generation = {
          ...object(currentNode.generation),
          provider_parameters: {
            ...object(currentNode.generation?.provider_parameters),
            shot_continuation: handoff,
          },
        };
        currentNode.metadata = {
          ...object(currentNode.metadata),
          shot_continuation_contract: HANDOFF_CONTRACT,
          previous_shot_id: previousShot.id,
          previous_generation_node_id: previousNode.id,
          previous_perceptual_review_node_id: reviewNode.id,
          reviewed_closing_frame_handoff_required: true,
        };

        addEdge(edges, createProductionEdge({
          from: previousNode.id,
          to: currentNode.id,
          type: "DEPENDS_ON",
          metadata: {
            contract: HANDOFF_CONTRACT,
            role: "PREVIOUS_GENERATION",
          },
        }));
        addEdge(edges, createProductionEdge({
          from: reviewNode.id,
          to: currentNode.id,
          type: "DEPENDS_ON",
          metadata: {
            contract: HANDOFF_CONTRACT,
            role: "PREVIOUS_PERCEPTUAL_APPROVAL",
          },
        }));

        bindings.push(handoff);
      }
    }

    return {
      ...graph,
      nodes,
      edges,
      metadata: {
        ...object(graph.metadata),
        shot_continuation_graph_contract: bindings.length ? CONTRACT : null,
        shot_continuation_handoff_contract: bindings.length ? HANDOFF_CONTRACT : null,
        shot_continuation_binding_count: bindings.length,
        shot_continuation_bindings: bindings,
        shot_continuation_requires_reviewed_closing_frame: bindings.length > 0,
        shot_continuation_execution_binding_fail_closed: true,
        closing_keyframe_contract:
          closingKeyframes.some((item) => item.required)
            ? CLOSING_KEYFRAME_CONTRACT
            : null,
        closing_keyframe_review_contract:
          closingKeyframes.some((item) => item.required)
            ? CLOSING_KEYFRAME_REVIEW_CONTRACT
            : null,
        closing_keyframe_bindings: closingKeyframes,
        closing_keyframe_binding_count:
          closingKeyframes.filter((item) => item.required).length,
      },
    };
  },
  contract: CONTRACT,
  handoffContract: HANDOFF_CONTRACT,
  closingKeyframeContract: CLOSING_KEYFRAME_CONTRACT,
  closingKeyframeReviewContract: CLOSING_KEYFRAME_REVIEW_CONTRACT,
});