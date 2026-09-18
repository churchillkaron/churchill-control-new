export const CREATIVE_BASE_PLATE_CONTRACT = "CREATIVE_BASE_PLATE_CONTRACT_V1";

function text(value) { return String(value ?? "").trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }

export function buildBasePlateContract({ shot = {}, reconstruction_pass_node_id = null } = {}) {
  const reinterpretation = object(shot.source_reinterpretation);
  const reconstruction = object(shot.scene_reconstruction_contract);
  if (!text(shot.id)) throw new Error("BASE_PLATE_SHOT_ID_REQUIRED");
  return {
    contract: CREATIVE_BASE_PLATE_CONTRACT,
    shot_id: text(shot.id),
    reconstruction_pass_node_id,
    reconstruction_contract_hash: reconstruction.contract_hash || null,
    source_reinterpretation: reinterpretation,
    purpose: "Establish the premium photographic world and source-grounded hero frame before motion/VFX layers are added.",
    allowed_in_base_plate: [
      "source-grounded architecture and set geometry",
      "authored camera composition and lens perspective",
      "photographic exposure and motivated base lighting",
      "source-grounded material response",
      "production-design cleanup that preserves identity truth",
      "depth, focal hierarchy and physically plausible base atmosphere already present in the world",
    ],
    forbidden_baked_layers: [
      "physical simulation such as particles, pyro, fluids, cloth or destruction",
      "story VFX intended for the VFX integration pass",
      "synthetic reflection/shadow interaction belonging to later passes",
      "motion graphics or generated typography",
      "final optical effects, final film grain or final color grade",
      "logos, signage or text redrawn by a generative model",
      "camera motion outside certified reconstruction geometry",
    ],
    rules: {
      reconstruction_certification_required_before_dispatch: Boolean(reconstruction_pass_node_id),
      source_truth_must_survive: true,
      consumer_ai_animation_is_not_base_plate: true,
      later_pass_responsibilities_must_remain_separable: true,
      perceptual_review_required_before_completion: true,
      generated_text_and_logo_forbidden: true,
      single_view_camera_bounds_binding: true,
    },
  };
}

export const CreativeBasePlateContractRuntime = Object.freeze({
  contract: CREATIVE_BASE_PLATE_CONTRACT,
  build: buildBasePlateContract,
});
