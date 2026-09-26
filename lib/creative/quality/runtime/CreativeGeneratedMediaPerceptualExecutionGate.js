import { CreativeVisualExcellenceRuntime } from "./CreativeVisualExcellenceRuntime.js";
import { CreativeAssetGraphRuntime } from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";
import { CreativeCrossShotFingerprintRuntime } from "./CreativeCrossShotFingerprintRuntime.js";
import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  signCreativeStorageReference,
} from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";

const FLAG = Symbol.for(
  "avantiqo.creative.generated-media-perceptual-gate.v1",
);
const REVIEW_URL_TTL_SECONDS = 15 * 60;

const SCORE_FIELDS = Object.freeze({
  overall_score: "overall",
  story_score: "story",
  environment_score: "environment",
  camera_score: "camera",
  anatomy_score: "anatomy",
  identity_score: "identity",
  product_fidelity_score: "product_fidelity",
  music_energy_score: "music_energy",
  performance_score: "performance",
  continuity_score: "continuity",
  physics_score: "physics",
  artifact_score: "artifact",
  composition_score: "composition",
  aesthetic_distinction_score: "aesthetic_distinction",
  tension_curiosity_score: "tension_curiosity",
  production_value_score: "production_value",
  depth_atmosphere_score: "depth_atmosphere",
  environmental_aliveness_score: "environmental_aliveness",
});

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  if (
    value === null ||
    value === undefined ||
    (typeof value === "string" && !value.trim())
  ) {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(object(value), key);
}

function outputValue(output = {}) {
  return output?.output?.output || output?.output || output || {};
}

function outputUrl(output = {}) {
  const candidates = [
    output,
    output?.output?.output,
    output?.output,
    output?.provider_poll?.output?.output,
    output?.provider_poll?.output,
    output?.provider_submission?.output?.output,
    output?.provider_submission?.output,
  ].filter(Boolean);
  for (const value of candidates) {
    const reference = value.storage_reference ||
      value.storageReference ||
      value.asset_url ||
      value.assetUrl ||
      value.image_url ||
      value.imageUrl ||
      value.video_url ||
      value.videoUrl ||
      value.file_url ||
      value.fileUrl ||
      value.url ||
      value.result?.url ||
      (typeof value.result === "string" ? value.result : null) ||
      value.images?.[0]?.url ||
      value.files?.[0]?.url ||
      null;
    if (reference) return reference;
  }
  return null;
}

function normalizeReviewEvidence(value = {}) {
  const root = object(value);
  const nestedScores = object(root.scores);
  const normalized = { ...root };
  const missingFields = [];
  const invalidFields = [];
  const outOfRangeFields = [];
  const conflictingFields = [];
  const fieldSources = {};

  for (const [canonicalKey, aliasKeys] of Object.entries(SCORE_FIELDS)) {
    const aliases = Array.isArray(aliasKeys) ? aliasKeys : [aliasKeys];
    const candidates = [
      ["scores", canonicalKey, nestedScores],
      ...aliases.map((key) => ["scores", key, nestedScores]),
      ["root", canonicalKey, root],
      ...aliases.map((key) => ["root", key, root]),
    ]
      .filter(([, key, source]) => hasOwn(source, key))
      .map(([location, key, source]) => ({
        path: `${location}.${key}`,
        raw: source[key],
        numeric: finite(source[key]),
      }));

    fieldSources[canonicalKey] = candidates.map((candidate) => candidate.path);

    if (candidates.length === 0) {
      missingFields.push(canonicalKey);
      continue;
    }

    if (candidates.some((candidate) => candidate.numeric === null)) {
      invalidFields.push(canonicalKey);
      continue;
    }

    if (
      candidates.some(
        (candidate) => candidate.numeric < 0 || candidate.numeric > 100,
      )
    ) {
      outOfRangeFields.push(canonicalKey);
      continue;
    }

    const uniqueValues = [...new Set(
      candidates.map((candidate) => candidate.numeric),
    )];
    if (uniqueValues.length !== 1) {
      conflictingFields.push(canonicalKey);
      continue;
    }

    normalized[canonicalKey] = uniqueValues[0];
  }

  const complete =
    missingFields.length === 0 &&
    invalidFields.length === 0 &&
    outOfRangeFields.length === 0 &&
    conflictingFields.length === 0;

  if (finite(normalized.analyzed_image_count) === null) {
    const frameCount = finite(
      root.analysis_frame_count ?? root.source_asset_count ?? root.analyzed_image_count,
    );
    if (frameCount !== null) normalized.analyzed_image_count = frameCount;
  }

  normalized.score_contract = {
    contract: "GENERATED_MEDIA_PERCEPTUAL_SCORE_CONTRACT_V2",
    complete,
    canonical_field_count: Object.keys(SCORE_FIELDS).length,
    normalized_field_count: Object.keys(SCORE_FIELDS).filter(
      (key) => finite(normalized[key]) !== null,
    ).length,
    source_shape:
      Object.keys(nestedScores).length > 0 ? "NESTED_SCORES" : "FLAT_ROOT",
    missing_fields: missingFields,
    invalid_fields: invalidFields,
    out_of_range_fields: outOfRangeFields,
    conflicting_fields: conflictingFields,
    field_sources: fieldSources,
  };

  return normalized;
}

