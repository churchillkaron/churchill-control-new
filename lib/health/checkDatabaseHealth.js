import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function checkDatabaseHealth({ organizationId = null } = {}) {
  const startedAt = Date.now();

  try {
    let query = supabaseAdmin
      .from("organizations")
      .select("id")
      .limit(1);

    if (organizationId) query = query.eq("id", organizationId);

    const { data, error } = await query;

    if (error) {
      return {
        status: "unhealthy",
        latency_ms: Date.now() - startedAt,
        error: error.message,
      };
    }

    if (organizationId && !data?.length) {
      return {
        status: "unhealthy",
        latency_ms: Date.now() - startedAt,
        error: "ORGANIZATION_SCOPE_NOT_FOUND",
      };
    }

    return {
      status: "healthy",
      latency_ms: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      status: "unhealthy",
      latency_ms: Date.now() - startedAt,
      error: error.message,
    };
  }
}
