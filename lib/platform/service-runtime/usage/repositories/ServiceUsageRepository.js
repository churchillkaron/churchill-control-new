import {
  supabaseAdmin,
} from "../../../../shared/supabase/admin.js";

const TABLE =
  "platform_service_usage";

const BILLING_USAGE_SELECT = [
  "id","organization_id","bill_to_organization_id","party_id","entity_id",
  "organization_service_id","provider","provider_request_id","provider_model",
  "capability","operation","quantity","unit","supplier_cost","platform_markup",
  "customer_price","currency","status","invoice_status","invoice_id",
  "billing_invoice_line_id","billing_completed","finance_posted","created_at","updated_at",
].join(",");

export async function create(record) {
  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from(TABLE)
      .insert(record)
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function getById(id) {
  if (!id) {
    throw new Error(
      "usage id required"
    );
  }

  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from(TABLE)
      .select("*")
      .eq("id", id)
      .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function getBillingById(id) {
  if (!id) throw new Error("usage id required");
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select(BILLING_USAGE_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function updateBillingState(id, updates = {}) {
  if (!id) throw new Error("usage id required");
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(BILLING_USAGE_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function findById(id) {
  if (!id) {
    throw new Error("usage id required");
  }

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function update(
  id,
  updates = {}
) {
  if (!id) {
    throw new Error(
      "usage id required"
    );
  }

  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from(TABLE)
      .update({
        ...updates,
        updated_at:
          new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function transition({
  id,
  from_statuses = [],
  updates = {},
}) {
  if (!id) {
    throw new Error("usage id required");
  }
  if (!from_statuses.length) {
    throw new Error("usage transition source status required");
  }

  const {
    data,
    error,
  } = await supabaseAdmin
    .from(TABLE)
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .in("status", from_statuses)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function listCreativeDirectionRecoveryCandidates({
  organization_id,
  creative_project_id,
  operation,
  limit = 20,
} = {}) {
  if (!organization_id) throw new Error("organization_id required");
  if (!creative_project_id) throw new Error("creative_project_id required");
  if (!operation) throw new Error("operation required");

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("organization_id", organization_id)
    .eq("status", "SUCCESS")
    .eq("category", "CREATIVE_DIRECTION")
    .eq("metadata->>creative_project_id", creative_project_id)
    .eq("metadata->>operation", operation)
    .order("updated_at", { ascending: false })
    .limit(Math.max(1, Math.min(100, Number(limit) || 20)));

  if (error) throw error;
  return data || [];
}

export async function summarizeByOrganization(organizationId) {
  if (!organizationId) {
    throw new Error("organization_id required");
  }

  const { data, error } = await supabaseAdmin.rpc(
    "get_platform_service_usage_totals",
    { p_organization_id: organizationId },
  );

  if (error) throw error;
  return data || [];
}

export async function listByOrganization(
  organizationId
) {
  if (!organizationId) {
    throw new Error(
      "organization_id required"
    );
  }

  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from(TABLE)
      .select("*")
      .eq(
        "organization_id",
        organizationId
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

  if (error) {
    throw error;
  }

  return data || [];
}
