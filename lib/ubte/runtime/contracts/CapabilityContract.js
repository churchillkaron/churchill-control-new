export const CAPABILITY_CONTRACT = {
  requiredFiles: [
    "manifest.js",
    "execute.js",
  ],

  optionalFiles: [
    "schema.js",
    "validate.js",
    "authorize.js",
    "rules.js",
    "repository.js",
    "events.js",
    "ai.js",
    "audit.js",
    "dto.js",
  ],

  lifecycle: [
    "context",
    "load",
    "validate",
    "authorize",
    "transaction.begin",
    "execute",
    "events",
    "ai",
    "audit",
    "transaction.commit",
    "response",
  ],
};
