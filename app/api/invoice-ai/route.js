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
You analyze invoice images.

Extract:

- vendor (company name)
- total amount
- category (food, drinks, supplies, utilities, other)

Rules:
- Must be realistic invoice
- Return ONLY JSON

{
  "vendor": string,
  "total": number,
  "category": string
}
`,
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Read this invoice" },
            {
              type: "image_url",
              image_url: { url: image },
            },
          ],
        },
      ],
    });

    const content = response.choices[0].message.content;
    const parsed = JSON.parse(content);

    if (!parsed.total || !parsed.vendor) {
      return Response.json({ error: "Invalid invoice" });
    }

    return Response.json(parsed);
  } catch (e) {
    return Response.json({ error: "AI failed" });
  }
}