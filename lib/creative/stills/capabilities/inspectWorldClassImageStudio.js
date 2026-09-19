import {
  CreativeStillWorldClassPlanningRuntime,
} from "@/lib/creative/stills/runtime/CreativeStillWorldClassPlanningRuntime.js";

const WORKERS = Object.freeze([
  "executive_creative_director",
  "strategy_director",
  "brand_director",
  "copy_director",
  "art_director",
  "graphic_design_director",
  "typography_director",
  "director_of_photography",
  "asset_intelligence_director",
  "image_retouching_director",
  "compositing_supervisor",
  "color_di_supervisor",
  "quality_director",
  "rights_safety_director",
  "release_director",
]);

export const manifest = defineCapability({
  domain: "creative",
  capability: "image",
  action: "inspectWorldClassStudio",
  description: "Inspect Avantiqo Image Studio: professional still-image, poster, banner, campaign, retouching, composition, typography, adaptation, quality and release capabilities.",
  permissions: [],
  events: [],
  tags: ["image", "poster", "banner", "design", "retouch", "campaign", "studio", "business-partner"],
  operatorAliases: [
    "what can image studio do", "show image studio", "image studio capabilities",
    "what can we do with images", "show image workers", "poster studio capabilities",
    "can we make posters", "can we retouch images", "can we make campaign graphics",
  ],
  operatorExamples: ["What can Image Studio do for this campaign?", "Can we make and retouch a professional poster here?"],
  transactional: false,
  aiEnabled: true,
  operatorEnabled: true,
  operatorMode: "read",
  operatorAutoExecute: true,
  operatorRequiresConfirmation: false,
  risk: "low",
  reversible: true,
  approval: "none",
  contextScope: "organization",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
});

export function validate() { return true; }
export function authorize() { return true; }

export async function execute() {
  return {
    status: "READY",
    contract: CreativeStillWorldClassPlanningRuntime.contract,
    prompt_free: true,
    workers: WORKERS,
    quality_floors: CreativeStillWorldClassPlanningRuntime.floors,
    entrypoints: ["IMAGE_STUDIO_UI", "BUSINESS_PARTNER", "API"],
  };
}
