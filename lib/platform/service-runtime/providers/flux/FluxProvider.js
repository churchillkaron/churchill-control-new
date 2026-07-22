import {
  CredentialRuntime,
} from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";

function firstValue(...values) {
  return values.find(
    (value) => value !== undefined && value !== null,
  ) ?? null;
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

  return `
Create one original photorealistic commercial master still for one independently directed film shot.
Do not create a generic hospitality, nightlife, luxury, poster, or campaign image unless the supplied business truth explicitly requires it.

SCENE:
${JSON.stringify(scene)}

SHOT:
${JSON.stringify({
  title: shot.title,
  purpose: shot.purpose,
  opening_frame: shot.opening_frame,
  closing_frame: shot.closing_frame,
  action_beats: shot.action_beats,
  performance_direction: shot.performance_direction,
  camera: shot.camera,
  lighting: shot.lighting,
  actors: shot.actors,
  products: shot.products,
  location: shot.location,
  continuity: shot.continuity,
  reality_rules: shot.reality_rules,
})}

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
Apply every correction explicitly. Preserve everything that already passed QA. Do not introduce new people, architecture, branding, products, text, props, or visual facts unless a correction specifically requires them and the supplied references support them.

NEGATIVE CONSTRAINTS:
${JSON.stringify(shot.negative_constraints || [])}
No identity drift, broken anatomy, altered product proportions, misspelled logos, invented architecture, fake text, plastic skin, duplicated objects, or physically impossible light.
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

    const imageUrls = selectedAssets(input.assets)
      .map(assetUrl)
      .filter(Boolean)
      .slice(0, 10);

    if (!imageUrls.length) {
      throw new Error("Reference-grounded Flux generation requires source assets");
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
        strength: Number(input.strength ?? 0.58),
        guidance_scale: Number(input.guidance_scale ?? 7.5),
        num_inference_steps: Number(input.num_inference_steps ?? 40),
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
      },
    };
  },
};
