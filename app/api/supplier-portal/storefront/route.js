import { NextResponse } from "next/server";
import {
  enableSupplierStorefront,
  supplierStorefrontSnapshot,
  updateSupplierStorefront,
} from "@/lib/supplier-portal/SupplierStorefrontRuntime";

export const dynamic = "force-dynamic";

function response(result) {
  return NextResponse.json(result, { status: result?.success === false ? (result.status || 500) : 200 });
}

export async function GET() {
  try {
    return response(await supplierStorefrontSnapshot());
  } catch (error) {
    return response({ success: false, error: error?.message || "Unable to load supplier storefront" });
  }
}

export async function POST() {
  try {
    return response(await enableSupplierStorefront());
  } catch (error) {
    return response({ success: false, error: error?.message || "Unable to create supplier storefront" });
  }
}

export async function PATCH(request) {
  try {
    return response(await updateSupplierStorefront(await request.json()));
  } catch (error) {
    return response({ success: false, error: error?.message || "Unable to update supplier storefront" });
  }
}
