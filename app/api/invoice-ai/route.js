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

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await openai.responses.create({
      model: "gpt-4o",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `
Analyze this invoice.

1. Extract:
- vendor
- date
- total
- all items

2. CLASSIFY into ONE of these accounts:

Food Main Kitchen  
Food Thai Kitchen  
Pizza Kitchen  
Alcohol  
Soft Drinks  
Breakfast Food  
Cleaning  
Maintenance  
Restaurant Supplies  
Kitchen Supplies  
Bar Supplies  
Rent  
Electricity  
Gas  
Ads  
Other Expense  

Return JSON ONLY:

{
  "vendor": "",
  "date": "",
  "total": 0,
  "account": "",
  "items": [
    { "name": "", "price": 0 }
  ]
}
`,
            },
            {
              type: "input_image",
              image_url: `data:image/jpeg;base64,${base64}`,
            },
          ],
        },
      ],
    });

    const text = response.output_text;

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return Response.json({ error: "AI parse fail", raw: text });
    }

    return Response.json(data);

  } catch (err) {
    console.error(err);
    return Response.json({ error: "AI failed" }, { status: 500 });
  }
}