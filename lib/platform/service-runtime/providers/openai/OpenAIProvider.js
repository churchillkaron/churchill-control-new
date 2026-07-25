import OpenAI, { toFile } from "openai";
import sharp from "sharp";

import {
  CredentialRuntime,
} from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";

const MAX_REFERENCE_BYTES = 20 * 1024 * 1024;
const MAX_REFERENCE_IMAGES = 6;
const MAX_MASK_BYTES = 4 * 1024 * 1024;
const DEFAULT_STRUCTURED_OUTPUT_TOKENS = 12000;
const OPENAI_IMAGE_PROMPT_HARD_LIMIT = 32000;
const OPENAI_IMAGE_PROMPT_SAFE_LIMIT = 30000;
const MASKED_MODES = new Set([
  "IMMUTABLE_PLATE_MASKED_CAST",
  "MASKED_CAST_COMPOSITE",
  "CREATIVE_MASKED_REFERENCE_EDIT",
]);

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

function list(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
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

async function readImageBytes(url, {
  maximumBytes = MAX_REFERENCE_BYTES,
  requirePng = false,
  errorPrefix = "REFERENCE_IMAGE",
} = {}) {
  const data = parseDataUrl(url);
  let bytes;
  let contentType;

  if (data) {
    ({ bytes, contentType } = data);
  } else {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      throw new Error(`${errorPrefix}_HTTPS_REQUIRED`);
    }

    const response = await fetch(parsed, {
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      throw new Error(`${errorPrefix}_DOWNLOAD_FAILED_${response.status}`);
    }

    const declaredLength = Number(
      response.headers.get("content-length") || 0,
    );
    if (declaredLength > maximumBytes) {
      throw new Error(`${errorPrefix}_TOO_LARGE`);
    }

    contentType = response.headers.get("content-type") || "image/png";
    if (!contentType.toLowerCase().startsWith("image/")) {
      throw new Error(`${errorPrefix}_IS_NOT_AN_IMAGE`);
    }

    bytes = Buffer.from(await response.arrayBuffer());
  }

  if (!bytes?.length) {
    throw new Error(`${errorPrefix}_EMPTY`);
  }
  if (bytes.length > maximumBytes) {
    throw new Error(`${errorPrefix}_TOO_LARGE`);
  }
  if (
    requirePng &&
    !String(contentType || "").toLowerCase().includes("png")
  ) {
    throw new Error(`${errorPrefix}_PNG_REQUIRED`);
  }

  return {
    bytes,
    contentType: contentType || "image/png",
  };
}

async function readReferenceImage(url, index) {
  const image = await readImageBytes(url);

  return {
    ...image,
    file: await toFile(
      image.bytes,
      `reference-${index + 1}.${fileExtension(image.contentType)}`,
      { type: image.contentType },
    ),
  };
}

async function referenceImages(assets = {}) {
  const urls = referenceUrls(assets);
  return Promise.all(
    urls.map((url, index) => readReferenceImage(url, index)),
  );
}

// CREATIVE_OPENAI_FINAL_PROMPT_BUDGET_V2
function enforceOpenAIImagePromptBudget(value) {
  const prompt = String(value || "").trim();
  if (prompt.length <= OPENAI_IMAGE_PROMPT_SAFE_LIMIT) return prompt;

  const suffix = [
    "[Provider payload compacted at the final OpenAI boundary.]",
    "The structured scene, shot, evidence, casting, reference and quality contracts remain authoritative.",
    "Preserve approved evidence, physical blocking, identity boundaries, location geometry, product truth, wardrobe continuity, brand safety, anatomy, realism and all mandatory corrections.",
  ].join(" ");
  const maximumPrefix = Math.max(
    0,
    OPENAI_IMAGE_PROMPT_SAFE_LIMIT - suffix.length - 2,
  );
  const compacted = prompt.slice(0, maximumPrefix).trim() + "\n\n" + suffix;

  if (compacted.length > OPENAI_IMAGE_PROMPT_HARD_LIMIT) {
    throw new Error("CREATIVE_OPENAI_IMAGE_PROMPT_BUDGET_EXCEEDED");
  }

  return compacted;
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
  composition_plan: shot.composition_plan,
})}

REFERENCE CONTRACT:
${references.length
    ? `${references.length} source image(s) are attached as actual visual inputs. The first image is authoritative when the composition contract declares a source plate.`
    : "No source images are attached. Create only from the approved specification."}
Preserve: ${JSON.stringify(referencePack.preserve || [])}
May change: ${JSON.stringify(referencePack.may_change || [])}
Never change: ${JSON.stringify(referencePack.never_change || [])}

