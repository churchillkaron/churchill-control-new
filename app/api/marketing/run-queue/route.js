import { NextResponse } from "next/server";

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL;

export const dynamic =
  "force-dynamic";

export async function GET() {

  try {

    console.log(
      "RUN QUEUE START"
    );

    const response =
      await fetch(
        `${BASE_URL}/api/marketing/process-queue`,
        {
          method: "POST",
        }
      );

    const data =
      await response.json();

    console.log(
      "RUN QUEUE RESULT:",
      data
    );

    return NextResponse.json({
      success: true,
      result: data,
    });

  } catch (error) {

    console.error(
      "RUN QUEUE ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error.message,
      },
      { status: 500 }
    );

  }

}