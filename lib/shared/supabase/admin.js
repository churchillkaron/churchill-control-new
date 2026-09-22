import WebSocket from "ws";
import { createClient } from "@supabase/supabase-js";
import { getPublicSupabaseUrl } from "./publicConfig.js";
import { supabaseNoStoreFetch } from "./serverFetch.js";

/**
 * AVANTIQO SERVER SUPABASE
 *
 * Build-safe by design: Next.js imports route modules while collecting page data.
 * The service-role secret is runtime-only authority and must not be required merely
 * to import those modules. The client is therefore created on first actual use.
 *
 * Runtime remains fail-closed: any server operation that touches supabaseAdmin
 * without SUPABASE_SERVICE_ROLE_KEY throws immediately.
 */

let cachedAdminClient = null;
let cachedAdminKey = null;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

export function getSupabaseAdmin() {
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (cachedAdminClient && cachedAdminKey === key) {
    return cachedAdminClient;
  }

  cachedAdminKey = key;
  cachedAdminClient = createClient(
    getPublicSupabaseUrl(),
    key,
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
    },
  );

  return cachedAdminClient;
}

export const supabaseAdmin = new Proxy({}, {
  get(_target, property) {
    const client = getSupabaseAdmin();
    const value = client[property];
    return typeof value === "function" ? value.bind(client) : value;
  },
});
