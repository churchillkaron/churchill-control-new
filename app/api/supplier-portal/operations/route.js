import { NextResponse } from "next/server";
import { supplierOperationalSnapshot } from "@/lib/supplier-portal/SupplierStorefrontRuntime";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await supplierOperationalSnapshot();
    return NextResponse.json(result, { status: result?.success === false ? (result.status || 500) : 200 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to load supplier operations" },
      { status: 500 },
    );
  }
}
