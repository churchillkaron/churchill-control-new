import buildExecutiveOverview from "@/lib/intelligence/executive/buildExecutiveOverview";

import buildPerformanceInsights from "@/lib/intelligence/performance/buildPerformanceInsights";

import buildRevenueForecast from "@/lib/finance/forecasting/buildRevenueForecast";

import buildOperationalRecommendations from "@/lib/intelligence/recommendations/buildOperationalRecommendations";

import generateAIResponse from "@/lib/intelligence/openai/generateAIResponse";

export default async function runAgentCouncil({
  tenant_id,
  question,
}) {

  try {

    const [
      executive,
      performance,
      forecast,
      recommendations,
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

      buildOperationalRecommendations({
        tenant_id,
      }),
    ]);

    const financeAgent =
      await generateAIResponse({

        systemPrompt:
`You are Finance AI.

Focus:
- profitability
- revenue
- margins
- forecasting
- pricing strategy`,

        userPrompt:
`Business data:
${JSON.stringify(executive)}

Question:
${question}`,
      });

    const operationsAgent =
      await generateAIResponse({

        systemPrompt:
`You are Operations AI.

Focus:
- workflow
- kitchen
- staff
- operational bottlenecks
- service quality`,

        userPrompt:
`Operational data:
${JSON.stringify(performance)}

Question:
${question}`,
      });

    const strategyAgent =
      await generateAIResponse({

        systemPrompt:
`You are Strategy AI.

Focus:
- scaling
- optimization
- long-term growth
- customer behavior
- executive recommendations`,

        userPrompt:
`Forecast:
${JSON.stringify(forecast)}

Recommendations:
${JSON.stringify(recommendations)}

Question:
${question}`,
      });

    const councilSummary =
      await generateAIResponse({

        systemPrompt:
`You are Churchill AI Council Coordinator.

Combine multiple expert AI opinions into one executive decision summary.`,

        userPrompt:
`
Finance AI:
${financeAgent.content}

Operations AI:
${operationsAgent.content}

Strategy AI:
${strategyAgent.content}

Generate final executive recommendation.
`,
      });

    return {
      success: true,

      agents: {

        finance:
          financeAgent.content,

        operations:
          operationsAgent.content,

        strategy:
          strategyAgent.content,
      },

      executive_summary:
        councilSummary.content,

      generated_at:
        new Date().toISOString(),
    };

  } catch (error) {

    return {
      success: false,
      error:
        error.message,
    };
  }
}
