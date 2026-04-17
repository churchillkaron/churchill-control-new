import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req) {
  try {
    const { image } = await req.json();

    if (!image) {
      return Response.json({ error: "No image provided" }, { status: 400 });
    }

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `
You are reading a receipt or invoice.

Extract:
- vendor (real business name, NOT filename or title)
- total amount paid (look for TOTAL, GRAND TOTAL)
- date

Rules:
- Ignore filenames like "invoice eden final"
- Ignore logos and titles
- Focus on final total amount
- Return numbers only (no currency symbols)

Return ONLY JSON:

{
  "vendor": "",
  "amount": "",
  "date": ""
}
              `,
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

    const text = response.choices[0].message.content;

    return Response.json({ result: text });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}