import {
  CreativeAssetGraphRuntime,
} from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";

const CHANNELS = [
  "facebook",
  "instagram",
  "linkedin",
  "x",
  "youtube",
  "tiktok",
];

export const CreativePublishRuntime = {

  async buildPublication({
    organization_id,
    creative_project_id,
  }) {

    const assets =
      await CreativeAssetGraphRuntime.list({
        organization_id,
        creative_project_id,
      });

    const publishable =
      assets.filter(
        a =>
          a.status === "READY" ||
          a.status === "APPROVED"
      );

    return {

      channels:
        CHANNELS,

      assets:
        publishable,

      total:
        publishable.length,

    };

  },

  async publish({
    organization_id,
    creative_project_id,
    channels=[],
  }) {

    const publication =
      await this.buildPublication({

        organization_id,

        creative_project_id,

      });

    return {

      success:true,

      channels:
        channels.length
          ? channels
          : publication.channels,

      assets:
        publication.assets.map(a=>a.id),

      total:
        publication.assets.length,

      status:
        "QUEUED",

    };

  },

};
