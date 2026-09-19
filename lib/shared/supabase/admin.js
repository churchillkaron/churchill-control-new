import WebSocket from "ws";
import { createClient } from "@supabase/supabase-js";
import { getPublicSupabaseUrl } from "./publicConfig.js";
import { supabaseNoStoreFetch } from "./serverFetch.js";

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
  getPublicSupabaseUrl(),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      experimental: {
        passkey: true,
      },
    },
    global: {
      fetch: supabaseNoStoreFetch,
    },
    realtime: {
      transport: WebSocket,
    },
  }
);
