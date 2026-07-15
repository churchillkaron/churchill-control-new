import { NextResponse } from "next/server";
import { getLookupOptions } from "@/lib/platform/erp-engine/lookups/LookupRuntime";

export async function GET(request) {

  const { searchParams } =
    new URL(request.url);

  try {

    console.log("LOOKUP",{
lookup: searchParams.get("lookup"),
organizationId: searchParams.get("organizationId"),
entityId: searchParams.get("entityId"),
});

const options =
      await getLookupOptions({

        lookup:
          searchParams.get("lookup"),

        query:
          searchParams.get("query") || "",

        context: {

          organizationId:
            searchParams.get("organizationId"),

          entityId:
            searchParams.get("entityId"),

        },

      });

    return NextResponse.json(
      options || []
    );

  } catch (error) {

    console.error(
      "LOOKUP API ERROR",
      error
    );

    return NextResponse.json(
      {
        error:
          error.message,
      },
      {
        status: 500,
      }
    );

  }

}
