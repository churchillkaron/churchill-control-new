import {
  CreativeEdlRenderRuntime,
} from "@/lib/creative/post-production/runtime/CreativeEdlRenderRuntime";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import {
  CreativeMotionGraphicsRenderRuntime,
} from "./CreativeMotionGraphicsRenderRuntime";

const FLAG = Symbol.for("avantiqo.creative.motion-graphics-render-bootstrap.v1");
const CONTRACT = "AVANTIQO_MOTION_GRAPHICS_RENDER_BOOTSTRAP_V1";

function install() {
  if (CreativeEdlRenderRuntime[FLAG]) return;
  const renderWithoutMotionGraphics = CreativeEdlRenderRuntime.render.bind(
    CreativeEdlRenderRuntime,
  );
  let depth = 0;

  Object.defineProperty(CreativeEdlRenderRuntime, FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  CreativeEdlRenderRuntime.render = async function renderWithMotionGraphics(input = {}) {
    if (depth > 0) return renderWithoutMotionGraphics(input);
    depth += 1;
    try {
      const baseResult = await renderWithoutMotionGraphics(input);
      if (
        !baseResult?.render ||
        baseResult.technical_qc?.passed === false ||
        baseResult.render.status === "REJECTED"
      ) {
        return baseResult;
      }
      const timeline = await AssetGraphRepository.getById(
        input.timeline_asset_node_id,
      );
      if (!timeline) throw new Error("MOTION_GRAPHICS_TIMELINE_NOT_FOUND");
      const motion = await CreativeMotionGraphicsRenderRuntime.render({
        organization_id: input.organization_id,
        creative_project_id: timeline.creative_project_id,
        timeline,
        base_render: baseResult.render,
        export_profile: input.export_profile || {},
        policy: input.policy || {},
        force: input.force === true,
      });
      if (!motion.applicable) {
        return {
          ...baseResult,
          motion_graphics: {
            contract: CreativeMotionGraphicsRenderRuntime.contract,
            applicable: false,
            element_count: 0,
          },
        };
      }
      return {
        ...baseResult,
        pre_motion_graphics_render: baseResult.render,
        render: motion.render,
        technical_qc: motion.technical_qc || baseResult.technical_qc,
        motion_graphics: {
          contract: CreativeMotionGraphicsRenderRuntime.contract,
          applicable: true,
          reused: motion.reused === true,
          render_asset_node_id: motion.render?.id || null,
          plan_contract: motion.plan?.contract || null,
          plan_hash: motion.plan?.contract_hash || null,
          element_count: motion.plan?.elements?.length || 0,
          exact_text_rendering: true,
          generated_text_pixels_used: false,
          generated_logo_redraw_used: false,
        },
      };
    } finally {
      depth -= 1;
    }
  };
}

install();

export const CreativeMotionGraphicsRenderBootstrap = Object.freeze({
  installed: true,
  contract: CONTRACT,
  render_contract: CreativeMotionGraphicsRenderRuntime.contract,
  deterministic_typography: true,
  deterministic_logos: true,
  preserves_editorial_timing: true,
  preserves_master_audio: true,
});
