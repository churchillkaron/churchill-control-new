// Compatibility entrypoint. The V2 provisioner fixes candidate/deep verification
// by fetching authoritative bound templates instead of trusting partial endpoint.template payloads.
await import("./provision-avantiqo-intelligence-deep-eager-candidate-v2-local.mjs");
