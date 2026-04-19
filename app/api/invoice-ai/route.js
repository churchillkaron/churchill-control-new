import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req) {
  try {
    const { image } = await req.json();

    if (!image) {
      return Response.json({ error: "Missing image" }, { status: 400 });
    }

    const prompt = `
You are an expert restaurant accounting invoice parser.

Your task:
1. Read the invoice image.
2. If the invoice is in Thai, translate it to English internally.
3. Extract vendor name.
4. Extract invoice date if visible.
5. Extract total amount.
6. Extract line items as accurately as possible.
7. Classify every line item into the EXACT accounting structure below.

IMPORTANT RULES:
- Return ONLY valid JSON.
- No markdown.
- No explanations.
- Currency is THB unless clearly stated otherwise.
- If qty is unclear, use 1.
- If invoice date is unclear, use null.
- If item classification is unclear, choose the closest valid option and explain briefly in notes.
- Never invent categories outside the approved list.
- If the bill is not a real invoice/receipt, return:
  { "error": "Invalid invoice" }

APPROVED ACCOUNTING STRUCTURE

ACCOUNT TYPES
- Revenue
- COGS
- Operating Expense
- Owner / Non-Operating

DEPARTMENTS (COST CENTERS)
- Kitchen
- Bar
- Breakfast
- Entertainment
- Operations
- Admin
- Utilities
- Staff Welfare
- Marketing
- Owner

NATURAL ACCOUNTS

COGS
Kitchen
- Food Main Kitchen
- Food Thai Kitchen
- Pizza Kitchen

Bar
- Alcohol
- Soft Drinks

Breakfast
- Breakfast Food

Operating Expense

Entertainment
- DJ
- Band
- Acoustic
- Events

Staff Welfare
- Staff Food
- Staff Drinks
- Staff Rewards
- Staff Tax
- SSO

Operations
- Cleaning
- Decoration
- Maintenance
- Restaurant Supplies
- Transportation
- Kitchen Supplies
- Bar Supplies
- Bar Equipment

Admin
- Rent
- Accounting Fees
- Software
- Depreciation
- Salaries
- Overtime
- Service Charge
- Postage

Utilities
- Electricity
- Gas

Marketing
- Ads
- Social Media
- Promotions
- Content Creation

Other Operating
- Miscellaneous
- Police / Irregular

Owner / Non-Operating
- Owner Funding
- Owner Withdrawal

CLASSIFICATION RULES
- Food ingredients for the main menu -> COGS / Kitchen / Food Main Kitchen
- Thai kitchen ingredients -> COGS / Kitchen / Food Thai Kitchen
- Pizza ingredients -> COGS / Kitchen / Pizza Kitchen
- Alcoholic beverages for sale -> COGS / Bar / Alcohol
- Soft drinks for sale -> COGS / Bar / Soft Drinks
- Breakfast ingredients -> COGS / Breakfast / Breakfast Food
- Staff meals -> Operating Expense / Staff Welfare / Staff Food
- Staff drinks / water -> Operating Expense / Staff Welfare / Staff Drinks
- Payroll tax -> Operating Expense / Staff Welfare / Staff Tax
- Social Security Office cost -> Operating Expense / Staff Welfare / SSO
- DJ cost -> Operating Expense / Entertainment / DJ
- Band cost -> Operating Expense / Entertainment / Band
- Acoustic performer -> Operating Expense / Entertainment / Acoustic
- Event-specific spend -> Operating Expense / Entertainment / Events
- Cleaning items -> Operating Expense / Operations / Cleaning
- Decoration items -> Operating Expense / Operations / Decoration
- Repair / fix / service -> Operating Expense / Operations / Maintenance
- Restaurant consumables -> Operating Expense / Operations / Restaurant Supplies
- Delivery / fuel / travel for buying goods -> Operating Expense / Operations / Transportation
- Kitchen tools / kitchen non-food supplies -> Operating Expense / Operations / Kitchen Supplies
- Bar tools / cups / shaker / opener / non-product bar items -> Operating Expense / Operations / Bar Supplies
- Bar machines / equipment -> Operating Expense / Operations / Bar Equipment
- Rent -> Operating Expense / Admin / Rent
- Accounting / tax service -> Operating Expense / Admin / Accounting Fees
- Software / subscriptions -> Operating Expense / Admin / Software
- Depreciation-related items -> Operating Expense / Admin / Depreciation
- Salary / payroll -> Operating Expense / Admin / Salaries
- Overtime -> Operating Expense / Admin / Overtime
- Service charge payout / cost -> Operating Expense / Admin / Service Charge
- Post / delivery documents -> Operating Expense / Admin / Postage
- Electric bill -> Operating Expense / Utilities / Electricity
- Gas / LPG -> Operating Expense / Utilities / Gas
- Advertising -> Operating Expense / Marketing / Ads
- Social media tools / spends -> Operating Expense / Marketing / Social Media
- Promotion / campaign cost -> Operating Expense / Marketing / Promotions
- Design / media content spend -> Operating Expense / Marketing / Content Creation
- Owner money added -> Owner / Non-Operating / Owner Funding
- Owner taking money out -> Owner / Non-Operating / Owner Withdrawal
- Police / unclear irregular cash out -> Operating Expense / Operations / Police / Irregular
- Unknown small business cost -> Operating Expense / Operations / Miscellaneous

RETURN THIS EXACT JSON SHAPE:
{
  "vendor": "string",
  "invoice_date": "YYYY-MM-DD or null",
  "currency": "THB",
  "total": 0,
  "items": [
    {
      "name": "string",
      "qty": 1,
      "amount": 0,
      "account_type": "COGS | Operating Expense | Owner / Non-Operating",
      "department": "Kitchen | Bar | Breakfast | Entertainment | Operations | Admin | Utilities | Staff Welfare | Marketing | Owner",
      "natural_account": "string",
      "tag": "string or null",
      "notes": "string or null"
    }
  ]
}
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: prompt,
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Analyze this invoice image and return the required JSON." },
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

    const content = response.choices?.[0]?.message?.content;

    if (!content) {
      return Response.json({ error: "AI returned empty response" }, { status: 500 });
    }

    const parsed = JSON.parse(content);

    if (parsed.error) {
      return Response.json(parsed, { status: 400 });
    }

    if (!parsed.vendor || typeof parsed.total !== "number" || !Array.isArray(parsed.items)) {
      return Response.json({ error: "Invalid invoice structure" }, { status: 400 });
    }

    const sanitized = {
      vendor: parsed.vendor || "Unknown Vendor",
      invoice_date: parsed.invoice_date || null,
      currency: parsed.currency || "THB",
      total: Number(parsed.total) || 0,
      items: parsed.items.map((item) => ({
        name: item.name || "Unknown Item",
        qty: Number(item.qty) || 1,
        amount: Number(item.amount) || 0,
        account_type: item.account_type || "Operating Expense",
        department: item.department || "Operations",
        natural_account: item.natural_account || "Miscellaneous",
        tag: item.tag ?? null,
        notes: item.notes ?? null,
      })),
    };

    return Response.json(sanitized);
  } catch (error) {
    return Response.json(
      {
        error: error?.message || "AI failed",
      },
      { status: 500 }
    );
  }
}