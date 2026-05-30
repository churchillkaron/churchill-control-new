import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function fallbackClassify(name = "") {
  const text = String(name).toLowerCase();

  if (
    text.includes("flour") ||
    text.includes("sugar") ||
    text.includes("oil") ||
    text.includes("rice") ||
    text.includes("pork") ||
    text.includes("chicken") ||
    text.includes("fish") ||
    text.includes("egg") ||
    text.includes("milk")
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
    text.includes("whisky")
  ) {
    return {
      account_type: "COGS",
      department: "Bar",
      natural_account: "Alcohol",
    };
  }

  if (
    text.includes("water") ||
    text.includes("soda") ||
    text.includes("juice") ||
    text.includes("coke")
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

export async function mapInvoiceItems({
  tenantId,
  items = [],
}) {
  const mapped = [];

  for (const item of items) {
    const thai =
      item.name_thai || "";

    const english =
      item.name_english ||
      item.name_thai ||
      "Unknown item";

    let mapping = null;

    const { data } = await supabaseAdmin
      .from("accounting_product_mappings")
      .select("*")
      .eq("tenant_id", tenantId)
      .or(
        `name_thai.eq.${thai},name_english.eq.${english}`
      )
      .maybeSingle();

    if (data) {
      mapping = data;
    } else {
      mapping = fallbackClassify(english);

      await supabaseAdmin
        .from("accounting_product_mappings")
        .insert({
          tenant_id: tenantId,
          name_thai: thai,
          name_english: english,
          account_type: mapping.account_type,
          department: mapping.department,
          natural_account: mapping.natural_account,
        });
    }

    mapped.push({
      ...item,
      account_type: mapping.account_type,
      department: mapping.department,
      natural_account: mapping.natural_account,
    });
  }

  return mapped;
}
