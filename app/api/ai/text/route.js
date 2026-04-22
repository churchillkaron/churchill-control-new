import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req) {
  try {
    const { idea } = await req.json();

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You are a luxury restaurant marketing expert.

Brand:
Churchill Phuket

Rules:
- Headline: short, emotional, premium
- Sub: describe experience (1–2 lines)
- CTA: clear action

Tone:
Elegant, nightlife, high-end beach club

Return JSON ONLY:
{ "headline": "", "sub": "", "cta": "" }
`,
        },
        {
          role: "user",
          content: idea,
        },
      ],
    });

    const raw = response.choices[0].message.content;

    let parsed;

    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {
        headline: "Unforgettable Nights",
        sub: "Experience Churchill Phuket",
        cta: "BOOK NOW",
      };
    }

    return Response.json(parsed);

  } catch (err) {
    console.error(err);
    return Response.json({ error: "Text failed" }, { status: 500 });
  }
}