QUALITY REQUIREMENTS:
${JSON.stringify(shot.quality_requirements || {})}

NEGATIVE CONSTRAINTS:
${JSON.stringify(shot.negative_constraints || [])}
- No identity drift, altered product geometry, misspelled logos, invented architecture, broken anatomy, duplicated objects, fake text, watermark, or artificial-looking skin.
- Exact brand marks and visible text may never be redrawn, approximated or hallucinated. Preserve verified source pixels when present; otherwise keep the designated area clean for an exact post-production overlay.
- Match every evidence-bound wardrobe in garment type, silhouette, colour, trim, markings and subject assignment.
- This frame must communicate its own distinct story action and composition rather than repeating another shot with minor pose changes.
- Use physically plausible light, contact shadows, reflections, scale, materials, hands, eye lines, and object placement.
- Keep the frame editorially usable as the approved first frame for image-to-video generation.
- When a native mask is supplied, change only transparent mask areas. Preserve every source pixel outside the mask.

MANDATORY CORRECTIONS FROM PRIOR QUALITY REVIEW:
${JSON.stringify(specification.quality_corrections || [])}

ADDITIONAL DIRECTION:
${prompt}
  `.trim();
}

function balancedJsonObject(value) {
  const source = String(value || "").trim();
  const start = source.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const character = source[index];

    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }

  return null;
}

function parseJson(value) {
  if (!value) return null;
  if (typeof value === "object") return value;

  const source = String(value)
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(source);
  } catch {
    const candidate = balancedJsonObject(source);
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

function compositionPlan(input = {}) {
  return (
    input.composition_plan ||
    input.specification?.shot?.composition_plan ||
    input.specification?.composition_plan ||
    {}
  );
}

function isMaskedEdit(input = {}) {
  const plan = compositionPlan(input);
  const mode = String(
    plan.mode || input.mode || "",
  ).toUpperCase();

  return Boolean(
    plan.mask_required === true ||
    plan.mask_asset_id ||
    plan.mask_image ||
    plan.mask_url ||
    list(plan.mask_regions || plan.edit_regions).length ||
    MASKED_MODES.has(mode),
  );
}

function normalizedNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) {
    throw new Error(`CREATIVE_MASK_${field}_INVALID`);
  }
  return number;
}

function normalizedRegion(region = {}, index = 0) {
  const type = String(region.type || region.shape || "").toUpperCase();
  const bindingKey = String(
    region.binding_key || region.key || region.id || `region-${index + 1}`,
  );
  const feather = Math.max(0, Number(region.feather_pixels || 12));

  if (type === "ELLIPSE") {
    const cx = normalizedNumber(region.cx, "ELLIPSE_CX");
    const cy = normalizedNumber(region.cy, "ELLIPSE_CY");
    const rx = normalizedNumber(region.rx, "ELLIPSE_RX");
    const ry = normalizedNumber(region.ry, "ELLIPSE_RY");

    if (!rx || !ry || cx - rx < 0 || cy - ry < 0 || cx + rx > 1 || cy + ry > 1) {
      throw new Error(`CREATIVE_MASK_REGION_${index + 1}_OUT_OF_BOUNDS`);
    }

    return { type, binding_key: bindingKey, cx, cy, rx, ry, feather_pixels: feather };
  }

  if (type === "POLYGON") {
    const points = list(region.points).map((point, pointIndex) => ({
      x: normalizedNumber(point.x, `POLYGON_${pointIndex + 1}_X`),
      y: normalizedNumber(point.y, `POLYGON_${pointIndex + 1}_Y`),
    }));

    if (points.length < 3) {
      throw new Error(`CREATIVE_MASK_REGION_${index + 1}_POLYGON_INCOMPLETE`);
    }

    return { type, binding_key: bindingKey, points, feather_pixels: feather };
  }

  throw new Error(`CREATIVE_MASK_REGION_${index + 1}_NON_RECTANGULAR_SHAPE_REQUIRED`);
}

function regionSvg(region, width, height) {
  if (region.type === "ELLIPSE") {
    return `<ellipse cx="${region.cx * width}" cy="${region.cy * height}" rx="${region.rx * width}" ry="${region.ry * height}" fill="black" />`;
  }

  const points = region.points
    .map((point) => `${point.x * width},${point.y * height}`)
    .join(" ");
  return `<polygon points="${points}" fill="black" />`;
}

async function generatedMask({
  sourceBytes,
  regions,
}) {
  const metadata = await sharp(sourceBytes).metadata();
  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);

  if (!width || !height) {
    throw new Error("CREATIVE_MASK_SOURCE_DIMENSIONS_REQUIRED");
  }

  const normalized = regions.map(normalizedRegion);
  if (!normalized.length) {
    throw new Error("CREATIVE_MASK_REGIONS_REQUIRED");
  }

  const maximumFeather = Math.max(
    0,
    ...normalized.map((region) => region.feather_pixels),
  );
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="${maximumFeather}" />
        </filter>
        <mask id="edit-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}">
          <rect x="0" y="0" width="${width}" height="${height}" fill="white" />
          <g filter="url(#soft)">
            ${normalized.map((region) => regionSvg(region, width, height)).join("\n")}
          </g>
        </mask>
      </defs>
      <rect x="0" y="0" width="${width}" height="${height}" fill="white" mask="url(#edit-mask)" />
    </svg>
  `;
  const bytes = await sharp(Buffer.from(svg))
    .png({ compressionLevel: 9 })
    .toBuffer();

  if (bytes.length > MAX_MASK_BYTES) {
    throw new Error("CREATIVE_MASK_TOO_LARGE");
  }

  return {
    bytes,
    width,
    height,
    regions: normalized,
    source: "NORMALIZED_NON_RECTANGULAR_REGIONS",
  };
}

