import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

function fallbackNarrative({
  metrics = {},
}) {
  return {
    summary:
      "Operations are live and the workspace is monitoring revenue, orders, staff, inventory and service activity.",
    risk:
      Number(metrics.operationsQueue || 0) > 0
        ? "Operations pressure may increase if pending items continue to build."
        : "No major operational risk is currently visible.",
    opportunity:
      Number(metrics.avgOrderValue || 0) > 0
        ? "Average order value can be improved through premium upselling and better staff focus."
        : "There is an opportunity to improve guest conversion and table activity.",
    action:
      "Keep monitoring service speed, stock levels and staff performance during the next operating cycle.",
  };
}

export async function generateWorkspaceNarrative({
  organization,
  industry,
  metrics,
  alerts,
}) {
  try {
     const execution =
      await ServiceExecutionRuntime.execute({

        organization_id:
          organization?.id,

        service_id:
          "ai.text.generate",

        provider_id:
          "openai",

        input:{

          model:
            "gpt-4o-mini",

          prompt:
`
You are an experienced hospitality operations manager.

Write like a sharp human operator, not a chatbot.

Rules:
- Use ONLY the data provided.
- Never invent numbers.
- Never repeat the same wording.
- Be practical, direct and premium.
- Focus on summary, risk, opportunity and action.
- Return ONLY valid JSON.

JSON shape:
{
  "summary": "",
  "risk": "",
  "opportunity": "",
  "action": ""
}


DATA:

${JSON.stringify(
  {
    organization:
      organization?.name,

    organizationType:
      organization?.organization_type,

    industry,

    metrics,

    alerts,

    generatedAt:
      new Date().toISOString(),

  },
  null,
  2
)}
`

        },

        metadata:{

          module:
            "WORKSPACE",

          operation:
            "GENERATE_NARRATIVE",

        },

        category:
          "AI",

      });


    const raw =
      execution?.output?.text ||
      "{}";

    return {
      ...fallbackNarrative({
        metrics,
      }),
      ...JSON.parse(raw),
    };
  } catch (error) {
    console.error(
      "workspace narrative error",
      error
    );

    return fallbackNarrative({
      metrics,
    });
  }
}
