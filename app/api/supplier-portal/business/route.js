import { NextResponse } from "next/server";
import {
  supplierBusinessCandidates,
  supplierBusinessCatalogCandidates,
  linkSupplierBusiness,
  mapSupplierProductToBusinessItem,
  syncSupplierBusinessCatalog,
} from "@/lib/supplier-portal/SupplierStorefrontRuntime";

export const dynamic = "force-dynamic";

function respond(result) {
  return NextResponse.json(result, { status: result?.success === false ? (result.status || 500) : 200 });
}

export async function GET() {
  try {
    const candidates = await supplierBusinessCandidates();
    if (!candidates.success) return respond(candidates);

    const catalog = await supplierBusinessCatalogCandidates();
    return respond({
      success: true,
      organizations: candidates.organizations || [],
      catalog: catalog?.success ? {
        products: catalog.products || [],
        business_items: catalog.business_items || [],
      } : null,
    });
  } catch (error) {
    return respond({ success: false, error: error?.message || "Unable to load business candidates" });
  }
}

export async function POST(request) {
  try {
    return respond(await linkSupplierBusiness(await request.json()));
  } catch (error) {
    return respond({ success: false, error: error?.message || "Unable to link Avantiqo Business" });
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "").trim().toLowerCase();
    if (action === "sync_catalog") return respond(await syncSupplierBusinessCatalog());
    if (action === "map_product") {
      return respond(await mapSupplierProductToBusinessItem({
        productId: body?.productId,
        inventoryItemId: body?.inventoryItemId,
        syncEnabled: body?.syncEnabled !== false,
      }));
    }
    return respond({ success: false, status: 400, error: "Unsupported supplier business action" });
  } catch (error) {
    return respond({ success: false, error: error?.message || "Unable to update Avantiqo Business catalog bridge" });
  }
}
