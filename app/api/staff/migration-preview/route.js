import { NextResponse } from "next/server";

import {
  previewStaffPartyMigration,
} from "/lib/people/employees/migration/previewStaffPartyMigration";


export async function GET() {

  try {

    const result =
      await previewStaffPartyMigration();


    return NextResponse.json({
      success:true,
      count:result.length,
      staff:result,
    });


  } catch(error) {

    return NextResponse.json(
      {
        success:false,
        error:error.message,
      },
      {
        status:500,
      }
    );

  }

}
