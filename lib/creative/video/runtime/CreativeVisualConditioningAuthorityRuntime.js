const CONTRACT = "CREATIVE_VISUAL_CONDITIONING_AUTHORITY_V1";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function text(value) { return String(value ?? "").trim(); }

function byShot(nodes, type, shotId) {
  return nodes.find((node) => node.type === type && text(node.metadata?.shot_id || node.intent?.shot_id) === shotId);
}
function visualState(nodes, shotId, role) {
  return nodes.find((node) => node.type === "VISUAL_STATE" &&
    text(node.metadata?.shot_id || node.intent?.shot_id) === shotId &&
    text(node.metadata?.visual_state_role).toUpperCase() === role);
}
function visualReview(nodes, stateId) {
  return nodes.find((node) => node.type === "VISUAL_STATE_REVIEW" &&
    text(node.metadata?.visual_state_node_id) === stateId);
}
function promoteSpecializedState({ specialized, review, frameDesign, role }) {
  if (!specialized) return;
  specialized.requirements = {
    ...object(specialized.requirements),
    frame_design_authority: frameDesign,
    visual_state_role: role,
    minimum_composition_score: role === "HERO" ? 96 : 94,
    minimum_visual_score: 94,
  };
  specialized.metadata = {
    ...object(specialized.metadata),
    visual_conditioning_authority_contract: CONTRACT,
    canonical_visual_state_role: role,
  };
  if (review) {
    review.requirements = {
      ...object(review.requirements),
      frame_design_authority: frameDesign,
      visual_state_role: role,
      minimum_composition_score: role === "HERO" ? 96 : 94,
      minimum_visual_score: 94,
    };
    const generation = object(review.generation);
    const frameInstruction = `Also verify ${role} frame fidelity against the governed Frame Design authority. Composition, subject scale, depth planes, negative space, eye path, lighting placement and visual hierarchy must match; attractive drift fails. Minimum composition score 94. Frame Design: ${JSON.stringify(frameDesign)}`;
    review.generation = {
      ...generation,
      instructions: [text(generation.instructions), frameInstruction].filter(Boolean).join("\n\n"),
      provider_prompt: [text(generation.provider_prompt), frameInstruction].filter(Boolean).join("\n\n"),
      provider_parameters: {
        ...object(generation.provider_parameters),
        frame_design_authority: frameDesign,
        visual_conditioning_authority_contract: CONTRACT,
      },
    };
    review.metadata = {
      ...object(review.metadata),
      visual_conditioning_authority_contract: CONTRACT,
      canonical_visual_state_role: role,
    };
  }
}

function stripIds(node, removedIds) {
  const req = object(node.requirements);
  const gen = object(node.generation);
  const remainingStateIds = list(req.visual_state_node_ids).filter((id) => !removedIds.has(text(id)));
  const remainingReviewIds = list(req.visual_state_review_node_ids).filter((id) => !removedIds.has(text(id)));
  node.requirements = {
    ...req,
    visual_state_node_ids: remainingStateIds,
    visual_state_review_node_ids: remainingReviewIds,
    visual_state_conditioning_required: remainingReviewIds.length > 0,
    specialized_visual_state_authority_active: removedIds.size > 0,
  };
  node.generation = {
    ...gen,
    provider_parameters: {
      ...object(gen.provider_parameters),
      visual_state_node_ids: list(gen.provider_parameters?.visual_state_node_ids).filter((id) => !removedIds.has(text(id))),
      visual_state_review_node_ids: list(gen.provider_parameters?.visual_state_review_node_ids).filter((id) => !removedIds.has(text(id))),
    },
  };
}
export const CreativeVisualConditioningAuthorityRuntime = Object.freeze({
  contract: CONTRACT,
  apply({ graph } = {}) {
    if (!graph) throw new Error("production graph required");
    const originalNodes = [...list(graph.nodes)];
    const removed = new Set();
    const reused = [];

    for (const shot of originalNodes.filter((node) => node.type === "SHOT")) {
      const shotId = text(shot.id);
      const frameDesign = object(shot.requirements?.frame_design);
      if (!frameDesign.contract) continue;

      const openingState = visualState(originalNodes, shotId, "OPENING");
      const identity = byShot(originalNodes, "IDENTITY_KEYFRAME", shotId);
      if (openingState && identity) {
        const openingReview = visualReview(originalNodes, openingState.id);
        const identityReview = originalNodes.find((node) => node.type === "IDENTITY_KEYFRAME_REVIEW" && text(node.metadata?.shot_id) === shotId);
        promoteSpecializedState({ specialized: identity, review: identityReview, frameDesign, role: "OPENING" });
        removed.add(openingState.id);
        if (openingReview) removed.add(openingReview.id);
        reused.push({ shot_id: shotId, role: "OPENING", authority: identity.id });
      }

      const closingState = visualState(originalNodes, shotId, "CLOSING");
      const closing = byShot(originalNodes, "CLOSING_KEYFRAME", shotId);
      if (closingState && closing) {
        const closingReview = visualReview(originalNodes, closingState.id);
        const specializedReview = originalNodes.find((node) => node.type === "CLOSING_KEYFRAME_REVIEW" && text(node.metadata?.shot_id) === shotId);
        promoteSpecializedState({ specialized: closing, review: specializedReview, frameDesign, role: "CLOSING" });
        removed.add(closingState.id);
        if (closingReview) removed.add(closingReview.id);
        reused.push({ shot_id: shotId, role: "CLOSING", authority: closing.id });
      }
      stripIds(shot, removed);
    }

    const nodes = originalNodes.filter((node) => !removed.has(text(node.id)));
    const edges = list(graph.edges).filter((edge) =>
      !removed.has(text(edge.from)) && !removed.has(text(edge.to)));
    return {
      ...graph,
      nodes,
      edges,
      metadata: {
        ...object(graph.metadata),
        visual_conditioning_authority_contract: CONTRACT,
        deduplicated_visual_state_count: removed.size,
        specialized_visual_state_reuse: reused,
      },
    };
  },
});
