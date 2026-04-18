import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req) {
  try {
    const { image } = await req.json();

    if (!image) {
      return Response.json({ error: "No image provided" });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You analyze screenshots of Google or TripAdvisor reviews.

You must STRICTLY verify if the screenshot is real.

Check for:
- Star rating visuals
- Reviewer name
- Platform UI (Google Maps or TripAdvisor layout)
- Restaurant context (food, service, visit experience)

Extract and validate:

1. rating (1–5)
2. review text (translated to English)
3. platform (Google or TripAdvisor)
4. is_real (true only if UI and content clearly match real review platforms)
5. confidence (0 to 1)
6. contains_food_reference (true/false)
7. contains_service_reference (true/false)
8. has_valid_ui (true/false)

Rules:
- Reject if UI does not match Google or TripAdvisor
- Reject if text is random, cropped, or unclear
- Reject if no visible stars or reviewer structure
- Reject if not clearly a restaurant review

Return ONLY JSON.
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

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      return Response.json({ error: "Invalid AI response format" });
    }

    // 🔒 HARD VALIDATION
    if (
      !parsed.rating ||
      parsed.rating < 1 ||
      parsed.rating > 5 ||
      !parsed.text ||
      parsed.text.length < 10 ||
      !parsed.is_real ||
      parsed.confidence < 0.75 ||
      !parsed.has_valid_ui
    ) {
      return Response.json({
        error: "Invalid or fake review",
      });
    }

    return Response.json(parsed);

  } catch (err) {
    return Response.json({
      error: "AI processing failed",
    });
  }
}