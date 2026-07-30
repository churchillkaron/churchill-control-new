export const dynamic = "force-dynamic";

import { settleTablePayment } from "@/lib/restaurant/payments/runtime/settleTablePayment";

export async function POST(request) {
  return settleTablePayment(request, { partial: false });
}
