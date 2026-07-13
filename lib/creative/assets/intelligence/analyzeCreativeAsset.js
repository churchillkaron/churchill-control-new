import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function fallbackAnalysis(assetType) {
  return {
    description: "Business creative asset",
    tags: ["business"],
    mood: "Professional",
    lighting: "Professional",
    sceneType: assetType || "Commercial",
    objects: [],
    activities: [],
    venue_area: null,
    business_angle: [],
    campaign_uses: [],
    visual_risks: [],
    asset_confidence: 40,
  };
}

export async function analyzeCreativeAsset({
  fileUrl,
  assetType,
  businessProfile = null,
}) {
  try {
    if (!fileUrl) {
      return fallbackAnalysis(assetType);
    }

    const prompt = `
Analyze this creative asset.

Business Industries:
${(businessProfile?.industries || []).join(", ")}

Business Types:
${(businessProfile?.business_types || []).join(", ")}

Revenue Drivers:
${(businessProfile?.revenue_drivers || []).join(", ")}

Marketing Angles:
${(businessProfile?.marketing_angles || []).join(", ")}

Identify only what is actually visible in the image.

Do not invent products, services, promotions, events, offers or business activities.

Do not infer marketing campaigns unless they are visually evident.

Return ONLY valid JSON with this structure:
{
  "description": "",
  "tags": [],
  "mood": "",
  "lighting": "",
  "sceneType": "",
  "objects": [],
  "activities": [],
  "venue_area": "",
  "business_angle": [],
  "campaign_uses": [],

  "business_category": "",

  "industry_tags": [],

  "commercial_use_cases": [],

  "campaign_fit": [],

  "brand_alignment_score": 0,

  "industry_relevance_score": 0,

  "visual_risks": [],

  "asset_confidence": 0
}

SCORING RULES:

brand_alignment_score:
0-100

How well this asset matches the business profile,
industry, positioning and marketing strategy.

industry_relevance_score:
0-100

How useful this asset is for campaigns
within this business industry.

commercial_use_cases examples:
- awareness
- branding
- product showcase
- event marketing
- recruitment
- trust building
- social proof
- promotion

campaign_fit examples:
- facebook
- instagram
- website
- landing page
- email marketing
- paid ads

industry_tags should describe
the actual business relevance
visible in the image.
`;

    const execution =
      await ServiceExecutionRuntime.execute({

        organization_id:
          businessProfile?.organization_id,

        service_id:
          "ai.image.analyze",

        provider_id:
          "openai",

        input:{

          model:
            "gpt-4.1-mini",

          prompt,

          image:
            fileUrl,

        },

        metadata:{

          module:
            "CREATIVE",

          operation:
            "ANALYZE_ASSET",

        },

        category:
          "AI",

      });


    const raw =
      execution?.output?.text ||
      "";

    const parsed =
      safeJsonParse(raw);

    if (!parsed) {
      return fallbackAnalysis(assetType);
    }

    return {
      description:
        parsed.description || "",

      tags:
        Array.isArray(parsed.tags)
          ? parsed.tags
          : [],

      mood:
        parsed.mood || "Professional",

      lighting:
        parsed.lighting || "Professional",

      sceneType:
        parsed.sceneType || assetType || "Commercial",

      objects:
        Array.isArray(parsed.objects)
          ? parsed.objects
          : [],

      activities:
        Array.isArray(parsed.activities)
          ? parsed.activities
          : [],

      venue_area:
        parsed.venue_area || null,

      business_angle:
        Array.isArray(parsed.business_angle)
          ? parsed.business_angle
          : [],

      campaign_uses:
        Array.isArray(parsed.campaign_uses)
          ? parsed.campaign_uses
          : [],

      business_category:
        parsed.business_category || "",

      industry_tags:
        Array.isArray(parsed.industry_tags)
          ? parsed.industry_tags
          : [],

      commercial_use_cases:
        Array.isArray(parsed.commercial_use_cases)
          ? parsed.commercial_use_cases
          : [],

      campaign_fit:
        Array.isArray(parsed.campaign_fit)
          ? parsed.campaign_fit
          : [],

      brand_alignment_score:
        Number(
          parsed.brand_alignment_score || 0
        ),

      industry_relevance_score:
        Number(
          parsed.industry_relevance_score || 0
        ),

      visual_risks:
        Array.isArray(parsed.visual_risks)
          ? parsed.visual_risks
          : [],

      asset_confidence:
        Number(parsed.asset_confidence || 0),
    };

  } catch (err) {
    console.error(
      "ANALYZE CREATIVE ASSET ERROR:",
      err
    );

    return fallbackAnalysis(assetType);
  }
}
