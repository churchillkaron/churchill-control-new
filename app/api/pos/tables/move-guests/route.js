import { NextResponse } from 'next/server';

import {
  moveGuestsBetweenTables,
} from '@/lib/restaurant/services/moveGuestsBetweenTables';

export async function POST(req) {
  try {
    const body = await req.json();

    const result =
      await moveGuestsBetweenTables({
        tenantId: body.tenantId,
        fromTable: body.fromTable,
        toTable: body.toTable,
        guestCount: body.guestCount,
      });

    return NextResponse.json({
      success: true,
      result,
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
