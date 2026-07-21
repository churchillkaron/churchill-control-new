import OpenAI from "openai";

import {
  CredentialRuntime,
} from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";

async function getOpenAIClient(credentialId = null) {
  let apiKey = process.env.OPENAI_API_KEY;

  if (credentialId) {
    const credential = await CredentialRuntime.resolve(credentialId);
    if (credential?.secret_reference) {
      apiKey = credential.secret_reference;
    }
  }

  if (!apiKey) {
    throw new Error("OPENAI_CREDENTIAL_REQUIRED");
  }

  return new OpenAI({ apiKey });
}

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

function referenceUrls(assets = {}) {
  return selectedAssets(assets)
    .map(assetUrl)
    .filter(Boolean)
    .slice(0, 10);
}

function buildMasterStillPrompt({
  prompt = "",
  specification = {},
  assets = {},
  mode = null,
} = {}) {
  const scene = specification.scene || {};
  const shot = specification.shot || {};
  const referencePack = shot.reference_pack || {};

  return `
Create one original, photorealistic commercial master still for one independently directed film shot.
This is not a poster, mood board, generic campaign image, or complete-film request.

MODE:
${mode || "reference_grounded_master_still"}

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

REFERENCE CONTRACT:
Preserve: ${JSON.stringify(referencePack.preserve || [])}
May change: ${JSON.stringify(referencePack.may_change || [])}
Never change: ${JSON.stringify(referencePack.never_change || [])}
Reference URLs supplied to the production runtime: ${JSON.stringify(referenceUrls(assets))}

QUALITY REQUIREMENTS:
${JSON.stringify(shot.quality_requirements || {})}

NEGATIVE CONSTRAINTS:
${JSON.stringify(shot.negative_constraints || [])}
- No identity drift, altered product geometry, misspelled logos, invented architecture, broken anatomy, duplicated objects, fake text, watermark, or artificial-looking skin.
- Use physically plausible light, contact shadows, reflections, scale, materials, hands, eye lines, and object placement.
- Keep the frame editorially usable as the approved first frame for image-to-video generation.

ADDITIONAL DIRECTION:
${prompt}
`.trim();
}

function parseJson(value) {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    const match = String(value).match(/\{[\s\S]*\}/);
    if (!match) return null;

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

async function generateImage({
  client,
  prompt,
  assets,
  specification,
  mode,
  size = "1536x1024",
}) {
  const response = await client.images.generate({
    model: "gpt-image-1",
    prompt: buildMasterStillPrompt({
      prompt,
      assets,
      specification,
      mode,
    }),
    size,
  });

  const image = response?.data?.[0] || {};
  const imageUrl =
    image.url ||
    (image.b64_json
      ? `data:image/png;base64,${image.b64_json}`
      : null);

  if (!imageUrl) {
    throw new Error("OpenAI image generation returned no image");
  }

  return {
    success: true,
    provider: "openai",
    model: "gpt-image-1",
    output: {
      image_url: imageUrl,
      reference_urls: referenceUrls(assets),
    },
  };
}

async function generateText({
  client,
  model,
  prompt,
  messages,
}) {
  const response = await client.responses.create({
    model,
    input: messages || prompt || "",
  });

  return {
    success: true,
    provider: "openai",
    model,
    output: {
      text: response.output_text || "",
    },
  };
}

async function analyzeImage({
  client,
  model,
  prompt,
  image,
}) {
  if (!image) {
    throw new Error("image required for visual analysis");
  }

  const response = await client.responses.create({
    model,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: prompt || "Analyze this image and return strict JSON.",
          },
          {
            type: "input_image",
            image_url: image,
          },
        ],
      },
    ],
  });

  const text = response.output_text || "";

  return {
    success: true,
    provider: "openai",
    model,
    output: {
      text,
      json: parseJson(text),
    },
  };
}

export const OpenAIProvider = {
  id: "openai",

  async execute({
    capability,
    model,
    prompt,
    image,
    assets,
    messages,
    credential_id,
    specification,
    mode,
    size,
  } = {}) {
    const client = await getOpenAIClient(credential_id);
    const selectedModel = model || "gpt-4.1";

    switch (capability) {
      case "ai.image.generate":
        return generateImage({
          client,
          prompt,
          assets,
          specification,
          mode,
          size,
        });

      case "ai.text.generate":
      case "ai.reasoning.execute":
        return generateText({
          client,
          model: selectedModel,
          prompt,
          messages,
        });

      case "document.classify":
      case "document.ocr":
      case "ai.image.analyze":
        return analyzeImage({
          client,
          model: selectedModel,
          prompt,
          image,
        });

      default:
        throw new Error(
          `OpenAI capability not supported: ${capability}`,
        );
    }
  },
};
