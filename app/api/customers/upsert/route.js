export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function POST(req) {
  try {
    const body = await req.json();

    const organizationId =
      body.organizationId ||
      body.organization_id;

    if (!organizationId) {
      return NextResponse.json(
        {
          success: false,
          error: "organizationId required",
        },
        { status: 400 }
      );
    }

    const {
      customer_name,
      customer_phone,
      customer_email,
      birthday,
      notes,
    } = body;

    if (!customer_name) {
      return NextResponse.json(
        {
          success: false,
          error: "customer_name required",
        },
        { status: 400 }
      );
    }

    let query =
      supabaseAdmin
        .from("customer_loyalty_accounts")
        .select("*")
        .eq("organization_id", organizationId);

    if (customer_phone) {
      query = query.eq("customer_phone", customer_phone);
    } else if (customer_email) {
      query = query.eq("customer_email", customer_email);
    } else {
      query = query.eq("customer_name", customer_name);
    }

    const { data: existing, error: existingError } =
      await query.maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (existing) {
      const { data, error } =
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

      if (error) throw error;

      return NextResponse.json({
        success: true,
        customer: data,
      });
    }

    const { data, error } =
      await supabaseAdmin
        .from("customer_loyalty_accounts")
        .insert({
          organization_id: organizationId,

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

    if (error) throw error;

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
      { status: 500 }
    );
  }
}
