import { createHash } from "node:crypto";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || value === undefined) return value ?? null;
  if (typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined && typeof value[key] !== "function")
      .map((key) => [key, canonical(value[key])]),
  );
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function operatorMissionPayloadFingerprint(payload = {}) {
  return sha256(JSON.stringify(canonical(object(payload))));
}

export function operatorMissionDispatchKey({
  organizationId,
  missionExecutionId,
  missionStepId,
  capabilityKey,
  payload = {},
} = {}) {
  const material = [
    text(organizationId),
    text(missionExecutionId),
    text(missionStepId),
    text(capabilityKey),
    operatorMissionPayloadFingerprint(payload),
  ].join("\n");
  return sha256(material);
}

export default {
  fingerprint: operatorMissionPayloadFingerprint,
  dispatchKey: operatorMissionDispatchKey,
};
