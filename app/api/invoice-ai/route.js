import OpenAI from "openai";
import { NextResponse } from "next/server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const ALLOWED_ACCOUNT_TYPES = [
  "COGS",
  "Operating Expense",
  "Owner / Non-Operating",
];

const ALLOWED_DEPARTMENTS = [
  "Kitchen",
  "Bar",
  "Breakfast",
  "Entertainment",
  "Operations",
  "Admin",
  "Utilities",
  "Staff Welfare",
  "Marketing",
  "Owner",
];

const ALLOWED_NATURAL_ACCOUNTS = [
  "Food Main Kitchen",
  "Food Thai Kitchen",
  "Pizza Kitchen",
  "Alcohol",
  "Soft Drinks",
  "Breakfast Food",
  "DJ",
  "Band",
  "Acoustic",
  "Events",
  "Staff Food",
  "Staff Drinks",
  "Staff Rewards",
  "Staff Tax",
  "SSO",
  "Cleaning",
  "Decoration",
  "Maintenance",
  "Restaurant Supplies",
  "Transportation",
  "Kitchen Supplies",
  "Bar Supplies",
  "Bar Equipment",
  "Rent",
  "Accounting Fees",
  "Software",
  "Depreciation",
  "Salaries",
  "Overtime",
  "Service Charge",
  "Postage",
  "Electricity",
  "Gas",
  "Ads",
  "Social Media",
  "Promotions",
  "Content Creation",
  "Miscellaneous",
  "Police / Irregular",
  "Owner Funding",
  "Owner Withdrawal",
];

function isValidImageInput(image) {
  if (typeof image !== "string" || !image.trim()) return false;

  const trimmed = image.trim();

  return (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("data:image/")
  );
}

function numberOrZero(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function positiveIntOrOne(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.round(num) : 1;
}

function sanitizeInvoice(parsed) {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Parsed response is not an object");
  }

  if (parsed.error) {
    return { error: parsed.error };
  }

  const vendor =
    typeof parsed.vendor === "string" && parsed.vendor.trim()
      ? parsed.vendor.trim()
      : "Unknown Vendor";

  const invoice_date =
    typeof parsed.invoice_date === "string" && parsed.invoice_date.trim()
      ? parsed.invoice_date.trim()
      : null;

  const currency =
    typeof parsed.currency === "string" && parsed.currency.trim()
      ? parsed.currency.trim()
      : "THB";

  const total = numberOrZero(parsed.total);

  const rawItems = Array.isArray(parsed.items) ? parsed.items : [];

  const items = rawItems.map((item) => {
    const account_type = ALLOWED_ACCOUNT_TYPES.includes(item?.account_type)
      ? item.account_type
      : "Operating Expense";

    const department = ALLOWED_DEPARTMENTS.includes(item?.department)
      ? item.department
      : "Operations";

    const natural_account = ALLOWED_NATURAL_ACCOUNTS.includes(item?.natural_account)
      ? item.natural_account
      : "Miscellaneous";

    return {
      name:
        typeof item?.name === "string" && item.name.trim()
          ? item.name.trim()
          : "Unknown Item",
      qty: positiveIntOrOne(item?.qty),
      amount: numberOrZero(item?.amount),
      account_type,
      department,
      natural_account,
      tag:
        typeof item?.tag === "string" && item.tag.trim()
          ? item.tag.trim()
          : null,
      notes:
        typeof item?.notes === "string" && item.notes.trim()
          ? item.notes.trim()
          : null,
    };
  });

  return {
    vendor,
    invoice_date,
    currency,
    total,
    items,
  };
}

export async function POST(req) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY" },
        { status: 500 }
      );
    }

    const body = await req.json();
    const image = body?.image;

    if (!image) {
      return NextResponse.json(
        { error: "Missing image" },
        { status: 400 }
      );
    }

    if (!isValidImageInput(image)) {
      return NextResponse.json(
        {
          error:
            "Invalid image format. Send a public URL or a base64 data URL starting with data:image/",
        },
        { status: 400 }
      );
    }

    const instructions = `
You are an expert restaurant accounting invoice parser.

Extract invoice information and return ONLY valid JSON.

IMPORTANT:
- Currency is THB unless clearly stated otherwise.
- If qty is unclear, use 1.
- If invoice date is unclear, use null.
- If the bill is not a real invoice or receipt, return:
  { "error": "Invalid invoice" }

Allowed account_type values:
- COGS
- Operating Expense
- Owner / Non-Operating

Allowed department values:
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

Allowed natural_account values:
- Food Main Kitchen
- Food Thai Kitchen
- Pizza Kitchen
- Alcohol
- Soft Drinks
- Breakfast Food
- DJ
- Band
- Acoustic
- Events
- Staff Food
- Staff Drinks
- Staff Rewards
- Staff Tax
- SSO
- Cleaning
- Decoration
- Maintenance
- Restaurant Supplies
- Transportation
- Kitchen Supplies
- Bar Supplies
- Bar Equipment
- Rent
- Accounting Fees
- Software
- Depreciation
- Salaries
- Overtime
- Service Charge
- Postage
- Electricity
- Gas
- Ads
- Social Media
- Promotions
- Content Creation
- Miscellaneous
- Police / Irregular
- Owner Funding
- Owner Withdrawal

Classification rules:
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

Return exactly this shape:
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
      "natural_account": "allowed natural account only",
      "tag": "string or null",
      "notes": "string or null"
    }
  ]
}
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: instructions,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analyze this invoice image and return the required JSON.",
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

    const content = response.choices?.[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { error: "AI returned empty response" },
        { status: 500 }
      );
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json(
        {
          error: "AI returned invalid JSON",
          raw: content,
        },
        { status: 500 }
      );
    }

    const sanitized = sanitizeInvoice(parsed);

    if (sanitized.error) {
      return NextResponse.json(sanitized, { status: 400 });
    }

    if (!sanitized.vendor || !Array.isArray(sanitized.items)) {
      return NextResponse.json(
        { error: "Invalid invoice structure after sanitization" },
        { status: 400 }
      );
    }

    return NextResponse.json(sanitized);
  } catch (error) {
    console.error("Invoice AI route error:", error);

    return NextResponse.json(
      {
        error: "AI failed",
        details:
          process.env.NODE_ENV === "development"
            ? error?.message || "Unknown error"
            : undefined,
      },
      { status: 500 }
    );
  }
}