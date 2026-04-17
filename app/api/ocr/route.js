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

    console.log("IMAGE LENGTH:", image.length); // DEBUG

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

1. Vendor = company issuing document (TOP area)
   - Must include company name / address / tax id
   - NEVER customer name
   - IGNORE "Invoice To"

2. Amount:
   - Use "Remaining Balance" if exists
   - Else use "Total"
   - NEVER use deposit

3. Date = invoice or transaction date

RETURN ONLY VALID JSON:

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

    let outputText = "";

    if (response.output_text) {
      outputText = response.output_text;
    } else if (response.output) {
      for (const item of response.output) {
        if (item.content) {
          for (const c of item.content) {
            if (c.text) {
              outputText += c.text;
            }
          }
        }
      }
    }

    if (!outputText) {
      return Response.json({
        error: "OCR failed: empty response",
        debug: response,
      });
    }

    let parsed;

    try {
      parsed = JSON.parse(outputText);
    } catch {
      return Response.json({
        error: "JSON parse failed",
        raw: outputText,
      });
    }

    return Response.json({ data: parsed });

  } catch (err) {
    console.error(err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}