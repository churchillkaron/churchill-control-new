import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function checkDatabaseHealth() {
  const startedAt = Date.now();

  try {
    const { error } = await supabaseAdmin
      .from("tenants")
      .select("id")
      .limit(1);

    if (error) {
      return {
        status: "unhealthy",
        latency_ms: Date.now() - startedAt,
        error: error.message,
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
