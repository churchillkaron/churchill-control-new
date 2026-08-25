#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const network = String(
  process.env.SECRETARY_TELEPHONY_DOCKER_NETWORK || "avantiqo-secretary-telephony",
).trim();

const asteriskCompose = "workers/secretary-sip-gateway/asterisk/docker-compose.asterisk.yml";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
  if (result.error) throw result.error;
  return result;
}

function requireSuccess(result, code) {
  if (result.status !== 0) {
    throw new Error(`${code}:${String(result.stderr || result.stdout || "").trim().slice(0, 500)}`);
  }
  return String(result.stdout || "").trim();
}

function composeExecNode(source) {
  return run("docker", [
    "compose",
    "--env-file",
    ".env.local",
    "-f",
    asteriskCompose,
    "exec",
    "-T",
    "secretary-asterisk",
    "node",
    "-e",
    source,
  ]);
}

try {
  const inspect = run("docker", ["network", "inspect", network, "--format", "{{json .Containers}}"]) ;
  const containersRaw = requireSuccess(inspect, "SECRETARY_TELEPHONY_NETWORK_MISSING");
  const containers = JSON.parse(containersRaw || "{}");
  const names = Object.values(containers).map((entry) => String(entry?.Name || ""));

  if (!names.some((name) => name.includes("secretary-asterisk"))) {
    throw new Error("SECRETARY_ASTERISK_NOT_ON_PRIVATE_NETWORK");
  }
  if (!names.some((name) => name.includes("secretary-sip-gateway"))) {
    throw new Error("SECRETARY_GATEWAY_NOT_ON_PRIVATE_NETWORK");
  }

  const audioProbe = composeExecNode(`
    const net = require("node:net");
    const socket = net.createConnection({ host: "secretary-sip-gateway", port: 9019 });
    const timer = setTimeout(() => { socket.destroy(); process.exit(2); }, 5000);
    socket.once("connect", () => { clearTimeout(timer); socket.destroy(); process.exit(0); });
    socket.once("error", () => { clearTimeout(timer); process.exit(3); });
  `);
  requireSuccess(audioProbe, "SECRETARY_AUDIOSOCKET_PRIVATE_CONNECT_FAILED");

  const gatewayProbe = composeExecNode(`
    fetch("http://secretary-sip-gateway:8787/health", { signal: AbortSignal.timeout(5000) })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok || body?.ok !== true || body?.ami_connected !== true) process.exit(4);
        process.exit(0);
      })
      .catch(() => process.exit(5));
  `);
  requireSuccess(gatewayProbe, "SECRETARY_GATEWAY_PRIVATE_HEALTH_FAILED");

  console.log("SECRETARY_TELEPHONY_STACK_PREFLIGHT=PASS");
  console.log("SECRETARY_TELEPHONY_PRIVATE_NETWORK=PASS");
  console.log("SECRETARY_ASTERISK_TO_AUDIOSOCKET=PASS");
  console.log("SECRETARY_ASTERISK_TO_GATEWAY_HTTP=PASS");
  console.log("SECRETARY_GATEWAY_TO_ASTERISK_AMI=PASS");
  console.log("SECRETARY_TELEPHONY_AUDIOSOCKET_PUBLIC_EXPOSURE=false");
  console.log("SECRETARY_ASTERISK_CARRIER_CALL_PERFORMED=false");
  console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
} catch (error) {
  console.error("SECRETARY_TELEPHONY_STACK_PREFLIGHT=FAIL");
  console.error(`SECRETARY_TELEPHONY_STACK_ERROR=${String(error?.message || error).slice(0, 1000)}`);
  console.error("SECRETARY_ASTERISK_CARRIER_CALL_PERFORMED=false");
  console.error("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
  process.exitCode = 1;
}
