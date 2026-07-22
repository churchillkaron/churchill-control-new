import {
  CreativeStorageRuntime,
} from "@/lib/creative/storage/runtime/CreativeStorageRuntime";

function extensionFor(contentType = "", fallbackType = "ASSET") {
  const normalized = String(contentType || "").toLowerCase();

  if (normalized.includes("png")) return "png";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("jpeg") || normalized.includes("jpg")) return "jpg";
  if (normalized.includes("mp4")) return "mp4";
  if (normalized.includes("quicktime")) return "mov";
  if (normalized.includes("mpeg")) return "mp3";
  if (normalized.includes("wav")) return "wav";

  return String(fallbackType || "asset").toLowerCase() === "image"
    ? "png"
    : String(fallbackType || "asset").toLowerCase() === "video"
      ? "mp4"
      : "bin";
}

function isCanonicalStorageUrl(url = "") {
  return String(url).includes("/storage/v1/object/public/creative-assets/");
}

export const CreativeProviderAssetIngestionRuntime = {
  async ingest({
    organization_id,
    creative_project_id,
    asset_id,
    type = "ASSET",
    url,
    provider = null,
    model = null,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");
    if (!asset_id) throw new Error("asset_id required");
    if (!url) throw new Error("provider asset url required");

    if (isCanonicalStorageUrl(url)) {
      return {
        public_url: url,
        storage_path: null,
        checksum: null,
        byte_size: null,
        content_type: null,
        reused_canonical_asset: true,
        provider,
        model,
      };
    }

    if (String(url).startsWith("data:")) {
      const contentType = String(url).slice(5).split(/[;,]/)[0];
      const extension = extensionFor(contentType, type);
      const stored = await CreativeStorageRuntime.uploadDataUrl({
        organization_id,
        creative_project_id,
        asset_id,
        data_url: url,
        filename: `provider-output.${extension}`,
      });

      return {
        ...stored,
        reused_canonical_asset: false,
        provider,
        model,
      };
    }

    const response = await fetch(url, {
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`PROVIDER_ASSET_DOWNLOAD_FAILED_${response.status}`);
    }

    const contentType =
      response.headers.get("content-type") ||
      "application/octet-stream";
    const extension = extensionFor(contentType, type);
    const stored = await CreativeStorageRuntime.uploadBuffer({
      organization_id,
      creative_project_id,
      asset_id,
      filename: `provider-output.${extension}`,
      buffer: Buffer.from(await response.arrayBuffer()),
      content_type: contentType,
    });

    return {
      ...stored,
      reused_canonical_asset: false,
      provider,
      model,
    };
  },
};
