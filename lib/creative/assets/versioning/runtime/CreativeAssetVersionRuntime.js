import crypto from "crypto";

import * as Repository
from "../repositories/CreativeAssetVersionRepository";

export const CreativeAssetVersionRuntime = {

  async createVersion({
    parent_asset_id = null,
    asset,
  }) {

    return Repository.create({

      id:
        crypto.randomUUID(),

      parent_asset_id,

      version: 1,

      version_label: "v1",

      created_at:
        new Date().toISOString(),

      storage_path:
        asset.storage_path,

      uri:
        asset.uri,

      intelligence:
        asset.intelligence || {},

      metadata:
        asset.metadata || {},

    });

  },

  async createRevision({
    parent,
    asset,
  }) {

    const latest =
      await Repository.latest(
        parent.parent_asset_id ||
        parent.id
      );

    const version =
      (latest?.version || 0) + 1;

    return Repository.create({

      id:
        crypto.randomUUID(),

      parent_asset_id:
        parent.parent_asset_id ||
        parent.id,

      version,

      version_label:
        `v${version}`,

      created_at:
        new Date().toISOString(),

      storage_path:
        asset.storage_path,

      uri:
        asset.uri,

      intelligence:
        asset.intelligence || {},

      metadata:
        asset.metadata || {},

    });

  },

};
