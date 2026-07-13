import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

const INVOICE_TABLE =
  "billing_invoices";

const LINE_TABLE =
  "billing_invoice_lines";

export async function getInvoice(
  invoice_id
) {
  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from(INVOICE_TABLE)
      .select("*")
      .eq("id", invoice_id)
      .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function findUsageInvoice({
  organization_id,
  currency,
}) {
  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from(INVOICE_TABLE)
      .select("*")
      .eq(
        "organization_id",
        organization_id
      )
      .eq(
        "source",
        "SERVICE_USAGE"
      )
      .eq(
        "currency",
        currency
      )
      .in(
        "status",
        [
          "draft",
          "issued",
        ]
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      )
      .limit(1)
      .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function createInvoice(
  record
) {
  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from(INVOICE_TABLE)
      .insert(record)
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateInvoice(
  invoice_id,
  updates
) {
  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from(INVOICE_TABLE)
      .update({
        ...updates,
        updated_at:
          new Date().toISOString(),
      })
      .eq("id", invoice_id)
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function getLineByUsage(
  usage_id
) {
  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from(LINE_TABLE)
      .select("*")
      .eq(
        "usage_id",
        usage_id
      )
      .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function createLine(
  record
) {
  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from(LINE_TABLE)
      .insert(record)
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function invoiceTotals(
  invoice_id
) {
  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from(LINE_TABLE)
      .select(
        "line_total,supplier_cost"
      )
      .eq(
        "invoice_id",
        invoice_id
      );

  if (error) {
    throw error;
  }

  return (data || []).reduce(
    (totals, line) => {
      totals.amount +=
        Number(
          line.line_total || 0
        );

      totals.supplier_cost +=
        Number(
          line.supplier_cost || 0
        );

      return totals;
    },
    {
      amount: 0,
      supplier_cost: 0,
    }
  );
}


export async function listServiceUsageInvoices({

  organization_id,

}) {

  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from(INVOICE_TABLE)
      .select("*")
      .eq(
        "organization_id",
        organization_id
      )
      .eq(
        "source",
        "SERVICE_USAGE"
      )
      .order(
        "created_at",
        {
          ascending:false,
        }
      );


  if (error) {

    throw error;

  }


  return data || [];

}
