import {
  CreativeStorageRuntime,
} from "@/lib/creative/storage/runtime/CreativeStorageRuntime";

const BUCKET = "creative-assets";
const STORAGE_MARKERS = [
  `/storage/v1/object/public/${BUCKET}/`,
  `/storage/v1/object/sign/${BUCKET}/`,
  `/storage/v1/object/authenticated/${BUCKET}/`,
];

function firstValue(...values) {
  return values.find(
    (value) => value !== undefined && value !== null && value !== "",
  ) ?? null;
}

function safeDecode(value = "") {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function storagePathFromUrl(value) {
  if (!value) return null;

  let parsed;
  try {
    parsed = new URL(String(value));
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:") return null;

  for (const marker of STORAGE_MARKERS) {
    const index = parsed.pathname.indexOf(marker);
    if (index < 0) continue;

    const path = parsed.pathname.slice(index + marker.length);
    return safeDecode(path).replace(/^\/+/, "") || null;
  }

  return null;
}

function assetStoragePath(asset = {}) {
  return firstValue(
    asset.storage_path,
    asset.storagePath,
    asset.metadata?.storage_path,
    asset.metadata?.storagePath,
    asset.metadata?.canonical_storage_path,
    asset.analysis?.storage_path,
    storagePathFromUrl(asset.file_url),
    storagePathFromUrl(asset.image_url),
    storagePathFromUrl(asset.url),
    storagePathFromUrl(asset.thumbnail_url),
  );
}

function directUrl(asset = {}) {
  return firstValue(
    asset.image_url,
    asset.file_url,
    asset.url,
    asset.thumbnail_url,
  );
}

function withDelivery(asset = {}, url, metadata = {}) {
  return {
    ...asset,
    url,
    file_url: url,
    image_url: url,
    thumbnail_url: asset.thumbnail_url || url,
    metadata: {
      ...(asset.metadata || {}),
      reference_delivery: {
        ...(asset.metadata?.reference_delivery || {}),
        ...metadata,
      },
    },
  };
}

export const CreativeReferenceDeliveryRuntime = {
  extractStoragePath(value) {
    return storagePathFromUrl(value);
  },

  async resolve(asset = {}, { expires_in = 3600 } = {}) {
    if (!asset) return null;

    const storagePath = assetStoragePath(asset);

    if (storagePath) {
      try {
        const delivery = await CreativeStorageRuntime.resolveDeliveryUrl({
          storage_path: storagePath,
          expires_in,
        });

        if (delivery?.signed_url) {
          return withDelivery(asset, delivery.signed_url, {
            mode: "PRIVATE_SIGNED_URL",
            storage_path: storagePath,
            expires_in: delivery.expires_in || expires_in,
            resolved_at: new Date().toISOString(),
          });
        }
      } catch (error) {
        const fallback = directUrl(asset);
        if (!fallback) throw error;

        return withDelivery(asset, fallback, {
          mode: "LEGACY_URL_FALLBACK",
          storage_path: storagePath,
          signing_error: error?.message || String(error),
          resolved_at: new Date().toISOString(),
        });
      }
    }

    const fallback = directUrl(asset);
    if (!fallback) return asset;

    return withDelivery(asset, fallback, {
      mode: "DIRECT_HTTPS_URL",
      storage_path: null,
      resolved_at: new Date().toISOString(),
    });
  },
};
