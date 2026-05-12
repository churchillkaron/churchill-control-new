export const runtime =
  "nodejs";

import { NextResponse }
from "next/server";

export async function POST(
  request
) {

  try {

    const body =
      await request.json();

    const jobId =
      body?.jobId;

    if (!jobId) {

      return NextResponse.json(

        {

          success: false,

          error:
            "Missing jobId",

        },

        {

          status: 400,

        }

      );

    }

    // =====================================
    // RUNWAY STATUS REQUEST
    // =====================================

    const response =
      await fetch(

        `https://api.dev.runwayml.com/v1/tasks/${jobId}`,

        {

          method: "GET",

          headers: {

            Authorization:
              `Bearer ${process.env.RUNWAY_API_KEY}`,

            "X-Runway-Version":
              "2024-11-06",

          },

        }

      );

    const result =
      await response.json();

    console.log(
      "RUNWAY STATUS RESULT:",
      JSON.stringify(
        result,
        null,
        2
      )
    );

    // =====================================
    // FAILED
    // =====================================

    if (
      result?.status ===
      "FAILED"
    ) {

      return NextResponse.json({

        success: false,

        status:
          "failed",

        error:

          result?.failure ||

          result?.error ||

          "Video generation failed",

      });

    }

    // =====================================
    // SUCCESS
    // =====================================

    if (
      result?.status ===
      "SUCCEEDED"
    ) {

      const videoUrl =

        result?.output?.[0] ||

        null;

      return NextResponse.json({

        success: true,

        status:
          "completed",

        video_url:
          videoUrl,

        raw:
          result,

      });

    }

    // =====================================
    // STILL PROCESSING
    // =====================================

    return NextResponse.json({

      success: true,

      status:
        "processing",

      raw:
        result,

    });

  } catch (err) {

    console.error(
      "VIDEO STATUS ERROR:",
      err
    );

    return NextResponse.json(

      {

        success: false,

        error:
          err.message,

      },

      {

        status: 500,

      }

    );

  }

}