import { NextResponse } from "next/server";
import {
  createSupplierStorefrontProduct,
  supplierStorefrontSnapshot,
  updateSupplierStorefrontProduct,
} from "@/lib/supplier-portal/SupplierStorefrontRuntime";

export const dynamic = "force-dynamic";

function response(result) {
  return NextResponse.json(result, { status: result?.success === false ? (result.status || 500) : 200 });
}

export async function GET() {
  try {
    const result = await supplierStorefrontSnapshot();
    if (!result.success) return response(result);
    return response({ success: true, products: result.products, storefront: result.storefront });
  } catch (error) {
    return response({ success: false, error: error?.message || "Unable to load supplier products" });
  }
}

export async function POST(request) {
  try {
    return response(await createSupplierStorefrontProduct(await request.json()));
  } catch (error) {
    return response({ success: false, error: error?.message || "Unable to create supplier product" });
  }
}


export async function PATCH(request) {
  try {
    return response(await updateSupplierStorefrontProduct(await request.json()));
  } catch (error) {
    return response({ success: false, error: error?.message || "Unable to update supplier product" });
  }
}
