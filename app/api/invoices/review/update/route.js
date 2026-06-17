export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

export async function POST(req) {
  try {
    const body = await req.json();

    const {
      organizationId,
      invoiceId,
      vendor,
      date,
      total_amount,
      items,
    } = body;

    if (!organizationId) {
      return NextResponse.json(
        { success: false, error: "organizationId required" },
        { status: 400 }
      );
    }

    if (!invoiceId) {
      return NextResponse.json(
        { success: false, error: "invoiceId required" },
        { status: 400 }
      );
    }

    const access = await requireOrganizationAccess({
      organizationId,
    });

    if (!access.success) {
      return NextResponse.json(
        {
          success: false,
          error: access.error,
        },
        {
          status: access.status,
        }
      );
    }

    const tenantId = access.tenantId;

    const { data, error } = await supabaseAdmin
      .from("invoices")
      .update({
        vendor: vendor || "Unknown Vendor",
        date: date || null,
        total_amount: Number(total_amount || 0),
        items: Array.isArray(items) ? items : [],
      })
      .eq("id", invoiceId)
      .eq("tenant_id", tenantId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      invoice: data,
    });
  } catch (error) {
    console.error("INVOICE REVIEW UPDATE ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      }
    );
  }
}
