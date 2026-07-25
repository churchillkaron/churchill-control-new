import { createHash } from "node:crypto";
import sharp from "sharp";

const POSITION_VALUES = new Set([
  "TOP_LEFT",
  "TOP_CENTER",
  "TOP_RIGHT",
  "CENTER",
  "BOTTOM_LEFT",
  "BOTTOM_CENTER",
  "BOTTOM_RIGHT",
]);

function list(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function text(value) {
  return String(value || "").trim();
}

function aliases(asset = {}) {
  return [
    asset.id,
    asset.asset_id,
    asset.creative_asset_id,
    asset.source_asset_id,
    asset.reference_asset_id,
    asset.metadata?.source_asset_id,
    asset.metadata?.creative_asset_id,
  ].filter(Boolean).map(String);
}

function assetUrl(asset = {}) {
  return text(
    asset.image_url ||
    asset.file_url ||
    asset.url ||
    asset.thumbnail_url,
  );
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function dataUrlBuffer(value = "") {
  const match = String(value).match(/^data:([^;,]+)?(?:;base64)?,(.*)$/s);
  if (!match) return null;
  return Buffer.from(match[2] || "", "base64");
}

async function fetchBuffer(url) {
  const inline = dataUrlBuffer(url);
  if (inline) return inline;

  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`CREATIVE_IMAGE_DOWNLOAD_FAILED_${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function signature(buffer) {
  const normalized = await sharp(buffer, { failOn: "none" })
    .rotate()
    .resize(32, 32, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer();
  const structure = await sharp(buffer, { failOn: "none" })
    .rotate()
    .resize(17, 16, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer();
  const bits = [];

  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      const left = structure[y * 17 + x];
      const right = structure[y * 17 + x + 1];
      bits.push(left > right ? 1 : 0);
    }
  }

  return {
    normalized,
    normalized_sha256: sha256(normalized),
    structure_bits: bits,
  };
}

function hamming(left = [], right = []) {
  const length = Math.min(left.length, right.length);
  let distance = Math.abs(left.length - right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) distance += 1;
  }
  return distance;
}

function colourRmse(left, right) {
  const length = Math.min(left.length, right.length);
  if (!length) return 1;
  let squared = 0;
  for (let index = 0; index < length; index += 1) {
    const delta = Number(left[index]) - Number(right[index]);
    squared += delta * delta;
  }
  return Math.sqrt(squared / length) / 255;
}

function qualityError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.quality_review = {
    passed: false,
    score: 0,
    deterministic: true,
    critical_failures: [code],
    issues: [details],
    correction_instructions: [
      "Regenerate a materially different story frame with a distinct decisive action, camera relationship and composition while preserving continuity and evidence fidelity.",
    ],
  };
  return error;
}

function placementContract(task = {}) {
  const shot = task.input?.specification?.shot || {};
  const scene = task.input?.specification?.scene || {};
  return (
    shot.brand_overlay ||
    shot.exact_brand_overlay ||
    shot.composition_plan?.brand_overlay ||
    shot.composition_plan?.exact_brand_overlay ||
    scene.brand_overlay ||
    scene.exact_brand_overlay ||
    null
  );
}

function resolveBrandAsset(brandAssets = [], placement = {}) {
  const requestedId = text(
    placement.asset_id ||
    placement.brand_asset_id ||
    placement.source_asset_id,
  );
  if (requestedId) {
    return list(brandAssets).find((asset) => aliases(asset).includes(requestedId)) || null;
  }
  return list(brandAssets).length === 1 ? brandAssets[0] : null;
}

function normalizedPlacement(task = {}) {
  const placement = placementContract(task);
  if (!placement || placement.required !== true) return null;

  const position = text(placement.position || placement.region).toUpperCase();
  const widthRatio = Number(placement.width_ratio || placement.size_ratio || 0);
  const marginRatio = Number(placement.margin_ratio ?? 0.04);

  if (!POSITION_VALUES.has(position)) {
    throw qualityError("CREATIVE_EXACT_BRAND_POSITION_INVALID", { position });
  }
  if (!(widthRatio >= 0.05 && widthRatio <= 0.5)) {
    throw qualityError("CREATIVE_EXACT_BRAND_WIDTH_RATIO_INVALID", { width_ratio: widthRatio });
  }
  if (!(marginRatio >= 0 && marginRatio <= 0.2)) {
    throw qualityError("CREATIVE_EXACT_BRAND_MARGIN_RATIO_INVALID", { margin_ratio: marginRatio });
  }

  return {
    ...placement,
    position,
    width_ratio: widthRatio,
    margin_ratio: marginRatio,
  };
}

function coordinates({ position, baseWidth, baseHeight, overlayWidth, overlayHeight, margin }) {
  const horizontal = position.endsWith("LEFT")
    ? margin
    : position.endsWith("RIGHT")
      ? baseWidth - overlayWidth - margin
      : Math.round((baseWidth - overlayWidth) / 2);
  const vertical = position.startsWith("TOP")
    ? margin
    : position.startsWith("BOTTOM")
      ? baseHeight - overlayHeight - margin
      : Math.round((baseHeight - overlayHeight) / 2);

  return {
    left: Math.max(0, Math.min(baseWidth - overlayWidth, Math.round(horizontal))),
    top: Math.max(0, Math.min(baseHeight - overlayHeight, Math.round(vertical))),
  };
}

export const CreativeDeterministicImageQualityRuntime = {
  assertExactBrandOverlayContract({ task = {}, brand_assets = [], required = false } = {}) {
    if (!required) return null;
    const placement = normalizedPlacement(task);
    if (!placement) {
      throw qualityError("CREATIVE_EXACT_BRAND_PLACEMENT_CONTRACT_REQUIRED");
    }
    const asset = resolveBrandAsset(brand_assets, placement);
    if (!asset || !assetUrl(asset)) {
      throw qualityError("CREATIVE_EXACT_BRAND_ASSET_AMBIGUOUS_OR_MISSING", {
        requested_asset_id: placement.asset_id || null,
        available_asset_ids: list(brand_assets).flatMap(aliases),
      });
    }
    return { placement, asset };
  },

  async applyExactBrandOverlay({
    task = {},
    image_url,
    brand_assets = [],
    required = false,
  } = {}) {
    if (!required) {
      return { url: image_url, applied: false, diagnostics: null };
    }

    const { placement, asset } = this.assertExactBrandOverlayContract({
      task,
      brand_assets,
      required,
    });
    const baseBuffer = await fetchBuffer(image_url);
    const brandBuffer = await fetchBuffer(assetUrl(asset));
    const base = sharp(baseBuffer, { failOn: "none" }).rotate();
    const metadata = await base.metadata();
    const baseWidth = Number(metadata.width || 0);
    const baseHeight = Number(metadata.height || 0);

    if (!baseWidth || !baseHeight) {
      throw qualityError("CREATIVE_EXACT_BRAND_BASE_DIMENSIONS_INVALID");
    }

    const targetWidth = Math.max(1, Math.round(baseWidth * placement.width_ratio));
    const margin = Math.max(0, Math.round(Math.min(baseWidth, baseHeight) * placement.margin_ratio));
    const overlayBuffer = await sharp(brandBuffer, { failOn: "none" })
      .rotate()
      .resize({ width: targetWidth, fit: "inside", withoutEnlargement: false })
      .png()
      .toBuffer();
    const overlayMetadata = await sharp(overlayBuffer).metadata();
    const overlayWidth = Number(overlayMetadata.width || 0);
    const overlayHeight = Number(overlayMetadata.height || 0);
    const point = coordinates({
      position: placement.position,
      baseWidth,
      baseHeight,
      overlayWidth,
      overlayHeight,
      margin,
    });
    const output = await base
      .composite([{ input: overlayBuffer, left: point.left, top: point.top }])
      .png()
      .toBuffer();

    return {
      url: `data:image/png;base64,${output.toString("base64")}`,
      applied: true,
      diagnostics: {
        version: "CREATIVE_EXACT_BRAND_COMPOSITOR_V10",
        source_asset_id: aliases(asset)[0] || null,
        source_asset_sha256: sha256(brandBuffer),
        output_sha256: sha256(output),
        exact_source_asset_raster_used: true,
        placement: {
          position: placement.position,
          width_ratio: placement.width_ratio,
          margin_ratio: placement.margin_ratio,
          left: point.left,
          top: point.top,
          width: overlayWidth,
          height: overlayHeight,
        },
      },
    };
  },

  async assertUniqueMasterStill({
    candidate_url,
    comparison_urls = [],
    hamming_threshold = 12,
    colour_rmse_threshold = 0.06,
  } = {}) {
    const comparisons = [...new Set(list(comparison_urls).map(text).filter(Boolean))];
    if (!candidate_url || !comparisons.length) {
      return {
        version: "CREATIVE_DETERMINISTIC_MASTER_STILL_DUPLICATE_GATE_V10",
        compared: 0,
        passed: true,
      };
    }

    const candidate = await signature(await fetchBuffer(candidate_url));
    const diagnostics = [];

    for (const comparisonUrl of comparisons) {
      const comparison = await signature(await fetchBuffer(comparisonUrl));
      const exact = candidate.normalized_sha256 === comparison.normalized_sha256;
      const hammingDistance = hamming(
        candidate.structure_bits,
        comparison.structure_bits,
      );
      const colourDistance = colourRmse(
        candidate.normalized,
        comparison.normalized,
      );
      const near = hammingDistance <= hamming_threshold &&
        colourDistance <= colour_rmse_threshold;
      const result = {
        comparison_url: comparisonUrl,
        exact,
        near,
        hamming_distance: hammingDistance,
        colour_rmse: Number(colourDistance.toFixed(6)),
      };
      diagnostics.push(result);

      if (exact) {
        throw qualityError("CREATIVE_MASTER_STILL_EXACT_DUPLICATE", result);
      }
      if (near) {
        throw qualityError("CREATIVE_MASTER_STILL_PERCEPTUAL_DUPLICATE", result);
      }
    }

    return {
      version: "CREATIVE_DETERMINISTIC_MASTER_STILL_DUPLICATE_GATE_V10",
      compared: diagnostics.length,
      passed: true,
      candidate_normalized_sha256: candidate.normalized_sha256,
      comparisons: diagnostics,
    };
  },
};
