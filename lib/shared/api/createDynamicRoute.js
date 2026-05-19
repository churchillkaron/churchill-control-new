import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export function validateTenant(req) {

  const tenantId =
    req.nextUrl.searchParams.get('tenantId')

  if (!tenantId) {

    return {
      error: NextResponse.json(
        {
          error: 'tenantId required',
        },
        {
          status: 400,
        }
      ),
    }
  }

  return {
    tenantId,
  }
}
