import {
  CredentialRuntime,
} from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";

function firstValue(...values) {
  return values.find(
    (value) => value !== undefined && value !== null,
  ) ?? null;
}

function resolveSourceImage(input = {}) {
  const sourceAsset =
    input.assets?.selectedAssets?.[0] ||
    input.assets?.[0] ||
    null;

  return firstValue(
    input.source_image,
    sourceAsset?.image_url,
    sourceAsset?.file_url,
    sourceAsset?.url,
  );
}

function resolveDuration(input = {}) {
  const requested = Number(
    input.duration_seconds ||
    input.specification?.shot?.duration_seconds ||
    5,
  );

  return requested <= 5 ? 5 : 10;
}

function resolveRatio(input = {}) {
  const requested = String(
    input.ratio ||
    input.aspect_ratio ||
    input.specification?.shot?.aspect_ratio ||
    "16:9",
  );

  const ratios = {
    "16:9": "1280:720",
    "9:16": "720:1280",
    "1:1": "960:960",
    "4:5": "768:960",
  };

  return ratios[requested] || requested || "1280:720";
}

function buildShotPrompt(input = {}) {
  const specification = input.specification || {};
  const scene = specification.scene || {};
  const shot = specification.shot || {};
  const preserve = shot.reference_pack?.preserve || [];
  const neverChange = shot.reference_pack?.never_change || [];
  const realityRules = shot.reality_rules || {};
  const negativeConstraints = shot.negative_constraints || [];

  return `
Create one independently directed commercial film shot.
This request is only for this shot, never for the complete film.

SHOT PURPOSE:
${shot.purpose || input.description || "Advance the approved story."}

DURATION AND ACTION:
Target editorial duration: ${shot.duration_seconds || input.duration_seconds || 5} seconds.
Opening frame and action must follow the approved master still.
Perform only the action described in this shot specification.

SCENE:
Title: ${scene.title || ""}
Objective: ${scene.objective || ""}
Emotion: ${scene.emotion || ""}
Location: ${JSON.stringify(shot.location || scene.location || {})}

CAMERA:
${JSON.stringify(shot.camera || {})}

LIGHTING:
${JSON.stringify(shot.lighting || {})}

PERFORMANCE AND ACTION:
Actors: ${JSON.stringify(shot.actors || scene.actors || [])}
Products: ${JSON.stringify(shot.products || scene.products || [])}
Dialogue: ${JSON.stringify(shot.dialogue || [])}
Continuity: ${JSON.stringify(shot.continuity || {})}

PRESERVE FROM REFERENCES:
${JSON.stringify(preserve)}

NEVER CHANGE:
${JSON.stringify(neverChange)}

REALITY REQUIREMENTS:
${JSON.stringify(realityRules)}
- Stable identity, age, wardrobe, products, logos, architecture and object placement.
- Natural blinking, breathing, weight shifts, eye lines and hand-object contact.
- Correct gravity, momentum, liquid behavior, reflections, shadows and environmental motion.
- No morphing, flicker, duplicated objects, broken anatomy or artificial looping.

NEGATIVE CONSTRAINTS:
${JSON.stringify(negativeConstraints)}

ADDITIONAL DIRECTOR DIRECTION:
${input.prompt || ""}
`.trim();
}

async function resolveApiKey(credentialId = null) {
  const credential = credentialId
    ? await CredentialRuntime.resolve(credentialId)
    : null;

  const apiKey =
    credential?.secret_reference ||
    process.env.RUNWAY_API_KEY;

  if (!apiKey) {
    throw new Error("Runway credential unavailable");
  }

  return apiKey;
}

export const RunwayProvider = {
  id: "runway",

  async execute(input = {}) {
    const apiKey = await resolveApiKey(
      input.credential_id || null,
    );

    const sourceImage = resolveSourceImage(input);

    if (!sourceImage) {
      throw new Error(
        "Image-to-video requires an approved master still",
      );
    }

    const response = await fetch(
      "https://api.dev.runwayml.com/v1/image_to_video",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "X-Runway-Version": "2024-11-06",
        },
        body: JSON.stringify({
          model: input.model || "gen4_turbo",
          promptText: buildShotPrompt(input),
          promptImage: sourceImage,
          duration: resolveDuration(input),
          ratio: resolveRatio(input),
        }),
      },
    );

    const result = await response.json();

    if (!response.ok || !result?.id) {
      throw new Error(
        result?.error ||
        result?.message ||
        "Runway video generation failed",
      );
    }

    return {
      success: true,
      provider: "runway",
      model: input.model || "gen4_turbo",
      output: {
        video_job_id: result.id,
        status: "processing",
        source_image_url: sourceImage,
        requested_duration_seconds:
          Number(input.duration_seconds || 0) || null,
        provider_duration_seconds:
          resolveDuration(input),
        ratio: resolveRatio(input),
      },
    };
  },
};

export async function getRunwayTaskStatus(jobId) {
  if (!jobId) {
    throw new Error("jobId required");
  }

  const apiKey = await resolveApiKey();

  const response = await fetch(
    `https://api.dev.runwayml.com/v1/tasks/${jobId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "X-Runway-Version": "2024-11-06",
      },
    },
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result?.error ||
      result?.message ||
      `Runway status request failed for ${jobId}`,
    );
  }

  return result;
}
