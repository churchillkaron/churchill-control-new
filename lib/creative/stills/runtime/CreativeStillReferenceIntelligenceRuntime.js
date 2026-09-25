const CONTRACT = "CREATIVE_STILL_REFERENCE_INTELLIGENCE_V1";

const ROLE_ORDER = Object.freeze([
  "IDENTITY_REFERENCE",
  "PRODUCT_REFERENCE",
  "BRAND_REFERENCE",
  "COMPOSITION_REFERENCE",
  "STYLE_REFERENCE",
  "LOCATION_REFERENCE",
  "SOURCE_IMAGE",
]);

function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function text(value) { return String(value ?? "").trim(); }
function upper(value) { return text(value).toUpperCase(); }
function words(value) { return text(value).toLowerCase(); }
function unique(values) { return [...new Set(list(values).flat(Infinity).filter(Boolean))]; }

function explicitRole(asset = {}) {
  const value = upper(asset.role || asset.reference_role || asset.metadata?.reference_role);
  return ROLE_ORDER.includes(value) ? value : null;
}

function inferRole(asset = {}) {
  const explicit = explicitRole(asset);
  if (explicit) return { role: explicit, source: "EXPLICIT" };
  const visualBibleClass = upper(asset.metadata?.visual_bible_class || asset.metadata?.asset_class);
  if (visualBibleClass === "CHARACTER") return { role: "IDENTITY_REFERENCE", source: "VISUAL_BIBLE" };
  if (["PRODUCT", "VEHICLE"].includes(visualBibleClass)) return { role: "PRODUCT_REFERENCE", source: "VISUAL_BIBLE" };
  if (visualBibleClass === "LOCATION") return { role: "LOCATION_REFERENCE", source: "VISUAL_BIBLE" };
  if (visualBibleClass === "STYLE") return { role: "STYLE_REFERENCE", source: "VISUAL_BIBLE" };
  const corpus = [asset.name, asset.title, asset.file_name, asset.description, ...list(asset.tags)]
    .map(words).join(" ");
  const type = words(asset.asset_type || asset.mime_type || asset.type);
  if (/identity|portrait|headshot|person|talent|artist|model|face/.test(corpus)) return { role: "IDENTITY_REFERENCE", source: "INFERRED" };
  if (/product|packaging|bottle|dish|food|vehicle|device|merchandise/.test(corpus)) return { role: "PRODUCT_REFERENCE", source: "INFERRED" };
  if (/brand|logo|wordmark|brandmark|guideline|identity system/.test(corpus)) return { role: "BRAND_REFERENCE", source: "INFERRED" };
  if (/composition|layout|framing|structure|pose|depth|placement/.test(corpus)) return { role: "COMPOSITION_REFERENCE", source: "INFERRED" };
  if (/style|mood|palette|lighting|texture|look|aesthetic/.test(corpus)) return { role: "STYLE_REFERENCE", source: "INFERRED" };
  if (/location|venue|place|building|interior|exterior|geography/.test(corpus)) return { role: "LOCATION_REFERENCE", source: "INFERRED" };
  if (type.includes("image") || /png|jpe?g|webp|avif|gif/.test(type)) return { role: "SOURCE_IMAGE", source: "INFERRED" };
  return { role: null, source: "UNRESOLVED" };
}

export function resolveCreativeStillReferences({ assets = [], requirements = {} } = {}) {
  const resolved = [];
  const unresolved = [];
  for (const asset of list(assets)) {
    const assignment = inferRole(asset);
    const entry = {
      asset_id: asset.id || asset.asset_id || null,
      name: asset.name || asset.title || asset.file_name || null,
      role: assignment.role,
      role_source: assignment.source,
      source_background_policy: assignment.role === "IDENTITY_REFERENCE" ? "EXCLUDE_UNLESS_EXPLICITLY_ASSIGNED" : "ALLOW_AS_ROLE_REQUIRES",
      style_authority: assignment.role === "STYLE_REFERENCE",
      identity_authority: assignment.role === "IDENTITY_REFERENCE",
      product_truth_authority: assignment.role === "PRODUCT_REFERENCE",
      brand_truth_authority: assignment.role === "BRAND_REFERENCE",
      composition_authority: assignment.role === "COMPOSITION_REFERENCE",
      location_truth_authority: assignment.role === "LOCATION_REFERENCE",
    };
    if (assignment.role) resolved.push(entry);
    else unresolved.push(entry);
  }

  const byRole = Object.fromEntries(ROLE_ORDER.map((role) => [role, resolved.filter((entry) => entry.role === role)]));
  const gaps = [];
  if (requirements.identity_required === true && !byRole.IDENTITY_REFERENCE.length) gaps.push("IDENTITY_REFERENCE_REQUIRED");
  if (requirements.product_required === true && !byRole.PRODUCT_REFERENCE.length) gaps.push("PRODUCT_REFERENCE_REQUIRED");
  if (requirements.brand_required === true && !byRole.BRAND_REFERENCE.length) gaps.push("BRAND_REFERENCE_REQUIRED");
  if (requirements.style_required === true && !byRole.STYLE_REFERENCE.length) gaps.push("STYLE_REFERENCE_REQUIRED");
  if (requirements.composition_required === true && !byRole.COMPOSITION_REFERENCE.length) gaps.push("COMPOSITION_REFERENCE_REQUIRED");
  if (requirements.location_required === true && !byRole.LOCATION_REFERENCE.length) gaps.push("LOCATION_REFERENCE_REQUIRED");

  return Object.freeze({
    contract: CONTRACT,
    prompt_free: true,
    resolved,
    unresolved,
    by_role: byRole,
    gaps: unique(gaps),
    ready: gaps.length === 0,
    policies: {
      reference_roles_are_independent: true,
      identity_backgrounds_are_not_style_authority: true,
      style_reference_is_not_identity_authority: true,
      composition_reference_is_not_brand_truth: true,
      source_truth_cannot_be_inferred_from_style: true,
    },
  });
}

export const CreativeStillReferenceIntelligenceRuntime = Object.freeze({ contract: CONTRACT, roles: ROLE_ORDER, resolve: resolveCreativeStillReferences });
export default CreativeStillReferenceIntelligenceRuntime;
