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
      model: "gpt-4o", // 🔥 UPGRADED MODEL
      temperature: 0,  // 🔥 no randomness
      messages: [
        {
          role: "system",
          content: `
You are an expert accountant reading receipts.

You MUST extract correct financial data.
You NEVER guess based on titles or filenames.
You ONLY use actual receipt content.
          `,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `
Extract data from this receipt.

VERY STRICT RULES:

1. Vendor:
- Must be real business name printed on receipt
- NOT file name
- NOT large title if not a company

2. Amount:
- Must be FINAL TOTAL
- Look for:
  - TOTAL
  - GRAND TOTAL
  - NET TOTAL
- Choose the LARGEST relevant amount

3. Date:
- Extract if visible

4. IGNORE:
- "invoice eden final"
- logos
- headers
- filenames

Return ONLY JSON:

{
  "vendor": "...",
  "amount": "...",
  "date": "..."
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