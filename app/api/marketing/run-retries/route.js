import { NextResponse }
from "next/server";

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL;

export async function GET() {

  try {

    console.log(
      "RUN RETRIES START"
    );

    const response =
      await fetch(
        `${BASE_URL}/api/marketing/retry-failed`,
        {
          method: "POST",
        }
      );

    const data =
      await response.json();

    console.log(
      "RUN RETRIES RESULT:",
      data
    );

    return NextResponse.json({

      success: true,

      result: data,

    });

  } catch (error) {

    console.error(
      "RUN RETRIES ERROR:",
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