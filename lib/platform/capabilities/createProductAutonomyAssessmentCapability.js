import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import {
  assessAvantiqoProductAutonomy,
} from "@/lib/intelligence/runtime/AvantiqoProductAutonomyAssessmentRuntime";

export function createProductAutonomyAssessmentCapability() {
  const manifest = defineCapability({
    domain: "platform",
    capability: "product_autonomy",
    action: "assess",
    name: "Assess Avantiqo Product Autonomy",
    document: "product_autonomy_assessment",
    description:
      "Let Avantiqo-owned Product Intelligence assess the live registered capability fabric and registry create coverage against the canonical Product Constitution, identify observed autonomy gaps, state evidence limitations, and prepare a bounded Code AI engineering objective. This is read-only and never starts Code AI, commits code, deploys, migrates or mutates business state.",
    permissions: [],
    events: [],
    tags: [
      "platform",
      "intelligence",
      "product-owner",
      "architecture",
      "autonomy",
      "constitution",
      "gap-analysis",
      "code-ai-handoff",
      "read",
    ],
    operatorAliases: [
      "what is missing in avantiqo",
      "what should we build next in avantiqo",
      "assess avantiqo",
      "audit avantiqo autonomy",
      "what prevents avantiqo from finishing itself",
      "find the next product gap",
      "prepare the next code ai objective",
      "what should code ai fix next",
      "finish avantiqo",
    ],
    operatorExamples: [
      "Assess Avantiqo against the product constitution and tell me the next engineering objective.",
      "What is the highest-impact gap preventing Avantiqo from operating autonomously?",
      "Prepare the next bounded Code AI objective without executing it.",
    ],
    transactional: false,
    aiEnabled: true,
    operatorEnabled: true,
    operatorMode: "read",
    operatorAutoExecute: true,
    operatorRequiresConfirmation: false,
    contextScope: "organization",
    risk: "low",
    reversible: true,
    inputSchema: {
      type: "object",
      properties: {
        focus: {
          type: "string",
          description: "Optional product area or autonomy concern to prioritize.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        status: { type: "string" },
        snapshot: { type: "object" },
        assessment: { type: "object" },
        recommended_code_ai_handoff: { type: "object" },
        evidence_limits: { type: "array" },
      },
      additionalProperties: true,
    },
  });

  function authorize({ context }) {
    return Boolean(String(context?.organizationId || "").trim());
  }

  async function execute({ context, payload = {} }) {
    return assessAvantiqoProductAutonomy({ context, payload });
  }

  return { manifest, authorize, execute };
}

export default createProductAutonomyAssessmentCapability;
