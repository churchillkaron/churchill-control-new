import OpenAI, { toFile } from "openai";

import {
  CredentialRuntime,
} from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";

const MAX_REFERENCE_BYTES = 20 * 1024 * 1024;
const MAX_REFERENCE_IMAGES = 6;
const DEFAULT_STRUCTURED_OUTPUT_TOKENS = 12000;

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
    .slice(0, MAX_REFERENCE_IMAGES);
}

function parseDataUrl(value) {
  const match = String(value || "").match(
    /^data:([^;,]+)?(;base64)?,([\s\S]+)$/i,
  );
  if (!match) return null;

  const contentType = match[1] || "image/png";
  const bytes = match[2]
    ? Buffer.from(match[3], "base64")
    : Buffer.from(decodeURIComponent(match[3]));

  return { bytes, contentType };
}

function fileExtension(contentType = "image/png") {
  const normalized = String(contentType).toLowerCase();
  if (normalized.includes("jpeg") || normalized.includes("jpg")) return "jpg";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("gif")) return "gif";
  return "png";
}

async function readReferenceImage(url, index) {
  const data = parseDataUrl(url);
  let bytes;
  let contentType;

  if (data) {
    ({ bytes, contentType } = data);
  } else {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      throw new Error("REFERENCE_IMAGE_HTTPS_REQUIRED");
    }

    const response = await fetch(parsed, {
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      throw new Error(`REFERENCE_IMAGE_DOWNLOAD_FAILED_${response.status}`);
    }

    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > MAX_REFERENCE_BYTES) {
      throw new Error("REFERENCE_IMAGE_TOO_LARGE");
    }

    contentType = response.headers.get("content-type") || "image/png";
    if (!contentType.toLowerCase().startsWith("image/")) {
      throw new Error("REFERENCE_ASSET_IS_NOT_AN_IMAGE");
    }

    bytes = Buffer.from(await response.arrayBuffer());
  }

  if (!bytes?.length) {
    throw new Error("REFERENCE_IMAGE_EMPTY");
  }
  if (bytes.length > MAX_REFERENCE_BYTES) {
    throw new Error("REFERENCE_IMAGE_TOO_LARGE");
  }

  return toFile(
    bytes,
    `reference-${index + 1}.${fileExtension(contentType)}`,
    { type: contentType },
  );
}

