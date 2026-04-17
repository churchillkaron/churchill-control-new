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
      model: "gpt-4o",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `
You are an OCR reader.

ONLY extract ALL text from the receipt.
DO NOT structure.
DO NOT summarize.
DO NOT interpret.

Return raw text exactly as seen.
          `,
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Read this receipt" },
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

    const rawText = response.choices[0].message.content;

    return Response.json({ text: rawText });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}