import { supabase } from "@/lib/supabase";

export async function getARAging({ tenantId }) {
  const { data, error } = await supabase
    .from("ar_invoices")
    .select("*")
    .eq("tenant_id", tenantId);

  if (error) {
    throw error;
  }

  const today = new Date();

  const buckets = {
    current: 0,
    days30: 0,
    days60: 0,
    days90: 0,
    over90: 0,
  };

  for (const invoice of data || []) {
    const due = new Date(invoice.due_date);
    const diff =
      Math.floor((today - due) / (1000 * 60 * 60 * 24));

    const amount = Number(invoice.total_amount || 0);

    if (diff <= 0) buckets.current += amount;
    else if (diff <= 30) buckets.days30 += amount;
    else if (diff <= 60) buckets.days60 += amount;
    else if (diff <= 90) buckets.days90 += amount;
    else buckets.over90 += amount;
  }

  return buckets;
}
