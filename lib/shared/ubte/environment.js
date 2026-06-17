/**
 * UBTE ENVIRONMENT CONTROL
 * Prevents unsafe execution in production
 */

export const UBTE_ENV = {
  isProd: process.env.NODE_ENV === "production",
  isDev: process.env.NODE_ENV !== "production"
};

export function getUBTEMode() {
  if (process.env.UBTE_MODE) return process.env.UBTE_MODE;

  if (UBTE_ENV.isProd) return "LOCKED";
  return "SAFE";
}

export function isAutoActionAllowed() {
  const mode = getUBTEMode();
  return mode === "AUTO";
}
