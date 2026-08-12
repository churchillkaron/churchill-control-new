export const COMMERCIAL_WORKSPACE_CAPABILITIES = {
  communications: {
    id: "communications",
    name: "Communications",
    route: "/commercial/customers/communications",
    description: "Unified customer conversations across connected business channels.",
    order: 40,
    status: "active",
    type: "business-workspace",
    document: "CommunicationConversation",
  },
  loyalty: {
    id: "loyalty",
    name: "Loyalty",
    route: "/commercial/customers/loyalty",
    description: "Manage loyalty programs.",
    order: 50,
    status: "active",
    type: "business-workspace",
    document: "LoyaltyAccount",
    runtime: {
      renderer: "MasterDataRuntimeWorkCenter",
      listApi: "/api/commercial/customers/loyalty",
    },
    ui: {
      api: "/api/commercial/customers/loyalty",
      rowsKey: "rows",
      search: ["party_id", "tier", "status"],
    },
    data: {
      capability: "commercial_loyalty",
      identity: "party_id",
    },
  },
  metaAds: {
    id: "meta_ads",
    name: "Meta Ads Manager",
    route: "/commercial/marketing/ads",
    description:
      "Create Facebook and Instagram campaigns using exact approved organization assets.",
    order: 25,
    status: "active",
  },
  brandDNA: {
    id: "brand_dna",
    name: "Brand DNA",
    route: "/commercial/marketing/brand",
    description:
      "Configure organization brand identity, voice, audience and campaign preferences.",
    order: 35,
    status: "active",
  },
};

function upsertWorkspaceItem(group, item) {
  if (!group) return;

  const items = Array.isArray(group.items) ? group.items : [];
  const index = items.findIndex((candidate) => candidate?.id === item.id);

  if (index >= 0) {
    items[index] = {
      ...items[index],
      ...item,
      runtime: {
        ...(items[index]?.runtime || {}),
        ...(item.runtime || {}),
      },
      ui: {
        ...(items[index]?.ui || {}),
        ...(item.ui || {}),
      },
      data: {
        ...(items[index]?.data || {}),
        ...(item.data || {}),
      },
    };
  } else {
    items.push(item);
  }

  group.items = items.sort(
    (left, right) => Number(left?.order || 0) - Number(right?.order || 0)
  );
}

export function applyCommercialWorkspaceRegistry(registry) {
  const commercial = registry?.workspaces?.commercial;
  if (!commercial) return registry;

  const groups = Array.isArray(commercial.groups) ? commercial.groups : [];
  const customerManagement = groups.find(
    (group) => group?.id === "customer_management"
  );
  const marketing = groups.find((group) => group?.id === "marketing");

  upsertWorkspaceItem(customerManagement, COMMERCIAL_WORKSPACE_CAPABILITIES.communications);
  upsertWorkspaceItem(customerManagement, COMMERCIAL_WORKSPACE_CAPABILITIES.loyalty);
  upsertWorkspaceItem(marketing, COMMERCIAL_WORKSPACE_CAPABILITIES.metaAds);
  upsertWorkspaceItem(marketing, COMMERCIAL_WORKSPACE_CAPABILITIES.brandDNA);

  return registry;
}
