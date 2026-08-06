const DISABLED_ERROR =
  "LEGACY_CREATIVE_PRODUCTION_GRAPH_CONVERGENCE_DISABLED";

export function installCreativeProductionGraphConvergencePatch() {
  throw new Error(DISABLED_ERROR);
}

export const CreativeProductionGraphConvergencePatch = Object.freeze({
  disabled: true,
  reason:
    "Legacy convergence archived and recreated project shots from repaired historical direction, allowing stale shot identities and asset references to overwrite canonical project data.",
  install: installCreativeProductionGraphConvergencePatch,
});
