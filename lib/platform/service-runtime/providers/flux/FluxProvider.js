import {
  CredentialRuntime,
} from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";

function firstValue(...values) {
  return values.find(
    (value) => value !== undefined && value !== null,
  ) ?? null;
}

function list(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function selectedAssets(assets = {}) {
  if (Array.isArray(assets)) return assets.filter(Boolean);
  return (assets.selectedAssets || []).filter(Boolean);
}

function assetUrl(asset = {}) {
  return firstValue(
    asset.image_url,
    asset.file_url,
    asset.url,
    asset.thumbnail_url,
  );
}

function resolveAspectRatio(input = {}) {
  const requested = String(
    input.aspect_ratio ||
    input.ratio ||
    input.specification?.shot?.aspect_ratio ||
    "16:9",
  );

  return ["16:9", "9:16", "1:1", "4:5"].includes(requested)
    ? requested
    : "16:9";
}

function castManifest(input = {}) {
  const specification = input.specification || {};
  const shot = specification.shot || {};
  const scene = specification.scene || {};
  const casting =
    input.casting ||
    shot.casting ||
    scene.casting ||
    {};

  return {
    mode: casting.mode || null,
    exact_identity_required:
      casting.exact_identity_required === true,
    actors: list(
      casting.actors ||
      shot.actors ||
      scene.actors,
    ),
  };
}

function buildPrompt(input = {}) {
  const specification = input.specification || {};
  const scene = specification.scene || {};
  const shot = specification.shot || {};
  const referencePack = shot.reference_pack || {};
  const qualityCorrections = Array.isArray(
    specification.quality_corrections,
  )
    ? specification.quality_corrections
    : [];
  const composition =
    input.composition_plan ||
    shot.composition_plan ||
    specification.composition_plan ||
    {};
  const casting = castManifest(input);
  const evidenceManifest =
    input.evidence_role_manifest ||
    input.approved_evidence_role_manifest ||
    specification.evidence_role_manifest ||
    {};
  const referenceManifest = list(input.reference_manifest);

  return `
Create one original, fully regenerated, photorealistic commercial master still for one independently directed film shot.
This is complete-frame cinematic synthesis, never masked compositing, collage assembly, pasted subjects, partial inpainting or a local insert.
Do not create a generic hospitality, nightlife, luxury, poster or campaign image unless the supplied business truth explicitly requires it.

FULL-FRAME CINEMA CONTRACT:
- Rebuild the complete image edge to edge as one optically coherent photograph.
- Use one consistent camera position, lens, horizon, perspective system, depth field and scale relationship.
- Use one globally coherent lighting design, exposure, white balance, contrast curve, color science, atmosphere and finishing treatment.
- Every person, object, shadow, reflection, surface, background and foreground element must share the same physical light, color temperature and spatial depth.
- The result must look captured in one real production, not assembled from references.
- Preserve factual identity, location, architecture, products and brand evidence while allowing the approved camera, lighting, color and blocking to become more cinematic.

COMPOSITION CONTRACT:
${JSON.stringify(composition)}

SCENE:
${JSON.stringify(scene)}

SHOT:
${JSON.stringify({
  title: shot.title,
  purpose: shot.purpose,
  story_purpose: shot.story_purpose,
  narrative_state_before: shot.narrative_state_before,
  narrative_state_after: shot.narrative_state_after,
  opening_frame: shot.opening_frame,
  closing_frame: shot.closing_frame,
  decisive_moment: shot.decisive_moment,
  screen_direction: shot.screen_direction,
  action_beats: shot.action_beats,
  foreground_action: shot.foreground_action,
  midground_action: shot.midground_action,
  background_action: shot.background_action,
  environment_action: shot.environment_action,
  performance_direction: shot.performance_direction,
  subject_paths: shot.subject_paths,
  relationships: shot.relationships,
  camera: shot.camera,
  lighting: shot.lighting,
  actors: shot.actors,
  casting: shot.casting,
  products: shot.products,
  location: shot.location,
  dialogue: shot.dialogue,
  continuity: shot.continuity,
  reality_rules: shot.reality_rules,
  forbidden_interpretations: shot.forbidden_interpretations,
  provider_brief: shot.provider_brief,
})}

AUTHORITATIVE CAST MANIFEST:
${JSON.stringify(casting)}
Each cast binding is independent and authoritative. Preserve declared role, count, identity mode, assigned identity references, wardrobe, action and placement. Never merge identities, reuse one face for multiple people, swap staff and guests, reverse travel direction, alter declared cast count, or invent undeclared people.

AUTHORITATIVE EVIDENCE ROLE MANIFEST:
${JSON.stringify(evidenceManifest)}

ORDERED REFERENCE MANIFEST:
${JSON.stringify(referenceManifest)}
Reference 1 is the authoritative location or environment source when marked authoritative. Identity references apply only to their assigned cast bindings. Product and brand references apply only to their declared evidence roles.

PRESERVE:
${JSON.stringify(referencePack.preserve || [])}

MAY CHANGE:
${JSON.stringify(referencePack.may_change || [])}

NEVER CHANGE:
${JSON.stringify(referencePack.never_change || [])}

QUALITY REQUIREMENTS:
${JSON.stringify(shot.quality_requirements || {})}

MANDATORY QUALITY CORRECTIONS:
${JSON.stringify(qualityCorrections)}
Apply every correction explicitly. Preserve everything that already passed QA. Do not introduce new people, architecture, branding, products, text, props or visual facts unless a correction specifically requires them and the supplied references support them.

NEGATIVE CONSTRAINTS:
${JSON.stringify(shot.negative_constraints || [])}
No identity drift, broken anatomy, altered product proportions, misspelled logos, invented architecture, fake text, plastic skin, duplicated objects, floating bodies, disconnected shadows, inconsistent reflections, local color mismatches, synthetic lighting or physically impossible light.
The output must be suitable as the approved first frame for image-to-video production.

ADDITIONAL DIRECTION:
${input.prompt || ""}
`.trim();
}

export const FluxProvider = {
  id: "flux",

  async execute(input = {}) {
    const credential = input.credential_id
      ? await CredentialRuntime.resolve(input.credential_id)
      : null;
    const apiKey =
      credential?.secret_reference ||
      process.env.FLUX_API_KEY;
    const apiUrl = process.env.FLUX_API_URL;

    if (!apiKey || !apiUrl) {
      throw new Error("Flux credential or API URL unavailable");
    }

    const composition =
      input.composition_plan ||
      input.specification?.shot?.composition_plan ||
      {};
    const mode = String(
      composition.mode ||
      input.generation_contract?.generation?.mode ||
      "FULL_SCENE_REFERENCE_SYNTHESIS",
    ).toUpperCase();

    if (mode !== "FULL_SCENE_REFERENCE_SYNTHESIS") {
      throw new Error(
        "FLUX_ACTIVE_RUNTIME_SUPPORTS_FULL_SCENE_REFERENCE_SYNTHESIS_ONLY",
      );
    }
    if (
      composition.exact_pixels_outside_mask_required === true ||
      list(composition.placement_regions).length ||
      list(composition.protected_regions).length
    ) {
      throw new Error("FLUX_MASKED_COMPOSITION_NOT_SUPPORTED");
    }

    const imageUrls = selectedAssets(input.assets)
      .map(assetUrl)
      .filter(Boolean)
      .slice(0, 10);

    if (!imageUrls.length) {
      throw new Error(
        "Reference-grounded Flux generation requires source assets",
      );
    }

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: buildPrompt(input),
        image_urls: imageUrls,
        strength: Number(input.strength ?? 0.72),
        guidance_scale: Number(input.guidance_scale ?? 8.5),
        num_inference_steps: Number(input.num_inference_steps ?? 50),
        safety_tolerance: Number(input.safety_tolerance ?? 2),
        output_format: input.output_format || "jpeg",
        enable_safety_checker: true,
        sync_mode: true,
        aspect_ratio: resolveAspectRatio(input),
      }),
    });

    const result = await response.json();
    const imageUrl = firstValue(
      result?.images?.[0]?.url,
      result?.image?.url,
      result?.url,
    );

    if (!response.ok || !imageUrl) {
      throw new Error(
        result?.error ||
        result?.message ||
        "Flux generation failed",
      );
    }

    return {
      success: true,
      provider: "flux",
      model: result?.model || "flux",
      output: {
        image_url: imageUrl,
        reference_urls: imageUrls,
        generation_mode: "FULL_SCENE_REFERENCE_SYNTHESIS",
        whole_frame_regenerated: true,
        masked_composition: false,
        evidence_binding_hash:
          input.evidence_binding_hash ||
          input.generation_contract?.evidence_binding_hash ||
          null,
      },
    };
  },
};