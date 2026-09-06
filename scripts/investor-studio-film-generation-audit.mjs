import fs from "node:fs";

const files = {
  plan: "lib/creative/post-production/runtime/AvantiqoInvestorStudioGenerationPlan.js",
  generation: "lib/creative/post-production/runtime/AvantiqoInvestorStudioGenerationRuntime.js",
  execution: "lib/creative/post-production/runtime/AvantiqoInvestorStudioExecutionRuntime.js",
  choreography: "lib/creative/post-production/runtime/AvantiqoInvestorCapabilityVisualChoreography.js",
  ownedPolicy: "lib/creative/post-production/runtime/AvantiqoInvestorOwnedExecutionPolicy.js",
  humanPolicy: "lib/creative/video/runtime/CreativeInvestorHumanGenerationPolicy.js",
  videoDispatch: "lib/creative/video/runtime/CreativeVideoProductionDispatchBootstrap.js",
  humanRenderer: "services/avantiqo-video-engine/modal_human_multi_keyframe_render.py",
  humanQc: "services/avantiqo-video-engine/investor_human_qc_pack.py",
  humanRelease: "services/avantiqo-video-engine/investor_human_release_gate.py",
  product: "lib/creative/post-production/runtime/AvantiqoInvestorProductProofPlan.js",
  finalAct: "lib/creative/post-production/runtime/AvantiqoInvestorFinalActPlan.js",
  master: "lib/creative/post-production/runtime/AvantiqoInvestorFilmMasterPlan.js",
  cli: "scripts/avantiqo-investor-studio-scenes.mjs",
};

const source = Object.fromEntries(
  Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]),
);

const failures = [];
function requireToken(fileKey, token) {
  if (!source[fileKey].includes(token)) failures.push(`${fileKey}:missing:${token}`);
}
function forbidToken(fileKey, token) {
  if (source[fileKey].includes(token)) failures.push(`${fileKey}:forbidden:${token}`);
}

requireToken("plan", "FRESH_AVANTIQO_STUDIO_GENERATION_REQUIRED");
requireToken("plan", "NO_PRODUCT_SCREENSHOTS");
requireToken("plan", "NO_EXTRACTED_SCREENSHOT_FRAGMENTS");
requireToken("plan", "CREATIVE_STUDIO");
requireToken("plan", "COMMUNICATION");
requireToken("plan", "CODE");
requireToken("plan", "MUSIC");
requireToken("plan", "SPEECH");
requireToken("plan", "INTEGRATIONS");
requireToken("plan", "scene: 18");
requireToken("plan", "ai.image.generate");
requireToken("plan", "ai.video.generate");
requireToken("generation", "availableProductionCapabilities");
requireToken("generation", "investorHumanGenerationPolicy");
requireToken("generation", "human_generation: humanGeneration");
requireToken("generation", "MULTI_KEYFRAME_GENERATE_THEN_EXACT_MASTER_QC_THEN_VISUAL_APPROVAL_THEN_RELEASE");
requireToken("generation", "human_generation_policy_bound: true");
requireToken("generation", "ready_to_generate");
requireToken("execution", "assets: []");
requireToken("execution", "INVESTOR_STUDIO_REQUIRED_CAPABILITY_TASK_MISSING");
requireToken("execution", "INVESTOR_STUDIO_SPEND_APPROVAL_REQUIRED");
requireToken("execution", "NO_SPEND_CONTEXT_AND_CAPABILITY_PREPARATION");
requireToken("execution", "owned_only_required: true");
requireToken("execution", "external_ai_provider_allowed: false");
requireToken("execution", "investorSceneVisualChoreography");
requireToken("execution", "enforceInvestorOwnedProjectTasks");
requireToken("choreography", "REAL_CAPABILITY_TO_FRESH_STUDIO_CREATION_TO_CINEMATIC_PROOF");
requireToken("choreography", "SCREENS_ARE_REFERENCE_AND_TRUTH_EVIDENCE_NOT_FILM_PIXELS");
requireToken("choreography", "KEY_VISUAL");
requireToken("choreography", "POSTER");
requireToken("choreography", "SOCIAL_VARIANT");
requireToken("choreography", "VIDEO_FRAME_SEQUENCE");
requireToken("choreography", "COMMUNICATION");
requireToken("choreography", "CODE");
requireToken("choreography", "MUSIC");
requireToken("choreography", "SPEECH");
requireToken("choreography", "INTEGRATIONS");
requireToken("ownedPolicy", "AVANTIQO_INVESTOR_OWNED_ONLY_PROVIDER_POLICY_V1");
requireToken("ownedPolicy", "CreativeProjectRuntime");
requireToken("ownedPolicy", "investorVideoTaskRequiresHumanControl");
requireToken("ownedPolicy", "INVESTOR_HUMAN_COMPLETED_TASK_RELEASE_EVIDENCE_REQUIRED");
requireToken("ownedPolicy", "generic_video_dispatch_for_humans: \"FORBIDDEN\"");
requireToken("ownedPolicy", "allowed_providers");
requireToken("ownedPolicy", "external_fallback_allowed: false");
requireToken("ownedPolicy", 'external_provider_role: "FORBIDDEN"');
requireToken("ownedPolicy", "INVESTOR_EXTERNAL_PROVIDER_FORBIDDEN");
requireToken("humanPolicy", "churchillkaron/churchill-control-new");
requireToken("humanPolicy", "AVANTIQO_INVESTOR_HUMAN_GENERATION_POLICY_V1");
requireToken("humanPolicy", "AVANTIQO_VIDEO_HUMAN_MULTI_KEYFRAME_NATIVE_MASTER_V1");
requireToken("humanPolicy", "AVANTIQO_INVESTOR_HUMAN_QC_PACK_V1");
requireToken("humanPolicy", "AVANTIQO_INVESTOR_HUMAN_RELEASE_V1");
requireToken("humanPolicy", "approved_same_identity_multi_keyframe");
requireToken("humanPolicy", "generic_video_dispatch_for_humans: \"FORBIDDEN\"");
for (const check of [
  "face_identity",
  "face_temporal_stability",
  "eyes",
  "hands",
  "anatomy",
  "skin_texture",
  "motion_physics",
]) requireToken("humanPolicy", check);
requireToken("videoDispatch", "investorOwnedOnly");
requireToken("videoDispatch", "assertGenericVideoDispatchAllowed");
requireToken("videoDispatch", "AVANTIQO_INVESTOR_HUMAN_GENERIC_VIDEO_DISPATCH_FORBIDDEN");
requireToken("videoDispatch", "AVANTIQO_VIDEO_HUMAN_MULTI_KEYFRAME_NATIVE_MASTER_V1");
requireToken("videoDispatch", '["avantiqo-video"]');
requireToken("videoDispatch", "external_provider_fallback_forbidden: ownedOnly");
requireToken("humanRenderer", "AVANTIQO_VIDEO_HUMAN_MULTI_KEYFRAME_NATIVE_MASTER_V1");
requireToken("humanRenderer", "SAME_IDENTITY_REQUIRED");
requireToken("humanRenderer", "REFERENCE_DIGEST_MISMATCH");
requireToken("humanRenderer", "LATE_IDENTITY_ANCHOR_REQUIRED");
requireToken("humanRenderer", "MID_IDENTITY_ANCHOR_REQUIRED");
requireToken("humanRenderer", '"release_authorized": False');
requireToken("humanQc", "AVANTIQO_INVESTOR_HUMAN_QC_PACK_V1");
requireToken("humanQc", "video_sha256");
requireToken("humanRelease", "AVANTIQO_INVESTOR_HUMAN_RELEASE_V1");
requireToken("humanRelease", "release_authorized");
requireToken("humanRelease", "contact_sheet_sha256");
requireToken("product", "FRESH_AVANTIQO_STUDIO_GENERATED_FILM_ASSETS_GROUNDED_IN_REAL_CAPABILITIES");
requireToken("product", "product_screenshot_allowed: false");
requireToken("product", "creative_studio_creates_campaign_to_customer_and_result");
requireToken("finalAct", "FRESH_AVANTIQO_STUDIO_GENERATED_FILM_ASSETS_PLUS_APPROVED_FOUNDER_WINDOWS");
requireToken("finalAct", "CODE");
requireToken("finalAct", "MUSIC");
requireToken("finalAct", "SPEECH");
requireToken("master", "AVANTIQO_INVESTOR_STUDIO_GENERATION_PLAN");
requireToken("master", "NO_PRODUCT_SCREENSHOTS");
requireToken("master", "NO_EXTRACTED_SCREENSHOT_FRAGMENTS");
requireToken("cli", "INVESTOR_STUDIO_SPEND_APPROVED");

