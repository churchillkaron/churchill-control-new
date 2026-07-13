import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";


export async function analyzeCreativeSubject({

  imageUrl,

  organizationId = null,

}) {


  const execution =
    await ServiceExecutionRuntime.execute({

      organization_id:
        organizationId,


      service_id:
        "ai.image.analyze",


      input:{

        model:
          "gpt-4.1-mini",


        prompt:
`
Analyze the visible person or subject.

Return JSON only.

Identify:

- appearance
- style
- visible characteristics
- role indicators
- presentation style
- brand suitability
- confidence score

Do not infer:
- private identity
- sensitive personal information
- profession unless visually supported
- demographic assumptions
`,


        image:
          imageUrl,

      },


      metadata:{

        module:
          "CREATIVE",

        operation:
          "SUBJECT_ANALYSIS",

      },


      category:
        "AI",

    });



  try {

    return JSON.parse(
      execution?.output?.text || "{}"
    );

  } catch {

    return {};

  }

}
