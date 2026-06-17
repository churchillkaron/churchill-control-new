import { supabase as client } from "@/lib/shared/supabase/client";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { createServerClient } from "@supabase/ssr";

/**
 * BACKWARD COMPATIBILITY LAYER (CRITICAL)
 * DO NOT DELETE - 1000+ FILES DEPEND ON THIS
 */

export const supabase = client;
export const supabaseClient = client;

/**
 * Server Supabase (safe fallback)
 */
export const supabaseServer = supabaseAdmin;

/**
 * legacy compatibility used in many modules
 */
export const createServerSupabase = () => supabaseAdmin;

/**
 * optional SSR helper if used in app router
 */
export const createSupabaseServerClient = () => {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {},
      },
    }
  );
};
