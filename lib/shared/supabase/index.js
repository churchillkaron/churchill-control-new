/**
 * AVANTIQO SUPABASE GATEWAY (STABILIZATION LAYER)
 *
 * This file does NOT replace existing usage.
 * It unifies access without breaking any imports.
 */

import { supabase as client } from "./client";
import { supabaseClient } from "./client";
import { supabaseAdmin } from "./admin";

/**
 * Legacy + modern compatibility exports
 * We support ALL patterns currently used in the system
 */

export const supabase = client;
export const supabaseClientUnified = supabaseClient;
export const supabaseAdminUnified = supabaseAdmin;

/**
 * SAFE GETTERS (future-proof layer)
 */
export function getSupabaseClient() {
  return supabaseClient;
}

export function getSupabaseAdmin() {
  return supabaseAdmin;
}
