export function ensureArray(input) {
  if (Array.isArray(input)) return input;
  if (!input) return [];
  if (typeof input === "object") return Object.values(input).flat();
  return [];
}
