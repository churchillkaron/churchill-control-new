import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { serverOperationsApi } from "@/lib/operations/api/createServerOperationsApi";
import {
  toOperationsContext,
  unwrapOperationsResponse,
} from "./operationsCapabilityContext";

export const manifest = defineCapability({
  domain: "operations",
  capability: "work_items",
  action: "createWorkItem",
  description:
    "Create a neutral operational work item so requested work is authorised and tracked.",
  permissions: ["operations.work-items.create"],
  events: ["operations.work-items.created"],
  tags: ["operations", "work-items", "execution", "write"],
  transactional: true,
  aiEnabled: false,
  operatorEnabled: true,
  operatorMode: "write",
  operatorAutoExecute: false,
  operatorRequiresConfirmation: true,
  reversible: true,
  risk: "low",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string" },
      description: { type: "string" },
      priority: { type: "string" },
      assigned_to: { type: "string" },
    },
    required: ["name"],
    additionalProperties: true,
  },
});

export async function execute({ context, payload = {} }) {
  const operationsContext = toOperationsContext(context, payload);

  const name = String(payload.name ?? "").trim();

  if (!name) {
    const error = new Error("Work item name is required.");
    error.status = 400;
    throw error;
  }

  const response = await serverOperationsApi.execute({
    capabilityId: "work-items",
    command: "create",
    context: operationsContext,
    payload: {
      ...payload,
      name,
    },
  });

  return unwrapOperationsResponse(response);
}
