export const dynamic = "force-dynamic";

import settlePOSPaymentRequest from "@/lib/operations/commerce/server/settlePOSPaymentRequest";

export async function POST(request) {
  return settlePOSPaymentRequest(request, {
    applicationId: "restaurant",
    partial: false,
  });
}
