import sharp from "sharp";

const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 60000;

function list(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function selectedAssets(payload = {}) {
  if (Array.isArray(payload.assets)) return payload.assets.filter(Boolean);
  return list(payload.assets?.selectedAssets);
}

function assetUrl(asset = {}) {
  return (
    asset.image_url ||
    asset.file_url ||
    asset.url ||
    asset.thumbnail_url ||
    null
  );
}

function parseDataUrl(value) {
  const match = String(value || "").match(
    /^data:([^;,]+)?(;base64)?,([\s\S]+)$/i,
  );

  if (!match) return null;

  return {
    content_type: match[1] || "application/octet-stream",
    buffer: match[2]
      ? Buffer.from(match[3], "base64")
      : Buffer.from(decodeURIComponent(match[3])),
  };
}

async function downloadBuffer(value) {
  const inline = parseDataUrl(value);
  if (inline) {
    if (inline.buffer.length > MAX_IMAGE_BYTES) {
      throw new Error("CREATIVE_MASKED_IMAGE_TOO_LARGE");
    }
    return inline.buffer;
  }

  const parsed = new URL(value);
  if (parsed.protocol !== "https:") {
    throw new Error("CREATIVE_MASKED_IMAGE_HTTPS_REQUIRED");
  }

  const response = await fetch(parsed, {
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(
      `CREATIVE_MASKED_IMAGE_DOWNLOAD_FAILED_${response.status}`,
    );
  }

  const declaredLength = Number(
    response.headers.get("content-length") || 0,
  );
  if (declaredLength > MAX_IMAGE_BYTES) {
    throw new Error("CREATIVE_MASKED_IMAGE_TOO_LARGE");
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error("CREATIVE_MASKED_IMAGE_TOO_LARGE");
  }

  return buffer;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, Number(value || 0)));
}

function regionPixels(region = {}, width, height, index) {
  const normalized =
    String(region.coordinate_space || region.coordinateSpace || "")
      .toUpperCase() === "NORMALIZED" ||
    [region.x, region.y, region.width, region.height]
      .every((value) => Number(value) >= 0 && Number(value) <= 1);

  const left = normalized
    ? Math.round(clamp(region.x, 0, 1) * width)
    : Math.round(clamp(region.x, 0, width));
  const top = normalized
    ? Math.round(clamp(region.y, 0, 1) * height)
    : Math.round(clamp(region.y, 0, height));
  const regionWidth = normalized
    ? Math.round(clamp(region.width, 0, 1) * width)
    : Math.round(clamp(region.width, 0, width));
  const regionHeight = normalized
    ? Math.round(clamp(region.height, 0, 1) * height)
    : Math.round(clamp(region.height, 0, height));
  const safeWidth = Math.min(regionWidth, width - left);
  const safeHeight = Math.min(regionHeight, height - top);

  if (safeWidth < 8 || safeHeight < 8) {
    throw new Error(
      `CREATIVE_MASK_PLACEMENT_REGION_${index + 1}_INVALID`,
    );
  }

  return {
    id: region.id || `placement-${index + 1}`,
    role: region.role || null,
    left,
    top,
    width: safeWidth,
    height: safeHeight,
    normalized: {
      x: left / width,
      y: top / height,
      width: safeWidth / width,
      height: safeHeight / height,
    },
  };
}

function intersection(left, right) {
  const x = Math.max(left.left, right.left);
  const y = Math.max(left.top, right.top);
  const rightEdge = Math.min(
    left.left + left.width,
    right.left + right.width,
  );
  const bottomEdge = Math.min(
    left.top + left.height,
    right.top + right.height,
  );

  return {
    width: Math.max(0, rightEdge - x),
    height: Math.max(0, bottomEdge - y),
  };
}

function validateProtectedRegions(
  placementRegions,
  protectedRegions,
) {
  for (const placement of placementRegions) {
    for (const protectedRegion of protectedRegions) {
      const overlap = intersection(placement, protectedRegion);
      if (overlap.width > 0 && overlap.height > 0) {
        const error = new Error(
          "CREATIVE_MASK_OVERLAPS_PROTECTED_BRAND_REGION",
        );
        error.details = {
          placement_region: placement,
          protected_region: protectedRegion,
        };
        throw error;
      }
    }
  }
}

function sizeFor(width, height) {
  const ratio = width / height;
  if (ratio > 1.15) return "1536x1024";
  if (ratio < 0.87) return "1024x1536";
  return "1024x1024";
}

async function normalizedPng(buffer) {
  return sharp(buffer)
    .rotate()
    .ensureAlpha()
    .png()
    .toBuffer();
}

async function createMask({
  width,
  height,
  placement_regions,
}) {
  const base = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: {
        r: 0,
        g: 0,
        b: 0,
        alpha: 1,
      },
    },
  })
    .png()
    .toBuffer();

  const composites = placement_regions.map((region) => ({
    input: Buffer.from(
      `<svg width="${region.width}" height="${region.height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/></svg>`,
    ),
    left: region.left,
    top: region.top,
    blend: "dest-out",
  }));

  return sharp(base)
    .composite(composites)
    .png()
    .toBuffer();
}

