import crypto from "node:crypto";
import { CreativeAxfMaterialConversionRuntime } from "./CreativeAxfMaterialConversionRuntime.js";
import { CreativeMaterialXGraphTranslationRuntime } from "./CreativeMaterialXGraphTranslationRuntime.js";

export const AVANTIQO_MATERIALX_INTERCHANGE_CONTRACT =
  "AVANTIQO_MATERIALX_INTERCHANGE_V1";

const SUPPORTED_INPUTS = Object.freeze({
  base_color: "base_color",
  metalness: "metallic",
  metallic: "metallic",
  specular_roughness: "roughness",
  roughness: "roughness",
  specular_ior: "ior",
  ior: "ior",
  transmission: "transmission",
  coat: "coat_weight",
  coat_weight: "coat_weight",
  coat_roughness: "coat_roughness",
  anisotropy: "anisotropy",
  subsurface: "subsurface_weight",
  emission_color: "emission_color",
  emission: "emission_strength",
  opacity: "alpha",
});

function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function checksum(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}
function attributes(source = "") {
  const out = {};
  for (const match of String(source).matchAll(/([A-Za-z_][A-Za-z0-9_:.-]*)\s*=\s*"([^"]*)"/g)) {
    out[match[1]] = match[2];
  }
  return out;
}

function color3(value) {
  const parts = text(value).split(/[ ,]+/).filter(Boolean).map(Number);
  if (parts.length < 3 || parts.slice(0, 3).some((item) => !Number.isFinite(item))) {
    throw new Error("MATERIALX_COLOR3_VALUE_INVALID");
  }
  return [
    Math.max(0, Math.min(1, parts[0])),
    Math.max(0, Math.min(1, parts[1])),
    Math.max(0, Math.min(1, parts[2])),
    1,
  ];
}

function scalar(value, min = 0, max = 1) {
  const number = finite(value, NaN);
  if (!Number.isFinite(number)) throw new Error("MATERIALX_SCALAR_VALUE_INVALID");
  return Math.max(min, Math.min(max, number));
}

function inputValue(attrs = {}) {
  if (attrs.nodename || attrs.nodegraph || attrs.interfacename || attrs.output) {
    throw new Error("MATERIALX_CONNECTED_INPUT_REQUIRES_BAKED_OR_GRAPH_TRANSLATION");
  }
  if (!("value" in attrs)) throw new Error("MATERIALX_INPUT_VALUE_REQUIRED");
  const type = text(attrs.type).toLowerCase();
  if (type === "color3") return color3(attrs.value);
  if (["float", "integer"].includes(type)) return Number(attrs.value);
  throw new Error("MATERIALX_INPUT_TYPE_UNSUPPORTED:" + type);
}
function materialClass(value) {
  const normalized = text(value).toUpperCase();
  return normalized || "CUSTOM_PBR";
}

function standardSurfaceBody(xml) {
  const source = String(xml || "");
  const root = source.match(/<materialx\b([^>]*)>/i);
  if (!root) throw new Error("MATERIALX_ROOT_REQUIRED");
  const rootAttrs = attributes(root[1]);
  const version = text(rootAttrs.version);
  if (!version) throw new Error("MATERIALX_VERSION_REQUIRED");
  const matches = [...source.matchAll(/<standard_surface\b([^>]*)>([\s\S]*?)<\/standard_surface>/gi)];
  if (matches.length !== 1) throw new Error("MATERIALX_SINGLE_STANDARD_SURFACE_REQUIRED");
  return {
    version,
    node_attrs: attributes(matches[0][1]),
    body: matches[0][2],
  };
}

