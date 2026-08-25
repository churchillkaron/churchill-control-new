#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const network = String(
  process.env.SECRETARY_TELEPHONY_DOCKER_NETWORK || "avantiqo-secretary-telephony",
).trim();

function run(args) {
  return spawnSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

if (!network || !/^[a-zA-Z0-9_.-]+$/.test(network)) {
  console.error("SECRETARY_TELEPHONY_NETWORK_BOOTSTRAP=FAIL");
  console.error("SECRETARY_TELEPHONY_NETWORK_ERROR=INVALID_NETWORK_NAME");
  process.exit(1);
}

const inspect = run(["network", "inspect", network]);
let created = false;

if (inspect.status !== 0) {
  const create = run(["network", "create", "--driver", "bridge", network]);
  if (create.status !== 0) {
    console.error("SECRETARY_TELEPHONY_NETWORK_BOOTSTRAP=FAIL");
    console.error("SECRETARY_TELEPHONY_NETWORK_ERROR=DOCKER_NETWORK_CREATE_FAILED");
    process.exit(1);
  }
  created = true;
}

console.log("SECRETARY_TELEPHONY_NETWORK_BOOTSTRAP=PASS");
console.log(`SECRETARY_TELEPHONY_NETWORK_NAME=${network}`);
console.log(`SECRETARY_TELEPHONY_NETWORK_CREATED=${created}`);
console.log("SECRETARY_TELEPHONY_AUDIOSOCKET_PUBLIC_EXPOSURE_REQUIRED=false");
console.log("SECRETARY_ASTERISK_CARRIER_CALL_PERFORMED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
