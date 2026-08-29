import WebSocket from "ws";
import {
  createClient,
} from "@supabase/supabase-js";
import { getPublicSupabaseUrl } from "./publicConfig";
import { supabaseNoStoreFetch } from "./serverFetch";

export function getServiceSupabase() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(
    getPublicSupabaseUrl(),
    serviceRoleKey,
    {
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
    }
  );
}
