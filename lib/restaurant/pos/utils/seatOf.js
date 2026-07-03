/**
 * Minimal production-safe fallback for POS seating logic.
 * Prevents runtime crash when seat utilities are missing.
 *
 * You can extend this later with real table/seat mapping rules.
 */

export function seatOf(input) {
  if (!input) return null;

  // If already a structured seat object
  if (typeof input === "object" && input.seat) return input.seat;

  // If string/number seat identifier
  return String(input);
}