function parseInputs(body, { literal_only = false } = {}) {
  const inputs = {};
  for (const match of String(body).matchAll(/<input\b([^>]*?)(?:\/\s*>|>\s*<\/input>)/gi)) {
    const attrs = attributes(match[1]);
    const name = text(attrs.name);
    if (!name) throw new Error("MATERIALX_INPUT_NAME_REQUIRED");
    if (!(name in SUPPORTED_INPUTS)) {
      if (literal_only) continue;
      throw new Error("MATERIALX_STANDARD_SURFACE_INPUT_UNSUPPORTED:" + name);
    }
    if (literal_only && (attrs.nodename || attrs.nodegraph || attrs.interfacename || attrs.output)) continue;
    inputs[name] = { attrs, value: inputValue(attrs) };
  }
  return inputs;
}
function mappedPbr(inputs = {}) {
  const pbr = {};
  for (const [sourceName, entry] of Object.entries(inputs)) {
    const target = SUPPORTED_INPUTS[sourceName];
    if (!target) continue;
    if (["base_color", "emission_color"].includes(target)) {
      pbr[target] = entry.value;
      continue;
    }
    if (target === "ior") {
      pbr[target] = scalar(entry.value, 1, 3);
      continue;
    }
    pbr[target] = scalar(entry.value, 0, target === "emission_strength" ? 100 : 1);
  }
  return pbr;
}

export function importMaterialXStandardSurface({
  xml,
  material_id = null,
  material_class = "CUSTOM_PBR",
  continuity_key = null,
  source_asset_node_id = null,
  axf_conversion = null,
  resource_bindings = {},
} = {}) {
  const source = String(xml || "");
  if (!source.trim()) throw new Error("MATERIALX_XML_REQUIRED");
  const parsed = standardSurfaceBody(source);
  const complexGraph = /<(?:nodegraph|image|tiledimage|multiply|add|mix|clamp|normalmap|texcoord|convert)\b/i.test(source);
  const graph = complexGraph
    ? CreativeMaterialXGraphTranslationRuntime.translate({ xml: source, resource_bindings })
    : null;
  const inputs = parseInputs(parsed.body, { literal_only: complexGraph });
  const nodeName = text(parsed.node_attrs.name) || "standard_surface";
  const sourceChecksum = checksum(source);
  const pbr = mappedPbr(inputs);
  let axfAuthority = null;
  if (axf_conversion) {
    axfAuthority = CreativeAxfMaterialConversionRuntime.validate({
      ...axf_conversion,
      actual_materialx_checksum: sourceChecksum,
    });
    if (axfAuthority.status !== "READY") {
      throw new Error("AXF_CONVERSION_AUTHORITY_BLOCKED:" + axfAuthority.blockers.join(","));
    }
  }

  return {
    contract: AVANTIQO_MATERIALX_INTERCHANGE_CONTRACT,
    status: "READY",
    source_format: "MATERIALX",
    source_checksum: sourceChecksum,
    source_asset_node_id: text(source_asset_node_id) || null,
    materialx_version: parsed.version,
    materialx_node_name: nodeName,
    mapped_input_names: Object.keys(inputs).sort(),
    material: {
      material_id: text(material_id) || nodeName,
      name: nodeName,
      material_class: materialClass(material_class),
      continuity_key: text(continuity_key) || text(material_id) || nodeName,
      pbr,
      material_graph: graph,
      material_interchange: {
        contract: AVANTIQO_MATERIALX_INTERCHANGE_CONTRACT,
        source_format: "MATERIALX",
        source_checksum: sourceChecksum,
        source_asset_node_id: text(source_asset_node_id) || null,
        materialx_version: parsed.version,
        materialx_node_name: nodeName,
        materialx_graph_contract: graph?.contract || null,
        materialx_graph_hash: graph?.graph_hash || null,
        axf_conversion: axfAuthority,
        native_materialx_in_usd_rendering_claimed: false,
      },
    },
    materialx_graph_translated: Boolean(graph),
    materialx_graph: graph,
    native_materialx_in_usd_rendering_claimed: false,
    provider_calls_performed: false,
  };
}
export const CreativeMaterialXInterchangeRuntime = Object.freeze({
  contract: AVANTIQO_MATERIALX_INTERCHANGE_CONTRACT,
  supported_standard_surface_inputs: SUPPORTED_INPUTS,
  importStandardSurface: importMaterialXStandardSurface,
});
