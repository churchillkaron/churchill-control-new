function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positive(value, fallback = null) {
  const number = finite(value, fallback);
  return number !== null && number > 0 ? number : fallback;
}

function slug(value, fallback = "variant") {
  return text(value || fallback)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || fallback;
}

export function unwrapStillOutput(value = {}) {
  let current = value;
  const seen = new Set();
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const next = current.output || current.result || current.data || null;
    if (!next || next === current) break;
    current = next;
  }
  return current || {};
}

export function stillOutputUrl(value = {}) {
  const candidates = [
    value,
    value.output,
    value.result,
    value.provider_submission,
    value.provider_submission?.output,
  ];
  for (const candidate of candidates.filter(Boolean)) {
    const resolved = unwrapStillOutput(candidate);
    const url = resolved.url || resolved.file_url || resolved.fileUrl ||
      resolved.image_url || resolved.imageUrl || resolved.images?.[0]?.url ||
      resolved.files?.[0]?.url || null;
    if (url) return url;
  }
  return null;
}

function normaliseFormat(value) {
  const format = text(value || "png").replace(/^\./, "").toLowerCase();
  if (["jpg", "jpeg", "png", "webp", "avif"].includes(format)) {
    return format === "jpeg" ? "jpg" : format;
  }
  throw new Error(`CREATIVE_STILL_FORMAT_UNSUPPORTED:${format || "UNKNOWN"}`);
}

function normaliseVariant(value = {}, index, fallback = {}) {
  const variant = object(value);
  const width = positive(variant.width ?? fallback.width);
  const height = positive(variant.height ?? fallback.height);
  if (!width || !height) {
    throw new Error(`CREATIVE_STILL_VARIANT_DIMENSIONS_REQUIRED:${index + 1}`);
  }
  return {
    id: slug(variant.id || variant.name || variant.channel || `variant-${index + 1}`),
    name: text(variant.name || variant.id || variant.channel || `Variant ${index + 1}`),
    channel: text(variant.channel),
    width: Math.round(width),
    height: Math.round(height),
    format: normaliseFormat(variant.format || variant.extension || fallback.format),
    fit: text(variant.fit || fallback.fit || "cover").toLowerCase(),
    position: variant.position || fallback.position || "centre",
    background: variant.background || fallback.background || { r: 0, g: 0, b: 0, alpha: 0 },
    quality: Math.max(1, Math.min(100, Math.round(positive(variant.quality ?? fallback.quality, 92)))),
    without_enlargement: variant.without_enlargement ?? variant.withoutEnlargement ?? fallback.without_enlargement ?? false,
    metadata: object(variant.metadata),
  };
}

function normaliseTextLayer(value = {}, index) {
  const layer = object(value);
  const content = text(layer.text ?? layer.content ?? layer.value);
  if (!content) throw new Error(`CREATIVE_STILL_TEXT_CONTENT_REQUIRED:${index + 1}`);
  return {
    id: slug(layer.id || layer.role || `text-${index + 1}`),
    role: text(layer.role || "copy"),
    text: content,
    x: finite(layer.x, 0),
    y: finite(layer.y, 0),
    width: positive(layer.width),
    height: positive(layer.height),
    font_size: positive(layer.font_size ?? layer.fontSize, 48),
    font_family: text(layer.font_family ?? layer.fontFamily ?? "sans-serif"),
    font_weight: text(layer.font_weight ?? layer.fontWeight ?? "normal"),
    fill: text(layer.fill || layer.color || "#ffffff"),
    align: text(layer.align || layer.text_align || "left").toLowerCase(),
    line_height: positive(layer.line_height ?? layer.lineHeight, 1.15),
    letter_spacing: finite(layer.letter_spacing ?? layer.letterSpacing, 0),
    opacity: Math.max(0, Math.min(1, finite(layer.opacity, 1))),
    required: layer.required !== false,
    metadata: object(layer.metadata),
  };
}

