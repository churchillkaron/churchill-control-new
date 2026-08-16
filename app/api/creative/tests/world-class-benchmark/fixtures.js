const CHURCHILL = "33336a72-acb5-474e-856b-8be0269360e2";
const COLE_LEY = "9550b843-b83c-4d15-b02d-a0b5ca23346e";

const CHURCHILL_QUALITY = Object.freeze({
  version: "AVANTIQO_CREATIVE_QUALITY_V1",
  require_brand_fit: true,
  minimum_scene_score: 90,
  require_non_ai_feel: true,
  regenerate_below_score: 88,
  require_story_progression: true,
  require_product_continuity: true,
  require_identity_continuity: true,
});

const COLE_QUALITY = Object.freeze({
  version: "AVANTIQO_WORLD_CLASS_TEMPORAL_V1",
  require_brand_fit: true,
  minimum_scene_score: 92,
  require_non_ai_feel: true,
  regenerate_below_score: 88,
  require_story_progression: true,
  require_product_continuity: false,
  require_identity_continuity: true,
});

// A fixed review panel for this case.
//
// Two runs of the entrance still were examined by different panels -- architectural authenticity, brand
// integrity, visual quality, rights and assurance on one; brand integrity, visual quality, rights,
// workflow and image quality on the next -- so its tribunal score moved from 87.4 to 85 between runs and
// neither number could be compared to the other. No fix can be shown to work against an instrument that
// changes shape between measurements. These reviewers are the ones a real run composed, copied verbatim
// rather than invented, so the exam is the one the studio chose for this mission and now stays put.
const CHURCHILL_ENTRANCE_PANEL = Object.freeze({
  rationale: "Panel observed on a real run of this case and pinned so the same reviewers examine it every time. Composing a panel per run is right for production work, where the disciplines that matter depend on the mission, and wrong for a benchmark: two runs of this case drew different examiners and their scores could not be compared to each other.",
  reviewers: Object.freeze([
    Object.freeze({
      id: "brand-integrity-specialist",
      role: "Brand Identity and Visual Consistency Expert",
      mandate: "Ensure strict adherence to Churchill's brand elements, including signage, logo accuracy, and color fidelity in the master still.",
      evidence_focus: Object.freeze(["3D metallic CC logo signage image", "Neon CC sign in entrance video and images"]),
    }),
    Object.freeze({
      id: "creative-visual-quality-expert",
      role: "Art and Cinematography Director for Still Image",
      mandate: "Validate visual composition, lighting simulation, and material realism for the AI-generated master still image.",
      evidence_focus: Object.freeze(["Red carpet stairway reference image", "Entrance video frames showing lighting and composition"]),
    }),
    Object.freeze({
      id: "rights-and-usage-compliance-officer",
      role: "Legal and Rights Review Specialist",
      mandate: "Confirm all image assets and brand elements comply with usage rights, releasing only after full clearance.",
      evidence_focus: Object.freeze(["Rights status of image and video assets", "Consent and release documentation"]),
    }),
    Object.freeze({
      id: "production-workflow-controller",
      role: "Production Process and Quality Assurance Expert",
      mandate: "Oversee AI-image analysis, generation, and upscaling steps ensuring quality gates and dependencies are strictly followed.",
      evidence_focus: Object.freeze(["Production plan steps for AI analysis, generation, upscaling", "Quality gate protocols and final quality criteria"]),
    }),
    Object.freeze({
      id: "master-image-quality-director",
      role: "Overall Visual Quality and Consistency Auditor",
      mandate: "Final gatekeeper to verify absence of AI artifacts, brand color accuracy, and spatial plus identity continuity.",
      evidence_focus: Object.freeze(["Quality policies (AVANTIQO_CREATIVE_QUALITY_V1)", "Final master still AI-generated outputs"]),
    }),
  ]),
});

