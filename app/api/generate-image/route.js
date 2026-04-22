import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const body = await req.json();

    // 🔥 TEXT MODE
    if (body.mode === "text") {
      const { type, idea } = body;

      const prompt = `
You are creating a premium marketing campaign for a luxury restaurant (Churchill Phuket).

Type: ${type}
Idea: ${idea}

Return ONLY JSON:
{
  "headline": "...",
  "subText": "...",
  "cta": "..."
}
`;

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
        }),
      });

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || "{}";

      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = {};
      }

      return NextResponse.json(parsed);
    }

    // 🔥 IMAGE MODE (3 images)
    if (body.mode === "images") {
      const { type, idea, headline } = body;

      const basePrompt = `
Luxury restaurant marketing image for Churchill Phuket.

Type: ${type}
Concept: ${idea}
Mood: cinematic, warm, premium lighting

NO TEXT IN IMAGE
NO LETTERS
NO TYPOGRAPHY
`;

      const images = [];

      for (let i = 0; i < 3; i++) {
        const response = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-image-1",
            prompt: basePrompt,
            size: "1024x1024",
          }),
        });

        const data = await response.json();
        images.push(data.data?.[0]?.url || null);
      }

      return NextResponse.json({ images });
    }

    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}