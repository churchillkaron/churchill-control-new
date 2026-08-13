import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { serverOperationsApi } from "@/lib/operations/api/createServerOperationsApi";
import { getOperationsFormSchema } from "@/lib/operations/forms/OperationsFormSchemaRegistry";
import {
  toOperationsContext,
  unwrapOperationsResponse,
} from "./operationsCapabilityContext";
import {
  fieldsToJsonSchema,
  filterableFieldNames,
} from "./operationsCapabilitySchema";

const LIFECYCLE_FILTER_FIELDS = Object.freeze([
  { name: "status", label: "Status", type: "text", storage: "column" },
]);

export function operationsUbteCapabilityName(capabilityId) {
  return String(capabilityId || "").replaceAll("-", "_");
}

function filterFields(capability) {
  const schemaFields = getOperationsFormSchema(capability) || [];

  return [
    ...LIFECYCLE_FILTER_FIELDS,
    ...schemaFields.filter((field) => field.storage === "column"),
  ];
}

export function createOperationsListCapability(capability) {
  const fields = filterFields(capability);
  const filterNames = new Set(filterableFieldNames(fields));

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
    inputSchema: fieldsToJsonSchema(fields),
  });

  async function execute({ context, payload = {} }) {
    const filters = {};

    for (const name of filterNames) {
      const value = payload[name];
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        filters[name] = value;
      }
    }

    const response = await serverOperationsApi.list({
      capabilityId: capability.id,
      context: toOperationsContext(context, payload),
      filters,
    });

    return unwrapOperationsResponse(response);
  }

  return { manifest, execute };
}

export default createOperationsListCapability;
