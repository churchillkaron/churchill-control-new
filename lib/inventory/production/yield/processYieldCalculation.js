import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function processYieldCalculation({
  organization_id,
  organizationId,
  entity_id = null,
  entityId = null,
  batch_id,
  raw_quantity,
  usable_quantity,
  waste_quantity,
  waste_reason = "PRODUCTION_LOSS",
}) {

  try {

    const resolvedOrganizationId =
      organization_id || organizationId;

    const resolvedEntityId =
      entity_id || entityId || null;

    const raw =
      Number(raw_quantity || 0);

    const usable =
      Number(usable_quantity || 0);

    const waste =
      Number(waste_quantity || 0);

    const yieldPercent =
      raw > 0
        ? (
            usable / raw
          ) * 100
        : 0;

    const wastePercent =
      raw > 0
        ? (
            waste / raw
          ) * 100
        : 0;

    // ===== SAVE YIELD =====
    const {
      data,
      error,
    } = await supabaseAdmin
      .from(
        "production_yield_logs"
      )
      .insert([
        {

          organization_id:
            resolvedOrganizationId,

          entity_id:
            resolvedEntityId,

          batch_id,

          raw_quantity:
            raw,

          usable_quantity:
            usable,

          waste_quantity:
            waste,

          yield_percent:
            Number(
              yieldPercent.toFixed(2)
            ),

          waste_percent:
            Number(
              wastePercent.toFixed(2)
            ),

          waste_reason,

          created_at:
            new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) {
      throw error;
    }

    // ===== WASTE LEDGER =====
    if (waste > 0) {

      await supabaseAdmin
        .from(
          "waste_ledger"
        )
        .insert([
          {

            organization_id:
              resolvedOrganizationId,

            entity_id:
              resolvedEntityId,

            batch_id,

            quantity:
              waste,

            reason:
              waste_reason,

            created_at:
              new Date().toISOString(),
          },
        ]);
    }

    return {

      success: true,

      yield:
        data,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
