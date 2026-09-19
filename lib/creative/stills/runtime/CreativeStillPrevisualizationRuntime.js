import crypto from "node:crypto";

const CONTRACT = "CREATIVE_STILL_PREVISUALIZATION_BLUEPRINT_V1";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
function geometry(outputSpec = {}) {
  const output = object(outputSpec);
  const width = finite(output.width || output.pixel_width || output.width_px);
  const height = finite(output.height || output.pixel_height || output.height_px);
  const aspect = text(output.aspect_ratio || output.aspectRatio);

  let ratio = width && height ? width / height : null;
  if (!ratio && aspect.includes(":")) {
    const [left, right] = aspect.split(":").map(Number);
    if (Number.isFinite(left) && Number.isFinite(right) && left > 0 && right > 0) {
      ratio = left / right;
    }
  }

  return {
    width,
    height,
    aspect_ratio: aspect || (ratio ? `${Number(ratio.toFixed(4))}:1` : null),
    ratio,
    orientation: ratio === null ? null : ratio > 1.08 ? "LANDSCAPE" : ratio < 0.92 ? "PORTRAIT" : "SQUARE",
  };
}

function normalizedZone(id, role, x, y, width, height, extra = {}) {
  return Object.freeze({ id, role, x, y, width, height, unit: "NORMALIZED", ...extra });
}
function fallbackZones(orientation) {
  const safe = normalizedZone("safe", "SAFE_AREA", 0.05, 0.05, 0.9, 0.9, { protected: true });
  if (orientation === "LANDSCAPE") {
    return [
      safe,
      normalizedZone("hero", "HERO", 0.05, 0.08, 0.56, 0.84),
      normalizedZone("negative-space", "NEGATIVE_SPACE", 0.64, 0.08, 0.31, 0.64),
      normalizedZone("brand", "BRAND", 0.66, 0.08, 0.27, 0.1, { deterministic_layer: true }),
      normalizedZone("copy", "COPY", 0.64, 0.22, 0.31, 0.42, { deterministic_layer: true }),
      normalizedZone("cta", "CTA", 0.64, 0.76, 0.31, 0.16, { deterministic_layer: true }),
    ];
  }
  return [
    safe,
    normalizedZone("brand", "BRAND", 0.08, 0.06, 0.84, 0.1, { deterministic_layer: true }),
    normalizedZone("copy", "COPY", 0.08, 0.17, 0.84, 0.18, { deterministic_layer: true }),
    normalizedZone("hero", "HERO", 0.05, 0.34, 0.9, 0.46),
    normalizedZone("negative-space", "NEGATIVE_SPACE", 0.08, 0.17, 0.84, 0.18),
    normalizedZone("cta", "CTA", 0.08, 0.82, 0.84, 0.12, { deterministic_layer: true }),
  ];
}

function explicitZones(requirements = {}, roleDecisions = {}) {
  const direct = list(requirements.composition_zones || requirements.layout_zones);
  if (direct.length) return direct;
  const composition = object(roleDecisions.composition || roleDecisions.graphic_design || roleDecisions.art_direction);
  return list(composition.zones || composition.composition_zones || composition.layout_zones);
}
function validZone(zone = {}) {
  const x = Number(zone.x);
  const y = Number(zone.y);
  const width = Number(zone.width);
  const height = Number(zone.height);
  return [x, y, width, height].every(Number.isFinite) &&
    x >= 0 && y >= 0 && width > 0 && height > 0 &&
    x + width <= 1.000001 && y + height <= 1.000001;
}

function normalizeExplicitZones(zones = []) {
  return zones.map((zone, index) => ({
    ...object(zone),
    id: text(zone.id) || `zone-${index + 1}`,
    role: text(zone.role).toUpperCase() || "CONTENT",
    unit: "NORMALIZED",
    x: Number(zone.x),
    y: Number(zone.y),
    width: Number(zone.width),
    height: Number(zone.height),
  }));
}

function deterministicLayers(requirements = {}) {
  const expected = object(requirements.expected_contract);
  return Object.freeze({
    logo: expected.brand_expected === true || requirements.exact_brand_assets_required === true,
    typography: true,
    copy: true,
    pricing_and_business_data: true,
    qr_and_barcode: true,
    legal_copy: true,
    generated_text_pixels_forbidden: true,
    generated_logo_pixels_forbidden: true,
  });
}
export function buildCreativeStillPrevisualizationBlueprint({
  deliverable = {},
  step = {},
  requirements = {},
  role_decisions = {},
  output_spec = {},
} = {}) {
  const canvas = geometry(output_spec);
  const failures = [];
  if (!canvas.ratio) failures.push("STILL_PREVIS_OUTPUT_GEOMETRY_REQUIRED");

  const authored = explicitZones(requirements, role_decisions);
  const zones = authored.length
    ? normalizeExplicitZones(authored)
    : canvas.orientation
      ? fallbackZones(canvas.orientation)
      : [];

  if (!zones.length) failures.push("STILL_PREVIS_COMPOSITION_ZONES_REQUIRED");
  for (const zone of zones) {
    if (!validZone(zone)) failures.push(`STILL_PREVIS_ZONE_INVALID:${zone.id}`);
  }
  if (!zones.some((zone) => zone.role === "HERO")) {
    failures.push("STILL_PREVIS_HERO_ZONE_REQUIRED");
  }
  if (!zones.some((zone) => zone.role === "NEGATIVE_SPACE")) {
    failures.push("STILL_PREVIS_NEGATIVE_SPACE_REQUIRED");
  }

  const payload = {
    deliverable_id: deliverable.id || null,
    deliverable_type: deliverable.type || null,
    production_step_id: step.id || null,
    purpose: deliverable.purpose || step.purpose || null,
    channels: list(deliverable.channels),
    languages: list(deliverable.languages),
    canvas,
    zones,
    zone_authority: authored.length ? "DIRECTOR_AUTHORED" : "GEOMETRY_DERIVED",
    role_decisions: object(role_decisions),
    deterministic_layers: deterministicLayers(requirements),
    generation_constraints: {
      visual_material_only: true,
      preserve_negative_space: true,
      obey_focal_logic: true,
      typography_generated_in_pixels: false,
      logo_generated_in_pixels: false,
      business_data_generated_in_pixels: false,
      composition_must_support_downstream_exact_design: true,
    },
  };

  return Object.freeze({
    contract: CONTRACT,
    passed: failures.length === 0,
    failures: [...new Set(failures)],
    blueprint_digest: digest({ contract: CONTRACT, payload }),
    payload,
    zero_provider_calls: true,
    zero_media_generation: true,
    paid_generation_authority: false,
  });
}

export function verifyCreativeStillPrevisualizationBlueprint(value = {}) {
  const blueprint = object(value);
  if (blueprint.contract !== CONTRACT) return false;
  if (blueprint.passed !== true) return false;
  if (blueprint.zero_provider_calls !== true || blueprint.zero_media_generation !== true) return false;
  if (blueprint.paid_generation_authority !== false) return false;
  if (!text(blueprint.blueprint_digest)) return false;
  return blueprint.blueprint_digest === digest({
    contract: CONTRACT,
    payload: object(blueprint.payload),
  });
}

export const CreativeStillPrevisualizationRuntime = Object.freeze({
  contract: CONTRACT,
  build: buildCreativeStillPrevisualizationBlueprint,
  verify: verifyCreativeStillPrevisualizationBlueprint,
});

export default CreativeStillPrevisualizationRuntime;
