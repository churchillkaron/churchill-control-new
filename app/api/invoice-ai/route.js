import vision from "@google-cloud/vision";
import OpenAI from "openai";

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file) {
      return Response.json({ error: "No file" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // 🔥 GOOGLE OCR
    const client = new vision.ImageAnnotatorClient();

    const [result] = await client.textDetection({
      image: { content: buffer },
    });

    const extractedText = result.textAnnotations[0]?.description || "";

    if (!extractedText) {
      return Response.json({ error: "No text detected" });
    }

    // 🔥 OPENAI STRUCTURE
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const ai = await openai.responses.create({
      model: "gpt-4o",
      temperature: 0,
      input: [
        {
          role: "user",
          content: `
You are an accounting AI.

Convert this OCR text into structured invoice data.

IMPORTANT:
- This is a Thai supermarket receipt
- Extract ALL items (not just a few)
- Extract real total
- Translate Thai to English

Return JSON ONLY:

{
  "vendor": "",
  "date": "",
  "total": 0,
  "items": [
    { "name": "", "price": 0 }
  ]
}

OCR TEXT:
${extractedText}
`,
        },
      ],
    });

    const text = ai.output_text;

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return Response.json({
        error: "AI parse failed",
        raw: text,
      });
    }

    return Response.json(data);

  } catch (err) {
    console.error(err);
    return Response.json({ error: "System failed" }, { status: 500 });
  }
}