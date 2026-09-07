import {
  CreativeEdlRenderRuntime,
} from "@/lib/creative/post-production/runtime/CreativeEdlRenderRuntime";
import {
  CreativeColorFinishingRuntime,
} from "./CreativeColorFinishingRuntime";

const FLAG = Symbol.for("avantiqo.creative.color-finishing-bootstrap.v1");
const CONTRACT = "AVANTIQO_COLOR_FINISHING_BOOTSTRAP_V1";

function install() {
  if (CreativeEdlRenderRuntime[FLAG]) return;
  const renderWithoutColorFinishing = CreativeEdlRenderRuntime.render.bind(
    CreativeEdlRenderRuntime,
  );
  let depth = 0;

  Object.defineProperty(CreativeEdlRenderRuntime, FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  CreativeEdlRenderRuntime.render = async function renderWithColorFinishing(
    input = {},
  ) {
    if (depth > 0) return renderWithoutColorFinishing(input);
    depth += 1;
    try {
      const result = await renderWithoutColorFinishing(input);
      if (
        !result?.render ||
        result.technical_qc?.passed === false ||
        result.render.status === "REJECTED"
      ) {
        return result;
      }

      const color = await CreativeColorFinishingRuntime.finish({
        organization_id: input.organization_id,
        timeline_asset_node_id: input.timeline_asset_node_id,
        base_render: result.render,
        export_profile: input.export_profile || {},
        policy: input.policy || {},
        force: input.force === true,
      });

      return {
        ...result,
        pre_color_finishing_render: result.render,
        render: color.render,
        technical_qc: color.technical_qc || result.technical_qc,
        color_finishing: {
          contract: CreativeColorFinishingRuntime.contract,
          qc_contract: CreativeColorFinishingRuntime.qc_contract,
          qc_seal_contract: CreativeColorFinishingRuntime.qc_seal_contract,
          output_policy: CreativeColorFinishingRuntime.output_policy,
          input_color: color.input_color,
          target: color.target,
          segment_authority: color.segment_authority,
          segment_count: color.segments?.length || 0,
          qc_passed: color.color_qc?.passed === true,
          qc_seal_hash: color.color_qc_seal?.seal_hash || null,
          render_asset_node_id: color.render?.id || null,
          reused: color.reused === true,
        },
      };
    } finally {
      depth -= 1;
    }
  };
}

install();

export const CreativeColorFinishingBootstrap = Object.freeze({
  installed: true,
  contract: CONTRACT,
  color_contract: CreativeColorFinishingRuntime.contract,
  color_qc_contract: CreativeColorFinishingRuntime.qc_contract,
  color_qc_seal_contract: CreativeColorFinishingRuntime.qc_seal_contract,
  fail_closed: true,
  runs_after_professional_finishing: true,
  revalidates_master_audio_after_color_render: true,
  hdr_requires_verified_aces_or_ocio_output_transform: true,
});
