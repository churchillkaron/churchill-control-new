#!/usr/bin/env node

/**
 * The former lightweight release smoke could certify a production without the
 * selected-asset contract, quality policies, provider requirements, wallet
 * settlement proof, database evidence or publication evidence.
 *
 * Keep this historical entry point for operator compatibility, but route every
 * release certification through the fail-closed forensic smoke.
 */

console.warn(
  "smoke:creative-release now runs the forensic release certification; " +
  "all required policies, assets, provider, wallet, database and publication " +
  "evidence must be configured.",
);

await import("./creative-studio-forensic-release-smoke.mjs");
