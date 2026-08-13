import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { serverOperationsApi } from "@/lib/operations/api/createServerOperationsApi";
import {
  OPERATIONS_ACTIONS,
  getOperationsRequiredPermissions,
  resolveOperationsCommandAction,
} from "@/lib/operations/security/OperationsAuthorizationPolicy";
import { getOperationsFormSchema } from "@/lib/operations/forms/OperationsFormSchemaRegistry";
import { getOperationsCommandSchema } from "@/lib/operations/forms/OperationsCommandSchemaRegistry";
import {
  toOperationsContext,
  unwrapOperationsResponse,
} from "./operationsCapabilityContext";
import { operationsUbteCapabilityName } from "./createOperationsListCapability";
import { fieldsToJsonSchema } from "./operationsCapabilitySchema";

const CONTROL_ACTIONS = new Set([
  OPERATIONS_ACTIONS.CONTROL,
  OPERATIONS_ACTIONS.ADMINISTER,
]);

const CREATE_ACTIONS = new Set([OPERATIONS_ACTIONS.CREATE]);

function resolveOperatorMode(action) {
  return CONTROL_ACTIONS.has(action) ? "approve" : "write";
}

function resolveRisk(action) {
  return CONTROL_ACTIONS.has(action) ? "high" : "medium";
}

function mostSpecificPermission({ capabilityId, command }) {
  const required = getOperationsRequiredPermissions({ capabilityId, command });
  return required[required.length - 1] || `operations.${capabilityId}.execute`;
}

export function createOperationsCommandCapability(capability, command) {
  const action = resolveOperationsCommandAction(command);
  const mode = resolveOperatorMode(action);
  const targetsExistingRecord = !CREATE_ACTIONS.has(action);

  const manifest = defineCapability({
    domain: "operations",
    capability: operationsUbteCapabilityName(capability.id),
    action: command,
    description:
      `Run the ${command} command on ${capability.name}. ${capability.description}`.trim(),
    permissions: [mostSpecificPermission({ capabilityId: capability.id, command })],
    events: [...capability.events],
    tags: ["operations", capability.id, capability.group, mode],
    transactional: true,
    aiEnabled: false,
    operatorEnabled: true,
    operatorMode: mode,
    operatorAutoExecute: false,
    operatorRequiresConfirmation: true,
    reversible: capability.commands.includes("reopen"),
    risk: resolveRisk(action),
    operationsCapabilityId: capability.id,
    operationsCommand: command,
    inputSchema: fieldsToJsonSchema(
      targetsExistingRecord
        ? [
            { name: "id", label: `${capability.name} record id`, type: "text", required: true },
            ...(getOperationsCommandSchema(command)?.fields || []),
          ]
        : getOperationsFormSchema(capability) || [],
    ),
  });

  async function execute({ context, payload = {} }) {
    if (targetsExistingRecord) {
      const recordId = String(payload.id ?? payload.record_id ?? "").trim();

      if (!recordId) {
        const error = new Error(
          `${capability.name} ${command} requires the target record id.`,
        );
        error.status = 400;
        throw error;
      }
    }

    const response = await serverOperationsApi.execute({
      capabilityId: capability.id,
      command,
      context: toOperationsContext(context, payload),
      payload,
    });

    return unwrapOperationsResponse(response);
  }

  return { manifest, execute };
}

export default createOperationsCommandCapability;
