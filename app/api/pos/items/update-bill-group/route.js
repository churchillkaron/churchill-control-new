import executePOSContextActionRequest from "@/lib/operations/commerce/server/executePOSContextActionRequest";

export const dynamic = "force-dynamic";

export async function POST(request) {
  return executePOSContextActionRequest(request, {
    action: "ASSIGN_ITEMS_TO_GROUP",
    compatibilityRoute: "/api/pos/items/update-bill-group",
  });
}
