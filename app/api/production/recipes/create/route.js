import { NextResponse } from 'next/server'
import { createRecipe } from '@/lib/production/createRecipe'

export async function POST(req) {
  try {
    const body = await req.json()

    const result = await createRecipe(body)

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
