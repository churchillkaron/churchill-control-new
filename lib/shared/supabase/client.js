import { createBrowserClient } from "@supabase/ssr";
import {
  getPublicSupabaseKey,
  getPublicSupabaseUrl,
} from "./publicConfig";

/**
 * AVANTIQO SUPABASE CLIENT LAYER
 * SINGLE SOURCE OF TRUTH (NO DUPLICATES)
 */

const client = createBrowserClient(
  getPublicSupabaseUrl(),
  getPublicSupabaseKey(),
  {
    auth: {
      experimental: {
        passkey: true,
      },
    },
  }
);

// Primary export (modern standard)
export const supabaseClient = client;

// Backward compatibility (legacy code)
export const supabase = client;
