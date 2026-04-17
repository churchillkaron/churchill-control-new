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
Extract structured data from this receipt.

Return ONLY valid JSON:
{
  "vendor": "",
  "amount": "",
  "date": ""
}

Rules:
- amount = total paid
- date = format DD/MM/YYYY if possible
- vendor = shop/company name
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