import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)

    const tenant_id =
      searchParams.get('tenant_id')

    if (!tenant_id) {
      throw new Error('Tenant ID required')
    }

    const { data, error } =
      await supabaseAdmin
        .from('dishes')
        .select('*')
        .eq('tenant_id', tenant_id)
        .order('name')

    if (error) {
      throw new Error(error.message)
    }

    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error(error)

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      }
    )
  }
}
