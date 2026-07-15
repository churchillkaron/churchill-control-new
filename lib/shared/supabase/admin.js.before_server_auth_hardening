import { createClient } from "@supabase/supabase-js";

/**
 * AVANTIQO SERVER SUPABASE (BUILD-SAFE)
 * DO NOT allow silent null initialization
 */

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

export const supabaseAdmin = createClient(
  requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY")
);
