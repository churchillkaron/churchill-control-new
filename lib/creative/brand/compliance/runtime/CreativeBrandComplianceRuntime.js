export const CreativeBrandComplianceRuntime = {

  evaluate({
    brand = {},
    asset = {},
  }) {

    const intelligence =
      asset.intelligence || {};

    const keywords =
      brand.style_keywords || [];

    const labels =
      intelligence.labels || [];

    const matched =
      keywords.filter(
        keyword => labels.includes(keyword)
      );

    const score =
      keywords.length
        ? Math.round(
            (matched.length / keywords.length) * 100
          )
        : null;

    return {

      score,

      matched,

      missing:
        keywords.filter(
          keyword => !matched.includes(keyword)
        ),

      compliant:
        score === null
          ? true
          : score >= 80,

      checked_at:
        new Date().toISOString(),

    };

  },

};
