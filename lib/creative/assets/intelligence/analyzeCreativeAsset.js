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

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value || "").trim();
}

function unverifiedAnalysis({ assetType, mediaKind, reason }) {
  return {
    status: "UNVERIFIED",
    verification_reason: text(reason) || "Provider-backed analysis unavailable",
    media_kind: mediaKind || "file",
    scene_type: assetType || "unknown",
    description: "",
    tags: [],
    visible_subjects: [],
    objects: [],
    activities: [],
    environments: [],
    visible_text: [],
    logos: [],
    identity_anchors: {},
    product_anchors: {},
    location_anchors: {},
    wardrobe_anchors: {},
    continuity_risks: [],
    technical_quality: {},
    crop_guidance: {},
    safe_areas: {},
    motion_characteristics: {},
    audio_characteristics: {},
    direct_use_disposition: "REFERENCE_ONLY",
    disposition_reason: "Asset understanding is unverified",
    recommended_uses: [],
    incompatible_uses: [],
    repairability: {},
    rights_risks: [],
    consent_risks: [],
    privacy_risks: [],
    claims_risks: [],
    brand_risks: [],
    evidence: [],
    asset_confidence: 0,
  };
}

function normalize(parsed, context) {
  const result = parsed?.result || parsed || {};
  const confidence = Number(result.asset_confidence);
  const status = text(result.status).toUpperCase() === "VERIFIED"
    ? "VERIFIED"
    : "UNVERIFIED";

  return {
    ...unverifiedAnalysis(context),
    ...result,
    status,
    media_kind: text(result.media_kind) || context.mediaKind || "file",
    scene_type: text(result.scene_type) || context.assetType || "unknown",
    tags: list(result.tags),
    visible_subjects: list(result.visible_subjects),
    objects: list(result.objects),
    activities: list(result.activities),
    environments: list(result.environments),
    visible_text: list(result.visible_text),
    logos: list(result.logos),
    continuity_risks: list(result.continuity_risks),
    recommended_uses: list(result.recommended_uses),
    incompatible_uses: list(result.incompatible_uses),
    rights_risks: list(result.rights_risks),
    consent_risks: list(result.consent_risks),
    privacy_risks: list(result.privacy_risks),
    claims_risks: list(result.claims_risks),
    brand_risks: list(result.brand_risks),
    evidence: list(result.evidence),
    asset_confidence:
      Number.isFinite(confidence) && confidence >= 0 && confidence <= 100
        ? confidence
        : 0,
  };
}

export async function analyzeCreativeAsset({
  organizationId,
  fileUrl,
  assetType,
  mediaKind = "image",
  mimeType = null,
  technicalInspection = {},
  businessProfile = null,
} = {}) {
  const resolvedOrganizationId =
    organizationId || businessProfile?.organization_id || null;

  if (!resolvedOrganizationId) {
    return unverifiedAnalysis({
      assetType,
      mediaKind,
      reason: "organization_id required for provider-backed analysis",
    });
  }
  if (!fileUrl) {
    return unverifiedAnalysis({
      assetType,
      mediaKind,
      reason: "file URL required for provider-backed analysis",
    });
  }
  if (mediaKind !== "image") {
    return unverifiedAnalysis({
      assetType,
      mediaKind,
      reason: `No verified ${mediaKind} analysis capability is connected`,
    });
  }

  const prompt = `
You are Avantiqo's Asset Intelligence Director. Inspect only evidence visible in
this asset. Do not invent identity, business activity, product claims, rights,
consent, location, profession, demographics or intended use.

Return strict JSON only:
{
  "status":"VERIFIED|UNVERIFIED",
  "media_kind":"image",
  "scene_type":"neutral evidence-based classification",
  "description":"precise visible description",
  "tags":[],
  "visible_subjects":[{"id":"subject-1","description":"","position":"","confidence":0}],
  "objects":[{"id":"object-1","description":"","position":"","confidence":0}],
  "activities":[],
  "environments":[],
  "visible_text":[{"text":"","position":"","confidence":0}],
  "logos":[{"description":"","position":"","confidence":0}],
  "identity_anchors":{"face":"","hair":"","body":"","distinctive_features":[]},
  "product_anchors":{"shape":"","colour":"","materials":"","markings":[]},
  "location_anchors":{"layout":"","architecture":"","landmarks":[]},
  "wardrobe_anchors":{"garments":[],"colours":[],"accessories":[]},
  "continuity_risks":[],
  "technical_quality":{"resolution":"","sharpness":"","noise":"","compression":"","exposure":"","colour":""},
  "crop_guidance":{"landscape":"","portrait":"","square":""},
  "safe_areas":{"critical_subjects":[],"critical_text":[]},
  "motion_characteristics":{},
  "audio_characteristics":{},
  "direct_use_disposition":"DIRECT_USE|REFERENCE_ONLY|REPAIR_FIRST|REGENERATE|EXCLUDE",
  "disposition_reason":"evidence-based production decision",
  "recommended_uses":[],
  "incompatible_uses":[],
  "repairability":{"possible":false,"operations":[],"limits":[]},
  "rights_risks":[],
  "consent_risks":[],
  "privacy_risks":[],
  "claims_risks":[],
  "brand_risks":[],
  "evidence":[],
  "asset_confidence":0
}

Rules:
- Mark status VERIFIED only when the asset was actually inspected.
- Confidence is evidence confidence, not aesthetic preference.
- Visible text and logos require conservative confidence.
- A person, product or place may be described but never privately identified.
- Direct use requires sufficient technical quality and no unresolved blocking risk.
- Reference-only means the asset may guide generation but should not be inserted directly.

CONTEXT:
${JSON.stringify({ assetType, mediaKind, mimeType, technicalInspection, businessProfile })}
`;

  try {
    const execution = await ServiceExecutionRuntime.execute({
      organization_id: resolvedOrganizationId,
      service_id: "ai.image.analyze",
      provider_id: null,
      input: {
        prompt,
        image: fileUrl,
      },
      metadata: {
        module: "CREATIVE",
        operation: "ASSET_INTELLIGENCE_V2",
        media_kind: mediaKind,
        mime_type: mimeType,
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
      return unverifiedAnalysis({
        assetType,
        mediaKind,
        reason: "Asset intelligence provider returned invalid JSON",
      });
    }
    return normalize(parsed, { assetType, mediaKind });
  } catch (error) {
    return unverifiedAnalysis({
      assetType,
      mediaKind,
      reason: error?.message || String(error),
    });
  }
}
