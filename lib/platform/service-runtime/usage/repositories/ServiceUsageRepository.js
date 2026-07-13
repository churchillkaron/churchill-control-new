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
