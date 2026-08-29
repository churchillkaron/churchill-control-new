import WebSocket from "ws";
import { createClient } from "@supabase/supabase-js";
import { getPublicSupabaseUrl } from "./publicConfig";
import { supabaseNoStoreFetch } from "./serverFetch";

/**
 * AVANTIQO CLEAN SERVER SUPABASE LAYER
 * STANDARDIZED - NO LEGACY EXPORTS
 */

export function createServerSupabase() {
  const url = getPublicSupabaseUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: supabaseNoStoreFetch,
    },
    realtime: {
      transport: WebSocket,
    },
  });
}
