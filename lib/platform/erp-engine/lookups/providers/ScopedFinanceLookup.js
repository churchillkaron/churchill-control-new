import BaseLookupProvider from "../BaseLookupProvider";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const MISSING_RELATION_CODES = new Set([
  "42P01",
  "PGRST204",
  "PGRST205",
]);

function firstValue(row, keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return null;
}

export default class ScopedFinanceLookup extends BaseLookupProvider {
  constructor({
    tables,
    valueKeys = ["id"],
    labelKeys = ["name", "display_name", "code", "id"],
    descriptionKeys = [],
    entityScoped = false,
  }) {
    super();
    this.tables = tables;
    this.valueKeys = valueKeys;
    this.labelKeys = labelKeys;
    this.descriptionKeys = descriptionKeys;
    this.entityScoped = entityScoped;
  }

  async readRows(context) {
    if (!context?.organizationId) {
      throw new Error("organizationId required");
    }

    if (this.entityScoped && !context?.entityId) {
      throw new Error("entityId required for entity-scoped lookup");
    }

    for (const table of this.tables) {
      let query = supabaseAdmin
        .from(table)
        .select("*")
        .eq("organization_id", context.organizationId)
        .limit(250);

      if (this.entityScoped) {
        query = query.eq("entity_id", context.entityId);
      }

      const { data, error } = await query;

      if (error) {
        if (MISSING_RELATION_CODES.has(String(error.code || ""))) {
          continue;
        }

        throw new Error(`Unable to load ${table} lookup: ${error.message}`);
      }

      return Array.isArray(data) ? data : [];
    }

    return [];
  }

  toOption(row) {
    const value = firstValue(row, this.valueKeys);
    const label = firstValue(row, this.labelKeys);

    if (!value || !label) {
      return null;
    }

    return {
      value: String(value),
      label: String(label),
      description: String(firstValue(row, this.descriptionKeys) || ""),
      raw: row,
    };
  }

  async getOptions({ context }) {
    const rows = await this.readRows(context);
    return rows.map(row => this.toOption(row)).filter(Boolean);
  }

  async search({ context, query }) {
    const normalized = String(query || "").trim().toLowerCase();
    const options = await this.getOptions({ context });

    if (!normalized) {
      return options;
    }

    return options.filter(option =>
      `${option.label} ${option.description}`
        .toLowerCase()
        .includes(normalized)
    );
  }
}
