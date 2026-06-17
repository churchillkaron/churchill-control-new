import { createBrowserClient } from "@supabase/ssr";

/**
 * AVANTIQO SUPABASE CLIENT LAYER
 * SINGLE SOURCE OF TRUTH (NO DUPLICATES)
 */

const client = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Primary export (modern standard)
export const supabaseClient = client;

// Backward compatibility (legacy code)
export const supabase = client;
