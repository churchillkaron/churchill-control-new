import { createServerSupabase } from "@/lib/shared/supabase/server";

/**
 * UBTE DB ACCESS LAYER
 * Centralized database entry for execution engine
 */

export function db() {
  return createServerSupabase();
}
