import crypto from "node:crypto";

export const CREATIVE_IMAGE_VISUAL_BIBLE_CONTRACT = "CREATIVE_IMAGE_VISUAL_BIBLE_V1";

const CLASSES = Object.freeze([
  "CHARACTER",
  "PRODUCT",
  "LOCATION",
  "PROP",
  "VEHICLE",
  "CREATURE",
  "WARDROBE",
  "MATERIAL",
  "STYLE",
]);

function list(value){ return Array.isArray(value) ? value.filter(Boolean) : []; }
function text(value){ return String(value ?? "").trim(); }
function object(value){ return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function stable(value){ if(Array.isArray(value)) return value.map(stable); if(!value || typeof value !== "object") return value; return Object.fromEntries(Object.keys(value).sort().map((key)=>[key,stable(value[key])])); }
function digest(value){ return crypto.createHash("sha256").update(JSON.stringify(stable(value))).digest("hex"); }
function approved(node={}){ return node.status === "APPROVED" || node.review?.approved === true || node.metadata?.release_approved === true; }
function tags(node={}){ return list(node.intelligence?.tags || node.tags).map((tag)=>text(tag).toUpperCase()); }
function metadata(node={}){ return object(node.metadata); }

function assetClass(node={}){
  const m = metadata(node);
  const explicit = text(m.visual_bible_class || m.image_asset_class || m.asset_class).toUpperCase();
  if(CLASSES.includes(explicit)) return explicit;
  const haystack = [node.name,node.description,...tags(node),m.reference_role,m.role,m.identity_type].map(text).join(" ").toUpperCase();
  const rules = [
    ["CHARACTER", /CHARACTER|PERSON|TALENT|ACTOR|IDENTITY|PORTRAIT/],
    ["PRODUCT", /PRODUCT|PACKAGING|SKU|BOTTLE|DEVICE|DISH/],
    ["LOCATION", /LOCATION|ENVIRONMENT|WORLD|SET|INTERIOR|EXTERIOR|ARCHITECTURE/],
    ["PROP", /PROP|SET DRESSING|OBJECT/],
    ["VEHICLE", /VEHICLE|CAR|MOTORCYCLE|AIRCRAFT|HELICOPTER|BOAT|SHIP/],
    ["CREATURE", /CREATURE|ANIMAL/],
    ["WARDROBE", /WARDROBE|COSTUME|CLOTHING|OUTFIT/],
    ["MATERIAL", /MATERIAL|SURFACE|FABRIC|WOOD|METAL|GLASS|PAINT/],
    ["STYLE", /STYLE|LOOK|MOODBOARD|ART DIRECTION|COLOR SCRIPT/],
  ];
  return rules.find(([,pattern])=>pattern.test(haystack))?.[0] || null;
}

function identityKey(node={}, cls=null){
  const m = metadata(node);
  return text(
    m.visual_bible_identity_key ||
    m.subject_identity_key ||
    m.identity_key ||
    m.identity_profile_id ||
    m.product_identity_key ||
    m.product_id ||
    m.location_identity_key ||
    m.location_id ||
    m.prop_identity_key ||
    m.vehicle_identity_key ||
    m.creature_identity_key ||
    m.wardrobe_identity_key ||
    m.material_identity_key ||
    m.style_identity_key ||
    (cls && node.name ? `${cls.toLowerCase()}:${text(node.name).toLowerCase()}` : "")
  ) || null;
}

function evidence(node={}){
  const m = metadata(node);
  return {
    asset_node_id: node.id || null,
    url: node.url || node.image_url || node.file_url || null,
    checksum: node.technical?.checksum || null,
    status: node.status || null,
    approved: approved(node),
    perceptual_qc_sealed: m.image_asset_perceptual_qc_sealed === true,
    pack_qc_sealed: m.image_asset_pack_qc_sealed === true,
    release_approved: m.release_approved === true,
    reusable: node.reuse?.approved_for_reuse === true || node.reuse?.reusable === true,
  };
}

export function buildImageVisualBible({ asset_nodes = [], requirements = {} } = {}) {
  const grouped = new Map();
  for(const node of list(asset_nodes)){
    const cls = assetClass(node);
    if(!cls) continue;
    const key = identityKey(node, cls);
    if(!key) continue;
    const mapKey = `${cls}:${key}`;
    if(!grouped.has(mapKey)) grouped.set(mapKey,{ class:cls, identity_key:key, nodes:[] });
    grouped.get(mapKey).nodes.push(node);
  }

  const entities = [...grouped.values()].map((entry)=>{
    const approvedNodes = entry.nodes.filter(approved);
    const authoritative = approvedNodes.find((node)=>metadata(node).visual_bible_authoritative === true) ||
      approvedNodes.find((node)=>metadata(node).image_asset_perceptual_qc_sealed === true) ||
      approvedNodes[0] || null;
    const conflicts = approvedNodes.filter((node)=>node.id !== authoritative?.id && metadata(node).visual_bible_authoritative === true).map((node)=>node.id);
    const authority = authoritative ? evidence(authoritative) : null;
    const locked = Boolean(authority?.approved && authority?.url);
    return {
      class: entry.class,
      identity_key: entry.identity_key,
      label: authoritative?.name || entry.nodes[0]?.name || entry.identity_key,
      locked,
      authoritative_asset_node_id: authoritative?.id || null,
      authority,
      evidence: entry.nodes.map(evidence),
      conflicting_authority_asset_node_ids: conflicts,
      policy: {
        downstream_may_reinterpret_identity: false,
        silent_identity_substitution_forbidden: true,
        repairs_must_preserve_identity_key: true,
        new_authority_requires_explicit_review: true,
      },
    };
  }).sort((a,b)=>`${a.class}:${a.identity_key}`.localeCompare(`${b.class}:${b.identity_key}`));

  const requiredClasses = new Set(list(requirements.required_classes).map((value)=>text(value).toUpperCase()).filter((value)=>CLASSES.includes(value)));
  const missingRequiredClasses = [...requiredClasses].filter((cls)=>!entities.some((entity)=>entity.class===cls && entity.locked));
  const conflicts = entities.flatMap((entity)=>entity.conflicting_authority_asset_node_ids.map((asset_node_id)=>({ class:entity.class, identity_key:entity.identity_key, asset_node_id })));
  const payload = {
    contract: CREATIVE_IMAGE_VISUAL_BIBLE_CONTRACT,
    entity_classes: CLASSES,
    entities,
    required_classes: [...requiredClasses],
    missing_required_classes: missingRequiredClasses,
    conflicting_authorities: conflicts,
    policies: {
      shared_between_image_and_video_studios: true,
      image_studio_owns_visual_authority_materialization: true,
      video_studio_consumes_approved_visual_authority: true,
      same_identity_key_must_resolve_to_same_authority_until_explicit_change: true,
      works_for_single_asset_campaign_and_long_form_story: true,
    },
  };
  return Object.freeze({
    ...payload,
    ready: missingRequiredClasses.length === 0 && conflicts.length === 0,
    bible_digest: digest(payload),
  });
}

export const CreativeImageVisualBibleRuntime = Object.freeze({
  contract: CREATIVE_IMAGE_VISUAL_BIBLE_CONTRACT,
  entity_classes: CLASSES,
  build: buildImageVisualBible,
});

export default CreativeImageVisualBibleRuntime;
