import {
  createProductionEdge,
} from "@/lib/creative/production-graph/documents/ProductionGraph";

const CONTRACT = "CREATIVE_SHOT_CONTINUATION_GRAPH_V1";
const HANDOFF_CONTRACT = "CREATIVE_REVIEWED_CLOSING_FRAME_HANDOFF_V1";
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

export const CreativeShotContinuationGraphRuntime = Object.freeze({
  apply({ graph, shots = [] } = {}) {
    if (!graph) throw new Error("production graph required");

    const edges = [...list(graph.edges)];
    const bindings = [];
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

        const previousNode = shotNode(graph, previousShot);
        const currentNode = shotNode(graph, shot);
        if (!previousNode || !currentNode) {
          throw new Error(`CREATIVE_SHOT_CONTINUATION_GRAPH_NODE_REQUIRED:${shot.id}`);
        }
        const reviewNode = perceptualReviewNode(graph, previousNode);
        if (!reviewNode) {
          throw new Error(`CREATIVE_SHOT_CONTINUATION_REVIEW_REQUIRED:${shot.id}:${previousNode.id}`);
        }
        if (capability(currentNode, shot) !== FLF2V_CAPABILITY) {
          throw new Error(`CREATIVE_SHOT_CONTINUATION_FLF2V_REQUIRED:${shot.id}`);
        }

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
      edges,
      metadata: {
        ...object(graph.metadata),
        shot_continuation_graph_contract: bindings.length ? CONTRACT : null,
        shot_continuation_handoff_contract: bindings.length ? HANDOFF_CONTRACT : null,
        shot_continuation_binding_count: bindings.length,
        shot_continuation_bindings: bindings,
        shot_continuation_requires_reviewed_closing_frame: bindings.length > 0,
        shot_continuation_execution_binding_fail_closed: true,
      },
    };
  },
  contract: CONTRACT,
  handoffContract: HANDOFF_CONTRACT,
});
