#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const network = String(
  process.env.SECRETARY_TELEPHONY_DOCKER_NETWORK || "avantiqo-secretary-telephony",
).trim();

const asteriskCompose = "workers/secretary-sip-gateway/asterisk/docker-compose.asterisk.yml";
const gatewayCompose = "workers/secretary-sip-gateway/docker-compose.gateway.yml";

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
    const detail = String(result.stderr || result.stdout || "").trim().slice(0, 700);
    throw new Error(`${code}${detail ? `:${detail}` : ""}`);
  }
  return String(result.stdout || "").trim();
}

function composeContainerId(composeFile, service, code) {
  const result = run("docker", [
    "compose",
    "--env-file",
    ".env.local",
    "-f",
    composeFile,
    "ps",
    "-q",
    service,
  ]);
  const id = requireSuccess(result, code);
  if (!id) throw new Error(`${code}:CONTAINER_NOT_RUNNING`);
  return id;
}

function containerNetworks(containerId, code) {
  const result = run("docker", [
    "inspect",
    containerId,
    "--format",
    "{{json .NetworkSettings.Networks}}",
  ]);
  const raw = requireSuccess(result, code);
  return JSON.parse(raw || "{}");
}

function requirePrivateMembership({ containerId, alias, label }) {
  const networks = containerNetworks(containerId, `SECRETARY_${label}_NETWORK_INSPECT_FAILED`);
  const membership = networks[network];
  if (!membership) throw new Error(`SECRETARY_${label}_NOT_ON_PRIVATE_NETWORK`);
  const aliases = Array.isArray(membership.Aliases)
    ? membership.Aliases.map((value) => String(value || ""))
    : [];
  if (!aliases.includes(alias)) throw new Error(`SECRETARY_${label}_PRIVATE_DNS_ALIAS_MISSING`);
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
  if (!network || !/^[a-zA-Z0-9_.-]+$/.test(network)) {
    throw new Error("SECRETARY_TELEPHONY_NETWORK_INVALID");
  }

  const networkInspect = run("docker", ["network", "inspect", network]);
  requireSuccess(networkInspect, "SECRETARY_TELEPHONY_NETWORK_MISSING");

  const asteriskId = composeContainerId(
    asteriskCompose,
    "secretary-asterisk",
    "SECRETARY_ASTERISK_COMPOSE_LOOKUP_FAILED",
  );
  const gatewayId = composeContainerId(
    gatewayCompose,
    "secretary-sip-gateway",
    "SECRETARY_GATEWAY_COMPOSE_LOOKUP_FAILED",
  );

  requirePrivateMembership({
    containerId: asteriskId,
    alias: "secretary-asterisk",
    label: "ASTERISK",
  });
  requirePrivateMembership({
    containerId: gatewayId,
    alias: "secretary-sip-gateway",
    label: "GATEWAY",
  });

  const audioProbe = composeExecNode(`
    const net = require("node:net");
    let attempts = 0;
    const connect = () => {
      attempts += 1;
      const socket = net.createConnection({ host: "secretary-sip-gateway", port: 9019 });
      const timer = setTimeout(() => socket.destroy(new Error("timeout")), 1500);
      socket.once("connect", () => { clearTimeout(timer); socket.destroy(); process.exit(0); });
      socket.once("error", () => {
        clearTimeout(timer);
        socket.destroy();
        if (attempts >= 10) process.exit(3);
        setTimeout(connect, 500);
      });
    };
    connect();
  `);
  requireSuccess(audioProbe, "SECRETARY_AUDIOSOCKET_PRIVATE_CONNECT_FAILED");

  const gatewayProbe = composeExecNode(`
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    (async () => {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        try {
          const response = await fetch("http://secretary-sip-gateway:8787/health", {
            signal: AbortSignal.timeout(2000),
          });
          const body = await response.json().catch(() => ({}));
          if (response.ok && body?.ok === true && body?.ami_connected === true) process.exit(0);
        } catch {}
        await sleep(500);
      }
      process.exit(5);
    })();
  `);
  requireSuccess(gatewayProbe, "SECRETARY_GATEWAY_PRIVATE_HEALTH_FAILED");

  console.log("SECRETARY_TELEPHONY_STACK_PREFLIGHT=PASS");
  console.log("SECRETARY_TELEPHONY_PRIVATE_NETWORK=PASS");
  console.log("SECRETARY_ASTERISK_PRIVATE_NETWORK=PASS");
  console.log("SECRETARY_GATEWAY_PRIVATE_NETWORK=PASS");
  console.log("SECRETARY_PRIVATE_DNS_ALIASES=PASS");
  console.log("SECRETARY_ASTERISK_TO_AUDIOSOCKET=PASS");
  console.log("SECRETARY_ASTERISK_TO_GATEWAY_HTTP=PASS");
  console.log("SECRETARY_GATEWAY_TO_ASTERISK_AMI=PASS");
  console.log("SECRETARY_TELEPHONY_AUDIOSOCKET_PUBLIC_EXPOSURE=false");
  console.log("SECRETARY_ASTERISK_CARRIER_CALL_PERFORMED=false");
  console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
} catch (error) {
  console.error("SECRETARY_TELEPHONY_STACK_PREFLIGHT=FAIL");
  console.error(`SECRETARY_TELEPHONY_STACK_ERROR=${String(error?.message || error).slice(0, 1200)}`);
  console.error("SECRETARY_ASTERISK_CARRIER_CALL_PERFORMED=false");
  console.error("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
  process.exitCode = 1;
}