async function nativeMask(input, sourceBytes) {
  const plan = compositionPlan(input);
  const explicitMask =
    input.mask_image ||
    input.mask_url ||
    plan.mask_image ||
    plan.mask_url ||
    null;
  let mask;

  if (explicitMask) {
    const loaded = await readImageBytes(explicitMask, {
      maximumBytes: MAX_MASK_BYTES,
      requirePng: true,
      errorPrefix: "CREATIVE_MASK",
    });
    const sourceMetadata = await sharp(sourceBytes).metadata();
    const maskMetadata = await sharp(loaded.bytes).metadata();

    if (
      Number(sourceMetadata.width || 0) !== Number(maskMetadata.width || 0) ||
      Number(sourceMetadata.height || 0) !== Number(maskMetadata.height || 0)
    ) {
      throw new Error("CREATIVE_MASK_DIMENSIONS_MUST_MATCH_SOURCE");
    }

    mask = {
      bytes: loaded.bytes,
      width: maskMetadata.width,
      height: maskMetadata.height,
      regions: [],
      source: "EXPLICIT_PNG_MASK",
    };
  } else {
    mask = await generatedMask({
      sourceBytes,
      regions: list(plan.mask_regions || plan.edit_regions),
    });
  }

  return {
    ...mask,
    file: await toFile(mask.bytes, "creative-edit-mask.png", {
      type: "image/png",
    }),
  };
}

async function generateImage({
  client,
  prompt,
  assets,
  specification,
  mode,
  size = "1536x1024",
  input = {},
}) {
  const references = await referenceImages(assets);
  const files = references.map((reference) => reference.file);
  const finalPrompt = enforceOpenAIImagePromptBudget(
    buildMasterStillPrompt({
      prompt,
      assets,
      specification,
      mode,
    }),
  );
  const masked = isMaskedEdit({ ...input, specification, mode });
  let mask = null;
  let response;

  if (masked) {
    if (!references.length) {
      throw new Error("CREATIVE_MASKED_EDIT_SOURCE_IMAGE_REQUIRED");
    }

    mask = await nativeMask(
      { ...input, specification, mode },
      references[0].bytes,
    );
    response = await client.images.edit({
      model: "gpt-image-1",
      image: files.length === 1 ? files[0] : files,
      mask: mask.file,
      prompt: finalPrompt,
      size: size || "auto",
      quality: input.quality || "high",
      input_fidelity: "high",
      output_format: "png",
    });
  } else if (files.length) {
    response = await client.images.edit({
      model: "gpt-image-1",
      image: files.length === 1 ? files[0] : files,
      prompt: finalPrompt,
      size,
      quality: input.quality || "high",
      input_fidelity: "high",
      output_format: "png",
    });
  } else {
    response = await client.images.generate({
      model: "gpt-image-1",
      prompt: finalPrompt,
      size,
    });
  }

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
      reference_mode: masked
        ? "PROVIDER_NATIVE_MASKED_IMAGE_EDIT"
        : files.length
          ? "PROVIDER_NATIVE_IMAGE_EDIT"
          : "TEXT_TO_IMAGE",
      native_mask_applied: masked,
      mask_source: mask?.source || null,
      mask_width: mask?.width || null,
      mask_height: mask?.height || null,
      mask_region_count: mask?.regions?.length || 0,
      exact_pixels_outside_mask_requested: masked,
    },
  };
}

