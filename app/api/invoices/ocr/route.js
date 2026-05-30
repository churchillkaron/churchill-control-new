import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import OpenAI from "openai";
import { mapInvoiceItems } from "@/lib/accounting/mapInvoiceItems";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";


function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function numberValue(value, fallback = 0) {
  if (value === null || value === undefined) return fallback;

  const cleaned = String(value)
    .replace(/,/g, "")
    .replace(/[^\d.-]/g, "");

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeDate(value) {
  if (!value) return todayDate();

  const raw = String(value).trim();
  const match = raw.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);

  if (!match) return todayDate();

  let dd = Number(match[1]);
  let mm = Number(match[2]);
  let yyyy = Number(match[3]);

  if (yyyy < 100) {
    yyyy = yyyy + 2500;
  }

  if (yyyy > 2400) {
    yyyy = yyyy - 543;
  }

  if (
    yyyy < 2000 ||
    yyyy > 2100 ||
    mm < 1 ||
    mm > 12 ||
    dd < 1 ||
    dd > 31
  ) {
    return todayDate();
  }

  return `${String(yyyy).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

function hasThai(text = "") {
  return /[\u0E00-\u0E7F]/.test(String(text));
}

function cleanName(value = "") {
  return String(value)
    .replace(/\b(KG|KIG|KGS|G|GRAM|PCS|PC|AU)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractVendor(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  const companyLine =
    lines.find((line) => line.includes("แม็คโคร")) ||
    lines.find((line) => line.toLowerCase().includes("makro"));

  return companyLine || "Unknown Vendor";
}

function extractDate(text) {
  const match =
    text.match(/วันที่\s+(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/) ||
    text.match(/date\s*[:\-]?\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/i);

  return match?.[1] || "";
}

function findAmountAfter(label, text) {
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    if (!line.includes(label)) continue;

    const nums =
      line.match(/[-+]?\d+(?:,\d{3})*(?:\.\d+)?/g) || [];

    if (nums.length) {
      return numberValue(nums[nums.length - 1], 0);
    }
  }

  return 0;
}

function extractTotals(text) {
  const grandTotal =
    findAmountAfter("จำนวนเงินรวมทั้งสิ้น", text) ||
    findAmountAfter("ยอดสุทธิ", text) ||
    findAmountAfter("GRAND TOTAL", text) ||
    findAmountAfter("TOTAL", text);

  const subtotal =
    findAmountAfter("รวมเงิน", text) ||
    findAmountAfter("SUBTOTAL", text);

  const vat =
    findAmountAfter("ภาษีมูลค่าเพิ่ม", text) ||
    findAmountAfter("VAT", text);

  return {
    subtotal,
    vat,
    grandTotal,
    accountingTotal:
      grandTotal ||
      (subtotal && vat ? subtotal + vat : 0) ||
      subtotal,
    reconciliationTarget:
      subtotal || grandTotal,
  };
}

function extractReceiptBody(text) {
  const startMarkers = [
    "ARTICLE DESCRIPTION",
    "รหัสสินค้า",
  ];

  const endMarkers = [
    "รวมเงิน",
    "ยอดรวม",
    "จำนวนเงินรวมทั้งสิ้น",
    "ภาษีมูลค่าเพิ่ม",
    "เงินสด",
  ];

  let start = -1;

  for (const marker of startMarkers) {
    const index = text.indexOf(marker);
    if (index !== -1 && (start === -1 || index < start)) {
      start = index;
    }
  }

  let end = -1;

  for (const marker of endMarkers) {
    const index = text.indexOf(marker);
    if (index !== -1 && index > start && (end === -1 || index < end)) {
      end = index;
    }
  }

  if (start !== -1 && end !== -1) {
    return text.slice(start, end);
  }

  if (start !== -1) {
    return text.slice(start);
  }

  return text;
}

function parseProductRows(receiptBody) {
  const lines =
    receiptBody
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

  const items = [];

  for (const line of lines) {
    if (!/^\d{8,}\s+/.test(line)) continue;
    if (/^0{20,}/.test(line)) continue;

    const match = line.match(/^(\d{8,})\s+(.+)$/);
    if (!match) continue;

    const rest = match[2];

    const nums =
      rest.match(/[-+]?\d+(?:,\d{3})*(?:\.\d+)?/g) || [];

    if (nums.length < 3) continue;

    const numericValues = nums.map((num) => numberValue(num, 0));

    let qty = 0;
    let unitPrice = 0;
    let totalPrice = 0;

    const last = numericValues[numericValues.length - 1];
    const beforeLast = numericValues[numericValues.length - 2];

    totalPrice = last;

    if (
      beforeLast === 1 &&
      numericValues.length >= 5 &&
      Math.abs(last - numericValues[numericValues.length - 3]) < 0.01
    ) {
      qty = numericValues[numericValues.length - 5];
      unitPrice = numericValues[numericValues.length - 4];
    } else {
      qty = numericValues[numericValues.length - 3];
      unitPrice = numericValues[numericValues.length - 2];
    }

    let namePart = rest.replace(
      /(?:\s+[-+]?\d+(?:,\d{3})*(?:\.\d+)?)+\s*$/,
      ""
    );

    namePart = cleanName(namePart);

    if (!namePart) continue;
    if (!hasThai(namePart) && namePart.length < 4) continue;
    if (qty <= 0 || totalPrice <= 0) continue;

    items.push({
      name_thai: namePart,
      name_english: "",
      qty,
      unit_price: unitPrice,
      total_price: totalPrice,
    });
  }

  return items;
}

async function translateItems(openai, items) {
  const untranslated =
    items
      .filter((item) => item.name_thai && !item.name_english)
      .map((item) => item.name_thai);

  const uniqueNames = [...new Set(untranslated)];

  if (!uniqueNames.length) return items;

  try {
    const response =
      await openai.responses.create({
        model: "gpt-4.1-mini",
        temperature: 0,
        input: `Translate these Thai receipt product names to English.

Return ONLY valid JSON object where each key is the exact Thai name and value is the English translation.

Names:
${uniqueNames.join("\n")}`
      });

    const raw =
      response.output_text ||
      "";

    const cleaned =
      raw.replace(/```json|```/g, "").trim();

    const match =
      cleaned.match(/\{[\s\S]*\}/);

    const translations =
      match ? JSON.parse(match[0]) : {};

    return items.map((item) => ({
      ...item,
      name_english:
        translations[item.name_thai] ||
        item.name_english ||
        item.name_thai,
    }));
  } catch (error) {
    console.error("TRANSLATION ERROR:", error);

    return items.map((item) => ({
      ...item,
      name_english:
        item.name_english ||
        item.name_thai,
    }));
  }
}

export async function POST(req) {
  try {
    const supabase = supabaseAdmin;

    const openai =
      new OpenAI({
        apiKey:
          process.env.OPENAI_API_KEY,
      });

    const body =
      await req.json();

    const image =
      body?.image;

    const tenantId =
      body?.tenantId;

    if (!tenantId) {

      return Response.json(
        {
          success: false,
          error:
            "tenantId required",
        },
        {
          status: 400,
        }
      );

    }

    if (!image) {
      return Response.json(
        {
          success: false,
          error: "No image provided",
        },
        {
          status: 400,
        }
      );
    }

    const ocrResponse =
      await openai.responses.create({
        model: "gpt-4.1",
        temperature: 0,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `You are an OCR engine for Thai and English receipts.

Return plain text only.

Rules:
- Transcribe the receipt exactly as visible.
- Preserve line order.
- Preserve Thai text.
- Preserve English text.
- Include product rows.
- Include totals.
- Do not translate.
- Do not calculate.
- Do not summarize.
- Do not create JSON.`,
              },
              {
                type: "input_image",
                image_url: image,
                detail: "high",
              },
            ],
          },
        ],
      });

    const rawText =
      ocrResponse.output_text ||
      ocrResponse.output?.[0]?.content?.[0]?.text ||
      "";

    if (!rawText) {
      return Response.json(
        {
          success: false,
          error: "No OCR text returned",
        },
        {
          status: 500,
        }
      );
    }

    const fs = require("fs");

    fs.writeFileSync(
      "/tmp/ocr-debug.txt",
      rawText
    );

    const vendor =
      extractVendor(rawText);

    const rawDate =
      extractDate(rawText);

    const purchaseDate =
      normalizeDate(rawDate);

    const totals =
      extractTotals(rawText);

    const receiptBody =
      extractReceiptBody(rawText);

    const parsedItems =
      parseProductRows(receiptBody);

    if (!parsedItems.length) {
      return Response.json(
        {
          success: false,
          error: "NO_PRODUCT_ROWS_FOUND",
          message: "OCR text was created, but no reliable product rows could be parsed. Invoice was not saved.",
          raw_ocr: rawText,
          receipt_body: receiptBody,
        },
        {
          status: 422,
        }
      );
    }

    const translatedItems =
      await translateItems(
        openai,
        parsedItems
      );

    const mappedItems =
      await mapInvoiceItems({
        tenantId: tenantId,
        items: translatedItems,
      });

    const extractedItemsTotal =
      mappedItems.reduce(
        (sum, item) =>
          sum + numberValue(item.total_price, 0),
        0
      );

    const reconciliationTarget =
      totals.reconciliationTarget ||
      extractedItemsTotal;

    const totalAmount =
      totals.accountingTotal ||
      extractedItemsTotal;

    const reconciliationDifference =
      Math.abs(
        reconciliationTarget -
        extractedItemsTotal
      );

    const reconciliationTolerance =
      Math.max(
        1,
        reconciliationTarget * 0.03
      );

    if (
      reconciliationTarget > 0 &&
      reconciliationDifference >
        reconciliationTolerance
    ) {
      return Response.json(
        {
          success: false,
          error: "OCR_RECONCILIATION_FAILED",
          message: "Invoice lines do not match receipt total. Invoice was not saved.",
          total_amount: totalAmount,
          reconciliation_target: reconciliationTarget,
          extracted_items_total: extractedItemsTotal,
          difference: reconciliationDifference,
          items: mappedItems,
          raw_ocr: rawText,
          receipt_body: receiptBody,
        },
        {
          status: 422,
        }
      );
    }

    for (const item of mappedItems) {
      const name =
        item.name_english ||
        item.name_thai;

      if (!name) continue;

      let {
        data: ingredient,
        error: ingredientFindError,
      } = await supabase
        .from("ingredients")
        .select("*")
        .ilike("name", name)
        .maybeSingle();

      if (ingredientFindError) {
        console.error(
          "INGREDIENT FIND ERROR:",
          ingredientFindError
        );
        continue;
      }

      if (!ingredient) {
        const {
          data: newIngredient,
          error: ingredientCreateError,
        } = await supabase
          .from("ingredients")
          .insert([
            {
              name,
              name_thai:
                item.name_thai || null,
              unit: "unit",
              department:
                item.department,
              cost_per_unit:
                numberValue(
                  item.unit_price,
                  0
                ),
              tenant_id: tenantId,
            },
          ])
          .select()
          .single();

        if (ingredientCreateError) {
          console.error(
            "INGREDIENT CREATE ERROR:",
            ingredientCreateError
          );
          continue;
        }

        ingredient = newIngredient;
      }

      const qty =
        numberValue(item.qty, 0);

      const costPerUnit =
        qty > 0
          ? numberValue(item.total_price, 0) / qty
          : 0;

      const {
        data: existingInventory,
        error: inventoryFindError,
      } = await supabase
        .from("inventory")
        .select("*")
        .eq("ingredient_id", ingredient.id)
        .maybeSingle();

      if (inventoryFindError) {
        console.error(
          "INVENTORY FIND ERROR:",
          inventoryFindError
        );
        continue;
      }

      if (existingInventory) {
        await supabase
          .from("inventory")
          .update({
            quantity:
              numberValue(
                existingInventory.quantity,
                0
              ) + qty,
            cost_per_unit: costPerUnit,
            last_updated:
              new Date().toISOString(),
          })
          .eq("id", existingInventory.id);
      } else {
        await supabase
          .from("inventory")
          .insert([
            {
              ingredient_id:
                ingredient.id,
              quantity: qty,
              cost_per_unit: costPerUnit,
            },
          ]);
      }

      await supabase
        .from("inventory_transactions")
        .insert([
          {
            ingredient_id:
              ingredient.id,
            change: qty,
            type: "invoice",
          },
        ]);
    }

    let vendorId = null;

    const {
      data: existingVendor,
    } = await supabase
      .from("vendors")
      .select("id")
      .ilike("legal_name", vendor)
      .maybeSingle();

    if (existingVendor) {
      vendorId = existingVendor.id;
    }

    const {
      data: existingInvoice,
    } = await supabase
      .from("invoices")
      .select("id")
      .eq("vendor", vendor)
      .eq("date", purchaseDate)
      .eq("total_amount", totalAmount)
      .maybeSingle();

    if (existingInvoice) {
      return Response.json(
        {
          success: false,
          error: "Duplicate invoice detected",
        },
        {
          status: 409,
        }
      );
    }

    const {
      data,
      error,
    } = await supabase
      .from("invoices")
      .insert([
        {
          vendor,
          vendor_id: vendorId,
          total_amount: totalAmount,
          date: purchaseDate,
          status: "pending_manager",
          image_url: image,
          items: mappedItems,
          tenant_id: tenantId,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error(
        "DB INSERT ERROR:",
        error
      );

      return Response.json(
        {
          success: false,
          error: "DB insert failed",
          message: error.message,
          details: error,
        },
        {
          status: 500,
        }
      );
    }

    return Response.json({
      success: true,
      invoice: data,
      extracted: {
        vendor,
        total_amount: totalAmount,
        subtotal: totals.subtotal,
        vat: totals.vat,
        date: purchaseDate,
        raw_date: rawDate,
        items: mappedItems,
      },
    });
  } catch (err) {
    console.error(
      "OCR ERROR:",
      err
    );

    return Response.json(
      {
        success: false,
        error: "OCR failed",
        message: err.message,
      },
      {
        status: 500,
      }
    );
  }
}
