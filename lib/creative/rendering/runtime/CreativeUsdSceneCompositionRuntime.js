import crypto from "node:crypto";

export const AVANTIQO_USD_SCENE_COMPOSITION_CONTRACT =
  "AVANTIQO_USD_SCENE_COMPOSITION_V1";

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function identifier(value, fallback = "Asset") {
  const candidate = text(value).replace(/[^A-Za-z0-9_]/g, "_").replace(/^[^A-Za-z_]+/, "");
  return candidate || fallback;
}
function assetPath(value) {
  const candidate = text(value);
  if (!candidate || candidate.includes("@") || candidate.includes("\n") || candidate.includes("\r")) {
    throw new Error("USD_REFERENCE_PATH_INVALID");
  }
  return candidate;
}
function vec(value, fallback) {
  return Array.isArray(value) && value.length >= 3
    ? value.slice(0, 3).map((item, index) => finite(item, fallback[index]))
    : fallback;
}
function hash(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function quote(value) {
  return JSON.stringify(text(value));
}

function transformOps(transform = {}) {
  const translate = vec(transform.translate, [0, 0, 0]);
  const rotate = vec(transform.rotate_xyz_degrees, [0, 0, 0]);
  const scale = vec(transform.scale, [1, 1, 1]);
  return [
    `    double3 xformOp:translate = (${translate.join(", ")})`,
    `    double3 xformOp:rotateXYZ = (${rotate.join(", ")})`,
    `    double3 xformOp:scale = (${scale.join(", ")})`,
    `    uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:rotateXYZ", "xformOp:scale"]`,
  ];
}

function variantSetLines(asset = {}) {
  const sets = list(asset.variant_sets);
  if (!sets.length) return [];
  const names = sets.map((set) => identifier(set.name, "variant"));
  const lines = [`    prepend variantSets = ${quote(names.join(" "))}`];
  for (const set of sets) {
    const name = identifier(set.name, "variant");
    const options = list(set.options).map((option) => identifier(option, "Option"));
    if (!options.length) throw new Error(`USD_VARIANT_OPTIONS_REQUIRED:${name}`);
    const selected = identifier(set.selected || options[0], options[0]);
    if (!options.includes(selected)) throw new Error(`USD_VARIANT_SELECTION_INVALID:${name}:${selected}`);
    lines.push(`    variants = { string ${name} = ${quote(selected)} }`);
    lines.push(`    variantSet ${quote(name)} = {`);
    for (const option of options) {
      lines.push(`        ${quote(option)} {`);
      lines.push(`            custom string avantiqo:variant = ${quote(option)}`);
      lines.push("        }");
    }
    lines.push("    }");
  }
  return lines;
}
function assetLines(asset = {}, index = 0) {
  const prim = identifier(asset.prim_name || asset.name || `Asset_${index + 1}`, `Asset_${index + 1}`);
  const reference = assetPath(asset.reference_path || asset.path);
  const lines = [
    `  def Xform ${quote(prim)} (`,
    `    prepend references = @${reference}@`,
    "  )",
    "  {",
    ...transformOps(asset.transform),
    ...variantSetLines(asset),
    "  }",
  ];
  return { prim, reference, lines };
}

export function authorUsdSceneComposition(input = {}) {
  const fps = finite(input.frame_rate, 24);
  const start = finite(input.start_time_code, 1);
  const end = finite(input.end_time_code, start + Math.max(1, finite(input.duration_frames, 48)) - 1);
  if (fps <= 0) throw new Error("USD_FRAME_RATE_REQUIRED");
  if (end < start) throw new Error("USD_TIME_RANGE_INVALID");
  const assets = list(input.assets);
  if (!assets.length) throw new Error("USD_SCENE_ASSETS_REQUIRED");
  const sublayers = list(input.sublayers).map(assetPath);
  const builtAssets = assets.map(assetLines);
  const prims = builtAssets.map((item) => item.prim);
  if (new Set(prims).size !== prims.length) throw new Error("USD_PRIM_NAMES_MUST_BE_UNIQUE");

  const header = [
    "#usda 1.0",
    "(",
    `    defaultPrim = ${quote(identifier(input.default_prim || "World", "World"))}`,
    "    metersPerUnit = 1",
    "    upAxis = \"Z\"",
    `    timeCodesPerSecond = ${fps}`,
    `    framesPerSecond = ${fps}`,
    `    startTimeCode = ${start}`,
    `    endTimeCode = ${end}`,
  ];
  if (sublayers.length) {
    header.push("    subLayers = [");
    sublayers.forEach((layer) => header.push(`        @${layer}@,`));
    header.push("    ]");
  }
  header.push(")", "");

  const worldPrim = identifier(input.default_prim || "World", "World");
  const body = [
    `def Xform ${quote(worldPrim)}`,
    "{",
    ...builtAssets.flatMap((asset) => asset.lines),
    "}",
    "",
  ];
  const usda = [...header, ...body].join("\n");
  const manifest = {
    contract: AVANTIQO_USD_SCENE_COMPOSITION_CONTRACT,
    format: "USDA",
    meters_per_unit: 1,
    up_axis: "Z",
    frame_rate: fps,
    start_time_code: start,
    end_time_code: end,
    sublayers,
    assets: builtAssets.map((item, index) => ({
      prim_name: item.prim,
      reference_path: item.reference,
      source_asset_checksum: text(assets[index].source_asset_checksum) || null,
      interchange_hash: text(assets[index].interchange_hash) || null,
      variant_sets: list(assets[index].variant_sets).map((set) => ({
        name: identifier(set.name, "variant"),
        options: list(set.options).map((option) => identifier(option, "Option")),
        selected: identifier(set.selected || list(set.options)[0], "Option"),
      })),
    })),
    policies: {
      destructive_mesh_merge_forbidden: true,
      references_preferred_over_flattened_copies: true,
      variants_must_be_non_destructive: true,
      physical_units_locked_to_meters: true,
      z_up_locked: true,
      shot_timecode_required: true,
    },
  };
  return {
    ...manifest,
    status: "READY",
    usda,
    bytes: Buffer.byteLength(usda, "utf8"),
    checksum: hash(usda),
    composition_hash: hash(JSON.stringify(manifest)),
  };
}

export const CreativeUsdSceneCompositionRuntime = Object.freeze({
  contract: AVANTIQO_USD_SCENE_COMPOSITION_CONTRACT,
  author: authorUsdSceneComposition,
});
