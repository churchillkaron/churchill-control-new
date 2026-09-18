import crypto from "node:crypto";

export const AVANTIQO_PROFESSIONAL_COMPOSITING_GRAPH_CONTRACT =
  "AVANTIQO_PROFESSIONAL_COMPOSITING_GRAPH_V1";

const OPERATIONS = Object.freeze(new Set([
  "READ","DEEP_READ","WRITE","MERGE","DEEP_MERGE","DEEP_HOLDOUT","DEEP_TO_IMAGE",
  "SHUFFLE","COPY_CHANNELS","PREMULT","UNPREMULT","KEY","DESPILL","EDGE_EXTEND",
  "GRAIN_EXTRACT","GRAIN_APPLY","DEFOCUS","Z_DEFOCUS","Z_FOG","VECTOR_BLUR",
  "RELIGHT_NORMALS","STMAP","UV_REMAP","LENS_DISTORT","LENS_UNDISTORT",
  "CHROMATIC_ABERRATION","GLOW","HALATION","LIGHTWRAP","CAMERA_PROJECT",
  "PAINT_CLEANUP","PATCH_TRACK","COLORSPACE","OCIO","CRYPTOMATTE","AOV_REBUILD",
]));

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function hash(value) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function topological(nodes = []) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const visiting = new Set(); const visited = new Set(); const ordered = [];
  function visit(id) {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error("COMPOSITING_GRAPH_CYCLE:" + id);
    const node = byId.get(id);
    if (!node) throw new Error("COMPOSITING_GRAPH_NODE_NOT_FOUND:" + id);
    visiting.add(id);
    for (const input of list(node.inputs)) visit(text(input));
    visiting.delete(id); visited.add(id); ordered.push(node);
  }
  for (const node of nodes) visit(node.id);
  return ordered;
}

export function authorProfessionalCompositingGraph({
  nodes = [], output_node_id, scene_linear = true, ocio_config_id = null,
} = {}) {
  const normalized = list(nodes).map((node, index) => ({
    id: text(node.id) || "node-" + (index + 1),
    op: text(node.op).toUpperCase(),
    inputs: list(node.inputs).map(text),
    params: node.params || {},
  }));
  const blockers = [];
  const ids = normalized.map((node) => node.id);
  if (new Set(ids).size !== ids.length) blockers.push("COMPOSITING_GRAPH_NODE_IDS_MUST_BE_UNIQUE");
  for (const node of normalized) {
    if (!OPERATIONS.has(node.op)) blockers.push("COMPOSITING_GRAPH_OPERATION_UNSUPPORTED:" + node.op);
  }
  if (!text(output_node_id) || !ids.includes(text(output_node_id))) {
    blockers.push("COMPOSITING_GRAPH_OUTPUT_REQUIRED");
  }
  if (scene_linear !== true) blockers.push("COMPOSITING_GRAPH_SCENE_LINEAR_REQUIRED");
  let order = [];
  if (!blockers.length) {
    try { order = topological(normalized); }
    catch (error) { blockers.push(error.message); }
  }
  const deepOps = normalized.filter((node) => node.op.startsWith("DEEP_"));
  const body = {
    contract: AVANTIQO_PROFESSIONAL_COMPOSITING_GRAPH_CONTRACT,
    nodes: normalized,
    output_node_id: text(output_node_id) || null,
    execution_order: order.map((node) => node.id),
    scene_linear: scene_linear === true,
    ocio_config_id: text(ocio_config_id) || null,
    deep_compositing_required: deepOps.length > 0,
    policies: {
      scene_linear_until_output_transform: true,
      premultiplication_state_must_be_explicit: true,
      color_transform_nodes_must_name_config: true,
      flattening_deep_before_required_holdouts_forbidden: true,
      cryptomatte_selection_must_preserve_manifest: true,
      grain_reapply_after_spatial_operations: true,
    },
  };
  return {
    ...body,
    status: blockers.length ? "BLOCKED" : "READY",
    blockers,
    graph_hash: hash(body),
  };
}

export const CreativeProfessionalCompositingGraphRuntime = Object.freeze({
  contract: AVANTIQO_PROFESSIONAL_COMPOSITING_GRAPH_CONTRACT,
  operations: Object.freeze([...OPERATIONS]),
  author: authorProfessionalCompositingGraph,
});
