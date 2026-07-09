import * as Repository from "../repositories/CreativeAssetRepository";

function normalize(asset) {

  const url =
    asset.image_url ||
    asset.file_url ||
    asset.thumbnail_url ||
    null;

  const isVideo =
    (url || "").toLowerCase().includes(".mp4");

  return {

    ...asset,

    url,

    isVideo,

    previewType: isVideo ? "video" : "image",

  };
}

export const CreativeAssetsRuntime = {

  async list(params = {}) {

    const data =
      await Repository.list(params);

    return (data || []).map(normalize);
  },

  get: Repository.get,
  create: Repository.create,
  update: Repository.update,
  remove: Repository.remove,
  incrementUsage: Repository.incrementUsage,

};
