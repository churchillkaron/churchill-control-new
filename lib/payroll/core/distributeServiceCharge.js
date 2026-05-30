import { supabase } from "@/lib/supabase";

export async function distributeServiceCharge({
  tenantId,
  distributionPeriod,
  totalServiceCharge,
}) {
  const total =
    Number(
      totalServiceCharge || 0
    );

  const foh =
    total * 0.5;

  const bar =
    total * 0.3;

  const kitchen =
    total * 0.2;

  const { data, error } =
    await supabase
      .from(
        "service_charge_distributions"
      )
      .insert({
        tenant_id: tenantId,
        distribution_period:
          distributionPeriod,
        total_service_charge:
          total,
        foh_amount: foh,
        bar_amount: bar,
        kitchen_amount:
          kitchen,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
