import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

import BaseLookupProvider from "@/lib/platform/erp-engine/lookups/BaseLookupProvider";

class InventoryLocationLookup extends BaseLookupProvider {
  async getOptions({
    context = {},
  } = {}) {
    const organizationId =
      context.organizationId ||
      context.organization_id ||
      null;

    if (!organizationId) {
      return [];
    }

    const warehouses =
      await supabaseAdmin
        .from(
          "inventory_warehouses"
        )
        .select(
          "id, organization_id, name, created_at"
        )
        .eq(
          "organization_id",
          organizationId
        )
        .order(
          "name",
          {
            ascending:
              true,
          }
        );

    if (warehouses.error) {
      throw warehouses.error;
    }

    const warehouseRows =
      warehouses.data || [];

    const warehouseIds =
      warehouseRows
        .map(
          row =>
            row.id
        )
        .filter(Boolean);

    if (
      warehouseIds.length ===
      0
    ) {
      return [];
    }

    const locations =
      await supabaseAdmin
        .from(
          "inventory_locations"
        )
        .select(
          "id, warehouse_id, name, created_at"
        )
        .in(
          "warehouse_id",
          warehouseIds
        )
        .order(
          "name",
          {
            ascending:
              true,
          }
        );

    if (locations.error) {
      throw locations.error;
    }

    const warehouseById =
      new Map(
        warehouseRows.map(
          warehouse => [
            warehouse.id,
            warehouse,
          ]
        )
      );

    return (
      locations.data ||
      []
    ).map(
      location => {
        const warehouse =
          warehouseById.get(
            location.warehouse_id
          );

        return {
          value:
            location.id,

          label:
            location.name ||
            location.id,

          description:
            warehouse?.name ||
            "",

          raw: {
            ...location,

            warehouse_name:
              warehouse?.name ||
              null,

            organization_id:
              warehouse?.organization_id ||
              null,
          },
        };
      }
    );
  }

  async search({
    context = {},
    query = "",
  } = {}) {
    const needle =
      String(
        query || ""
      )
        .trim()
        .toLowerCase();

    const options =
      await this.getOptions({
        context,
      });

    if (!needle) {
      return options;
    }

    return options.filter(
      option =>
        [
          option.label,
          option.description,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(
            needle
          )
    );
  }
}

export default new InventoryLocationLookup();
