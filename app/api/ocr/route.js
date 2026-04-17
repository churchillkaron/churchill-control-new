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

    const response = await client.responses.create({
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

Extract all visible text from this document.
Return plain text only.
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

    // ✅ SAFE extraction (this is the fix)
    const rawText =
      response.output_text ||
      response.output?.[0]?.content?.[0]?.text ||
      "";

    if (!rawText || rawText.trim() === "") {
      return Response.json({ error: "No readable text found" }, { status: 200 });
    }

    return Response.json({ text: rawText });

  } catch (err) {
    console.error(err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}