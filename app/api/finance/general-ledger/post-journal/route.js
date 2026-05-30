import {
  requireAuth,
} from "@/lib/shared/auth";

import { NextResponse } from 'next/server'

import { postJournalEntry } from '@/lib/finance/services/postJournalEntry'

export async function POST(req) {

  try {

    await requireAuth();

    const body =
      await req.json()

    const result =
      await postJournalEntry(body)

    return NextResponse.json({
      success: true,
      result,
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
