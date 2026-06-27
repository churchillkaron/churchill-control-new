import { NextResponse } from 'next/server'

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const access =
      await requireOrganizationAccess({

        organizationId:
          body.organizationId,

      });

    if (!access.success) {

      return NextResponse.json(
        {
          success: false,
          error:
            access.error,
        },
        {
          status:
            access.status,
        }
      );

    }

    const organization_id =
      access.organizationId

    const {
      data,
      error,
    } = await supabaseAdmin
      .from(
        'finance_budgets'
      )
      .insert([
        {
          organization_id:
            organization_id,

          category:
            body.category,

          amount:
            body.amount,

          month:
            body.month,

          year:
            body.year,
        },
      ])
      .select()
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      data,
    })

  } catch (error) {

    return NextResponse.json(
      {
        success: false,
        error:
          error.message,
      },
      {
        status: 500,
      }
    )
  }
}
