import { NextResponse } from "next/server";
import {
  attachSupplierRelationship,
  respondToSupplierConnection,
  supplierConnectionRequests,
} from "@/lib/supplier-portal/SupplierStorefrontRuntime";

export const dynamic = "force-dynamic";

function respond(result) {
  return NextResponse.json(result, { status: result?.success === false ? (result.status || 500) : 200 });
}

export async function GET() {
  try {
    return respond(await supplierConnectionRequests());
  } catch (error) {
    return respond({ success: false, error: error?.message || "Unable to load supplier connection requests" });
  }
}

export async function PATCH(request) {
  try {
    return respond(await respondToSupplierConnection(await request.json()));
  } catch (error) {
    return respond({ success: false, error: error?.message || "Unable to respond to supplier connection" });
  }
}


export async function POST(request) {
  try {
    return respond(await attachSupplierRelationship(await request.json()));
  } catch (error) {
    return respond({ success: false, error: error?.message || "Unable to attach supplier relationship" });
  }
}