// CREATIVE_OPENAI_STRUCTURED_RECOVERY_V8
// CREATIVE_OPENAI_STRUCTURED_RECOVERY_ESCAPE_V8_1
function responseOutputText(response = {}) {
  const direct = String(response.output_text || "").trim();
  if (direct) return direct;

  return list(response.output)
    .flatMap((item) => list(item?.content))
    .map((content) =>
      content?.text ||
      content?.output_text ||
      content?.value ||
      ""
    )
    .filter(Boolean)
    .join("\n")
    .trim();
}

function responseRefusal(response = {}) {
  return list(response.output)
    .flatMap((item) => list(item?.content))
    .map((content) => content?.refusal || "")
    .find(Boolean) || null;
}

function structuredAttemptSummary(response = {}, outputText = "") {
  return {
    status: response.status || null,
    incomplete_details: response.incomplete_details || null,
    output_length: outputText.length,
    refusal: responseRefusal(response),
  };
}

function structuredRepairInput({ prompt, messages }) {
  const instruction =
    "The previous attempt did not return a complete valid JSON object. Return the full answer again, compactly, matching the required JSON schema exactly. Include every required field. Use concise strings and bounded arrays. Do not add markdown, commentary, code fences, or text outside the JSON object.";

  if (Array.isArray(messages) && messages.length) {
    return [
      { role: "system", content: instruction },
      ...messages,
    ];
  }

  return [
    { role: "system", content: instruction },
    { role: "user", content: String(prompt || "") },
  ];
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
    store: false,
  };

  if (format) request.text = { format };
  if (outputTokens) request.max_output_tokens = outputTokens;

  const attempts = [];
  let response = await client.responses.create(request);
  let outputText = responseOutputText(response);
  let json = format ? parseJson(outputText) : null;
  attempts.push(structuredAttemptSummary(response, outputText));

  if (format && !json && !responseRefusal(response)) {
    const repairRequest = {
      model,
      input: structuredRepairInput({ prompt, messages }),
      text: { format },
      max_output_tokens: Math.max(
        outputTokens || DEFAULT_STRUCTURED_OUTPUT_TOKENS,
        DEFAULT_STRUCTURED_OUTPUT_TOKENS,
      ),
      store: false,
    };

    response = await client.responses.create(repairRequest);
    outputText = responseOutputText(response);
    json = parseJson(outputText);
    attempts.push(structuredAttemptSummary(response, outputText));
  }

  if (format && !json) {
    const error = new Error("OPENAI_STRUCTURED_JSON_INVALID");
    error.provider_response = {
      attempts,
      response_format: format.type || null,
      response_format_name: format.name || null,
      response_format_strict: format.strict === true,
    };
    throw error;
  }

  return {
    success: true,
    provider: "openai",
    model,
    output: {
      text: outputText,
      json,
      response_format: format?.type || "text",
      response_format_name: format?.name || null,
      response_format_strict: format?.strict === true,
      response_status: response.status || null,
      incomplete_details: response.incomplete_details || null,
      structured_attempt_count: attempts.length,
    },
  };
}

