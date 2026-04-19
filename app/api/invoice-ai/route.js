import OpenAI from "openai";

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file) {
      return Response.json({ error: "No file" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `
You are an AI that reads invoices.

Extract:
- vendor
- date
- total
- items (name + price)

Return JSON ONLY:
{
  "vendor": "",
  "date": "",
  "total": number,
  "items": [
    { "name": "", "price": number }
  ]
}
`,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analyze this invoice",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64}`,
              },
            },
          ],
        },
      ],
    });

    const text = response.choices[0].message.content;

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return Response.json({ error: "AI parse failed", raw: text });
    }

    return Response.json(parsed);

  } catch (err) {
    console.error(err);
    return Response.json({ error: "AI failed" }, { status: 500 });
  }
}