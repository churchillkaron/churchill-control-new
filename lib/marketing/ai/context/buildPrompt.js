import { getTopPerformingCampaigns }
from "@/lib/marketing/ai/utils/getTopPerformingCampaigns";

export async function buildPrompt(
  state
) {

  let referenceMemory = "";

  try {

    const topCampaigns =
      await getTopPerformingCampaigns({

        tenantId:
          state.tenantId,

        limit: 3,

      });

    if (topCampaigns?.length) {

      referenceMemory =
        topCampaigns
          .map((campaign) => {

            return `

TOP PERFORMING CAMPAIGN:

TITLE:
${campaign.title}

MOOD:
${campaign.mood}

LIGHTING:
${campaign.lighting}

ATMOSPHERE:
${campaign.atmosphere}

SUBJECT:
${campaign.subject}

VENUE:
${campaign.venue}

`;

          })
          .join("\n");

    }

  } catch (err) {

    console.error(
      "PROMPT MEMORY ERROR:",
      err
    );

  }

  return `

Create marketing content aligned with the business profile.

BUSINESS CONTEXT:

Business Name:
${state.businessName || "Unknown Business"}

Facebook Page:
${state.selectedBusiness?.page_name || "Unknown"}

Instagram Business:
${state.selectedBusiness?.instagram_business_id || "Not Connected"}

Industries:
${(state.businessProfile?.industries || []).join(", ")}

Business Types:
${(state.businessProfile?.business_types || []).join(", ")}

Revenue Drivers:
${(state.businessProfile?.revenue_drivers || []).join(", ")}

Customer Motivations:
${(state.businessProfile?.customer_motivations || []).join(", ")}

Operational Focus:
${(state.businessProfile?.operational_focus || []).join(", ")}

Marketing Angles:
${(state.businessProfile?.marketing_angles || []).join(", ")}

Maintain:
- brand consistency
- business identity
- industry realism
- authentic commercial context
- professional visual quality

Avoid:
- generic stock imagery
- unrelated industries
- random branding
- inconsistent business context

CAMPAIGN:
${state.campaignType}

MOOD:
${state.mood}

LIGHTING:
${state.lighting}

COMPOSITION:
${state.composition}

ATMOSPHERE:
${state.atmosphere}

SUBJECT:
${state.subject}

VENUE:
${state.venue}

EXTRA DIRECTION:
${state.extraDirection}

REFERENCE MEMORY:
${referenceMemory}

RULES:
- realistic photography
- cinematic realism
- believable guests
- natural skin texture
- brand-appropriate commercial atmosphere
- authentic lighting
- no typography
- no logos
- no graphic design

`;

}