import { NextResponse } from 'next/server'

import { postJournalEntry } from '@/lib/finance/generalLedger/postJournalEntry'

export async function POST(req) {

  try {

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
