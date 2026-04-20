import { NextResponse } from "next/server";

let history = [];

export async function GET() {
  return NextResponse.json(history);
}

export async function POST(req) {
  try {
    const body = await req.json();

    history.push({
      id: Date.now(),
      ...body,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to save" },
      { status: 500 }
    );
  }
}