import {
  planCreativeStillWorldClassProduction,
} from "@/lib/creative/stills/runtime/CreativeStillWorldClassPlanningRuntime.js";

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }

export const manifest = defineCapability({
  domain: "creative",
  capability: "image",
  action: "planWorldClassProduction",
  description: "Turn a natural-language poster, image, banner, campaign graphic, retouching or still-design request into a prompt-free world-class Image Studio plan. Use this while discussing or refining visual direction before paid generation.",
  permissions: [],
  events: [],
  tags: ["image", "poster", "banner", "campaign", "retouch", "design", "creative-discussion", "business-partner"],
  operatorAliases: [
    "plan the image", "plan the poster", "plan the banner", "plan the graphic",
    "help me with the poster", "help me think through the image", "talk through the poster",
    "image ideas", "poster ideas", "banner ideas", "campaign image ideas",
    "make the image calmer", "make the poster cleaner", "move the subject left",
    "use the real photo", "keep the real person", "change the composition",
  ],
  operatorExamples: [
    "Help me think through this poster before we generate anything.",
    "Move the subject left and keep more negative space for the headline.",
    "Use the real artist photo and make the composition calmer.",
  ],
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
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string" },
      objective: { type: "string" },
      deliverable: { type: "string" },
      format: { type: "string" },
      channels: { type: "array", items: { type: "string" } },
      deliverables: { type: "array", items: { type: "object" } },
      assets: { type: "array", items: { type: "object" } },
    },
    required: ["objective"],
    additionalProperties: true,
  },
});

export function validate({ payload = {} }) {
  if (!text(payload.objective)) {
    const error = new Error("CREATIVE_IMAGE_WORLD_CLASS_OBJECTIVE_REQUIRED");
    error.status = 400;
    throw error;
  }
  return true;
}
export function authorize() { return true; }

export async function execute({ payload = {} }) {
  const deliverables = list(payload.deliverables).length
    ? payload.deliverables
    : [{
        type: text(payload.deliverable) || "STILL_IMAGE",
        purpose: text(payload.objective),
        channels: list(payload.channels),
      }];
  return planCreativeStillWorldClassProduction({
    mission: { title: text(payload.title), business_goal: text(payload.objective) },
    project: { name: text(payload.title), objective: text(payload.objective) },
    brief: {
      title: text(payload.title),
      creative_objective: text(payload.objective),
      deliverable: text(payload.deliverable),
      format: text(payload.format),
    },
    deliverables,
    assets: list(payload.assets),
  });
}
