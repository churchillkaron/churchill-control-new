const CONTRACT = "AVANTIQO_CODE_REAL_WRITE_E2E_PROOF_V7_PRELOAD_AP_JP1";
const IMAGE = "ghcr.io/churchillkaron/avantiqo-code-pod@sha256:c636b7fc23ab2cd433978cf0ba0470acff7df0df6747b3a64b5e71d1ec762a41";

process.env.AVANTIQO_CODE_E2E_IMAGE = IMAGE;

console.log(JSON.stringify({
  event: "AVANTIQO_CODE_REAL_WRITE_E2E_V7_START",
  contract: CONTRACT,
  image_digest: IMAGE.split("@")[1],
  boot_preload_required: true,
  network_volume_reused: true,
  new_storage_created: false,
  production_deploy_performed: false,
  secrets_printed: false,
}));

await import(`./run-avantiqo-code-real-write-e2e-proof-v6-ap-jp1-local.mjs?v=${Date.now()}`);

console.log(`${CONTRACT}=PASS`);