async function referenceFiles(assets = {}) {
  const urls = referenceUrls(assets);
  return Promise.all(
    urls.map((url, index) => readReferenceImage(url, index)),
  );
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
  const references = referenceUrls(assets);

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
${references.length
    ? `${references.length} source image(s) are attached as actual visual inputs. Inspect and use them directly.`
    : "No source images are attached. Create only from the approved specification."}
Preserve: ${JSON.stringify(referencePack.preserve || [])}
May change: ${JSON.stringify(referencePack.may_change || [])}
Never change: ${JSON.stringify(referencePack.never_change || [])}

QUALITY REQUIREMENTS:
${JSON.stringify(shot.quality_requirements || {})}

NEGATIVE CONSTRAINTS:
${JSON.stringify(shot.negative_constraints || [])}
- No identity drift, altered product geometry, misspelled logos, invented architecture, broken anatomy, duplicated objects, fake text, watermark, or artificial-looking skin.
- Use physically plausible light, contact shadows, reflections, scale, materials, hands, eye lines, and object placement.
- Keep the frame editorially usable as the approved first frame for image-to-video generation.

MANDATORY CORRECTIONS FROM PRIOR QUALITY REVIEW:
${JSON.stringify(specification.quality_corrections || [])}

ADDITIONAL DIRECTION:
${prompt}
  `.trim();
}

function balancedJsonObject(value) {
  const text = String(value || "").trim();
  const start = text.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const character = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }

  return null;
}

function parseJson(value) {
  if (!value) return null;
  if (typeof value === "object") return value;

  const text = String(value)
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(text);
  } catch {
    const candidate = balancedJsonObject(text);
    if (!candidate) return null;

    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  }
}

function messageText(messages = []) {
  if (!Array.isArray(messages)) return "";

  return messages
    .flatMap((message) => {
      if (typeof message?.content === "string") return [message.content];
      if (!Array.isArray(message?.content)) return [];
      return message.content
        .map((item) => item?.text || item?.input_text || "")
        .filter(Boolean);
    })
    .join("\n");
}

function requestedResponseFormat({
  responseFormat = null,
  prompt = "",
  messages = null,
}) {
  if (responseFormat?.type) return responseFormat;

  const instruction = `${prompt || ""}\n${messageText(messages || [])}`;
  if (/\b(return|respond with|output)\s+(strict\s+|valid\s+)?json\b|\bjson\s+only\b/i.test(instruction)) {
    return { type: "json_object" };
  }

  return null;
}

async function generateImage({
  client,
  prompt,
  assets,
  specification,
  mode,
  size = "1536x1024",
}) {
  const files = await referenceFiles(assets);
  const finalPrompt = buildMasterStillPrompt({
    prompt,
    assets,
    specification,
    mode,
  });
  const response = files.length
    ? await client.images.edit({
        model: "gpt-image-1",
        image: files.length === 1 ? files[0] : files,
        prompt: finalPrompt,
        size,
      })
    : await client.images.generate({
        model: "gpt-image-1",
        prompt: finalPrompt,
        size,
      });

  const generated = response?.data?.[0] || {};
  const imageUrl =
    generated.url ||
    (generated.b64_json
      ? `data:image/png;base64,${generated.b64_json}`
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
      reference_count: files.length,
      reference_mode: files.length
        ? "PROVIDER_NATIVE_IMAGE_EDIT"
        : "TEXT_TO_IMAGE",
    },
  };
}

async function generateText({
  client,
  model,
  prompt,
  messages,
  responseFormat = null,
  maxOutputTokens = null,
}) {
  const format = requestedResponseFormat({
    responseFormat,
    prompt,
    messages,
  });
  const outputTokens = Number(maxOutputTokens || 0) > 0
    ? Math.round(Number(maxOutputTokens))
    : format
      ? DEFAULT_STRUCTURED_OUTPUT_TOKENS
      : null;
  const request = {
    model,
    input: messages || prompt || "",
  };

  if (format) {
    request.text = { format };
  }
  if (outputTokens) {
    request.max_output_tokens = outputTokens;
  }

  const response = await client.responses.create(request);
  const text = response.output_text || "";
  const json = format ? parseJson(text) : null;

  if (format && !json) {
    const error = new Error("OPENAI_STRUCTURED_JSON_INVALID");
    error.provider_response = {
      status: response.status || null,
      incomplete_details: response.incomplete_details || null,
      output_length: text.length,
    };
    throw error;
  }

  return {
    success: true,
    provider: "openai",
    model,
    output: {
      text,
      json,
      response_format: format?.type || "text",
      response_format_name:
        format?.name || null,
      response_format_strict:
        format?.strict === true,
      response_status: response.status || null,
      incomplete_details: response.incomplete_details || null,
    },
  };
}

async function analyzeImage({
  client,
  model,
  prompt,
  image,
  assets,
  mode,
  minimumScore = 90,
}) {
  const resolvedImage =
    image ||
    assetUrl(selectedAssets(assets)[0] || {});

  if (!resolvedImage) {
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
            image_url: resolvedImage,
          },
        ],
      },
    ],
    text: {
      format: { type: "json_object" },
    },
    max_output_tokens: 4000,
  });

  const text = response.output_text || "";
  const json = parseJson(text);

  if (!json) {
    throw new Error("OPENAI_IMAGE_ANALYSIS_INVALID_JSON");
  }

  if (mode === "creative_master_still_qa") {
    const overallScore = Number(json.overall_score || 0);
    const criticalFailures = Array.isArray(json.critical_failures)
      ? json.critical_failures.filter(Boolean)
      : [];
    const passed =
      json.passed === true &&
      overallScore >= Number(minimumScore || 90) &&
      criticalFailures.length === 0;

    if (!passed) {
      const error = new Error("MASTER_STILL_QUALITY_REJECTED");
      error.quality_review = {
        ...json,
        passed: false,
        minimum_score: Number(minimumScore || 90),
      };
      throw error;
    }
  }

  return {
    success: true,
    provider: "openai",
    model,
    output: {
      text,
      json,
      inspected_image_url: resolvedImage,
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
    minimum_score,
    response_format,
    max_output_tokens,
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
          responseFormat: response_format,
          maxOutputTokens: max_output_tokens,
        });

      case "document.classify":
      case "document.ocr":
      case "ai.image.analyze":
        return analyzeImage({
          client,
          model: selectedModel,
          prompt,
          image,
          assets,
          mode,
          minimumScore: minimum_score,
        });

      default:
        throw new Error(
          `OpenAI capability not supported: ${capability}`,
        );
    }
  },
};
