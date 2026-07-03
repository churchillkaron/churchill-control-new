import {
  ERP_REGISTRY,
  getWorkspaceMeta,
  getWorkspaceGroups,
  getWorkspaceItems,
  getWorkspaceItemByWorkspace,
  getWorkspaceItemAction,
} from "@/lib/platform/registry/erpRegistry";

export function getRegistry() {
  return ERP_REGISTRY;
}

export function getWorkspace(workspaceId) {
  return {
    id: workspaceId,
    meta: getWorkspaceMeta(workspaceId),
    groups: getWorkspaceGroups(workspaceId),
    capabilities: getWorkspaceItems(workspaceId),
  };
}

export function getCapability(workspaceId, capabilityId) {
  return getWorkspaceItemByWorkspace(workspaceId, capabilityId);
}

export function getAction(workspaceId, capabilityId, actionId) {
  return getWorkspaceItemAction(workspaceId, capabilityId, actionId);
}

export function getRenderer(workspaceId, capabilityId) {
  return getCapability(workspaceId, capabilityId)?.renderer ?? null;
}

export function getRepository(workspaceId, capabilityId) {
  return getCapability(workspaceId, capabilityId)?.repository ?? null;
}

export function getWorkflow(workspaceId, capabilityId) {
  return getCapability(workspaceId, capabilityId)?.workflow ?? null;
}

export function getDocument(workspaceId, capabilityId) {
  return getCapability(workspaceId, capabilityId)?.document ?? null;
}

export function getForm(workspaceId, capabilityId) {
  return getCapability(workspaceId, capabilityId)?.form ?? null;
}

export function getAPI(workspaceId, capabilityId) {
  return getCapability(workspaceId, capabilityId)?.api ?? null;
}

export function execute({
  workspaceId,
  capabilityId,
  actionId,
}) {
  return {
    capability: getCapability(workspaceId, capabilityId),
    action: getAction(workspaceId, capabilityId, actionId),
    repository: getRepository(workspaceId, capabilityId),
    workflow: getWorkflow(workspaceId, capabilityId),
    document: getDocument(workspaceId, capabilityId),
    form: getForm(workspaceId, capabilityId),
    api: getAPI(workspaceId, capabilityId),
  };
}
