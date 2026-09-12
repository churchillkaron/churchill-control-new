import {
  createProductionNode,
  createProductionEdge,
} from "../../production-graph/documents/ProductionGraph.js";

const GRAPH_CONTRACT = "CREATIVE_VISUAL_STATE_GRAPH_V1";
const STATE_CONTRACT = "CREATIVE_VISUAL_STATE_V1";
const REVIEW_CONTRACT = "CREATIVE_VISUAL_STATE_REVIEW_V1";

function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function text(value) { return String(value ?? "").trim(); }

function requiredRoles(frameDesign = {}) {
  const conditioning = object(frameDesign.visual_state_conditioning);
  if (conditioning.required !== true) return [];
  if (text(frameDesign.shot_tier) === "A") return ["OPENING", "HERO", "CLOSING"];
  if (text(frameDesign.shot_tier) === "B") return ["OPENING"];
  return [];
}

function stateSpec(frameDesign = {}, role = "OPENING") {
  const authored = object(frameDesign.authored_frames);
  if (role === "OPENING") return authored.opening || frameDesign.frame_spec;
  if (role === "CLOSING") return authored.closing || frameDesign.frame_spec;
  return { ...object(frameDesign.frame_spec), iconic_target: frameDesign.iconic_target || null };
}
function buildStateNode(shotNode, frameDesign, role) {
  const id = `${shotNode.id}:visual-state:${role.toLowerCase()}`;
  return createProductionNode({
    id,
    type: "VISUAL_STATE",
    title: `${role.toLowerCase()} visual state for ${shotNode.title || shotNode.id}`,
    description: `Generate the governed ${role.toLowerCase()} frame before Cinema execution.`,
    priority: Math.max(0, Number(shotNode.priority || 100) - 4),
    intent: { shot_id: shotNode.id, role, frame_design: frameDesign.frame_spec },
    requirements: {
      contract: STATE_CONTRACT,
      shot_id: shotNode.id,
      role,
      shot_tier: frameDesign.shot_tier,
      frame_design: frameDesign,
      state_spec: stateSpec(frameDesign, role),
      minimum_composition_score: role === "HERO" ? 96 : 94,
      minimum_visual_score: 94,
    },
    assets: [],
    generation: {
      required: true,
      service: "ai.image.generate",
      capability: "ai.image.generate",
      output_spec: { type: "IMAGE", purpose: "VISUAL_STATE_CONDITIONING" },
      status: "WAITING",
    },
    metadata: {
      scene_id: shotNode.metadata?.scene_id || null,
      shot_id: shotNode.id,
      contract: STATE_CONTRACT,
      visual_state_role: role,
      visual_state_for_shot_id: shotNode.id,
    },
  });
}
function buildReviewNode(shotNode, stateNode, frameDesign, role) {
  const id = `${stateNode.id}:review`;
  return createProductionNode({
    id,
    type: "VISUAL_STATE_REVIEW",
    title: `Review ${role.toLowerCase()} visual state for ${shotNode.title || shotNode.id}`,
    description: "Compare the generated frame against the director-designed spatial state; beauty alone cannot pass drift.",
    priority: Math.max(0, Number(shotNode.priority || 100) - 3),
    intent: { shot_id: shotNode.id, role, review: "FRAME_DESIGN_CONFORMANCE" },
    requirements: {
      contract: REVIEW_CONTRACT,
      shot_id: shotNode.id,
      role,
      shot_tier: frameDesign.shot_tier,
      frame_design: frameDesign,
      state_spec: stateSpec(frameDesign, role),
      minimum_composition_score: role === "HERO" ? 96 : 94,
      minimum_visual_score: 94,
      print_test_required: role === "HERO",
    },
    assets: [],
    generation: {
      required: true,
      service: "ai.image.analyze",
      capability: "ai.image.analyze",
      output_spec: { type: "CREATIVE_VISUAL_STATE_REVIEW_V1" },
      status: "WAITING",
    },
    metadata: {
      scene_id: shotNode.metadata?.scene_id || null,
      shot_id: shotNode.id,
      contract: REVIEW_CONTRACT,
      visual_state_role: role,
      visual_state_node_id: stateNode.id,
      visual_state_review_for_shot_id: shotNode.id,
    },
  });
}

export const CreativeVisualStateGraphRuntime = {
  contract: GRAPH_CONTRACT,
  state_contract: STATE_CONTRACT,
  review_contract: REVIEW_CONTRACT,
  apply({ graph } = {}) {
    if (!graph) throw new Error("production graph required");
    const nodes = [...list(graph.nodes)];
    const edges = [...list(graph.edges)];
    const bindings = [];
    for (const shotNode of nodes.filter((node) => node.type === "SHOT")) {
      const frameDesign = object(shotNode.requirements?.frame_design);
      const roles = requiredRoles(frameDesign);
      if (!roles.length) continue;
      const reviewIds = [];
      const stateIds = [];
      for (const role of roles) {
        const stateNode = buildStateNode(shotNode, frameDesign, role);
        const reviewNode = buildReviewNode(shotNode, stateNode, frameDesign, role);
        if (!nodes.some((node) => node.id === stateNode.id)) nodes.push(stateNode);
        if (!nodes.some((node) => node.id === reviewNode.id)) nodes.push(reviewNode);
        edges.push(
          createProductionEdge({ from: stateNode.id, to: reviewNode.id, type: "DEPENDS_ON" }),
          createProductionEdge({ from: reviewNode.id, to: shotNode.id, type: "DEPENDS_ON" }),
        );
        stateIds.push(stateNode.id);
        reviewIds.push(reviewNode.id);
      }
      shotNode.requirements = {
        ...object(shotNode.requirements),
        visual_state_conditioning_required: true,
        visual_state_node_ids: stateIds,
        visual_state_review_node_ids: reviewIds,
      };
      shotNode.metadata = {
        ...object(shotNode.metadata),
        visual_state_conditioning_contract: GRAPH_CONTRACT,
        visual_state_review_node_ids: reviewIds,
      };
      bindings.push({ shot_id: shotNode.id, shot_tier: frameDesign.shot_tier, state_node_ids: stateIds, review_node_ids: reviewIds });
    }
    return {
      ...graph,
      nodes,
      edges,
      metadata: {
        ...object(graph.metadata),
        visual_state_graph_contract: bindings.length ? GRAPH_CONTRACT : null,
        visual_state_binding_count: bindings.length,
        visual_state_bindings: bindings,
      },
    };
  },
};
