/**
 * AVANTIQO FREEZE GUARD (v1)
 * Prevents architecture drift in Supabase usage
 */

export function validateSupabasePattern(type) {
  const valid = ["client", "server", "admin"];

  if (!valid.includes(type)) {
    throw new Error(
      `[SUPABASE GUARD] Invalid usage: ${type}`
    );
  }

  return true;
}
