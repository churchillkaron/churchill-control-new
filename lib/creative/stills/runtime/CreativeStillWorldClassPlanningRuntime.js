const CONTRACT = "CREATIVE_STILL_WORLD_CLASS_PLAN_V1";

const BASELINE_ROLES = Object.freeze([
  "executive_creative_director",
  "strategy_director",
  "brand_director",
  "art_director",
  "asset_intelligence_director",
  "quality_director",
  "rights_safety_director",
  "release_director",
]);

const WORLD_CLASS_FLOORS = Object.freeze({
  overall: 95,
  critical_visual_dimension: 94,
  hero_frame: 96,
  identity: 96,
  product_fidelity: 96,
  brand_fidelity: 98,
  copy_accuracy: 100,
  typography_accuracy: 100,
  logo_fidelity: 100,
  governed_business_data: 100,
});

function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function text(value) { return String(value ?? "").trim(); }
function words(value) { return text(value).toLowerCase(); }
function unique(values) { return [...new Set(list(values).flat(Infinity).filter(Boolean))]; }

function contextText(input = {}) {
  return [
    input.mission?.title,
    input.mission?.business_goal,
    input.project?.name,
    input.project?.objective,
    input.brief?.title,
    input.brief?.creative_objective,
    input.brief?.deliverable,
    input.brief?.format,
    ...list(input.deliverables).flatMap((item) => [item?.type, item?.purpose, ...list(item?.channels)]),
  ].map(text).filter(Boolean).join(" ").toLowerCase();
}

function hasAny(haystack, terms) { return terms.some((term) => haystack.includes(term)); }

function mediaSignals(assets = []) {
  const result = { images: 0, references: 0, identity: 0, product: 0, brand: 0, style: 0, location: 0, vector: 0 };
  for (const asset of list(assets)) {
    const type = words(asset?.asset_type || asset?.mime_type || asset?.type);
    const role = words(asset?.role || asset?.reference_role || asset?.metadata?.reference_role);
    const tags = list(asset?.tags).map(words).join(" ");
    if (type.includes("image") || /png|jpe?g|webp|avif|gif/.test(type)) result.images += 1;
    if (role.includes("reference") || tags.includes("reference")) result.references += 1;
    if (role.includes("identity") || tags.includes("identity") || tags.includes("person")) result.identity += 1;
    if (role.includes("product") || tags.includes("product")) result.product += 1;
    if (role.includes("brand") || tags.includes("brand") || tags.includes("logo")) result.brand += 1;
    if (role.includes("style") || tags.includes("style") || tags.includes("moodboard") || asset?.metadata?.visual_bible_class === "STYLE") result.style += 1;
    if (role.includes("location") || tags.includes("location") || asset?.metadata?.visual_bible_class === "LOCATION") result.location += 1;
    if (type.includes("svg") || type.includes("vector") || tags.includes("vector")) result.vector += 1;
  }
  return result;
}

