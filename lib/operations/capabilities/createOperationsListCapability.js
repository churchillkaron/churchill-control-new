import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { serverOperationsApi } from "@/lib/operations/api/createServerOperationsApi";
import {
  toOperationsContext,
  unwrapOperationsResponse,
} from "./operationsCapabilityContext";

const FILTER_KEYS = Object.freeze([
  "status",
  "priority",
  "assigned_to",
  "source_domain",
  "source_type",
  "source_id",
]);

export function operationsUbteCapabilityName(capabilityId) {
  return String(capabilityId || "").replaceAll("-", "_");
}

function resolveFilters(payload = {}) {
  const filters = {};

  for (const key of FILTER_KEYS) {
    const camel = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    const value = payload[key] ?? payload[camel];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      filters[key] = value;
    }
  }

  return filters;
}

export function createOperationsListCapability(capability) {
  const manifest = defineCapability({
    domain: "operations",
    capability: operationsUbteCapabilityName(capability.id),
    action: "list",
    description:
      `List ${capability.name} records for the active organization. ${capability.description}`.trim(),
    permissions: [`operations.${capability.id}.view`],
    events: [],
    tags: ["operations", capability.id, capability.group, "read"],
    transactional: false,
    aiEnabled: false,
    operatorEnabled: true,
    operatorMode: "read",
    operatorAutoExecute: true,
    operatorRequiresConfirmation: false,
    risk: "low",
    operationsCapabilityId: capability.id,
    inputSchema: {
      type: "object",
      properties: FILTER_KEYS.reduce((properties, key) => {
        properties[key] = { type: "string" };
        return properties;
      }, {}),
      additionalProperties: true,
    },
  });

  async function execute({ context, payload = {} }) {
    const response = await serverOperationsApi.list({
      capabilityId: capability.id,
      context: toOperationsContext(context, payload),
      filters: resolveFilters(payload),
    });

    return unwrapOperationsResponse(response);
  }

  return { manifest, execute };
}

export default createOperationsListCapability;
