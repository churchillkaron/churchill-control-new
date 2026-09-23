import { NextResponse } from "next/server";
import {
  createSupplierNetworkProfile,
  setDefaultSupplierAccount,
  supplierStorefrontSnapshot,
  updateSupplierNetworkProfile,
} from "@/lib/supplier-portal/SupplierStorefrontRuntime";

export const dynamic = "force-dynamic";

function respond(result) {
  return NextResponse.json(result, { status: result?.success === false ? (result.status || 500) : 200 });
}

export async function GET() {
  try {
    const snapshot = await supplierStorefrontSnapshot();
    if (!snapshot.success) return respond(snapshot);
    return respond({
      success: true,
      account: snapshot.account,
      capabilities: snapshot.capabilities,
    });
  } catch (error) {
    return respond({ success: false, error: error?.message || "Unable to load supplier profile" });
  }
}

export async function PATCH(request) {
  try {
    return respond(await updateSupplierNetworkProfile(await request.json()));
  } catch (error) {
    return respond({ success: false, error: error?.message || "Unable to update supplier profile" });
  }
}

export async function PUT(request) {
  try {
    return respond(await createSupplierNetworkProfile(await request.json()));
  } catch (error) {
    return respond({ success: false, error: error?.message || "Unable to create supplier profile" });
  }
}

export async function POST(request) {
  try {
    return respond(await setDefaultSupplierAccount(await request.json()));
  } catch (error) {
    return respond({ success: false, error: error?.message || "Unable to switch supplier profile" });
  }
}
