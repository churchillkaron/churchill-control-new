import { NextResponse } from "next/server";
import {
  setSupplierCustomerProductTerm,
  supplierCustomerTerms,
} from "@/lib/supplier-portal/SupplierStorefrontRuntime";

export const dynamic = "force-dynamic";

function respond(result) {
  return NextResponse.json(result, { status: result?.success === false ? (result.status || 500) : 200 });
}

export async function GET(request) {
  try {
    return respond(await supplierCustomerTerms({
      relationshipId: request.nextUrl.searchParams.get("relationshipId"),
    }));
  } catch (error) {
    return respond({ success: false, error: error?.message || "Unable to load customer pricing terms" });
  }
}

export async function PATCH(request) {
  try {
    return respond(await setSupplierCustomerProductTerm(await request.json()));
  } catch (error) {
    return respond({ success: false, error: error?.message || "Unable to update customer pricing terms" });
  }
}
