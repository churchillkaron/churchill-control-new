import OpenAI from "openai";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req) {
  try {
    const { image } = await req.json();

    if (!image) {
      return Response.json({ error: "No image provided" }, { status: 400 });
    }

    const response = await openai.responses.create({
      model: "gpt-4.1",
      temperature: 0,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `
You are an OCR system.

Extract:
- vendor
- total_amount
- date

Return ONLY JSON:
{
  "vendor": "",
  "total_amount": "",
  "date": ""
}
              `,
            },
            {
              type: "input_image",
              image_url: image,
            },
          ],
        },
      ],
    });

    const text =
      response.output_text ||
      response.output?.[0]?.content?.[0]?.text ||
      "";

    if (!text) {
      return Response.json({ error: "No OCR text returned" });
    }

    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch {
      return Response.json({ error: "JSON parse failed", raw: text });
    }

    return Response.json({ data: parsed });

  } catch (error) {
    console.error("OCR ERROR:", error);
    return Response.json(
      { error: "OCR failed", details: error.message },
      { status: 500 }
    );
  }
}