function normaliseLogoLayer(value = {}, index) {
  const layer = object(value);
  return {
    id: slug(layer.id || layer.role || `logo-${index + 1}`),
    role: text(layer.role || "logo"),
    asset_id: text(layer.asset_id || layer.assetId),
    x: finite(layer.x, 0),
    y: finite(layer.y, 0),
    width: positive(layer.width),
    height: positive(layer.height),
    fit: text(layer.fit || "contain").toLowerCase(),
    opacity: Math.max(0, Math.min(1, finite(layer.opacity, 1))),
    required: layer.required !== false,
    metadata: object(layer.metadata),
  };
}

export function resolveStillDesign(task = {}) {
  const spec = {
    ...object(task.input?.requirements?.output_spec),
    ...object(task.input?.output_spec),
    ...object(task.metadata?.output_spec),
  };
  const variantsInput = list(spec.variants || spec.exports || spec.channel_variants || spec.channelVariants);
  const fallback = {
    width: spec.width,
    height: spec.height,
    format: spec.format || spec.extension,
    fit: spec.fit,
    position: spec.position,
    background: spec.background,
    quality: spec.quality,
    without_enlargement: spec.without_enlargement ?? spec.withoutEnlargement,
  };
  const variants = (variantsInput.length ? variantsInput : [fallback])
    .map((variant, index) => normaliseVariant(variant, index, fallback));

  const textLayers = list(
    spec.text_layers || spec.textLayers || spec.copy_layers || spec.copyLayers,
  ).map(normaliseTextLayer);
  const legal = list(spec.legal_copy || spec.legalCopy);
  if (typeof spec.legal_copy === "string" || typeof spec.legalCopy === "string") {
    legal.push(spec.legal_copy || spec.legalCopy);
  }
  for (const [index, value] of legal.entries()) {
    textLayers.push(normaliseTextLayer({
      id: `legal-${index + 1}`,
      role: "legal",
      text: value,
      ...(object(spec.legal_style || spec.legalStyle)),
    }, textLayers.length));
  }

  const logoLayers = list(
    spec.logo_layers || spec.logoLayers || spec.brand_asset_layers || spec.brandAssetLayers,
  ).map(normaliseLogoLayer);
  const exactBrandRequired = spec.exact_brand_assets_required === true ||
    spec.exactBrandAssetsRequired === true || spec.logo_required === true ||
    spec.logoRequired === true;
  if (exactBrandRequired && !logoLayers.length) {
    throw new Error("CREATIVE_STILL_LOGO_LAYER_REQUIRED");
  }

  return {
    variants,
    text_layers: textLayers,
    logo_layers: logoLayers,
    exact_brand_assets_required: exactBrandRequired,
    preserve_source_identity: spec.preserve_source_identity !== false && spec.preserveSourceIdentity !== false,
    output_spec: spec,
  };
}

export function resolveCanvasMetric(value, total, fallback = 0) {
  const number = finite(value, fallback);
  if (number === null) return fallback;
  if (number >= 0 && number <= 1) return Math.round(number * total);
  return Math.round(number);
}

export function explicitStillQualityPass(value = {}) {
  const evidence = object(unwrapStillOutput(value));
  if (evidence.passed === true || evidence.approved === true || evidence.release_readiness === true) {
    return true;
  }
  const verdict = text(
    evidence.verdict || evidence.status || evidence.result || evidence.decision,
  ).toUpperCase();
  return ["PASS", "PASSED", "APPROVED", "READY", "RELEASE_READY"].includes(verdict);
}

export function stillQualityFailures(value = {}) {
  const evidence = object(unwrapStillOutput(value));
  return [
    ...list(evidence.failed_checks),
    ...list(evidence.failures),
    ...list(evidence.critical_failures),
    ...list(evidence.issues).map((item) => typeof item === "string" ? item : item?.message || item?.issue),
  ].filter(Boolean).map(String);
}

export const StillDesignContractRuntime = {
  resolve: resolveStillDesign,
  outputUrl: stillOutputUrl,
  unwrap: unwrapStillOutput,
};
