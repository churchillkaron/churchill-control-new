import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { serverOperationsApi } from "@/lib/operations/api/createServerOperationsApi";
import {
  toOperationsContext,
  unwrapOperationsResponse,
} from "./operationsCapabilityContext";

export const manifest = defineCapability({
  domain: "operations",
  capability: "work_items",
  action: "listWorkItems",
  description:
    "List operational work items for the active organization, so questions about open, assigned or in-progress work can be answered.",
  permissions: [],
  events: [],
  tags: ["operations", "work-items", "execution", "read"],
  transactional: false,
  aiEnabled: false,
  operatorEnabled: true,
  operatorMode: "read",
  operatorAutoExecute: true,
  operatorRequiresConfirmation: false,
  risk: "low",
  inputSchema: {
    type: "object",
    properties: {
      status: { type: "string" },
      assigned_to: { type: "string" },
    },
    additionalProperties: true,
  },
});

export async function execute({ context, payload = {} }) {
  const operationsContext = toOperationsContext(context, payload);

  const filters = {};
  if (payload.status) filters.status = payload.status;
  if (payload.assigned_to || payload.assignedTo) {
    filters.assigned_to = payload.assigned_to || payload.assignedTo;
  }

  const response = await serverOperationsApi.list({
    capabilityId: "work-items",
    context: operationsContext,
    filters,
  });

  return unwrapOperationsResponse(response);
}
