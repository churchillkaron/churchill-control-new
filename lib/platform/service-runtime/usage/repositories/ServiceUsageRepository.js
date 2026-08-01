import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

const TABLE =
  "platform_service_usage";

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

export async function listCreativeDirectionByProject({
  organization_id,
  creative_project_id,
  operation = null,
  request_hash = null,
  approval_id = null,
  ascending = false,
  limit = 100,
}) {
  if (!organization_id) {
    throw new Error("organization_id required");
  }
  if (!creative_project_id) {
    throw new Error("creative_project_id required");
  }

  const boundedLimit = Math.max(
    1,
    Math.min(250, Math.floor(Number(limit) || 100)),
  );

  let query = supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("organization_id", organization_id)
    .eq("status", "SUCCESS")
    .eq("category", "CREATIVE_DIRECTION")
    .eq("metadata->>creative_project_id", creative_project_id);

  if (operation) {
    query = query.eq("metadata->>operation", operation);
  }
  if (request_hash) {
    query = query.eq(
      "metadata->>creative_direction_request_hash",
      request_hash,
    );
  }
  if (approval_id) {
    query = query.eq(
      "metadata->>direction_approval_id",
      approval_id,
    );
  }

  const { data, error } = await query
    .order("created_at", { ascending: Boolean(ascending) })
    .limit(boundedLimit);

  if (error) throw error;
  return data || [];
}
