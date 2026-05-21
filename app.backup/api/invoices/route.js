export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";

export async function GET() {

  return NextResponse.json({
    success: true,
    invoices: [],
  });
}

export async function POST() {

  return NextResponse.json({
    success: true,
  });
}