// CREATIVE_VISUAL_EVIDENCE_COMPARISON_QA_V5
async function analyzeImage({
  client,
  model,
  prompt,
  image,
  assets,
  mode,
  minimumScore = 90,
  comparisonImages = [],
  referenceManifest = [],
  evidenceManifest = {},
  specification = {},
}) {
  const resolvedImage =
    image ||
    assetUrl(selectedAssets(assets)[0] || {});

  if (!resolvedImage) {
    throw new Error("image required for visual analysis");
  }

  const evidenceUrls = referenceUrls(assets)
    .filter((url) => url && url !== resolvedImage)
    .slice(0, 6);
  const comparisonUrls = [...new Set(list(comparisonImages).filter(Boolean))]
    .filter((url) => url !== resolvedImage)
    .slice(0, 6);
  const masterStillQa = mode === "creative_master_still_qa";
  const analysisPrompt = masterStillQa
    ? [
        prompt || "Inspect this generated master still.",
        "The first image is the GENERATED FRAME under review.",
        "The following EVIDENCE images are authoritative references. Compare the generated frame against the exact roles assigned in the evidence manifest.",
        "The final COMPARISON images are previously generated story frames. Reject exact duplicates, near-duplicates, repeated dominant action, repeated composition, repeated camera relationship or a sequence that does not advance the story.",
        "Return strict JSON with: passed, overall_score, critical_failures, issues, correction_instructions, release_readiness, evidence_fidelity, and story_distinctiveness.",
        "evidence_fidelity must contain LOCATION, IDENTITY, WARDROBE, PRODUCT, BRAND, TEXT and STYLE objects with required, passed, score, matched_reference_asset_ids and issues.",
        "story_distinctiveness must contain passed, duplicate_of_previous, repeated_action, repeated_composition, repeated_camera_relationship, narrative_progression_visible and issues.",
        "Any fabricated, approximate, misspelled or substituted logo/wordmark fails BRAND and TEXT. Any clothing that does not match bound wardrobe evidence fails WARDROBE. Any generic substitute for the referenced place fails LOCATION.",
        "EVIDENCE ROLE MANIFEST: " + JSON.stringify(evidenceManifest || {}),
        "REFERENCE MANIFEST: " + JSON.stringify(referenceManifest || []),
        "SHOT CONTRACT: " + JSON.stringify(specification?.shot || {}),
      ].join("\n\n")
    : prompt || "Analyze this image and return strict JSON.";
  const content = [
    { type: "input_text", text: analysisPrompt },
    { type: "input_text", text: "GENERATED FRAME TO INSPECT" },
    { type: "input_image", image_url: resolvedImage },
    ...evidenceUrls.flatMap((url, index) => [
      { type: "input_text", text: "AUTHORITATIVE EVIDENCE IMAGE " + (index + 1) },
      { type: "input_image", image_url: url },
    ]),
    ...comparisonUrls.flatMap((url, index) => [
      { type: "input_text", text: "PREVIOUS STORY FRAME " + (index + 1) },
      { type: "input_image", image_url: url },
    ]),
  ];

  const response = await client.responses.create({
    model,
    input: [
      {
        role: "user",
        content,
      },
    ],
    text: {
      format: { type: "json_object" },
    },
    max_output_tokens: 4000,
  });

  const outputText = response.output_text || "";
  const json = parseJson(outputText);

  if (!json) {
    throw new Error("OPENAI_IMAGE_ANALYSIS_INVALID_JSON");
  }

  if (mode === "creative_master_still_qa") {
    const overallScore = Number(json.overall_score || 0);
    const criticalFailures = Array.isArray(json.critical_failures)
      ? json.critical_failures.filter(Boolean)
      : [];
    const requiredRoles = list(evidenceManifest?.required_roles)
      .map((role) => String(role).toUpperCase());
    const fidelity = json.evidence_fidelity && typeof json.evidence_fidelity === "object"
      ? json.evidence_fidelity
      : {};
    const failedEvidenceRoles = requiredRoles.filter((role) => {
      const result = fidelity[role] || fidelity[role.toLowerCase()] || null;
      if (!result) return true;
      const score = Number(result.score ?? 0);
      return result.passed !== true || !Number.isFinite(score) || score < 85;
    });
    const distinctiveness = json.story_distinctiveness &&
      typeof json.story_distinctiveness === "object"
      ? json.story_distinctiveness
      : {};
    const duplicateFailure = comparisonUrls.length > 0 && (
      distinctiveness.passed !== true ||
      distinctiveness.duplicate_of_previous === true ||
      distinctiveness.repeated_action === true ||
      distinctiveness.repeated_composition === true ||
      distinctiveness.repeated_camera_relationship === true ||
      distinctiveness.narrative_progression_visible !== true
    );
    const passed =
      json.passed === true &&
      overallScore >= Number(minimumScore || 90) &&
      criticalFailures.length === 0 &&
      failedEvidenceRoles.length === 0 &&
      !duplicateFailure;

    if (!passed) {
      const error = new Error("MASTER_STILL_QUALITY_REJECTED");
      error.quality_review = {
        ...json,
        passed: false,
        minimum_score: Number(minimumScore || 90),
        failed_evidence_roles: failedEvidenceRoles,
        duplicate_or_story_repetition: duplicateFailure,
        evidence_image_count: evidenceUrls.length,
        comparison_image_count: comparisonUrls.length,
      };
      throw error;
    }
  }

  return {
    success: true,
    provider: "openai",
    model,
    output: {
      text: outputText,
      json,
      inspected_image_url: resolvedImage,
    },
  };
}

export const OpenAIProvider = {
  id: "openai",

  async execute(input = {}) {
    const {
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
      comparison_images,
      reference_manifest,
      evidence_role_manifest,
      response_format,
      max_output_tokens,
    } = input;
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
          input,
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
          comparisonImages: comparison_images,
          referenceManifest: reference_manifest,
          evidenceManifest: evidence_role_manifest,
          specification,
        });

      default:
        throw new Error(
          `OpenAI capability not supported: ${capability}`,
        );
    }
  },
};
