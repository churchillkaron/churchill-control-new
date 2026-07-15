import { getCapability } from "@/lib/platform/erp-engine/ERPRuntime";

export const Registry = {

  getDomain(domainId) {
    return getCapability(domainId);
  },

  getCapability(domain, capability) {
    return getCapability(domain, capability);
  },

  getWorkspace(domain, workspaceId) {
    const domainData = getCapability(domain);

    const workspaces =
      domainData?.workspaces || [];

    return workspaces.find(w => w.id === workspaceId) || null;
  },

  getNavigation(domain, workspaceId) {
    const ws = this.getWorkspace(domain, workspaceId);
    return ws?.navigation || [];
  },

  getWidgets(domain, workspaceId) {
    const ws = this.getWorkspace(domain, workspaceId);
    return ws?.widgets || [];
  },

  getCommands(domain, workspaceId) {
    const ws = this.getWorkspace(domain, workspaceId);
    return ws?.commands || [];
  },

  getLayout(domain, workspaceId) {
    const ws = this.getWorkspace(domain, workspaceId);
    return ws?.layout || "table";
  }

};
