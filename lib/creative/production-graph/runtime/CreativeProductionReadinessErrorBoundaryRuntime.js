import {
  ProductionGraphRuntime,
} from "./ProductionGraphRuntime";

const INSTALL_FLAG = Symbol.for(
  "avantiqo.creative.production-readiness-error-boundary.v1",
);

function text(value) {
  return String(value ?? "").trim();
}

function readinessFailure(message = "") {
  const value = text(message);
  return value.startsWith("CREATIVE_PRODUCTION_READINESS_FAILED:") ||
    value.startsWith("CREATIVE_PRODUCTION_GRAPH_READINESS_FAILED:");
}

function unambiguousReadinessMessage(message = "") {
  return text(message)
    .replaceAll("PRODUCTION_DOSSIER", "DOSSIER_INPUT")
    .replaceAll("HUMAN_APPROVAL_REQUIRED", "HUMAN_GATE_MISSING")
    .replaceAll("APPROVAL_REQUIRED", "APPROVAL_GATE_MISSING");
}

function install() {
  if (ProductionGraphRuntime[INSTALL_FLAG]) return;
  const planWithoutErrorBoundary =
    ProductionGraphRuntime.plan.bind(ProductionGraphRuntime);

  Object.defineProperty(ProductionGraphRuntime, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  ProductionGraphRuntime.plan =
    async function planWithReadinessErrorBoundary(input = {}) {
      try {
        return await planWithoutErrorBoundary(input);
      } catch (error) {
        const message = text(error?.message || error);
        if (!readinessFailure(message)) throw error;
        const normalized = new Error(unambiguousReadinessMessage(message));
        normalized.cause = error;
        normalized.name = "CreativeProductionReadinessError";
        throw normalized;
      }
    };
}

install();

export const CreativeProductionReadinessErrorBoundaryRuntime = {
  installed: true,
  unambiguousReadinessMessage,
};
