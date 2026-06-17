import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function distributeServiceCharge({
  tenantId,
  distributionPeriod,
  totalServiceCharge,
}) {
  const total =
    Number(
      totalServiceCharge || 0
    );

  const {
    data: policy,
    error: policyError,
  } = await supabaseAdmin
    .from(
      "tenant_payout_policies"
    )
    .select("*")
    .eq(
      "tenant_id",
      tenantId
    )
    .single();

  if (policyError) {
    throw policyError;
  }

  const fohPercentage =
    Number(
      policy?.foh_percentage || 0
    );

  const barPercentage =
    Number(
      policy?.bar_percentage || 0
    );

  const kitchenPercentage =
    Number(
      policy?.kitchen_percentage || 0
    );

  const totalPercentage =
    fohPercentage +
    barPercentage +
    kitchenPercentage;

  if (totalPercentage > 100) {
    throw new Error(
      "Payout policy exceeds 100%"
    );
  }

  const fohAmount =
    Number(
      (
        total *
        (fohPercentage / 100)
      ).toFixed(2)
    );

  const barAmount =
    Number(
      (
        total *
        (barPercentage / 100)
      ).toFixed(2)
    );

  const kitchenAmount =
    Number(
      (
        total *
        (kitchenPercentage / 100)
      ).toFixed(2)
    );

  const {
    data,
    error,
  } = await supabaseAdmin
    .from(
      "service_charge_distributions"
    )
    .insert({
      tenant_id:
        tenantId,

      distribution_period:
        distributionPeriod,

      total_service_charge:
        total,

      foh_amount:
        fohAmount,

      bar_amount:
        barAmount,

      kitchen_amount:
        kitchenAmount,

      payout_model:
        policy?.payout_model || null,

      performance_enabled:
        policy?.performance_enabled || false,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}
