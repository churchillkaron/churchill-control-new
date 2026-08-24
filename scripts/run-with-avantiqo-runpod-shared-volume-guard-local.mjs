import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  AVANTIQO_RUNPOD_SHARED_VOLUME_POLICY,
  classifyManagedVolumeName,
  resolveReusableGroupVolume,
} from "./lib/avantiqo-runpod-shared-volumes.mjs";

const REST_BASE = "https://rest.runpod.io/v1";
const NETWORK_VOLUMES_URL = `${REST_BASE}/networkvolumes`;
const baseFetch = globalThis.fetch.bind(globalThis);

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function requestUrl(input) {
  return typeof input === "string" ? input : text(input?.url);
}

function requestMethod(input, init) {
  return text(init?.method || input?.method || "GET").toUpperCase();
}

function parseBody(init = {}) {
  if (!init?.body) return null;
  if (typeof init.body !== "string") {
    throw new Error("AVANTIQO_RUNPOD_SHARED_VOLUME_GUARD_STRING_JSON_BODY_REQUIRED");
  }
  let parsed = null;
  try {
    parsed = JSON.parse(init.body);
  } catch {
    throw new Error("AVANTIQO_RUNPOD_SHARED_VOLUME_GUARD_VALID_JSON_BODY_REQUIRED");
  }
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
}

function isAvantiqoCacheLike(name) {
  const value = text(name).toLowerCase();
  return value.startsWith("avantiqo-") && value.includes("cache");
}

function volumeSize(volume = {}) {
  return finite(volume.size ?? volume.sizeGb, 0);
}

function volumeDatacenter(volume = {}) {
  return text(volume.dataCenterId ?? volume.data_center_id);
}

function safeVolume(volume = {}) {
  return {
    id: text(volume.id) || null,
    name: text(volume.name) || null,
    size_gb: volumeSize(volume),
    data_center_id: volumeDatacenter(volume) || null,
  };
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function listVolumes(managementKey) {
  const response = await baseFetch(NETWORK_VOLUMES_URL, {
    headers: {
      Authorization: `Bearer ${managementKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || raw).slice(0, 500);
    throw new Error(
      `AVANTIQO_RUNPOD_SHARED_VOLUME_GUARD_LIST_FAILED:${response.status}:${detail || "EMPTY_BODY"}`,
    );
  }
  if (!Array.isArray(body)) {
    throw new Error("AVANTIQO_RUNPOD_SHARED_VOLUME_GUARD_LIST_INVALID");
  }
  return body;
}

function assertCreationBudget(volumes, targetGroup) {
  const cacheLike = volumes.filter((volume) => isAvantiqoCacheLike(volume?.name));
  const targetAlreadyPresent = cacheLike.some(
    (volume) => classifyManagedVolumeName(volume?.name)?.id === targetGroup.id,
  );
  if (targetAlreadyPresent) return;
  if (cacheLike.length >= AVANTIQO_RUNPOD_SHARED_VOLUME_POLICY.maximum_managed_cache_volumes) {
    throw new Error(
      `AVANTIQO_RUNPOD_SHARED_VOLUME_HARD_LIMIT_REACHED:existing_avantiqo_cache_volumes=${cacheLike.length}:maximum=${AVANTIQO_RUNPOD_SHARED_VOLUME_POLICY.maximum_managed_cache_volumes}:target_group=${targetGroup.id}`,
    );
  }
}

async function guardedNetworkVolumeCreate(input, init = {}) {
  const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY);
  if (!managementKey) {
    throw new Error("RUNPOD_MANAGEMENT_API_KEY_REQUIRED_FOR_SHARED_VOLUME_GUARD");
  }

  const body = parseBody(init);
  const requestedName = text(body?.name);
  if (!requestedName) {
    throw new Error("AVANTIQO_RUNPOD_SHARED_VOLUME_GUARD_NAME_REQUIRED");
  }

  const group = classifyManagedVolumeName(requestedName);
  if (!group) {
    if (isAvantiqoCacheLike(requestedName)) {
      throw new Error(
        `AVANTIQO_RUNPOD_SHARED_VOLUME_NONCANONICAL_CREATION_BLOCKED:name=${requestedName}`,
      );
    }
    return baseFetch(input, init);
  }

  const volumes = await listVolumes(managementKey);
  const reusable = resolveReusableGroupVolume(volumes, group);
  const requestedSizeGb = finite(body?.size, 0);
  const requestedDc = text(body?.dataCenterId);

  if (reusable.volume) {
    const existingSizeGb = volumeSize(reusable.volume);
    const existingDc = volumeDatacenter(reusable.volume);
    if (requestedSizeGb > 0 && existingSizeGb < requestedSizeGb) {
      throw new Error(
        `AVANTIQO_RUNPOD_SHARED_VOLUME_EXISTING_TOO_SMALL:group=${group.id}:existing_gb=${existingSizeGb}:requested_gb=${requestedSizeGb}`,
      );
    }
    if (requestedDc && existingDc && requestedDc !== existingDc) {
      throw new Error(
        `AVANTIQO_RUNPOD_SHARED_VOLUME_DATACENTER_ALIGNMENT_REQUIRED:group=${group.id}:existing=${existingDc}:requested=${requestedDc}`,
      );
    }

    console.log(
      JSON.stringify({
        event: "AVANTIQO_RUNPOD_SHARED_VOLUME_REUSED",
        contract: AVANTIQO_RUNPOD_SHARED_VOLUME_POLICY.contract,
        group: group.id,
        resolution: reusable.resolution,
        volume: safeVolume(reusable.volume),
        network_volume_created: false,
      }),
    );
    return jsonResponse(reusable.volume);
  }

  assertCreationBudget(volumes, group);

  const guardedBody = {
    ...body,
    name: group.canonical_name,
  };
  console.log(
    JSON.stringify({
      event: "AVANTIQO_RUNPOD_SHARED_VOLUME_CREATE_AUTHORIZED",
      contract: AVANTIQO_RUNPOD_SHARED_VOLUME_POLICY.contract,
      group: group.id,
      canonical_name: group.canonical_name,
      maximum_managed_cache_volumes:
        AVANTIQO_RUNPOD_SHARED_VOLUME_POLICY.maximum_managed_cache_volumes,
    }),
  );
  return baseFetch(input, {
    ...init,
    body: JSON.stringify(guardedBody),
  });
}

globalThis.fetch = async (input, init = {}) => {
  const url = requestUrl(input);
  const method = requestMethod(input, init);
  if (url === NETWORK_VOLUMES_URL && method === "POST") {
    return guardedNetworkVolumeCreate(input, init);
  }
  return baseFetch(input, init);
};

const target = text(process.argv[2]);
if (!target || !target.startsWith("scripts/") || target.includes("..")) {
  throw new Error(
    "AVANTIQO_RUNPOD_SHARED_VOLUME_GUARD_TARGET_REQUIRED:usage=node scripts/run-with-avantiqo-runpod-shared-volume-guard-local.mjs scripts/<target>.mjs [args]",
  );
}

console.log("AVANTIQO_RUNPOD_SHARED_VOLUME_GUARD=true");
console.log(`AVANTIQO_RUNPOD_SHARED_VOLUME_MAXIMUM=${AVANTIQO_RUNPOD_SHARED_VOLUME_POLICY.maximum_managed_cache_volumes}`);
console.log("AVANTIQO_RUNPOD_SHARED_VOLUME_GUARD_GENERATION_SUBMITTED=false");
console.log("AVANTIQO_RUNPOD_SHARED_VOLUME_GUARD_PRODUCTION_DEPLOY=false");

await import(pathToFileURL(resolve(target)).href);
