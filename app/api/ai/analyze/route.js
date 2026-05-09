import OpenAI from "openai";

export async function POST(req) {

  try {

    if (!process.env.OPENAI_API_KEY) {

      return Response.json(
        {
          error: "Missing OPENAI_API_KEY",
        },
        { status: 500 }
      );

    }

    

    const body = await req.json();

    const {
      revenue,
      orders,
      avg,
      trend = {},
    } = body;

    const prompt = `
You are a restaurant owner AI.

Current performance:
- Revenue: ${revenue}
- Orders: ${orders}
- Avg order value: ${avg}

Trend (vs previous period):
- Revenue change: ${trend?.revenueTrend || 0}
- Orders change: ${trend?.orderTrend || 0}
- Avg change: ${trend?.avgTrend || 0}

Your job:
Make 3 SHORT business decisions.

Format EXACTLY like this:

Action: ...
Reason: ...
Impact: ...

Rules:
- Think like an owner
- Be direct
- Focus on profit, efficiency, or risk
`;

    const response =
      await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

    return Response.json({
      result:
        response.choices[0]
          .message.content,
    });

  } catch (err) {

    return Response.json(
      {
        error:
          err.message ||
          "AI analyze failed",
      },
      { status: 500 }
    );

  }

}