export const CREATIVE_WORLD_CLASS_BENCHMARK_CASES = Object.freeze([
  Object.freeze({
    id: "churchill-entrance-still",
    label: "Churchill entrance master still",
    organization_id: CHURCHILL,
    source_project_id: "5dc4897b-88a5-40f0-a269-033a4e96cd65",
    production_type: "IMAGE",
    quality: CHURCHILL_QUALITY,
    review_panel: CHURCHILL_ENTRANCE_PANEL,
    asset_ids: Object.freeze([
      "f0c96f1a-6719-4dc2-8b9a-d095864d273a",
      "d10ddc3a-386f-403b-9bb4-2cfe40c7c655",
      "8b4854e6-8c9c-4fc6-a3f5-7eaadc1d8d8b",
    ]),
    benchmark: Object.freeze({
      organization_name: "Churchill",
      required_anchors: Object.freeze(["entrance", "red carpet", "pool table"]),
    }),
  }),
  Object.freeze({
    id: "churchill-food-editorial-stills",
    label: "Churchill food editorial still system",
    organization_id: CHURCHILL,
    source_project_id: "d83dd7df-48b1-4ddd-bd98-88d409251755",
    production_type: "IMAGE",
    quality: CHURCHILL_QUALITY,
    objective:
      "Create a premium editorial still system for Churchill Restaurant & Bar using only the registered real food and venue references. Make the food physically specific and source-faithful rather than generic hospitality imagery. Build a coherent art direction that can hold striploin, smoked salmon, nachos, Mediterranean salad and beef carpaccio together while preserving the recognisable Churchill setting and avoiding invented dishes, ingredients, claims, people or location details.",
    asset_ids: Object.freeze([
      "9a7f96b4-1c77-47f5-8377-69f0404929ee",
      "7df53ffb-b0dd-4a25-bc68-8e4225fe782f",
      "c9aafc12-9f77-4305-8bb6-52e2b1db2eb4",
      "707932d6-467d-4f07-a938-829515abf124",
      "e767ad1c-e9ba-4bc3-aebc-525e963a8c78",
      "8b4854e6-8c9c-4fc6-a3f5-7eaadc1d8d8b",
    ]),
    benchmark: Object.freeze({
      organization_name: "Churchill",
      product_names: Object.freeze(["striploin", "smoked salmon", "nachos"]),
      required_anchors: Object.freeze(["food"]),
    }),
  }),
  Object.freeze({
    id: "churchill-audio-package",
    label: "Churchill campaign music and sound package",
    organization_id: CHURCHILL,
    source_project_id: "614910af-90ae-4024-a2b0-e9ef7a58e1e9",
    production_type: "AUDIO",
    quality: CHURCHILL_QUALITY,
    asset_ids: Object.freeze([
      "f0c96f1a-6719-4dc2-8b9a-d095864d273a",
      "d10ddc3a-386f-403b-9bb4-2cfe40c7c655",
      "8b4854e6-8c9c-4fc6-a3f5-7eaadc1d8d8b",
      "cb027610-625c-4751-99a0-6a41b3597237",
    ]),
    benchmark: Object.freeze({
      organization_name: "Churchill",
      required_anchors: Object.freeze(["music", "sound", "entrance", "pool"]),
    }),
  }),
  Object.freeze({
    id: "cole-full-song-artist-film",
    label: "Cole Ley full-song original artist film",
    organization_id: COLE_LEY,
    source_project_id: "6fbac0e8-ab00-44be-9b26-94bf25f28c1e",
    production_type: "VIDEO",
    quality: COLE_QUALITY,
    asset_ids: Object.freeze([
      "b6acc9fd-9fb5-470d-943f-3e3b4b23efc2",
      "e501570d-e54e-491f-8bdb-56cd012615a2",
      "f29d002c-1a05-4d4a-beec-af09ddb28b69",
      "b0fb646f-bc0f-4959-8d14-68a5edd645bb",
      "28aeb19a-4135-4350-98ca-d1c9b877da34",
    ]),
    benchmark: Object.freeze({
      organization_name: "Cole Ley",
      required_anchors: Object.freeze(["Show Me Love", "205", "authentic love"]),
    }),
  }),
  Object.freeze({
    id: "cole-live-performance-showreel",
    label: "Cole Ley live-performance showreel",
    organization_id: COLE_LEY,
    source_project_id: "3866623f-d9a6-45d3-99b8-e978666cc028",
    production_type: "VIDEO",
    quality: COLE_QUALITY,
    asset_ids: Object.freeze([
      "e501570d-e54e-491f-8bdb-56cd012615a2",
      "d1548f5a-6b18-4b2e-bbda-85aa4d609791",
      "61976eb0-ff9d-4f0f-af41-ec3d6c24c264",
      "c89501d4-56ac-4415-b190-dd831b03d718",
      "cee439a8-df25-46ef-bfee-1e4c59863855",
      "e44190e8-ca81-4fc9-84f8-4da0a651dba0",
      "ad4c9aab-7527-41e8-bbc1-dcc7a82db443",
      "fee4512a-6c63-43af-8f65-9ecf34ba040a",
    ]),
    benchmark: Object.freeze({
      organization_name: "Cole Ley",
      required_anchors: Object.freeze(["live performance", "original audio", "lip sync"]),
    }),
  }),
]);

export function getCreativeWorldClassBenchmarkCase(caseId) {
  const normalized = String(caseId ?? "").trim();
  const fixture = CREATIVE_WORLD_CLASS_BENCHMARK_CASES.find(
    (entry) => entry.id === normalized,
  );
  if (!fixture) {
    throw new Error(
      `CREATIVE_BENCHMARK_CASE_NOT_REGISTERED:${normalized || "UNKNOWN"}`,
    );
  }
  return fixture;
}
