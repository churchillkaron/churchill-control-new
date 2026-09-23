import { NextResponse } from "next/server";
import {
  inviteSupplierTeamMember,
  supplierTeamMembers,
  updateSupplierTeamMember,
} from "@/lib/supplier-portal/SupplierStorefrontRuntime";

export const dynamic = "force-dynamic";

function respond(result) {
  return NextResponse.json(result, {
    status: result?.success === false ? (result.status || 500) : 200,
  });
}

export async function GET() {
  try {
    return respond(await supplierTeamMembers());
  } catch (error) {
    return respond({ success: false, error: error?.message || "Unable to load supplier team" });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const redirectTo = new URL("/supplier-portal/settings?team=1", request.url).toString();
    return respond(await inviteSupplierTeamMember({
      email: body?.email,
      role: body?.role,
      redirectTo,
    }));
  } catch (error) {
    return respond({ success: false, error: error?.message || "Unable to invite supplier team member" });
  }
}

export async function PATCH(request) {
  try {
    return respond(await updateSupplierTeamMember(await request.json()));
  } catch (error) {
    return respond({ success: false, error: error?.message || "Unable to update supplier team member" });
  }
}
