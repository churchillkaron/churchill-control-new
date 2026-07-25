import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

function safeJsonParse(value) {
  if (value && typeof value === "object") return value;

  try {
    return JSON.parse(String(value || ""));
  } catch {
    return null;
  }
}

function array(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function incompleteAnalysis(assetType, status, error = null) {
  return {
    status,
    description: "",
    tags: [],
    visual_style: "",
    mood: "",
    lighting: "",
    scene_type: assetType || "",
    people: [],
    objects: [],
    locations: [],
    actions: [],
    events: [],
    text: "",
    composition: {},
    recommended_uses: [],
    suitable_roles: [],
    visual_risks: [],
    restrictions_observed: [],
    quality: {},
    brand_alignment_score: null,
    asset_confidence: null,
    error,
  };
}

export async function analyzeMarketingAsset({
  fileUrl,
  assetType = null,
  businessProfile = null,
  analysisServiceId = "ai.image.analyze",
  analysisPolicy = {},
}) {
  if (!fileUrl) {
    return incompleteAnalysis(assetType, "NOT_ANALYZED", "file_url_required");
  }

  const context = {
    organization: businessProfile?.organization || null,
    industries: array(businessProfile?.industries),
    business_types: array(businessProfile?.business_types),
    positioning: businessProfile?.positioning || null,
    brand: businessProfile?.brand || null,
    goals: businessProfile?.goals || null,
    policy: analysisPolicy,
  };

  const prompt = `
Analyse the supplied visual asset using only evidence visible in the asset.
Do not invent identities, products, services, events, offers, locations, rights,
brand claims, demographic attributes, or business facts.

Organisation context may be used only to evaluate relevance, never to change
what is visibly present:
${JSON.stringify(context)}

Return valid JSON only with this contract:
{
  "description": "",
  "tags": [],
  "visual_style": "",
  "mood": "",
  "lighting": "",
  "scene_type": "",
  "people": [],
  "objects": [],
  "locations": [],
  "actions": [],
  "events": [],
  "text": "",
  "composition": {
    "orientation": "",
    "primary_subject_position": "",
    "negative_space": [],
    "crop_risks": [],
    "text_safe_areas": []
  },
  "recommended_uses": [],
  "suitable_roles": [],
  "visual_risks": [],
  "restrictions_observed": [],
  "quality": {
    "sharpness": null,
    "lighting": null,
    "composition": null,
    "overall": null,
    "issues": []
  },
  "brand_alignment_score": null,
  "asset_confidence": null
}
`;

  try {
    const execution = await ServiceExecutionRuntime.execute({
      organization_id: businessProfile?.organization_id,
      service_id: analysisServiceId,
      input: {
        prompt,
        image: fileUrl,
        response_format: "json",
      },
      metadata: {
        module: "CREATIVE",
        operation: "ANALYSE_ASSET",
        asset_type: assetType,
        policy: analysisPolicy,
      },
      category: "AI",
    });

    const parsed = safeJsonParse(
      execution?.output?.text ??
      execution?.output?.json ??
      execution?.output,
    );

    if (!parsed) {
      return incompleteAnalysis(assetType, "FAILED", "invalid_analysis_response");
    }

    return {
      status: "COMPLETED",
      description: parsed.description || "",
      tags: array(parsed.tags),
      visual_style: parsed.visual_style || "",
      mood: parsed.mood || "",
      lighting: parsed.lighting || "",
      scene_type: parsed.scene_type || parsed.sceneType || assetType || "",
      sceneType: parsed.scene_type || parsed.sceneType || assetType || "",
      people: array(parsed.people),
      objects: array(parsed.objects),
      locations: array(parsed.locations),
      actions: array(parsed.actions || parsed.activities),
      activities: array(parsed.actions || parsed.activities),
      events: array(parsed.events),
      text: parsed.text || "",
      composition: parsed.composition || {},
      recommended_uses: array(parsed.recommended_uses),
      suitable_roles: array(parsed.suitable_roles),
      visual_risks: array(parsed.visual_risks),
      restrictions_observed: array(parsed.restrictions_observed),
      quality: parsed.quality || {},
      quality_score: Number.isFinite(Number(parsed.quality?.overall))
        ? Number(parsed.quality.overall)
        : null,
      brand_alignment_score: Number.isFinite(Number(parsed.brand_alignment_score))
        ? Number(parsed.brand_alignment_score)
        : null,
      asset_confidence: Number.isFinite(Number(parsed.asset_confidence))
        ? Number(parsed.asset_confidence)
        : null,
      provider: execution?.provider || null,
      model: execution?.model || null,
    };
  } catch (error) {
    return incompleteAnalysis(assetType, "FAILED", error.message);
  }
}
