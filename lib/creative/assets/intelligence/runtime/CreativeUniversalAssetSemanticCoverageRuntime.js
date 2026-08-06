import {
  CreativeUniversalAssetIntelligenceRuntime,
} from "./CreativeUniversalAssetIntelligenceRuntime";

import {
  enrichCreativeAssetsForUniversalIntelligence,
  enforceUniversalAssetSemanticCoverage,
} from "../planner/enrichUniversalAssetIntelligence";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.universal-asset-semantic-coverage.v1",
);

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function install() {
  if (CreativeUniversalAssetIntelligenceRuntime[INSTALL_FLAG]) return;

  const originalAnalyze = CreativeUniversalAssetIntelligenceRuntime.analyze.bind(
    CreativeUniversalAssetIntelligenceRuntime,
  );

  Object.defineProperty(
    CreativeUniversalAssetIntelligenceRuntime,
    INSTALL_FLAG,
    {
      value: true,
      enumerable: false,
      configurable: false,
    },
  );

  CreativeUniversalAssetIntelligenceRuntime.analyze =
    function analyzeWithUniversalSemanticCoverage(input = {}) {
      const assets = enrichCreativeAssetsForUniversalIntelligence(
        list(input.assets),
      );
      const result = originalAnalyze({
        ...input,
        assets,
      });
      return enforceUniversalAssetSemanticCoverage(result, assets);
    };
}

install();

export const CreativeUniversalAssetSemanticCoverageRuntime = Object.freeze({
  installed: true,
});
