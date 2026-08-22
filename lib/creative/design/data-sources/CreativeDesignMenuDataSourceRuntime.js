import crypto from "node:crypto";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const CONTRACT = "CREATIVE_DESIGN_MENU_DATA_SOURCE_V2";
const SOURCE_ID = ["commercial", "catalog", "dishes"].join(".");
const SOURCE_TYPE = "COMMERCIAL_MENU_DISHES";

function text(value) {
  return String(value ?? "").trim();
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

function normalizedDish(row = {}) {
  const price = Number(row.price);
  if (!row.id || !text(row.name) || !Number.isFinite(price)) return null;
  return {
    id: String(row.id),
    name: text(row.name),
    price,
    category: text(row.category) || null,
  };
}

function grouped(items) {
  const categories = new Map();
  for (const item of items) {
    const key = item.category || "uncategorized";
    if (!categories.has(key)) categories.set(key, []);
    categories.get(key).push(item);
  }
  return [...categories.entries()].map(([category, rows]) => ({
    category,
    items: rows,
  }));
}

function planningSummary(categories, itemCount) {
  return {
    item_count: itemCount,
    category_count: categories.length,
    all_items_path: "items",
    categories: categories.map((entry, index) => ({
      index,
      category: entry.category,
      item_count: entry.items.length,
      category_path: `categories.${index}.category`,
      items_path: `categories.${index}.items`,
    })),
    display_columns: [
      { id: "name", type: "TEXT" },
      { id: "price", type: "NUMBER" },
    ],
  };
}

export async function resolveCreativeDesignMenuDataSource({ organization_id } = {}) {
  const organizationId = text(organization_id);
  if (!organizationId) {
    throw new Error("CREATIVE_DESIGN_MENU_DATA_SOURCE_ORGANIZATION_REQUIRED");
  }

  const { data, error } = await supabaseAdmin
    .from("dishes")
    .select("id,name,price,category")
    .eq("organization_id", organizationId)
    .order("category", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`CREATIVE_DESIGN_MENU_DATA_SOURCE_QUERY_FAILED:${error.message}`);
  }

  const items = (data || []).map(normalizedDish).filter(Boolean);
  if (!items.length) return null;

  const categories = grouped(items);
  const snapshot = { items, categories };
  const evidenceId = `sha256:${sha256({
    organization_id: organizationId,
    source_id: SOURCE_ID,
    data: snapshot,
  })}`;

  return {
    contract: CONTRACT,
    source_id: SOURCE_ID,
    organization_id: organizationId,
    source_type: SOURCE_TYPE,
    description:
      "Current organization sellable-item names, selling prices and categories from the governed dishes master.",
    evidence_id: evidenceId,
    captured_at: new Date().toISOString(),
    data: snapshot,
    planning_summary: planningSummary(categories, items.length),
    available_paths: [
      "items",
      "items.<index>.id",
      "items.<index>.name",
      "items.<index>.price",
      "items.<index>.category",
      "categories",
      "categories.<index>.category",
      "categories.<index>.items",
    ],
    policy: {
      read_only: true,
      organization_scoped: true,
      invented_values_allowed: false,
      display_fields: ["id", "name", "price", "category"],
      costs_exposed: false,
      internal_production_fields_exposed: false,
    },
  };
}

export const CreativeDesignMenuDataSourceRuntime = Object.freeze({
  contract: CONTRACT,
  source_id: SOURCE_ID,
  source_type: SOURCE_TYPE,
  resolve: resolveCreativeDesignMenuDataSource,
});

export default CreativeDesignMenuDataSourceRuntime;