import {
  CreativeEdlRenderRuntime,
} from "@/lib/creative/post-production/runtime/CreativeEdlRenderRuntime";
import {
  CreativeProfessionalFinishingRuntime,
} from "@/lib/creative/post-production/runtime/CreativeProfessionalFinishingRuntime";
import {
  CreativeProfessionalMasterAudioMuxRuntime,
} from "@/lib/creative/post-production/runtime/CreativeProfessionalMasterAudioMuxRuntime";

const FLAG = Symbol.for("avantiqo.creative.professionalFinishingBootstrap.v2");

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

    const hasApprovedMasterAudio =
      baseResult.render.metadata?.master_soundtrack_integrity_passed === true;
    const locked = hasApprovedMasterAudio && finished.render?.id !== baseResult.render.id
      ? await CreativeProfessionalMasterAudioMuxRuntime.mux({
          organization_id: input.organization_id,
          video_render: finished.render,
          master_render: baseResult.render,
          export_profile: input.export_profile || {},
          policy: input.policy || {},
          force: input.force === true,
        })
      : null;

    return {
      ...baseResult,
      base_render: baseResult.render,
      professional_finished_render: finished.render,
      render: locked?.render || finished.render,
      technical_qc:
        locked?.technical_qc ||
        finished.technical_qc ||
        baseResult.technical_qc,
      professional_finishing: finished.report,
      professional_finishing_reused: finished.reused,
      professional_master_audio_lock: locked
        ? {
            contract: CreativeProfessionalMasterAudioMuxRuntime.contract,
            applied: true,
            reused: locked.reused,
            render_asset_node_id: locked.render.id,
          }
        : {
            contract: CreativeProfessionalMasterAudioMuxRuntime.contract,
            applied: false,
            reason: hasApprovedMasterAudio
              ? "PROFESSIONAL_FINISHING_DID_NOT_CREATE_NEW_RENDER"
              : "APPROVED_MASTER_SOUNDTRACK_NOT_PRESENT",
          },
    };
  };
}

export const CreativeProfessionalFinishingBootstrap = Object.freeze({
  installed: true,
  contract: CreativeProfessionalFinishingRuntime.contract,
  master_audio_lock_contract: CreativeProfessionalMasterAudioMuxRuntime.contract,
});
