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

STEP 1: Detect document type:
- If it contains "INVOICE" → type = invoice
- Otherwise → type = receipt

STEP 2: Extract data based on type

IF INVOICE:
- vendor = company issuing invoice (top section with address / tax id / logo)
- total_amount = ONLY the final payable amount:
  Priority:
  1. "Remaining Balance"
  2. "Total"
  3. Largest amount if unclear
- date = invoice date

IGNORE:
- customer name (Invoice To)
- deposits
- event details

IF RECEIPT:
- vendor = store/shop name (top)
- total_amount = final total paid
- date = transaction date

STEP 3: Category detection:
- If vendor contains food supplier → "Food"
- If vendor contains alcohol/bar → "Alcohol"
- Otherwise → "Supplies"

RETURN ONLY JSON:
{
  "type": "",
  "vendor": "",
  "total_amount": "",
  "date": "",
  "category": ""
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

    const text = response.output[0].content[0].text;

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }

    return Response.json({ data: parsed });

  } catch (err) {
    console.error(err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}