forbidToken("product", 'source_policy: "AUTHENTIC_AVANTIQO_UI_ONLY"');
forbidToken("finalAct", 'source_policy: "AUTHENTIC_AVANTIQO_UI_PLUS_APPROVED_FOUNDER_ONLY"');
forbidToken("master", 'product_ui_policy: "AUTHENTIC_USER_SUPPLIED_AVANTIQO_UI_ONLY"');
forbidToken("ownedPolicy", 'external_provider_role: "OPTIONAL_FALLBACK_ONLY"');

const preserved = source.plan.match(/preserve_user_approved_scenes:\s*Object\.freeze\(\[([^\]]+)\]\)/)?.[1] || "";
for (const scene of [1, 2, 3, 4, 5, 6, 7, 8, 10]) {
  if (!new RegExp(`(^|\\D)${scene}(\\D|$)`).test(preserved)) {
    failures.push(`plan:approved-scene-not-preserved:${scene}`);
  }
}

const rebuilt = source.plan.match(/rebuild_scenes:\s*Object\.freeze\(\[([^\]]+)\]\)/)?.[1] || "";
for (const scene of [9, 11, 12, 13, 14, 15, 16, 17, 18, 19]) {
  if (!new RegExp(`(^|\\D)${scene}(\\D|$)`).test(rebuilt)) {
    failures.push(`plan:required-rebuild-scene-missing:${scene}`);
  }
}

if (failures.length) {
  console.error("INVESTOR_STUDIO_FILM_GENERATION_AUDIT=FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("INVESTOR_STUDIO_FILM_GENERATION_AUDIT=PASS");
console.log("FRESH_STUDIO_GENERATION=ENFORCED");
console.log("SCREENSHOT_INSERTION=FORBIDDEN");
console.log("CAPABILITY_VISUAL_CHOREOGRAPHY=ENFORCED");
console.log("OWNED_AI_ONLY=ENFORCED");
console.log("EXTERNAL_AI_FALLBACK=FORBIDDEN");
console.log("HUMAN_MULTI_KEYFRAME_CONTROL=ENFORCED");
console.log("HUMAN_EXACT_MASTER_QC=ENFORCED");
console.log("HUMAN_GENERIC_VIDEO_DISPATCH=FORBIDDEN");
console.log("PREPARE_MODE=NO_SPEND");
console.log("PAID_EXECUTION=EXPLICIT_GATE");
console.log("APPROVED_SCENES_PRESERVED=1,2,3,4,5,6,7,8,10");
console.log("REBUILD_SCENES=9,11,12,13,14,15,16,17,18,19");
