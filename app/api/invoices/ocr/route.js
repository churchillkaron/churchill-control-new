export const runtime = "nodejs";

import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";



function classifyItem(name = "") {
  const text = String(name).toLowerCase();

  if (
    text.includes("flour") ||
    text.includes("sugar") ||
    text.includes("oil") ||
    text.includes("rice") ||
    text.includes("starch") ||
    text.includes("pork") ||
    text.includes("chicken") ||
    text.includes("beef") ||
    text.includes("fish") ||
    text.includes("shrimp") ||
    text.includes("egg") ||
    text.includes("milk") ||
    text.includes("cheese") ||
    text.includes("bread") ||
    text.includes("vegetable")
  ) {
    return {
      account_type: "COGS",
      department: "Kitchen",
      natural_account: "Food Main Kitchen",
    };
  }

  if (
    text.includes("beer") ||
    text.includes("wine") ||
    text.includes("vodka") ||
    text.includes("whisky") ||
    text.includes("rum") ||
    text.includes("gin") ||
    text.includes("tequila")
  ) {
    return {
      account_type: "COGS",
      department: "Bar",
      natural_account: "Alcohol",
    };
  }

  if (
    text.includes("coke") ||
    text.includes("water") ||
    text.includes("soda") ||
    text.includes("juice") ||
    text.includes("sprite") ||
    text.includes("fanta")
  ) {
    return {
      account_type: "COGS",
      department: "Bar",
      natural_account: "Soft Drinks",
    };
  }

  return {
    account_type: "Operating Expense",
    department: "Operations",
    natural_account: "Miscellaneous",
  };
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeDate(value) {
  if (!value) return todayDate();

  let raw = String(value).trim();

  if (!raw || raw.toLowerCase() === "unknown" || raw.toLowerCase() === "null") {
    return todayDate();
  }

  raw = raw.replace(/\//g, "-").replace(/\./g, "-");

  const parts = raw.split("-").map((p) => p.trim());

  let yyyy;
  let mm;
  let dd;

  if (parts.length === 3) {
    if (parts[0].length === 4) {
      yyyy = Number(parts[0]);
      mm = Number(parts[1]);
      dd = Number(parts[2]);
    } else if (parts[2].length === 4) {
      dd = Number(parts[0]);
      mm = Number(parts[1]);
      yyyy = Number(parts[2]);
    }
  }

  if (!yyyy || !mm || !dd) {
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return todayDate();

    yyyy = parsed.getFullYear();
    mm = parsed.getMonth() + 1;
    dd = parsed.getDate();
  }

  if (yyyy > 2400) {
    yyyy = yyyy - 543;
  }

  if (yyyy < 2000 || yyyy > 2100 || mm < 1 || mm > 12 || dd < 1 || dd > 31) {
    return todayDate();
  }

  return `${String(yyyy).padStart(4, "0")}-${String(mm).padStart(
    2,
    "0"
  )}-${String(dd).padStart(2, "0")}`;
}

function numberValue(value, fallback = 0) {
  if (value === null || value === undefined) return fallback;

  const cleaned = String(value)
    .replace(/,/g, "")
    .replace(/[^\d.-]/g, "");

  const n = Number(cleaned);

  return Number.isFinite(n) ? n : fallback;
}

export async function POST(req) {
  try {

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const body = await req.json();
    const image = body?.image;

    if (!image) {
      return Response.json(
        { success: false, error: "No image provided" },
        { status: 400 }
      );
    }

    const response = await openai.responses.create({
      model: "gpt-4.1",
      temperature: 0,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `You are a strict restaurant receipt parser.

Return ONLY valid JSON. No markdown. No explanation.

Rules:
- The receipt may be Thai or English.
- Read EVERY visible line item.
- Translate Thai item names to English.
- Do NOT guess the date.
- Use the actual purchase/receipt date printed on the receipt.
- If the receipt uses Thai Buddhist year, convert to Gregorian year. Example: 2569 = 2026.
- If date is DD/MM/YYYY, convert to YYYY-MM-DD.
- If date is DD-MM-YYYY, convert to YYYY-MM-DD.
- If no purchase date is visible, return date as "".
- All numbers must be numbers, not strings.
- If qty is unclear, use 1.
- If unit_price is unclear, calculate total_price / qty.
- If total_amount is unclear, calculate from items.

Return exactly this JSON structure:

{
  "vendor": "",
  "date": "",
  "total_amount": 0,
  "items": [
    {
      "name_thai": "",
      "name_english": "",
      "qty": 0,
      "unit_price": 0,
      "total_price": 0
    }
  ]
}`,
            },
            {
              type: "input_image",
              image_url: image,
            },
          ],
        },
      ],
    });

    const text =
      response.output_text ||
      response.output?.[0]?.content?.[0]?.text ||
      "";

    if (!text) {
      return Response.json(
        { success: false, error: "No OCR text returned" },
        { status: 500 }
      );
    }

    let parsed;

    try {
      const cleaned = text.replace(/```json|```/g, "").trim();
      const match = cleaned.match(/\{[\s\S]*\}/);

      if (!match) {
        throw new Error("No JSON found");
      }

      parsed = JSON.parse(match[0]);
    } catch {
      console.error("PARSE ERROR RAW:", text);

      return Response.json(
        {
          success: false,
          error: "JSON parse failed",
          raw: text,
        },
        { status: 500 }
      );
    }

    const baseItems = Array.isArray(parsed.items) ? parsed.items : [];

    const items = baseItems.map((item) => {
      const qty = numberValue(item.qty, 1);
      const totalPrice = numberValue(item.total_price, 0);
      const unitPrice =
        numberValue(item.unit_price, 0) ||
        (qty > 0 ? totalPrice / qty : 0);

      const nameThai = item.name_thai || "";
      const nameEnglish =
        item.name_english ||
        item.name ||
        item.description ||
        nameThai ||
        "Unknown item";

      return {
        name_thai: nameThai,
        name_english: nameEnglish,
        qty,
        unit_price: unitPrice,
        total_price: totalPrice,
        ...classifyItem(nameEnglish),
      };
    });

    const totalAmount =
      numberValue(parsed.total_amount, 0) ||
      items.reduce((sum, item) => sum + numberValue(item.total_price, 0), 0);

    const purchaseDate = normalizeDate(parsed.date);

    for (const item of items) {
      const name = item.name_english || item.name_thai;
      if (!name) continue;

      let { data: ingredient, error: ingredientFindError } = await supabase
        .from("ingredients")
        .select("*")
        .ilike("name", name)
        .maybeSingle();

      if (ingredientFindError) {
        console.error("INGREDIENT FIND ERROR:", ingredientFindError);
        continue;
      }

      if (!ingredient) {
        const { data: newIngredient, error: ingredientCreateError } =
          await supabase
            .from("ingredients")
            .insert([
              {
                name,
                name_thai: item.name_thai || null,
                unit: "unit",
                department: item.department,
              },
            ])
            .select()
            .single();

        if (ingredientCreateError) {
          console.error("INGREDIENT CREATE ERROR:", ingredientCreateError);
          continue;
        }

        ingredient = newIngredient;
      }

      const qty = numberValue(item.qty, 0);
      const costPerUnit =
        qty > 0 ? numberValue(item.total_price, 0) / qty : 0;

      const { data: existingInventory, error: inventoryFindError } =
        await supabase
          .from("inventory")
          .select("*")
          .eq("ingredient_id", ingredient.id)
          .maybeSingle();

      if (inventoryFindError) {
        console.error("INVENTORY FIND ERROR:", inventoryFindError);
        continue;
      }

      if (existingInventory) {
        await supabase
          .from("inventory")
          .update({
            quantity: numberValue(existingInventory.quantity, 0) + qty,
            cost_per_unit: costPerUnit,
            last_updated: new Date().toISOString(),
          })
          .eq("id", existingInventory.id);
      } else {
        await supabase.from("inventory").insert([
          {
            ingredient_id: ingredient.id,
            quantity: qty,
            cost_per_unit: costPerUnit,
          },
        ]);
      }

      await supabase.from("inventory_transactions").insert([
        {
          ingredient_id: ingredient.id,
          change: qty,
          type: "invoice",
        },
      ]);
    }

    // -----------------------------------