function sourcePlateAsset(assets, contract) {
  const requested =
    contract.composition?.source_plate_asset_id ||
    contract.source_plate?.authoritative_asset_id ||
    null;

  if (!requested || requested === "AUTO_PRIMARY_REFERENCE") {
    return assets[0] || null;
  }

  return assets.find((asset) => String(asset.id) === String(requested)) || null;
}

export const CreativeMaskedCompositionRuntime = {
  async prepare({
    payload = {},
    contract = {},
  } = {}) {
    const assets = selectedAssets(payload);
    const sourceAsset = sourcePlateAsset(assets, contract);
    const sourceUrl = assetUrl(sourceAsset || {});

    if (!sourceAsset || !sourceUrl) {
      throw new Error("CREATIVE_MASK_SOURCE_PLATE_REQUIRED");
    }

    const sourceBuffer = await normalizedPng(
      await downloadBuffer(sourceUrl),
    );
    const metadata = await sharp(sourceBuffer).metadata();
    const width = Number(metadata.width || 0);
    const height = Number(metadata.height || 0);

    if (!width || !height) {
      throw new Error("CREATIVE_MASK_SOURCE_DIMENSIONS_REQUIRED");
    }

    const placementRegions = list(
      contract.composition?.placement_regions,
    ).map((region, index) =>
      regionPixels(region, width, height, index),
    );
    const protectedRegions = list(
      contract.composition?.protected_regions,
    ).map((region, index) =>
      regionPixels(region, width, height, index),
    );

    if (!placementRegions.length) {
      throw new Error("CREATIVE_MASK_PLACEMENT_REGION_REQUIRED");
    }

    const editedArea = placementRegions.reduce(
      (total, region) => total + region.width * region.height,
      0,
    );
    const editedRatio = editedArea / (width * height);

    if (editedRatio > 0.6) {
      throw new Error("CREATIVE_MASK_EDIT_AREA_TOO_LARGE");
    }

    validateProtectedRegions(
      placementRegions,
      protectedRegions,
    );

    const maskBuffer = await createMask({
      width,
      height,
      placement_regions: placementRegions,
    });
    const sourceDataUrl =
      `data:image/png;base64,${sourceBuffer.toString("base64")}`;
    const maskDataUrl =
      `data:image/png;base64,${maskBuffer.toString("base64")}`;
    const preparedSource = {
      ...sourceAsset,
      image_url: sourceDataUrl,
      file_url: sourceDataUrl,
      url: sourceDataUrl,
      reference_role: "IMMUTABLE_SOURCE_PLATE",
    };
    const remaining = assets.filter(
      (asset) => String(asset.id) !== String(sourceAsset.id),
    );

    return {
      payload: {
        ...payload,
        assets: {
          selectedAssets: [preparedSource, ...remaining],
        },
        source_image: sourceDataUrl,
        mask_data_url: maskDataUrl,
        mode: "creative_masked_reference_edit",
        size: sizeFor(width, height),
      },
      execution: {
        mode: "IMMUTABLE_PLATE_MASKED_EDIT",
        source_image_data_url: sourceDataUrl,
        mask_data_url: maskDataUrl,
        source_plate_asset_id: sourceAsset.id || null,
        width,
        height,
        placement_regions: placementRegions,
        protected_regions: protectedRegions,
        edited_area_ratio: editedRatio,
        exact_pixels_outside_mask_required: true,
      },
    };
  },

  async enforceImmutablePlate({
    source_image,
    generated_image,
    mask_data_url,
  } = {}) {
    if (!source_image || !generated_image || !mask_data_url) {
      throw new Error("CREATIVE_IMMUTABLE_COMPOSITE_INPUT_REQUIRED");
    }

    const sourceBuffer = await normalizedPng(
      await downloadBuffer(source_image),
    );
    const generatedBuffer = await normalizedPng(
      await downloadBuffer(generated_image),
    );
    const maskBuffer = await normalizedPng(
      await downloadBuffer(mask_data_url),
    );
    const metadata = await sharp(sourceBuffer).metadata();
    const width = Number(metadata.width || 0);
    const height = Number(metadata.height || 0);

    if (!width || !height) {
      throw new Error("CREATIVE_IMMUTABLE_COMPOSITE_DIMENSIONS_REQUIRED");
    }

    const generatedRgb = await sharp(generatedBuffer)
      .resize(width, height, { fit: "fill" })
      .removeAlpha()
      .png()
      .toBuffer();
    const editableAlpha = await sharp(maskBuffer)
      .resize(width, height, { fit: "fill" })
      .ensureAlpha()
      .extractChannel(3)
      .negate()
      .png()
      .toBuffer();
    const generatedLayer = await sharp(generatedRgb)
      .joinChannel(editableAlpha)
      .png()
      .toBuffer();
    const composite = await sharp(sourceBuffer)
      .composite([
        {
          input: generatedLayer,
          left: 0,
          top: 0,
          blend: "over",
        },
      ])
      .png()
      .toBuffer();

    return {
      data_url: `data:image/png;base64,${composite.toString("base64")}`,
      content_type: "image/png",
      width,
      height,
      exact_pixels_outside_mask_restored: true,
    };
  },
};
