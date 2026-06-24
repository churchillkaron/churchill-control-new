export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

export async function POST(req) {
  try {

    const body = await req.json();

    const access =
      await requireOrganizationAccess({
        organizationId:
          body.organizationId,
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

    const tenantId =
      access.tenantId;

    const {
      customer_name,
      customer_phone,
      customer_email,
      birthday,
      notes,
    } = body;

    let query =
      supabaseAdmin
        .from("customer_loyalty_accounts")
        .select("*")
        .eq("tenant_id", tenantId);

    if (customer_phone) {

      query =
        query.eq(
          "customer_phone",
          customer_phone
        );

    } else {

      query =
        query.eq(
          "customer_email",
          customer_email
        );

    }

    const {
      data: existing,
    } =
      await query.maybeSingle();

    if (existing) {

      const {
        data,
        error,
      } =
        await supabaseAdmin
          .from("customer_loyalty_accounts")
          .update({
            customer_name,
            customer_phone,
            customer_email,
            birthday,
            notes,
          })
          .eq("id", existing.id)
          .select()
          .single();

      if (error) {
        throw error;
      }

      return NextResponse.json({
        success: true,
        customer: data,
      });

    }

    const {
      data,
      error,
    } =
      await supabaseAdmin
        .from("customer_loyalty_accounts")
        .insert({
          tenant_id: tenantId,
          organization_id:
            body.organizationId,

          customer_name,
          customer_phone,
          customer_email,
          birthday,
          notes,

          loyalty_points: 0,
          total_spent: 0,
          visit_count: 0,
          tier: "REGULAR",
        })
        .select()
        .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      customer: data,
    });

  } catch (error) {

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
