import OpenAI from "openai";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file) {
      return Response.json({ error: "No file uploaded" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an OCR assistant. Extract all readable text from invoices. Focus on vendor, total amount, and items.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract all text from this invoice image.",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${base64}`,
              },
            },
          ],
        },
      ],
      max_tokens: 1000,
    });

    const text = response.choices[0].message.content;

    return Response.json({
      success: true,
      text,
    });
  } catch (error) {
    console.error("OCR ERROR:", error);
    return Response.json(
      { error: "OCR failed", details: error.message },
      { status: 500 }
    );
  }
}