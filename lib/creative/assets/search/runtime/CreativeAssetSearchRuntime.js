import {
  listByProject,
} from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";

function normalize(text = "") {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export const CreativeAssetSearchRuntime = {

  async search({
    organization_id,
    creative_project_id,
    query = "",
  }) {

    const assets =
      await listByProject({
        organization_id,
        creative_project_id,
      });

    if (!query.trim()) {
      return assets;
    }

    const terms =
      normalize(query);

    return assets
      .map(asset => {

        const source = [

          asset.title,

          asset.type,

          ...(asset.intelligence?.labels || []),

          ...(asset.intelligence?.objects || []),

          ...(asset.intelligence?.people || []),

          asset.intelligence?.text,

        ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

        const score =
          terms.reduce(
            (n, term) =>
              n +
              (source.includes(term) ? 1 : 0),
            0,
          );

        return {
          score,
          asset,
        };

      })
      .filter(r => r.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score
      )
      .map(r => r.asset);

  },

};
