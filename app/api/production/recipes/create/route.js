import { NextResponse } from 'next/server'
import { createRecipe } from '@/lib/inventory/production/createRecipe'

export async function POST(req) {
  try {
    const body = await req.json()

    const result = await createRecipe({
      ...body,
      organization_id:
        body.organization_id ||
        body.organizationId,
      entity_id:
        body.entity_id ||
        body.entityId ||
        null,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('CREATE RECIPE ERROR:', error)

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
