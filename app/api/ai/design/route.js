import { NextResponse } from "next/server";
import { BRAND } from "@/lib/brand";

export async function POST(req) {
  try {
    const body = await req.json();
    const { idea } = body;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `
You are a luxury restaurant marketing expert.

Brand:
${BRAND.name}

Tone:
${BRAND.tone.style}

Rules:
- Headline: short, powerful
- Sub: emotional, experience-driven
- CTA: direct

Output JSON:
{headline, sub, cta}
`,
          },
          {
            role: "user",
            content: idea,
          },
        ],
      }),
    });

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content || "{}";

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

    return NextResponse.json(parsed);

  } catch {
    return NextResponse.json({ error: "fail" }, { status: 500 });
  }
}