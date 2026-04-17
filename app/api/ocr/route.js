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
You are an accounting OCR system.

RULES:

1. This is an invoice or receipt.

2. Vendor = the company issuing the document:
- Usually at the TOP
- Contains company name, address, tax ID, logo
- NEVER the customer name

3. IGNORE:
- "Invoice To"
- Customer names (like Amit)
- Event or booking details

4. Amount:
- If "Remaining Balance" exists → use it
- Otherwise use "Total"
- Never use deposit

5. Date:
- Use invoice date or transaction date

RETURN ONLY JSON:

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

    const output =
      response.output_text ||
      response.output?.[0]?.content?.[0]?.text ||
      "";

    let parsed;

    try {
      parsed = JSON.parse(output);
    } catch {
      return Response.json({ error: "Parsing failed", raw: output });
    }

    return Response.json({ data: parsed });

  } catch (err) {
    console.error(err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}