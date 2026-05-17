import { NextResponse } from "next/server";
import calculatePayroll from "@/lib/payroll/calculatePayroll";

export async function POST(req) {
  try {
    const body = await req.json();

    const result = await calculatePayroll(body);

    return NextResponse.json(result);
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
