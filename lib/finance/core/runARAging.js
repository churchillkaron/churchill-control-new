import { supabase } from "@/lib/supabase";

export async function runARAging({
  tenantId,
}) {
  const invoices =
    await supabase
      .from("ar_customer_invoices")
      .select("*")
      .eq("tenant_id", tenantId);

  const grouped = {};

  const today =
    new Date();

  for (const row of invoices.data || []) {
    if (
      !grouped[
        row.customer_name
      ]
    ) {
      grouped[
        row.customer_name
      ] = {
        current: 0,
        d30: 0,
        d60: 0,
        d90: 0,
      };
    }

    const due =
      new Date(row.due_date);

    const diff =
      Math.floor(
        (today - due) /
          (1000 * 60 * 60 * 24)
      );

    const amount =
      Number(
        row.outstanding_balance ||
          0
      );

    if (diff <= 0) {
      grouped[
        row.customer_name
      ].current += amount;
    } else if (diff <= 30) {
      grouped[
        row.customer_name
      ].d30 += amount;
    } else if (diff <= 60) {
      grouped[
        row.customer_name
      ].d60 += amount;
    } else {
      grouped[
        row.customer_name
      ].d90 += amount;
    }
  }

  const inserts =
    Object.entries(
      grouped
    ).map(
      ([customer, data]) => ({
        tenant_id: tenantId,
        customer_name:
          customer,
        current_bucket:
          data.current,
        days_30: data.d30,
        days_60: data.d60,
        days_90: data.d90,
        total_outstanding:
          data.current +
          data.d30 +
          data.d60 +
          data.d90,
      })
    );

  const result =
    await supabase
      .from(
        "ar_aging_snapshots"
      )
      .insert(inserts)
      .select();

  if (result.error) {
    throw result.error;
  }

  return result.data;
}
