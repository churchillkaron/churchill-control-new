export async function buildResearch({
  brief,
}) {
  const business =
    brief.business || {};

  const assets =
    brief.assets || [];

  return {
    version: 1,

    objective:
      brief.objective,

    audience:
      brief.audience,

    business,

    brand:
      brief.brand,

    platform:
      brief.platform,

    duration_seconds:
      brief.duration_seconds,

    asset_summary: {
      total:
        assets.length,

      photos:
        assets.filter(a =>
          a.type === "photo"
        ).length,

      videos:
        assets.filter(a =>
          a.type === "video"
        ).length,
    },

    observations: [],

    opportunities: [],

    missing_assets: [],

    risks: [],

    recommendations: [],

    confidence: 0,
  };
}
