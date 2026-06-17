/**
 * UBTE DOMAIN ISOLATION LAYER
 * Prevents cross-domain execution contamination
 */

const ALLOWED_DOMAINS = [
  "pos",
  "finance",
  "marketing",
  "hr",
  "system",
  "inventory",
  "procurement",
  "payroll",
  "production"
];

export function validateDomain(domain) {
  if (!domain) {
    throw new Error("UBTE: missing domain");
  }

  if (!ALLOWED_DOMAINS.includes(domain)) {
    throw new Error(`UBTE: invalid domain ${domain}`);
  }

  return true;
}

/**
 * DOMAIN SANDBOX WRAPPER
 */
export function runInDomain(domain, fn) {
  validateDomain(domain);

  try {
    return fn();
  } catch (err) {
    throw new Error(
      `UBTE DOMAIN ERROR [${domain}]: ${err.message}`
    );
  }
}
