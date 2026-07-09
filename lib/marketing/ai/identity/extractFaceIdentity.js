import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

export async function extractFaceIdentity({

  imageUrl,

}) {

  const execution =
    await ServiceExecutionRuntime.execute({

      organization_id:
        null,

      service_id:
        "ai.image.analyze",

      provider_id:
        "openai",

      input:{

        model:
          "gpt-4.1-mini",

        prompt:
`
Analyze this person for commercial marketing use.

Return JSON only.

Detect:

- gender
- approximate_age
- hairstyle
- hair_color
- facial_features
- vibe
- fashion_style
- business_role
- industry_relevance_score
- brand_alignment_score
- hospitality_role
- luxury_score
- nightlife_score
- reusable_identity_prompt
`,

        image:
          imageUrl,

      },

      metadata:{

        module:
          "MARKETING",

        operation:
          "IDENTITY_ANALYSIS",

      },

      category:
        "AI",

    });



  const result =
    JSON.parse(

      execution?.output?.text ||
      "{}"

    );

  return {

    ...result,

    business_role:
      result.business_role ||
      result.hospitality_role ||
      null,

    industry_relevance_score:
      result.industry_relevance_score ??
      result.nightlife_score ??
      0,

    brand_alignment_score:
      result.brand_alignment_score ??
      result.luxury_score ??
      0,

  };

}