function resultEvidence(task = {}) {
  const outputs = [
    task.output?.raw?.output,
    task.output?.usage?.metadata?.provider_result?.output,
    task.output?.provider_poll?.usage?.metadata?.provider_result?.output,
    task.output?.output?.raw?.output,
    task.output?.provider_poll?.output?.raw?.output,
    outputValue(task.output),
  ].map(object).filter((value) => Object.keys(value).length);
  for (const root of outputs) {
    const candidate = root.result || root.review || root.validation || root;
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      const normalized = normalizeReviewEvidence({
        ...root,
        ...object(candidate),
      });
      if (normalized.score_contract?.normalized_field_count > 0) return normalized;
    }
    const source = text(candidate);
    if (!source) continue;
    const first = source.indexOf("{");
    const last = source.lastIndexOf("}");
    if (first < 0 || last <= first) continue;
    try {
      const parsed = JSON.parse(source.slice(first, last + 1));
      const normalized = normalizeReviewEvidence({
        ...root,
        ...object(parsed),
        ...object(parsed.result || parsed),
      });
      if (normalized.score_contract?.normalized_field_count > 0) return normalized;
    } catch {}
  }
  return normalizeReviewEvidence({});
}

async function dependencyTasks(task = {}) {
  const dependencies = [];
  for (const id of list(task.depends_on)) {
    const dependency = await ProductionTaskRuntime.get(id);
    if (dependency) dependencies.push(dependency);
  }
  return dependencies;
}

async function signedUrl(task, value) {
  if (!value) return null;
  return signCreativeStorageReference({
    organization_id: task.organization_id,
    reference: value,
    expires_in: REVIEW_URL_TTL_SECONDS,
  });
}

function expectation(task = {}) {
  return object(
    task.input?.requirements?.expected_contract ||
    task.metadata?.requirements?.expected_contract,
  );
}

function reviewMediaKind(task = {}) {
  return text(
    expectation(task).media_kind ||
    task.metadata?.media_kind ||
    task.input?.media_kind ||
    task.input?.provider_parameters?.media_kind,
  ).toUpperCase();
}

function thresholds(task = {}) {
  return {
    ...object(expectation(task).thresholds),
    ...object(task.input?.requirements?.thresholds),
    ...object(task.metadata?.thresholds),
  };
}

