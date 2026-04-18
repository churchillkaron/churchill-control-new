import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req) {
  const { image } = await req.json();

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You analyze screenshots of Google or TripAdvisor reviews.

Extract and validate:

1. rating (1–5)
2. review text (clean, readable)
3. platform (Google or TripAdvisor)
4. is_real (true if it looks like a real restaurant review)
5. confidence (0 to 1)
6. contains_food_reference (true/false)
7. contains_service_reference (true/false)

Rules:
- Reject if text looks fake, random, or unrelated
- Reject if not clearly a review screenshot
- Reject if no restaurant context

Return ONLY JSON:
{
  "rating": number,
  "text": string,
  "platform": string,
  "is_real": boolean,
  "confidence": number,
  "contains_food_reference": boolean,
  "contains_service_reference": boolean
}
`,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analyze this review screenshot",
            },
            {
              type: "image_url",
              image_url: {
                url: image,
              },
            },
          ],
        },
      ],
    });

    const content = response.choices[0].message.content;

    const parsed = JSON.parse(content);

    // 🔒 HARD VALIDATION
    if (
      !parsed.rating ||
      parsed.rating < 1 ||
      parsed.rating > 5 ||
      !parsed.text ||
      parsed.text.length < 10 ||
      !parsed.is_real ||
      parsed.confidence < 0.7
    ) {
      return Response.json({
        error: "Invalid or fake review",
      });
    }

    return Response.json(parsed);
  } catch (err) {
    return Response.json({
      error: "AI parsing failed",
    });
  }
}