export function planCreativeStillWorldClassProduction(input = {}) {
  const corpus = contextText(input);
  const assets = mediaSignals(input.assets);
  const deliverables = list(input.deliverables);
  const channels = unique(deliverables.flatMap((item) => list(item?.channels)));

  const designHeavy = hasAny(corpus, ["poster", "banner", "advert", " ad ", "flyer", "menu", "brochure", "social", "carousel", "thumbnail", "signage", "graphic", "campaign"]);
  const copyHeavy = designHeavy || hasAny(corpus, ["price", "offer", "headline", "cta", "legal", "copy", "text"]);
  const photographic = hasAny(corpus, ["photo", "portrait", "fashion", "food", "restaurant", "product", "editorial", "lifestyle", "realistic", "photoreal"]);
  const identityRequired = assets.identity > 0 || hasAny(corpus, ["portrait", "artist", "singer", "actor", "person", "talent", "founder", "staff", "model"]);
  const productRequired = assets.product > 0 || hasAny(corpus, ["product", "packaging", "bottle", "vehicle", "device", "dish", "food", "merchandise"]);
  const vectorRequired = assets.vector > 0 || hasAny(corpus, ["logo", "icon", "vector", "illustration", "infographic", "diagram", "signage"]);
  const printRequired = hasAny(corpus, ["print", "poster", "flyer", "menu", "brochure", "business card", "rollup", "signage", "a4", "a3"]);
  const multiFormat = channels.length > 1 || deliverables.length > 1 || hasAny(corpus, ["campaign", "variants", "formats", "story and feed", "social set"]);
  const sourceEditing = assets.images > 0 || hasAny(corpus, ["edit", "retouch", "repair", "remove", "replace", "relight", "extend", "outpaint", "inpaint", "background"]);
  const persistentWorld = hasAny(corpus, ["campaign", "series", "film", "movie", "book", "novel", "character", "location", "world", "scene", "story", "continuity", "vehicle", "wardrobe", "costume", "prop", "environment"]);
  const locationRequired = hasAny(corpus, ["location", "hotel", "restaurant", "street", "city", "beach", "house", "office", "factory", "forest", "monaco", "phuket", "environment", "world"]);
  const productionDesignRequired = persistentWorld || hasAny(corpus, ["set", "production design", "architecture", "interior", "exterior", "material", "surface", "prop", "wardrobe", "costume"]);

  const controls = {
    business_intent: true,
    subject_identity: identityRequired,
    product_fidelity: productRequired,
    style_system: designHeavy || photographic || assets.style > 0,
    composition_structure: true,
    local_editing: sourceEditing,
    exact_design: designHeavy || copyHeavy || printRequired,
    premium_graphic_benchmark: designHeavy,
    premium_advertising_benchmark: designHeavy || hasAny(corpus, ["advert", " ad ", "campaign", "commercial", "launch", "brand film", "hero campaign"]),
    vector_master: vectorRequired,
    format_adaptation: multiFormat,
    print_engineering: printRequired,
    independent_review: true,
    release_evidence: true,
    persistent_visual_bible: persistentWorld || identityRequired || productRequired || locationRequired,
    location_authority: locationRequired,
    production_design_authority: productionDesignRequired,
  };

  const roles = [...BASELINE_ROLES];
  if (copyHeavy) roles.push("copy_director");
  if (designHeavy || printRequired) roles.push("graphic_design_director", "typography_director");
  if (photographic) roles.push("director_of_photography", "image_retouching_director", "color_di_supervisor");
  if (sourceEditing) roles.push("image_retouching_director", "compositing_supervisor");
  if (photographic || designHeavy || sourceEditing || multiFormat) roles.push("post_production_supervisor");
  if (identityRequired) roles.push("talent_performance_director");
  if (productRequired) roles.push("product_capability_director");
  if (vectorRequired) roles.push("graphic_design_director");
  if (productionDesignRequired) roles.push("production_designer", "cg_asset_supervisor");
  if (locationRequired) roles.push("location_production_supervisor");

  const departments = [
    { id: "direction", required: true, owner_roles: ["executive_creative_director", "strategy_director", "brand_director", "art_director"] },
    { id: "reference_intelligence", required: controls.subject_identity || controls.product_fidelity || controls.style_system, owner_roles: ["asset_intelligence_director", "brand_director"] },
    { id: "visual_bible", required: controls.persistent_visual_bible, owner_roles: ["asset_intelligence_director", "art_director", "production_designer", "brand_director"] },
    { id: "world_building", required: controls.production_design_authority || controls.location_authority, owner_roles: ["production_designer", "location_production_supervisor", "cg_asset_supervisor", "art_director"] },
    { id: "visual_creation", required: true, owner_roles: photographic ? ["art_director", "director_of_photography"] : ["art_director", "graphic_design_director"] },
    { id: "design_composition", required: controls.exact_design, owner_roles: ["graphic_design_director", "typography_director", "copy_director"] },
    { id: "retouch_composite", required: controls.local_editing || photographic, owner_roles: ["image_retouching_director", "compositing_supervisor", "color_di_supervisor"] },
    { id: "adaptation", required: controls.format_adaptation || controls.print_engineering, owner_roles: ["graphic_design_director", "release_director"] },
    { id: "independent_quality", required: true, owner_roles: ["quality_director", "brand_director", "rights_safety_director"] },
    { id: "release", required: true, owner_roles: ["release_director"] },
  ].filter((department) => department.required);

  return Object.freeze({
    contract: CONTRACT,
    prompt_free: true,
    dynamic: true,
    provider_selection_user_visible: false,
    provider_prompt_boundary: "EXECUTION_TRANSPORT_ONLY",
    signals: { design_heavy: designHeavy, copy_heavy: copyHeavy, photographic, identity_required: identityRequired, product_required: productRequired, vector_required: vectorRequired, print_required: printRequired, multi_format: multiFormat, source_editing: sourceEditing, persistent_world: persistentWorld, location_required: locationRequired, production_design_required: productionDesignRequired },
    controls,
    active_role_ids: unique(roles),
    departments,
    quality_floors: WORLD_CLASS_FLOORS,
    premium_graphic_benchmark: designHeavy ? {
      id: "PREMIUM_EDITORIAL_AUTOMOTIVE_MINIMUM_V1",
      required: true,
      principles: ["cinematic_hero_dominance", "controlled_negative_space", "disciplined_typography", "exact_alignment", "restrained_palette", "modular_detail_crops", "zero_decorative_clutter"],
      typography_floor: 97,
      alignment_floor: 97,
      critical_design_floor: 95,
    } : null,
    review_policy: {
      independent_creation_and_review: true,
      average_score_cannot_hide_critical_failure: true,
      bounded_repair_before_whole_regeneration: true,
      source_truth_over_aesthetic_convenience: true,
      exact_copy_logo_and_business_data_fail_closed: true,
    },
  });
}

export const CreativeStillWorldClassPlanningRuntime = Object.freeze({
  contract: CONTRACT,
  floors: WORLD_CLASS_FLOORS,
  plan: planCreativeStillWorldClassProduction,
});

export default CreativeStillWorldClassPlanningRuntime;