function referenceValues(task = {}, source = {}) {
  const expected = expectation(task);
  const values = [];
  const add = (value, role) => {
    if (!value) return;
    if (typeof value === "string") values.push({ url: value, role });
    else if (value.url) values.push({ ...value, role: value.role || role });
    else if (value.asset_id || value.id) values.push({ ...value, role: value.role || role });
  };

  add(
    expected.identity_requirements?.identity_atlas_url ||
    expected.identity_requirements?.identityAtlasUrl ||
    source.input?.identity_atlas_url ||
    source.input?.generation?.identity_lock?.identity_atlas_url,
    "IDENTITY_ATLAS",
  );
  add(
    source.input?.generation?.identity_lock?.approved_keyframe_url ||
    source.input?.identity_lock?.approved_keyframe_url,
    "APPROVED_IDENTITY_KEYFRAME",
  );
  for (const value of list(
    expected.identity_requirements?.reference_images ||
    source.input?.reference_images,
  )) add(value, "IDENTITY_REFERENCE");
  for (const value of list(expected.reference_asset_ids)) add({ asset_id: value }, "REFERENCE_ASSET");
  for (const value of list(expected.product_requirements?.reference_images)) add(value, "PRODUCT_REFERENCE");

  const seen = new Set();
  return values.filter((value) => {
    const key = text(value.url || value.asset_id || value.id);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function finishingReviewRules(source = {}) {
  const capability = text(source.capability || source.service_code || source.service_id).toLowerCase();
  const step = text(source.metadata?.production_step_id || source.metadata?.pass_id).toLowerCase();
  if (capability.includes("composite") || step === "composite") {
    return [
      "FINAL COMPOSITE REVIEW: inspect edge integration, occlusion, contact shadow, reflection continuity, depth-of-field match, motion-blur match, grain/texture match, atmospheric integration, exposure match and local color response.",
      "Reject cutout edges, matte chatter, alpha halos, spill, floating elements, depth disagreement, unmatched sharpness, different grain structures, pasted fog, detached volumetrics, inconsistent rain density or any layer that reads as composited rather than photographed together.",
      "Do not reward a clean composite if the scene still looks synthetic. The composite must reduce generative tells, not merely hide seams."
    ].join("\n- ");
  }
  if (capability.includes("optical-finish") || step === "optical-finish") {
    return [
      "OPTICAL FINISH REVIEW: judge lens integration and restraint. Distortion, chromatic aberration, bloom, halation, grain, vignette and highlight behavior must feel like one coherent capture system rather than stacked effects.",
      "Reject visible effect signatures: excessive halation, rainbow fringing, uniform digital grain, crushed detail, smeared highlights, artificial bloom, oversharpened edges, synthetic microcontrast or a generic 'film look' pasted over the image.",
      "Motion blur and depth of field must remain physically consistent with the authored lens/shutter/camera behavior; optical finishing may never rescue weak framing or poor material realism."
    ].join("\n- ");
  }
  if (capability.includes("color") || step.includes("color")) {
    return [
      "COLOR/DI REVIEW: judge black separation, highlight rolloff, skin and material hue integrity, shot-to-shot exposure continuity, saturation discipline, local contrast, shadow chroma and preservation of texture.",
      "Reject teal-orange defaults, lifted milky blacks used to hide artifacts, crushed blacks that erase production design, clipped highlights, radioactive saturation, synthetic skin hues, inconsistent forest greens, or grading that makes separate shots feel like unrelated worlds.",
      "The grade must preserve tactile material differences between wet bark, skin, cloth, metal, rain, fog and light; if materials collapse into one digital tonal texture, FAIL."
    ].join("\n- ");
  }
  return "";
}

function imageAssetReviewRules(source = {}) {
  const authority = object(source.input?.requirements?.image_asset_authority);
  const assetClass = text(authority.asset_class).toUpperCase();
  if (!assetClass) return "";
  const common = [
    "IMAGE STUDIO ASSET REVIEW: this is upstream production source material, not a decorative still.",
    "Reject generic AI beauty, concept-art shortcuts, plastic skin/materials, cloned natural geometry, default centered symmetry, weak silhouette, fake fog, decorative beams, broken anatomy, unreadable hands/feet, implausible optics, muddy blacks and overprocessed cinematic effects.",
    "The asset must be usable by downstream motion/VFX/compositing without forcing Video Studio to reinvent identity, geometry, environment or lighting.",
    "Approval requires premium visual authorship, tactile realism, clean production separation, continuity fidelity and downstream usability.",
    "ROLE TRUTH IS A HARD GATE: verify the pixels visibly perform the declared asset_class. Never approve a beautiful environment as CHARACTER_SHEET, a portrait as ENVIRONMENT_LOOKFRAME, or generic key art as a governed HERO_FRAME. If the visible role is wrong, passed must be false."
  ];
  const specific = {
    CHARACTER_SHEET: "CHARACTER_SHEET: identity, age, body proportions, wardrobe, hair and facial geometry must remain stable across front/3-quarter/profile evidence. Reject duplicated people, collage artifacts, inconsistent anatomy or beauty-filter drift.",
    HERO_FRAME: "HERO_FRAME: must survive as a world-class still before motion AND execute the exact authored frame-zero state. Verify opening-frame blocking, actor/threat relation, body mechanics, gaze, terrain/contact state, lens perspective, virtual-camera start, motivated light and editorial purpose. Reject generic poster poses, pre-action states that do not lead naturally into the planned movement, incorrect geography, fake tension, or any frame that needs later motion to make the composition/story work.",
    THREAT_DESIGN: "THREAT_DESIGN: geometry and silhouette must be stable enough for depth-aware integration. Reject generic sci-fi styling, decorative symmetry, scale ambiguity and surface detail that cannot remain coherent in motion.",
    ENVIRONMENT_LOOKFRAME: "ENVIRONMENT_LOOKFRAME: ecology, set density, wetness, terrain, atmosphere, practical light and material separation must feel photographed. Reject procedural repetition, clean CG corridors and fake volumetric decoration.",
    TRANSITION_LOOKFRAME: "TRANSITION_LOOKFRAME: require causal material/energy/form progression toward the brand. Reject electric-brain clip art, neon network overlays, random particles and logo pop-ins.",
    VFX_SOURCE: "VFX_SOURCE: require clean stable geometry, readable silhouette, integration-friendly edges, controlled lighting and no baked effects that conflict with downstream compositing.",
    COMPOSITING_SOURCE: "COMPOSITING_SOURCE: require clean separability, stable geometry, no hidden alpha/edge contamination, and no decorative grade/effects that belong downstream.",
    CONTINUITY_REFERENCE: "CONTINUITY_REFERENCE: exact identity/world/lighting state is authority. Reject any drift in wardrobe, wetness, threat geometry, environment structure, practical lights or camera language.",
    STORYBOARD_FRAME: "STORYBOARD_FRAME: blocking, geography, scale, threat relation and editorial purpose must be precise. Do not reward polish if spatial information is ambiguous.",
    MATERIAL_DETAIL_REFERENCE: "MATERIAL_DETAIL_REFERENCE: judge tactile surface truth and physically plausible light/material interaction above beauty. Reject plastic skin, rubbery fabric, varnished bark, generic chrome, fake glass, smooth paste-like mud, uniform wet gloss, repeated procedural texture, floating droplets, impossible reflections/refraction and detached decorative searchlight beams. The reference must be useful as downstream physical material authority.",
    PERFORMANCE_REFERENCE: "PERFORMANCE_REFERENCE: verify exact character identity plus observable acting/body truth: gaze, breath, involuntary reaction, deliberate decision, weight distribution, posture asymmetry, fatigue/wetness carryover and microexpression. Reject stock fear faces, fashion posing, generic running posture, symmetric tension and any body language that ignores the authored stimulus.",
    CONTACT_DETAIL_REFERENCE: "CONTACT_DETAIL_REFERENCE: verify physically credible contact and consequence. Hands/feet/boots/cloth/object/environment must show pressure, friction, weight transfer, deformation, mud/water displacement, grip or impact response appropriate to the shot. Reject floating contact, penetration, weightless feet, fake mud, collision with no body consequence or staged product-like interaction."
  };
  return [...common, specific[assetClass]].filter(Boolean).join("\n- ");
}

function temporalReviewRules(task = {}, source = {}) {
  const req = object(task.input?.requirements);
  const step = text(source.metadata?.production_step_id || source.metadata?.pass_id).toLowerCase();
  if (req.temporal_4k_review === true || step === "temporal-4k-master") {
    return [
      "TEMPORAL MASTER REVIEW: inspect motion frame-to-frame, not only isolated beauty frames.",
      "Reject texture boiling, foliage/bark crawl, skin-detail pulsing, unstable pores/hair, reflection flicker, edge crawl, ringing shimmer, grain crawl, focus pumping, lens-effect pulsing, exposure pumping, rain resets, fog/volumetric resets, and motion-blur changes that are not caused by authored shutter or camera motion.",
      "Upscaling may recover detail but may not invent different micro-detail on adjacent frames. A sharper master that flickers, shimmers or changes material texture is a FAIL.",
      "Rain, fog, beams, wet surfaces and reflections must carry causal temporal continuity through motion. Atmospheric detail may evolve, but it may not randomly respawn between frames.",
      "Identity geometry, skin texture, wardrobe texture and environment structure must remain stable unless the shot contract explicitly authors a transformation."
    ].join("\n- ");
  }
  return "";
}

function reviewPrompt(task = {}, source = {}) {
  const expected = expectation(task);
  const minimum = thresholds(task);
  const stageRules = [
    finishingReviewRules(source),
    imageAssetReviewRules(source),
    temporalReviewRules(task, source),
  ].filter(Boolean).join("\n- ");
  const authoredContractText = JSON.stringify({
    intent: source.input?.intent || {},
    requirements: source.input?.requirements || {},
  }).toLowerCase();
  const authoredStillnessRequired =
    /completely still|no visible action|no people|empty|absolute stillness|motionless/.test(authoredContractText);
  const stillnessOverride = authoredStillnessRequired
    ? [
        "IMMUTABLE STILLNESS OVERRIDE FOR THIS SHOT:",
        "- The approved shot explicitly requires stillness/emptiness/no visible action.",
        "- Do NOT fail this shot merely because it contains no visible action, people, motion or environmental activity.",
        "- Do NOT propose breeze, wind movement, moving dust, people, vehicles, animals, sound, activity or new events as repairs.",
        "- Sound is not visible evidence in a still image and must never be proposed as an image repair.",
        "- Judge dramatic tension only through composition, negative space, scale, horizon pressure, withholding/reveal, pre-dawn light, atmospheric depth, texture, focal hierarchy and unresolved expectation.",
        "- Any failure or repair that contradicts the approved stillness contract is invalid.",
      ].join("\n")
    : "";
  return `
You are Avantiqo's accountable generated-media perceptual quality director.
Inspect the actual generated ${text(expected.media_kind || task.metadata?.media_kind).toLowerCase()} against the immutable approved shot contract and all supplied reference evidence.
Return strict JSON only. Use exactly the property names shown. Never remove or rename the _score suffix.

{
  "passed": true,
  "scores": {
    "overall_score": null,
    "story_score": null,
    "environment_score": null,
    "camera_score": null,
    "anatomy_score": null,
    "identity_score": null,
    "product_fidelity_score": null,
    "music_energy_score": null,
    "performance_score": null,
    "continuity_score": null,
    "physics_score": null,
    "artifact_score": null,
    "composition_score": null,
    "aesthetic_distinction_score": null,
    "tension_curiosity_score": null,
    "production_value_score": null,
    "depth_atmosphere_score": null,
    "environmental_aliveness_score": null
  },
  "person_count_correct": true,
  "identity_preserved": true,
  "product_preserved": true,
  "requested_environment_correct": true,
  "requested_camera_correct": true,
  "story_contribution_present": true,
  "music_energy_translated": true,
  "anatomy_valid": true,
  "physics_valid": true,
  "continuity_valid": true,
  "synthetic_artifacts_absent": true,
  "source_background_not_copied": true,
  "unexpected_text_or_watermark_absent": true,
  "failures": [],
  "evidence": [],
  "affected_timestamps": [],
  "repair_instructions": []
}

FAIL-CLOSED RULES
${stageRules ? "- " + stageRules + "\n" : ""}- Never invent evidence. A missing, unreadable, inaccessible or insufficient source must fail.
- Return every score as a finite number from 0 to 100. Missing, null, textual, out-of-range or renamed score fields are invalid.
- The nulls shown in the JSON shape are placeholders only. Replace every null score with an evidence-based finite number from 0 to 100. Never return null, never copy the placeholder shape, and never return an all-zero score set unless the media is completely inaccessible or catastrophically invalid.
- When a dimension is genuinely not applicable and the approved contract does not require it, score it 100 only if there is no visible defect in that dimension; do not use 0 as shorthand for N/A.
- If the approved contract explicitly requires stillness, emptiness, no visible action or no people, do not penalize the frame merely for being still or empty. Judge whether the authored stillness is visually specific, atmospheric, intentional, and dramatically charged by composition, light, scale, negative space, reveal/withholding, horizon pressure, depth or unresolved expectation.
- For an approved still or empty hero frame, DO NOT require visible physical action, people, moving objects, environmental activity or added events in order to satisfy story/tension. Tension may be entirely spatial, tonal, compositional or anticipatory. A repair must not introduce action that contradicts an approved no-action/stillness contract.
- If passed is false, return 1-8 compact failure strings and 1-6 bounded imperative repair_instructions. Each repair instruction must identify a concrete visual change while preserving every requirement that already passed.
- The output must execute the exact story purpose, action, environment, camera, lighting and production design, not merely look attractive.
- Reject technically correct but visually cheap, flat, generic or emotionally inert work. Major-brand work must have deliberate visual hierarchy, aesthetic distinction, premium production value, dimensional depth/atmosphere, and environmental life only where the story expects a living world.
- Tension/curiosity must be created through reveal, withholding, contrast, blocking, sound-picture implication or unresolved visual pressure when the shot purpose calls for it; for still hero frames, composition, negative space, scale, pre-dawn light, atmospheric depth and unresolved expectation are valid tension mechanisms. Generic prettiness is not tension.
- Empty environments fail environmental_aliveness when the approved story implies workers, guests, crowds, traffic, operations or human activity.
- Beauty is not a vague adjective: score composition by focal hierarchy, foreground/midground/background separation, negative space, lighting shape, texture, depth, and intentional subject placement.
- Aesthetic distinction must fail generic AI-commercial imagery, stock-looking coverage, obvious first-idea framing and compositions transferable to any brand or industry.
- Reject filler, static posing, disconnected montage, repeated visual ideas and shots that add no new story or musical state.
- A beautiful shot with no story delta, sensory delta, causal relationship, tension, reveal or earned payoff is a FAIL, not a near-pass.
- If geography or place identity matters, reject a merely plausible random city/coast/room. The place must be visually specific enough to communicate the intended location or the shot must be designed so location identification is not being claimed.
- For images, judge the frame as premium key art: it must survive close inspection without motion, editing or sound to rescue weak composition, depth, pose, texture, light or realism.
- For video, reject unearned black frames, dead air, overlong static holds, generic slow motion, decorative camera movement, frozen environments, and shots whose opening/progression/closing do not produce meaningful visual progress. Intentional stillness is valid only when dramatically motivated.
- Reject malformed hands, fingers, teeth, eyes, limbs, body geometry, impossible reflections, floating objects, unstable backgrounds, object morphing, camera teleportation, temporal warping, rubber motion, frozen faces, synthetic skin and generative shimmer.
- When identity is required, compare exact facial geometry, eye spacing, nose, lips, jawline, skin tone, age, hairline, body type and proportions against all identity evidence. Reject lookalikes, averaged faces, beauty-filter drift, duplicates and identity changes across frames.
- When product fidelity is required, reject changed shape, proportions, materials, colour, label, logo, packaging, components or count.
- Uploaded identity backgrounds are excluded and must not be copied into the story unless explicitly requested.
- For video, inspect opening, progression and closing states and reject failed continuity, physics, performance, camera path or environment stability.
- For music-led media, visible energy, performance, camera, lighting and environmental state must match the supplied measured section rather than generic tempo assumptions.
- Reject generated typography, logos, legal copy or watermarks unless the approved contract explicitly requires them inside pixels.
- Score composition, depth, lighting quality, material realism, production design, visual hierarchy, place specificity and scale readability independently. Do not let an attractive average hide a weak critical visual dimension.
- iconic_frame_score measures whether the frame achieves the authored Cinematic DNA iconic-frame target; for non-hero shots score the strongest authored frame without forcing spectacle.

MINIMUM SCORES
${JSON.stringify(minimum)}

IMMUTABLE EXPECTED CONTRACT
${JSON.stringify(expected)}

SOURCE SHOT ESSENTIALS
${JSON.stringify({
    id: source.id,
    type: source.type,
    capability: source.capability,
    intent: source.input?.intent,
    requirements: {
      subject: source.input?.requirements?.subject,
      action: source.input?.requirements?.action,
      purpose: source.input?.requirements?.purpose,
      location: source.input?.requirements?.location,
      camera: source.input?.requirements?.camera,
      lighting: source.input?.requirements?.lighting,
      frame_plan: source.input?.requirements?.frame_plan,
      opening_frame:
        source.input?.requirements?.frame_plan?.opening_frame ||
        source.input?.requirements?.opening_frame,
      closing_frame:
        source.input?.requirements?.frame_plan?.closing_frame ||
        source.input?.requirements?.closing_frame,
      virtual_camera_state: source.input?.requirements?.virtual_camera_state,
      subject_motion_choreography:
        source.input?.requirements?.subject_motion_choreography,
      editorial_causality: source.input?.requirements?.editorial_causality,
      beauty_intent: source.input?.requirements?.beauty_intent,
      signature_frame_design: source.input?.requirements?.signature_frame_design,
      pursuit_spatial_choreography: source.input?.requirements?.pursuit_spatial_choreography,
      pursuit_performance_choreography: source.input?.requirements?.pursuit_performance_choreography,
      environmental_continuity_state: source.input?.requirements?.environmental_continuity_state,
      focal_path: source.input?.requirements?.focal_path,
      depth_layers: source.input?.requirements?.depth_layers,
      negative_constraints: source.input?.requirements?.negative_constraints,
      known_failure_modes: source.input?.requirements?.known_failure_modes,
      identity_requirements: source.input?.requirements?.identity_requirements,
      product_requirements: source.input?.requirements?.product_requirements,
      geography_claim: source.input?.requirements?.geography_claim,
      geography_proof: source.input?.requirements?.geography_proof,
      cinematic_dna: source.input?.requirements?.cinematic_dna,
    },
  })}

${stillnessOverride}
`;
}

async function bindReview(task = {}) {
  const dependencies = await dependencyTasks(task);
  const sourceNodeId = text(
    task.metadata?.source_generation_node_id ||
    task.input?.requirements?.source_generation_node_id ||
    task.input?.provider_parameters?.source_generation_node_id,
  );
  const source = dependencies.find((item) =>
    text(item.id) === sourceNodeId,
  ) || dependencies.find((item) =>
    text(item.metadata?.execution_node_id) === sourceNodeId ||
    text(item.metadata?.source_generation_node_id) === sourceNodeId,
  ) || dependencies.find((item) => item.status === "COMPLETED");
  if (!source || source.status !== "COMPLETED") {
    throw new Error("GENERATED_MEDIA_SOURCE_TASK_NOT_COMPLETED");
  }
  const sourceUrl = outputUrl(source.output);
  if (!sourceUrl) throw new Error("GENERATED_MEDIA_SOURCE_URL_REQUIRED");
  const reviewUrl = await signedUrl(task, sourceUrl);
  if (!reviewUrl) throw new Error("GENERATED_MEDIA_REVIEW_URL_REQUIRED");

  const mediaKind = reviewMediaKind(task);
  if (mediaKind === "VIDEO" && !/^https:\/\//i.test(text(reviewUrl))) {
    throw new Error("GENERATED_MEDIA_VIDEO_REVIEW_HTTPS_URL_REQUIRED");
  }

  const references = [];
  for (const value of referenceValues(task, source)) {
    if (value.url) {
      references.push({
        ...value,
        url: await signedUrl(task, value.url),
      });
    } else {
      references.push(value);
    }
  }

  const assets = [
    {
      url: reviewUrl,
      role: "GENERATED_MEDIA_UNDER_REVIEW",
    },
    ...references,
  ];

  const executionPrompt = reviewPrompt(task, source);
  const persisted = await ProductionTaskRuntime.update(task.id, {
    input: {
      ...object(task.input),
      openai_video_analysis_frame_contract: null,
      media_kind: mediaKind || undefined,
      image: reviewUrl,
      media: reviewUrl,
      source: reviewUrl,
      video: mediaKind === "VIDEO" ? reviewUrl : undefined,
      assets,
      source_assets: [reviewUrl],
      reference_assets: references.filter((item) => item.url).map((item) => item.url),
      reference_images: references.filter((item) => item.url),
      provider_parameters: {
        ...object(task.input?.provider_parameters),
        media_kind:
          mediaKind ||
          text(task.input?.provider_parameters?.media_kind).toUpperCase() ||
          undefined,
        response_format: { type: "json_object" },
        source_url: reviewUrl,
        generated_media_url: reviewUrl,
        source_generation_task_id: source.id,
        source_generation_node_id: sourceNodeId,
        references,
        thresholds: thresholds(task),
      },
    },
    metadata: {
      ...object(task.metadata),
      media_kind: mediaKind || task.metadata?.media_kind,
      source_generation_task_id: source.id,
      source_asset_node_id: source.output?.asset_node_id || null,
      generated_media_url_bound: true,
      reference_count: references.length,
      provider_prompt_boundary: "EXECUTION_TRANSPORT_ONLY",
      provider_prompts_persisted: false,
    },
  });
  ProductionTaskRuntime.setExecutionTransportOverlay(task.id, {
    prompt: executionPrompt,
    provider_prompt: executionPrompt,
  });
  return persisted;
}

function minimumPass(value, minimum) {
  const score = finite(value);
  const threshold = finite(minimum);
  if (threshold === null || threshold <= 0) return true;
  return score !== null && score >= threshold;
}

function detailEvidenceDecision({
  evidence,
  key,
  required = true,
  conclusive = false,
  scoreBacked = false,
}) {
  if (!required) {
    return {
      passed: true,
      source: "NOT_REQUIRED",
      present: hasOwn(evidence, key),
      explicit_value:
        typeof evidence[key] === "boolean" ? evidence[key] : null,
    };
  }

  if (hasOwn(evidence, key)) {
    if (evidence[key] === true) {
      return {
        passed: true,
        source: "EXPLICIT_TRUE",
        present: true,
        explicit_value: true,
      };
    }
    return {
      passed: false,
      source:
        evidence[key] === false
          ? "EXPLICIT_FALSE"
          : "INVALID_EXPLICIT_VALUE",
      present: true,
      explicit_value:
        typeof evidence[key] === "boolean" ? evidence[key] : null,
    };
  }

  if (conclusive && scoreBacked) {
    return {
      passed: true,
      source: "SCORE_BACKED_CONCLUSIVE_PROVIDER_VERDICT",
      present: false,
      explicit_value: null,
    };
  }

  return {
    passed: false,
    source: "MISSING_WITHOUT_CONCLUSIVE_SUPPORT",
    present: false,
    explicit_value: null,
  };
}

function validation(task = {}) {
  const evidence = resultEvidence(task);
  const minimum = thresholds(task);
  const expected = expectation(task);
  const scoreContract = object(evidence.score_contract);
  const analyzedImageCount = finite(evidence.analyzed_image_count);
  const videoExpected = text(
    expected.media_kind || task.metadata?.media_kind,
  ).toUpperCase() === "VIDEO";
  const visualExcellence = CreativeVisualExcellenceRuntime.evaluate({ cinematic_dna: expected.cinematic_dna, evidence, media_kind: expected.media_kind || task.metadata?.media_kind });
  const evidenceItems = list(evidence.evidence);
  const checks = {
    score_contract: scoreContract.complete === true,
    frame_evidence: videoExpected
      ? analyzedImageCount !== null && analyzedImageCount >= 7
      : evidenceItems.length >= 2,
    overall: minimumPass(evidence.overall_score, minimum.minimum_overall_score),
    story: minimumPass(evidence.story_score, minimum.minimum_story_score),
    environment: minimumPass(evidence.environment_score, minimum.minimum_environment_score),
    camera: minimumPass(evidence.camera_score, minimum.minimum_camera_score),
    anatomy: minimumPass(evidence.anatomy_score, minimum.minimum_anatomy_score),
    identity: minimumPass(evidence.identity_score, minimum.minimum_identity_score),
    product: minimumPass(evidence.product_fidelity_score, minimum.minimum_product_fidelity_score),
    music: minimumPass(evidence.music_energy_score, minimum.minimum_music_energy_score),
    performance: minimumPass(evidence.performance_score, minimum.minimum_performance_score),
    continuity: minimumPass(evidence.continuity_score, minimum.minimum_continuity_score),
    physics: minimumPass(evidence.physics_score, minimum.minimum_physics_score),
    artifacts: minimumPass(evidence.artifact_score, minimum.minimum_artifact_score),
    composition: minimumPass(evidence.composition_score, minimum.minimum_composition_score),
    aesthetic_distinction: minimumPass(evidence.aesthetic_distinction_score, minimum.minimum_aesthetic_distinction_score),
    tension_curiosity: minimumPass(evidence.tension_curiosity_score, minimum.minimum_tension_curiosity_score),
    production_value: minimumPass(evidence.production_value_score, minimum.minimum_production_value_score),
    depth_atmosphere: minimumPass(evidence.depth_atmosphere_score, minimum.minimum_depth_atmosphere_score),
    environmental_aliveness: minimumPass(evidence.environmental_aliveness_score, minimum.minimum_environmental_aliveness_score),
  };
  const failures = list(evidence.failures);
  const repairs = list(evidence.repair_instructions);
  const matchedHardRejects = list(evidence.matched_hard_reject_signatures);
  const mediaRejected = evidence.media_rejected === true;
  checks.hard_rejects = !mediaRejected && matchedHardRejects.length === 0;
  const semanticFailures = [...new Set([
    ...failures,
    ...matchedHardRejects,
    ...(mediaRejected ? ["media_rejected"] : []),
  ])];
  const allChecksPassed = Object.values(checks).every(Boolean);
  const conclusiveProviderVerdict =
    evidence.passed === true &&
    allChecksPassed &&
    semanticFailures.length === 0 &&
    repairs.length === 0;
  const evidenceDecisions = {
    requested_environment_correct: detailEvidenceDecision({
      evidence,
      key: "requested_environment_correct",
      conclusive: conclusiveProviderVerdict,
      scoreBacked: checks.environment === true,
    }),
    requested_camera_correct: detailEvidenceDecision({
      evidence,
      key: "requested_camera_correct",
      conclusive: conclusiveProviderVerdict,
      scoreBacked: checks.camera === true,
    }),
    story_contribution_present: detailEvidenceDecision({
      evidence,
      key: "story_contribution_present",
      conclusive: conclusiveProviderVerdict,
      scoreBacked: checks.story === true,
    }),
    anatomy_valid: detailEvidenceDecision({
      evidence,
      key: "anatomy_valid",
      conclusive: conclusiveProviderVerdict,
      scoreBacked: checks.anatomy === true,
    }),
    physics_valid: detailEvidenceDecision({
      evidence,
      key: "physics_valid",
      conclusive: conclusiveProviderVerdict,
      scoreBacked: checks.physics === true,
    }),
    continuity_valid: detailEvidenceDecision({
      evidence,
      key: "continuity_valid",
      conclusive: conclusiveProviderVerdict,
      scoreBacked: checks.continuity === true,
    }),
    synthetic_artifacts_absent: detailEvidenceDecision({
      evidence,
      key: "synthetic_artifacts_absent",
      conclusive: conclusiveProviderVerdict,
      scoreBacked: checks.artifacts === true,
    }),
    source_background_not_copied: detailEvidenceDecision({
      evidence,
      key: "source_background_not_copied",
      conclusive: conclusiveProviderVerdict,
      scoreBacked: checks.artifacts === true,
    }),
    unexpected_text_or_watermark_absent: detailEvidenceDecision({
      evidence,
      key: "unexpected_text_or_watermark_absent",
      conclusive: conclusiveProviderVerdict,
      scoreBacked: checks.artifacts === true,
    }),
    person_count_correct: detailEvidenceDecision({
      evidence,
      key: "person_count_correct",
      required: expected.person_expected === true,
      conclusive: conclusiveProviderVerdict,
      scoreBacked:
        checks.anatomy === true && checks.performance === true,
    }),
    identity_preserved: detailEvidenceDecision({
      evidence,
      key: "identity_preserved",
      required: expected.identity_expected === true,
      conclusive: conclusiveProviderVerdict,
      scoreBacked: checks.identity === true,
    }),
    product_preserved: detailEvidenceDecision({
      evidence,
      key: "product_preserved",
      required: expected.product_expected === true,
      conclusive: conclusiveProviderVerdict,
      scoreBacked: checks.product === true,
    }),
    music_energy_translated: detailEvidenceDecision({
      evidence,
      key: "music_energy_translated",
      required: expected.music_expected === true,
      conclusive: conclusiveProviderVerdict,
      scoreBacked: checks.music === true,
    }),
  };
  const evidenceChecks = Object.fromEntries(
    Object.entries(evidenceDecisions).map(([key, decision]) => [
      key,
      decision.passed === true,
    ]),
  );
  return {
    passed:
      conclusiveProviderVerdict &&
      Object.values(evidenceChecks).every(Boolean),
    checks,
    evidence_checks: evidenceChecks,
    evidence_policy: {
      contract: "GENERATED_MEDIA_PERCEPTUAL_EVIDENCE_POLICY_V2",
      conclusive_provider_verdict: conclusiveProviderVerdict,
      provider_passed: evidence.passed === true,
      all_score_and_frame_checks_passed: allChecksPassed,
      failure_count: failures.length,
      repair_instruction_count: repairs.length,
      decisions: evidenceDecisions,
    },
    score_contract: scoreContract,
    visual_excellence: visualExcellence,
    evidence,
  };
}

async function enforceCrossShotNovelty(source = {}) {
  const type = text(source.type || source.capability).toUpperCase();
  if (!type.includes("IMAGE")) return { passed: true, skipped: "NOT_IMAGE" };
  const assetNodeId = text(source.output?.asset_node_id || source.metadata?.asset_node_id);
  if (!assetNodeId) return { passed: true, skipped: "NO_ASSET_NODE" };
  const current = await CreativeAssetGraphRuntime.get(assetNodeId);
  if (!current) return { passed: true, skipped: "ASSET_NODE_NOT_FOUND" };
  const all = await CreativeAssetGraphRuntime.list({
    organization_id: source.organization_id,
    creative_project_id: source.creative_project_id,
  });
  const comparisonNodes = list(all).filter((node) =>
    node?.id !== current.id &&
    text(node?.type).toUpperCase() === "IMAGE" &&
    !["REJECTED", "FAILED"].includes(text(node?.status).toUpperCase()),
  );
  const novelty = CreativeCrossShotFingerprintRuntime.evaluate({
    asset_node: current, comparison_nodes: comparisonNodes,
  });
  const metadata = {
    ...object(current.metadata),
    cross_shot_fingerprint: novelty.fingerprint,
    cross_shot_novelty_score: novelty.novelty_score,
    cross_shot_strongest_match: novelty.strongest_match,
  };
  if (!novelty.passed) {
    await CreativeAssetGraphRuntime.update(current.id, {
      status: "REJECTED",
      review: { ...object(current.review), ai_reviewed: true, approved: false },
      metadata: { ...metadata, image_asset_duplicate_quarantined: true },
    });
    return { ...novelty, passed: false };
  }
  await CreativeAssetGraphRuntime.update(current.id, { metadata });
  return novelty;
}

async function holdOrFail(task = {}) {
  if (task.status !== "COMPLETED") return task;
  const evaluated = validation(task);
  const sourceId = text(task.metadata?.source_generation_task_id);
  const source = sourceId ? await ProductionTaskRuntime.get(sourceId) : null;

  if (!evaluated.passed) {
    if (source && source.status === "COMPLETED") {
      await ProductionTaskRuntime.update(source.id, {
        status: "FAILED",
        error: "GENERATED_MEDIA_PERCEPTUAL_VALIDATION_FAILED",
        metadata: {
          ...object(source.metadata),
          perceptual_validation_failed: true,
          perceptual_review_task_id: task.id,
          rejected_before_editing: true,
        },
        output: {
          ...object(source.output),
          perceptual_validation: evaluated,
        },
      });
    }
    return ProductionTaskRuntime.fail(
      task.id,
      new Error("GENERATED_MEDIA_PERCEPTUAL_VALIDATION_FAILED"),
      { perceptual_validation: evaluated },
    );
  }

  if (source) {
    const novelty = await enforceCrossShotNovelty(source);
    if (novelty.passed === false) {
      await ProductionTaskRuntime.update(source.id, {
        status: "FAILED",
        error: "GENERATED_MEDIA_CROSS_SHOT_DUPLICATE_REJECTED",
        metadata: {
          ...object(source.metadata),
          image_asset_duplicate_quarantined: true,
          rejected_before_editing: true,
        },
        output: { ...object(source.output), cross_shot_novelty: novelty },
      });
      return ProductionTaskRuntime.fail(
        task.id,
        new Error("GENERATED_MEDIA_CROSS_SHOT_DUPLICATE_REJECTED"),
        { cross_shot_novelty: novelty },
      );
    }
    await ProductionTaskRuntime.update(source.id, {
      metadata: {
        ...object(source.metadata),
        automated_perceptual_validation_passed: true,
        perceptual_review_task_id: task.id,
        approved_for_downstream_after_perceptual_review: true,
      },
      output: {
        ...object(source.output),
        perceptual_validation: evaluated,
      },
    });
  }

  return ProductionTaskRuntime.update(task.id, {
    status: "COMPLETED",
    review: {
      ...object(task.review),
      required: false,
      approved: true,
      approved_by: "AVANTIQO_AUTOMATED_PERCEPTUAL_GATE",
    },
    metadata: {
      ...object(task.metadata),
      automated_perceptual_validation_passed: true,
      generated_media_released_for_downstream: true,
    },
    output: {
      ...object(task.output),
      perceptual_validation: evaluated,
    },
  });
}

function isGeneratedMediaPerceptualReview(task = {}) {
  return (
    text(task.metadata?.contract) === "GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1" ||
    text(task.input?.intent?.review) === "GENERATED_MEDIA_PERCEPTUAL_VALIDATION" ||
    text(task.input?.generation?.output_spec?.type) === "GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1" ||
    text(task.input?.requirements?.expected_contract?.contract) === "GENERATED_MEDIA_PERCEPTUAL_EXPECTATION_V1"
  );
}

if (!ProductionTaskRuntime[FLAG]) {
  const dispatch = ProductionTaskRuntime.dispatch.bind(ProductionTaskRuntime);
  Object.defineProperty(ProductionTaskRuntime, FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });
  const poll = ProductionTaskRuntime.poll.bind(ProductionTaskRuntime);
  ProductionTaskRuntime.dispatch = async function dispatchWithGeneratedMediaPerceptualGate(id) {
    let task = await ProductionTaskRuntime.get(id);
    if (!task) throw new Error("Production task not found");
    const perceptualReview = isGeneratedMediaPerceptualReview(task);
    if (perceptualReview) {
      task = await bindReview(task);
    }
    const result = await dispatch(task.id);
    return perceptualReview ? holdOrFail(result) : result;
  };
  ProductionTaskRuntime.poll = async function pollWithGeneratedMediaPerceptualGate(id) {
    const before = await ProductionTaskRuntime.get(id);
    if (!before) throw new Error("Production task not found");
    const perceptualReview = isGeneratedMediaPerceptualReview(before);
    const result = await poll(id);
    return perceptualReview ? holdOrFail(result) : result;
  };
}

export const CreativeGeneratedMediaPerceptualExecutionGate = {
  installed: true,
  outputUrl,
  normalizeReviewEvidence,
  resultEvidence,
  validation,
  bindReview,
  reviewPrompt,
  enforceCrossShotNovelty,
  enforceCompleted: holdOrFail,
};
