import {
  CreativeEdlRenderRuntime,
} from "@/lib/creative/post-production/runtime/CreativeEdlRenderRuntime";
import {
  CreativeProfessionalFinishingRuntime,
} from "@/lib/creative/post-production/runtime/CreativeProfessionalFinishingRuntime";

const FLAG = Symbol.for("avantiqo.creative.professionalFinishingBootstrap.v1");

if (!CreativeEdlRenderRuntime[FLAG]) {
  const renderBaseMaster = CreativeEdlRenderRuntime.render.bind(
    CreativeEdlRenderRuntime,
  );

  Object.defineProperty(CreativeEdlRenderRuntime, FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  CreativeEdlRenderRuntime.render = async function renderProfessionalMaster(input = {}) {
    const baseResult = await renderBaseMaster(input);
    if (
      !baseResult?.render ||
      baseResult.technical_qc?.passed === false ||
      baseResult.render.status === "REJECTED"
    ) {
      return baseResult;
    }

    const finished = await CreativeProfessionalFinishingRuntime.finish({
      organization_id: input.organization_id,
      timeline_asset_node_id: input.timeline_asset_node_id,
      base_render: baseResult.render,
      export_profile: input.export_profile || {},
      policy: input.policy || {},
    });

    return {
      ...baseResult,
      base_render: baseResult.render,
      render: finished.render,
      technical_qc: finished.technical_qc || baseResult.technical_qc,
      professional_finishing: finished.report,
      professional_finishing_reused: finished.reused,
    };
  };
}

export const CreativeProfessionalFinishingBootstrap = Object.freeze({
  installed: true,
  contract: CreativeProfessionalFinishingRuntime.contract,
});
