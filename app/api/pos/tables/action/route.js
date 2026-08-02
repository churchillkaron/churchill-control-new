import executePOSContextActionRequest from "@/lib/operations/commerce/server/executePOSContextActionRequest";

export async function POST(request) {
  return executePOSContextActionRequest(request, {
    compatibilityRoute: "/api/pos/tables/action",
  });
}
