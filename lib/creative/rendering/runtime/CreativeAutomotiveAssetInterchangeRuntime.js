import crypto from "node:crypto";

export const AVANTIQO_AUTOMOTIVE_ASSET_INTERCHANGE_CONTRACT =
  "AVANTIQO_AUTOMOTIVE_ASSET_INTERCHANGE_V1";

const INTERCHANGE_FORMATS = new Set(["USD", "USDA", "USDC", "ABC"]);
const CAD_SOURCES = new Set(["STEP", "STP", "IGES", "IGS", "CATPART", "CATPRODUCT", "JT"]);

function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}
function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}
export function evaluateAutomotiveAssetInterchange(input = {}) {
  const format = text(input.interchange_format || input.format).toUpperCase();
  const sourceCadFormat = text(input.source_cad_format).toUpperCase();
  const blockers = [];

  if (!INTERCHANGE_FORMATS.has(format)) blockers.push("AUTOMOTIVE_INTERCHANGE_USD_OR_ALEMBIC_REQUIRED");
  if (sourceCadFormat && !CAD_SOURCES.has(sourceCadFormat)) blockers.push("AUTOMOTIVE_SOURCE_CAD_FORMAT_UNSUPPORTED");
  if (!text(input.source_asset_checksum)) blockers.push("AUTOMOTIVE_SOURCE_CHECKSUM_REQUIRED");
  if (!text(input.conversion_manifest_id)) blockers.push("AUTOMOTIVE_CONVERSION_MANIFEST_REQUIRED");
  if (finite(input.meters_per_unit, null) !== 1) blockers.push("AUTOMOTIVE_METERS_PER_UNIT_MUST_EQUAL_1");
  if (!["Z_UP", "Y_UP"].includes(text(input.up_axis).toUpperCase())) blockers.push("AUTOMOTIVE_UP_AXIS_REQUIRED");
  if (input.part_hierarchy_preserved !== true) blockers.push("AUTOMOTIVE_PART_HIERARCHY_REQUIRED");
  if (input.material_assignments_preserved !== true) blockers.push("AUTOMOTIVE_MATERIAL_ASSIGNMENTS_REQUIRED");
  if (input.normals_validated !== true) blockers.push("AUTOMOTIVE_NORMALS_VALIDATION_REQUIRED");
  if (input.uvs_validated !== true) blockers.push("AUTOMOTIVE_UV_VALIDATION_REQUIRED");
  if (input.wheel_pivots_validated !== true) blockers.push("AUTOMOTIVE_WHEEL_PIVOTS_REQUIRED");
  if (input.vehicle_dimensions_validated !== true) blockers.push("AUTOMOTIVE_DIMENSIONS_VALIDATION_REQUIRED");
  const body = {
    contract: AVANTIQO_AUTOMOTIVE_ASSET_INTERCHANGE_CONTRACT,
    interchange_format: format || null,
    source_cad_format: sourceCadFormat || null,
    source_asset_checksum: text(input.source_asset_checksum) || null,
    conversion_manifest_id: text(input.conversion_manifest_id) || null,
    meters_per_unit: finite(input.meters_per_unit, null),
    up_axis: text(input.up_axis).toUpperCase() || null,
    part_hierarchy_preserved: input.part_hierarchy_preserved === true,
    material_assignments_preserved: input.material_assignments_preserved === true,
    normals_validated: input.normals_validated === true,
    uvs_validated: input.uvs_validated === true,
    udim_sets: list(input.udim_sets).map(text),
    wheel_pivots_validated: input.wheel_pivots_validated === true,
    vehicle_dimensions_validated: input.vehicle_dimensions_validated === true,
    named_part_groups: list(input.named_part_groups).map(text),
    policy: {
      destructive_mesh_merge_forbidden: true,
      source_cad_provenance_required_when_cad_derived: true,
      render_scale_must_be_physical: true,
      wheel_and_steering_articulation_must_survive_ingest: true,
    },
  };
  return {
    ...body,
    status: blockers.length ? "BLOCKED" : "READY",
    blockers,
    interchange_hash: hash(body),
  };
}

export const CreativeAutomotiveAssetInterchangeRuntime = Object.freeze({
  contract: AVANTIQO_AUTOMOTIVE_ASSET_INTERCHANGE_CONTRACT,
  supported_interchange_formats: Object.freeze([...INTERCHANGE_FORMATS]),
  supported_cad_source_formats: Object.freeze([...CAD_SOURCES]),
  evaluate: evaluateAutomotiveAssetInterchange,
});
