import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req) {
  const body = await req.json();

  const { revenue, orders, avg, performance } = body;

  const prompt = `
You are a restaurant owner AI.

Current data:
- Revenue: ${revenue}
- Orders: ${orders}
- Avg order: ${avg}
- Performance: ${performance}

Give 3 short business actions to improve profit.
`;

  const response = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [{ role: "user", content: prompt }],
  });

  return Response.json({
    result: response.choices[0].message.content,
  });
}