// VENDOR MATCHING
// -----------------------------------

let vendorId = null;

const {
  data: existingVendor,
} = await supabase

  .from("vendors")

  .select("id")

  .ilike(
    "legal_name",
    parsed.vendor || ""
  )

  .maybeSingle();

if (existingVendor) {

  vendorId =
    existingVendor.id;

}

    // -----------------------------------
// DUPLICATE INVOICE PROTECTION
// -----------------------------------

const {
  data: existingInvoice,
} = await supabase

  .from("invoices")

  .select("id")

  .eq(
    "vendor",
    parsed.vendor || "Unknown Vendor"
  )

  .eq(
    "date",
    purchaseDate
  )

  .eq(
    "total_amount",
    totalAmount
  )

  .maybeSingle();

if (existingInvoice) {

  return Response.json(

    {
      success: false,
      error:
        "Duplicate invoice detected",
    },

    {
      status: 409,
    }

  );

}

    const { data, error } = await supabase
      .from("invoices")
      .insert([
        {
vendor:
  parsed.vendor ||
  "Unknown Vendor",

vendor_id:
  vendorId,          total_amount: totalAmount,
          date: purchaseDate,
          status: "pending_manager",
          image_url: image,
          items,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("DB INSERT ERROR:", error);

      return Response.json(
        {
          success: false,
          error: "DB insert failed",
          message: error.message,
          details: error,
        },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      invoice: data,
      extracted: {
        vendor: parsed.vendor || "Unknown Vendor",
        total_amount: totalAmount,
        date: purchaseDate,
        raw_date: parsed.date || "",
        items,
      },
    });

  } catch (err) {

    console.error("OCR ERROR:", err);

    return Response.json(
      {
        success: false,
        error: "OCR failed",
        message: err.message,
      },
      { status: 500 }
    );

  }
}