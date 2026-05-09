import { getTopPerformingCampaigns }
from "@/lib/ai/getTopPerformingCampaigns";

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

Create a realistic cinematic hospitality photograph.

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
- premium hospitality atmosphere
- authentic lighting
- no typography
- no logos
- no graphic design

`;

}