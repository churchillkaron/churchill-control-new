import { NextResponse }
from "next/server";

import { supabase }
from "@/lib/supabase";

export async function POST() {

  try {

    console.log(
      "RETRY FAILED START"
    );

    // LOAD FAILED JOBS

    const {
      data: jobs,
      error,
    } = await supabase
      .from(
        "campaign_publish_queue"
      )
      .select("*")
      .eq(
        "status",
        "failed"
      )
      .lt(
        "retry_count",
        5
      )
      .limit(10);

    if (error) {

      throw error;

    }

    if (!jobs?.length) {

      return NextResponse.json({

        success: true,

        retried: 0,

        message:
          "No failed jobs",

      });

    }

    let retried = 0;

    for (const job of jobs) {

      console.log(
        "RETRYING JOB:",
        job.id
      );

      await supabase
        .from(
          "campaign_publish_queue"
        )
        .update({

          status:
            "queued",

          scheduled_for:
            new Date(
              Date.now() +
              1000 * 60 * 5
            ).toISOString(),

        })
        .eq(
          "id",
          job.id
        );

      retried++;

    }

    return NextResponse.json({

      success: true,

      retried,

    });

  } catch (error) {

    console.error(
      "RETRY FAILED ERROR:",
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