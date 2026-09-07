import { ProductionGraphRuntime } from "@/lib/creative/production-graph/runtime/ProductionGraphRuntime";
import { CreativeAudienceVersioningRuntime } from "./CreativeAudienceVersioningRuntime";

const FLAG = Symbol.for("avantiqo.creative.audience-versioning-planning.v1");
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }

function install() {
  if (ProductionGraphRuntime[FLAG]) return;
  const previous = ProductionGraphRuntime.preview.bind(ProductionGraphRuntime);
  Object.defineProperty(ProductionGraphRuntime, FLAG, { value: true });
  ProductionGraphRuntime.preview = async function previewWithAudienceVersions(input = {}) {
    const enriched = CreativeAudienceVersioningRuntime.build(input);
    const graph = await previous(enriched);
    return {
      ...graph,
      metadata: {
        ...object(graph.metadata),
        audience_versioning_contract: enriched.audience_versioning?.contract || null,
        audience_versioning_matrix_hash: enriched.audience_versioning?.matrix_hash || null,
        audience_version_count: enriched.audience_versioning?.version_count || 0,
        audience_versioning_blind_crop_or_stretch_forbidden: true,
        audience_versioning_publication_authorized: false,
      },
    };
  };
  ProductionGraphRuntime.plan = async function planWithAudienceVersions(input = {}) {
    return ProductionGraphRuntime.create(await ProductionGraphRuntime.preview(input));
  };
}
install();

export const CreativeAudienceVersioningPlanningBootstrap = Object.freeze({
  installed: true,
  contract: "AVANTIQO_MULTI_VERSION_AUDIENCE_OUTPUT_PLANNING_BOOTSTRAP_V1",
  versioning_contract: CreativeAudienceVersioningRuntime.contract,
  publication_authorized: false,
});
