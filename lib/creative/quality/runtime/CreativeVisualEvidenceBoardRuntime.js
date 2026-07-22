import sharp from "sharp";

const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_REFERENCE_IMAGES = 6;
const BOARD_WIDTH = 1536;
const MASTER_HEIGHT = 1024;
const REFERENCE_WIDTH = 768;
const REFERENCE_HEIGHT = 512;
const LABEL_HEIGHT = 64;

function list(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function selectedAssets(assets = {}) {
  if (Array.isArray(assets)) return assets.filter(Boolean);
  return list(assets.selectedAssets);
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

function assetRoles(asset = {}) {
  return [
    ...list(asset.reference_roles),
    ...list(asset.reference_role),
    ...list(asset.roles),
    ...list(asset.role),
    ...list(asset.metadata?.reference_roles),
    ...list(asset.metadata?.reference_role),
    ...list(asset.analysis?.reference_roles),
  ].map(String);
}

function parseDataUrl(value) {
  const match = String(value || "").match(
    /^data:([^;,]+)?(;base64)?,([\s\S]+)$/i,
  );
  if (!match) return null;

  const bytes = match[2]
    ? Buffer.from(match[3], "base64")
    : Buffer.from(decodeURIComponent(match[3]));

  return {
    bytes,
    content_type: match[1] || "image/png",
  };
}

async function loadImage(value) {
  const data = parseDataUrl(value);
  if (data) {
    if (!data.bytes.length || data.bytes.length > MAX_SOURCE_BYTES) {
      throw new Error("CREATIVE_QA_EVIDENCE_IMAGE_SIZE_INVALID");
    }
    return data.bytes;
  }

  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error("CREATIVE_QA_EVIDENCE_HTTPS_REQUIRED");
  }

  const response = await fetch(url, {
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    throw new Error(
      `CREATIVE_QA_EVIDENCE_DOWNLOAD_FAILED_${response.status}`,
    );
  }

  const declaredLength = Number(
    response.headers.get("content-length") || 0,
  );
  if (declaredLength > MAX_SOURCE_BYTES) {
    throw new Error("CREATIVE_QA_EVIDENCE_IMAGE_TOO_LARGE");
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("image/")) {
    throw new Error("CREATIVE_QA_EVIDENCE_NOT_IMAGE");
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_SOURCE_BYTES) {
    throw new Error("CREATIVE_QA_EVIDENCE_IMAGE_SIZE_INVALID");
  }

  return bytes;
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function labelSvg(width, label) {
  const text = escapeXml(label).slice(0, 120);

  return Buffer.from(`
    <svg width="${width}" height="${LABEL_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#111111"/>
      <text x="24" y="41" fill="#ffffff" font-family="Arial, sans-serif" font-size="25" font-weight="700">${text}</text>
    </svg>
  `);
}

async function panel({
  image,
  width,
  height,
  label,
}) {
  const bodyHeight = height - LABEL_HEIGHT;
  const resized = await sharp(image)
    .rotate()
    .resize(width, bodyHeight, {
      fit: "contain",
      background: {
        r: 18,
        g: 18,
        b: 18,
        alpha: 1,
      },
      withoutEnlargement: false,
    })
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();

  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: {
        r: 18,
        g: 18,
        b: 18,
      },
    },
  })
    .composite([
      { input: resized, left: 0, top: LABEL_HEIGHT },
      { input: labelSvg(width, label), left: 0, top: 0 },
    ])
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();
}

function referenceLabel(asset, index) {
  const name =
    asset.name ||
    asset.title ||
    asset.file_name ||
    asset.id ||
    `Reference ${index + 1}`;
  const roles = assetRoles(asset);

  return roles.length
    ? `REFERENCE ${index + 1} — ${name} — ${roles.join(", ")}`
    : `REFERENCE ${index + 1} — ${name}`;
}

export const CreativeVisualEvidenceBoardRuntime = {
  async prepare({
    generated_image,
    assets = {},
  } = {}) {
    if (!generated_image) {
      throw new Error("CREATIVE_QA_GENERATED_IMAGE_REQUIRED");
    }

    const generatedUrl = String(generated_image);
    const references = [];
    const seen = new Set([generatedUrl]);

    for (const asset of selectedAssets(assets)) {
      const url = assetUrl(asset);
      if (!url || seen.has(String(url))) continue;
      seen.add(String(url));
      references.push({ asset, url: String(url) });
      if (references.length >= MAX_REFERENCE_IMAGES) break;
    }

    if (!references.length) {
      return {
        image: generated_image,
        evidence_board_created: false,
        reference_count: 0,
        manifest: [],
      };
    }

    const generatedBuffer = await loadImage(generatedUrl);
    const referenceBuffers = await Promise.all(
      references.map(({ url }) => loadImage(url)),
    );
    const masterPanel = await panel({
      image: generatedBuffer,
      width: BOARD_WIDTH,
      height: MASTER_HEIGHT,
      label: "GENERATED MASTER STILL — SUBJECT UNDER REVIEW",
    });
    const referencePanels = await Promise.all(
      references.map(({ asset }, index) => panel({
        image: referenceBuffers[index],
        width: REFERENCE_WIDTH,
        height: REFERENCE_HEIGHT,
        label: referenceLabel(asset, index),
      })),
    );
    const referenceRows = Math.ceil(referencePanels.length / 2);
    const boardHeight = MASTER_HEIGHT +
      referenceRows * REFERENCE_HEIGHT;
    const composites = [
      { input: masterPanel, left: 0, top: 0 },
      ...referencePanels.map((input, index) => ({
        input,
        left: (index % 2) * REFERENCE_WIDTH,
        top: MASTER_HEIGHT +
          Math.floor(index / 2) * REFERENCE_HEIGHT,
      })),
    ];
    const board = await sharp({
      create: {
        width: BOARD_WIDTH,
        height: boardHeight,
        channels: 3,
        background: {
          r: 8,
          g: 8,
          b: 8,
        },
      },
    })
      .composite(composites)
      .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
      .toBuffer();

    return {
      image: `data:image/jpeg;base64,${board.toString("base64")}`,
      evidence_board_created: true,
      reference_count: references.length,
      manifest: references.map(({ asset, url }, index) => ({
        index: index + 1,
        asset_id: asset.id || asset.asset_id || null,
        name:
          asset.name ||
          asset.title ||
          asset.file_name ||
          null,
        roles: assetRoles(asset),
        source_url_present: Boolean(url),
      })),
    };
  },
};
