import { listBusinessConnections } from "@/lib/platform/channels/BusinessConnectionRegistry";

export function listCustomerIntegrations() {
  return listBusinessConnections().map((integration) => ({
    id: integration.id,
    name: integration.name,
    category: integration.category,
    description: integration.description,
    connectionProviders: integration.connectionProviders || [],
    assetProviders: integration.assetProviders || [],
    assetTypes: integration.assetTypes || [],
    connectPath: integration.connectPath || null,
    detailAnchor: integration.detailAnchor || null,
    availability: integration.availability || "active",
  }));
}
