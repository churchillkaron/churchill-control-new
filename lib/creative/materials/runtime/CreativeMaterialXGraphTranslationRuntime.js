import crypto from "node:crypto";

export const AVANTIQO_MATERIALX_GRAPH_TRANSLATION_CONTRACT =
  "AVANTIQO_MATERIALX_GRAPH_TRANSLATION_V1";

const SUPPORTED_NODES = new Set([
  "constant", "image", "tiledimage", "multiply", "add", "mix",
  "clamp", "normalmap", "texcoord", "convert",
]);
const SURFACE_INPUTS = new Set([
  "base_color", "metalness", "specular_roughness", "specular_ior",
  "transmission", "coat", "coat_roughness", "anisotropy",
  "subsurface", "emission_color", "emission", "opacity",
]);

function text(value) { return String(value ?? "").trim(); }
function hash(value) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function attrs(source = "") {
  const out = {};
  for (const match of String(source).matchAll(/([A-Za-z_][A-Za-z0-9_:.-]*)\s*=\s*"([^"]*)"/g)) out[match[1]] = match[2];
  return out;
}
function parseInputs(body = "") {
  return [...String(body).matchAll(/<input\b([^>]*?)(?:\/\s*>|>\s*<\/input>)/gi)]
    .map((match) => attrs(match[1]));
}
function parseNodes(xml = "") {
  const nodes = [];
  const pattern = /<(constant|image|tiledimage|multiply|add|mix|clamp|normalmap|texcoord|convert)\b([^>]*?)(?:\/\s*>|>([\s\S]*?)<\/\1>)/gi;
  for (const match of String(xml).matchAll(pattern)) {
    const nodeAttrs = attrs(match[2]);
    const name = text(nodeAttrs.name);
    if (!name) throw new Error("MATERIALX_GRAPH_NODE_NAME_REQUIRED");
    nodes.push({
      name,
      category: match[1].toLowerCase(),
      type: text(nodeAttrs.type) || null,
      value: text(nodeAttrs.value) || null,
      file: text(nodeAttrs.file) || null,
      inputs: parseInputs(match[3] || ""),
    });
  }
  return nodes;
}
function dependencyNames(node) {
  return node.inputs.map((input) => text(input.nodename)).filter(Boolean);
}
function graphOutputMap(xml = "") {
  const map = new Map();
  for (const match of String(xml).matchAll(/<nodegraph\b([^>]*)>([\s\S]*?)<\/nodegraph>/gi)) {
    const graph = attrs(match[1]);
    const graphName = text(graph.name);
    if (!graphName) continue;
    for (const output of String(match[2]).matchAll(/<output\b([^>]*?)(?:\/\s*>|>\s*<\/output>)/gi)) {
      const out = attrs(output[1]);
      if (text(out.name) && text(out.nodename)) map.set(graphName + ":" + text(out.name), text(out.nodename));
    }
  }
  return map;
}
function topo(nodes) {
  const byName = new Map(nodes.map((node) => [node.name, node]));
  const visiting = new Set(); const visited = new Set(); const order = [];
  function visit(name) {
    if (visited.has(name)) return;
    if (visiting.has(name)) throw new Error("MATERIALX_GRAPH_CYCLE:" + name);
    const node = byName.get(name);
    if (!node) throw new Error("MATERIALX_GRAPH_REFERENCE_NOT_FOUND:" + name);
    visiting.add(name);
    for (const dep of dependencyNames(node)) visit(dep);
    visiting.delete(name); visited.add(name); order.push(name);
  }
  for (const node of nodes) visit(node.name);
  return order;
}

export function translateMaterialXGraph({ xml, resource_bindings = {} } = {}) {
  const source = String(xml || "");
  if (!/<materialx\b/i.test(source)) throw new Error("MATERIALX_ROOT_REQUIRED");
  const nodes = parseNodes(source);
  if (!nodes.length) throw new Error("MATERIALX_GRAPH_NODES_REQUIRED");
  for (const node of nodes) {
    if (!SUPPORTED_NODES.has(node.category)) throw new Error("MATERIALX_GRAPH_NODE_UNSUPPORTED:" + node.category);
  }
  const surfaces = [...source.matchAll(/<standard_surface\b([^>]*)>([\s\S]*?)<\/standard_surface>/gi)];
  if (surfaces.length !== 1) throw new Error("MATERIALX_SINGLE_STANDARD_SURFACE_REQUIRED");
  const surfaceInputs = parseInputs(surfaces[0][2]).filter((input) => SURFACE_INPUTS.has(text(input.name)));
  const outputs = graphOutputMap(source);
  const connected = surfaceInputs
    .filter((input) => input.nodename || input.nodegraph)
    .map((input) => {
      const resolvedNode = text(input.nodename) ||
        outputs.get(text(input.nodegraph) + ":" + text(input.output || "out")) || "";
      return { ...input, resolved_nodename: resolvedNode };
    });
  if (!connected.length) throw new Error("MATERIALX_GRAPH_CONNECTED_SURFACE_INPUT_REQUIRED");
  const byName = new Map(nodes.map((node) => [node.name, node]));
  for (const input of connected) {
    if (!input.resolved_nodename || !byName.has(input.resolved_nodename)) {
      throw new Error("MATERIALX_GRAPH_SURFACE_REFERENCE_NOT_FOUND:" + (input.nodename || input.nodegraph || "unknown"));
    }
  }
  const resources = nodes
    .filter((node) => ["image", "tiledimage"].includes(node.category))
    .map((node) => {
      const fileInput = node.inputs.find((input) => text(input.name) === "file");
      const file = text(node.file || fileInput?.value);
      if (!file) throw new Error("MATERIALX_GRAPH_IMAGE_FILE_REQUIRED:" + node.name);
      const binding = resource_bindings[file] || null;
      if (!binding?.asset_node_id) throw new Error("MATERIALX_GRAPH_RESOURCE_BINDING_REQUIRED:" + file);
      return { node: node.name, file, asset_node_id: text(binding.asset_node_id), color_space: text(binding.color_space) || null };
    });
  const order = topo(nodes);
  const body = {
    contract: AVANTIQO_MATERIALX_GRAPH_TRANSLATION_CONTRACT,
    source_checksum: crypto.createHash("sha256").update(source).digest("hex"),
    nodes,
    execution_order: order,
    surface_bindings: connected.map((input) => ({
      input: text(input.name),
      node: text(input.resolved_nodename),
      nodegraph: text(input.nodegraph) || null,
      output: text(input.output) || "out",
      type: text(input.type) || null,
    })),
    resources,
    policy: {
      unsupported_nodes_fail_closed: true,
      image_resources_require_governed_asset_binding: true,
      graph_cycles_forbidden: true,
      materialx_graph_preserved_not_baked_by_default: true,
    },
  };
  return { ...body, status: "READY", graph_hash: hash(body) };
}

export const CreativeMaterialXGraphTranslationRuntime = Object.freeze({
  contract: AVANTIQO_MATERIALX_GRAPH_TRANSLATION_CONTRACT,
  supported_nodes: Object.freeze([...SUPPORTED_NODES]),
  translate: translateMaterialXGraph,
});
