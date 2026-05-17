import buildExecutiveOverview from "@/lib/intelligence/executive/buildExecutiveOverview";

import buildPerformanceInsights from "@/lib/intelligence/performance/buildPerformanceInsights";

import buildRevenueForecast from "@/lib/finance/forecasting/buildRevenueForecast";

import generateAIResponse from "@/lib/intelligence/openai/generateAIResponse";

import { TOOL_REGISTRY } from "@/lib/intelligence/tools/toolRegistry";

export default async function buildOwnerResponse({
  tenant_id,
  question,
}) {

  try {

    const [
      executive,
      performance,
      forecast,
    ] = await Promise.all([

      buildExecutiveOverview({
        tenant_id,
      }),

      buildPerformanceInsights({
        tenant_id,
      }),

      buildRevenueForecast({
        tenant_id,
      }),
    ]);

    const context = {

      revenue:
        executive?.revenue
          ?.total_revenue || 0,

      operations:
        executive?.operations
          ?.status || "UNKNOWN",

      customers:
        executive?.customers
          ?.total_customers || 0,

      performance:
        performance
          ?.performance || "UNKNOWN",

      forecast:
        forecast
          ?.projected_30_day_revenue || 0,
    };

    const ai =
      await generateAIResponse({

        systemPrompt:
`You are Churchill AI.

You are an elite hospitality operations AI system.

You analyze:
- restaurant revenue
- operations
- forecasting
- staffing
- anomalies
- optimization

Always answer strategically and professionally.

Business context:
${JSON.stringify(context, null, 2)}`,

        userPrompt:
          question,

        tools:
          TOOL_REGISTRY,
      });

    if (
      !ai.success
    ) {

      return ai;
    }

    const message =
      ai.message;

    if (
      message.tool_calls
    ) {

      const outputs = [];

      for (const call of message.tool_calls) {

        if (
          call.function.name ===
          "get_revenue_summary"
        ) {

          outputs.push(
            `Revenue is currently ${context.revenue}.`
          );
        }

        if (
          call.function.name ===
          "get_operational_status"
        ) {

          outputs.push(
            `Operational status is ${context.operations}.`
          );
        }

        if (
          call.function.name ===
          "get_forecast"
        ) {

          outputs.push(
            `30-day forecast is ${context.forecast}.`
          );
        }
      }

      return {
        success: true,
        answer:
          outputs.join("\n"),
        tool_mode:
          true,
      };
    }

    return {
      success: true,
      answer:
        message.content ||
        "No AI response generated.",
      tool_mode:
        false,
    };

  } catch (error) {

    return {
      success: false,
      error:
        error.message,
    };
  }
}
