import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

function parseJson(value) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(String(value || ""));
  } catch {
    return null;
  }
}

export async function analyzeCreativeSubject({
  imageUrl,
  organizationId = null,
} = {}) {
  if (!organizationId || !imageUrl) {
    return {
      status: "UNVERIFIED",
      confidence: 0,
      verification_reason: !organizationId
        ? "organization_id required"
        : "image URL required",
    };
  }

  try {
    const execution = await ServiceExecutionRuntime.execute({
      organization_id: organizationId,
      service_id: "ai.image.analyze",
      provider_id: null,
      input: {
        prompt: `
Analyze only the visible subject evidence in this image. Return strict JSON only:
{
  "status":"VERIFIED|UNVERIFIED",
  "appearance":"non-sensitive visible description",
  "style":"visible presentation style",
  "visible_characteristics":[],
  "identity_continuity_anchors":[],
  "wardrobe_anchors":[],
  "role_indicators":[],
  "presentation_style":"",
  "brand_suitability":{"supported":false,"reason":""},
  "continuity_risks":[],
  "consent_risks":[],
  "privacy_risks":[],
  "evidence":[],
  "confidence":0
}

Do not infer or identify private identity, ethnicity, health, religion, politics,
sexuality, profession, age, nationality or other sensitive attributes. Describe
only visible production evidence. Mark UNVERIFIED when inspection is uncertain.
`,
        image: imageUrl,
      },
      metadata: {
        module: "CREATIVE",
        operation: "SUBJECT_ANALYSIS_V2",
      },
      category: "CREATIVE_ASSET_INTELLIGENCE",
    });

    const output =
      execution?.output?.output ||
      execution?.output?.text ||
      execution?.output ||
      null;
    const parsed = parseJson(output);
    if (!parsed) {
      return {
        status: "UNVERIFIED",
        confidence: 0,
        verification_reason: "Subject analysis provider returned invalid JSON",
      };
    }
    return {
      ...parsed,
      status: String(parsed.status || "UNVERIFIED").toUpperCase() === "VERIFIED"
        ? "VERIFIED"
        : "UNVERIFIED",
      confidence: Number.isFinite(Number(parsed.confidence))
        ? Math.max(0, Math.min(100, Number(parsed.confidence)))
        : 0,
    };
  } catch (error) {
    return {
      status: "UNVERIFIED",
      confidence: 0,
      verification_reason: error?.message || String(error),
    };
  }
}
