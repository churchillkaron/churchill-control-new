import executePOSContextActionRequest from "@/lib/operations/commerce/server/executePOSContextActionRequest";

export const dynamic = "force-dynamic";

export async function POST(request) {
  return executePOSContextActionRequest(request, {
    action: "MOVE_ASSIGNMENT",
    compatibilityRoute: "/api/pos/tables/move-seat",
  });
}
