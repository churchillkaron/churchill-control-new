export const dynamic = "force-dynamic";

import executePOSContextActionRequest from "@/lib/operations/commerce/server/executePOSContextActionRequest";

export async function POST(request) {
  return executePOSContextActionRequest(request);
}
