#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const network = String(
  process.env.SECRETARY_TELEPHONY_DOCKER_NETWORK || "avantiqo-secretary-telephony",
).trim();
const requested = String(process.argv[2] || "all").trim().toLowerCase();

const services = [
  {
    key: "asterisk",
    label: "ASTERISK",
    compose: "workers/secretary-sip-gateway/asterisk/docker-compose.asterisk.yml",
    service: "secretary-asterisk",
    alias: "secretary-asterisk",
  },
  {
    key: "gateway",
    label: "GATEWAY",
    compose: "workers/secretary-sip-gateway/docker-compose.gateway.yml",
    service: "secretary-sip-gateway",
    alias: "secretary-sip-gateway",
  },
];

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
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

function composeContainerId(entry) {
  const result = run("docker", [
    "compose",
    "--env-file",
    ".env.local",
    "-f",
    entry.compose,
    "ps",
    "-q",
    entry.service,
  ]);
  return requireSuccess(result, `SECRETARY_${entry.label}_COMPOSE_LOOKUP_FAILED`);
}

function containerNetworks(containerId) {
  const result = run("docker", [
    "inspect",
    containerId,
    "--format",
    "{{json .NetworkSettings.Networks}}",
  ]);
  const raw = requireSuccess(result, "SECRETARY_CONTAINER_NETWORK_INSPECT_FAILED");
  return JSON.parse(raw || "{}");
}

function networkAliases(containerId) {
  return Array.isArray(containerNetworks(containerId)?.[network]?.Aliases)
    ? containerNetworks(containerId)[network].Aliases.map((value) => String(value || ""))
    : [];
}

function ensureMembership(entry) {
  const containerId = composeContainerId(entry);
  if (!containerId) throw new Error(`SECRETARY_${entry.label}_CONTAINER_NOT_RUNNING`);

  let networks = containerNetworks(containerId);
  let attached = Boolean(networks[network]);
  let repaired = false;

  if (!attached) {
    const connect = run("docker", [
      "network",
      "connect",
      "--alias",
      entry.alias,
      network,
      containerId,
    ]);
    requireSuccess(connect, `SECRETARY_${entry.label}_PRIVATE_NETWORK_ATTACH_FAILED`);
    repaired = true;
    networks = containerNetworks(containerId);
    attached = Boolean(networks[network]);
  }

  if (!attached) throw new Error(`SECRETARY_${entry.label}_NOT_ON_PRIVATE_NETWORK`);

  const aliases = networkAliases(containerId);
  if (!aliases.includes(entry.alias)) {
    const disconnect = run("docker", ["network", "disconnect", network, containerId]);
    requireSuccess(disconnect, `SECRETARY_${entry.label}_PRIVATE_NETWORK_ALIAS_RESET_FAILED`);
    const reconnect = run("docker", [
      "network",
      "connect",
      "--alias",
      entry.alias,
      network,
      containerId,
    ]);
    requireSuccess(reconnect, `SECRETARY_${entry.label}_PRIVATE_NETWORK_ALIAS_ATTACH_FAILED`);
    repaired = true;
  }

  const verifiedAliases = networkAliases(containerId);
  if (!verifiedAliases.includes(entry.alias)) {
    throw new Error(`SECRETARY_${entry.label}_PRIVATE_DNS_ALIAS_MISSING`);
  }

  console.log(`SECRETARY_${entry.label}_PRIVATE_NETWORK=PASS`);
  console.log(`SECRETARY_${entry.label}_PRIVATE_NETWORK_REPAIRED=${repaired}`);
}

try {
  if (!network || !/^[a-zA-Z0-9_.-]+$/.test(network)) {
    throw new Error("SECRETARY_TELEPHONY_NETWORK_INVALID");
  }
  const networkInspect = run("docker", ["network", "inspect", network]);
  requireSuccess(networkInspect, "SECRETARY_TELEPHONY_NETWORK_MISSING");

  const selected = requested === "all"
    ? services
    : services.filter((entry) => entry.key === requested);
  if (!selected.length) throw new Error("SECRETARY_TELEPHONY_NETWORK_TARGET_INVALID");

  for (const entry of selected) ensureMembership(entry);

  console.log("SECRETARY_TELEPHONY_NETWORK_MEMBERSHIP=PASS");
  console.log(`SECRETARY_TELEPHONY_NETWORK_NAME=${network}`);
  console.log("SECRETARY_ASTERISK_CARRIER_CALL_PERFORMED=false");
  console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
} catch (error) {
  console.error("SECRETARY_TELEPHONY_NETWORK_MEMBERSHIP=FAIL");
  console.error(`SECRETARY_TELEPHONY_NETWORK_ERROR=${String(error?.message || error).slice(0, 1000)}`);
  console.error("SECRETARY_ASTERISK_CARRIER_CALL_PERFORMED=false");
  console.error("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
  process.exitCode = 1;
}
