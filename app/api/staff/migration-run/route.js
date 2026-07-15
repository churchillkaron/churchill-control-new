import { NextResponse } from "next/server";

import {
  migrateStaffAccountsToParty,
} from "/lib/people/employees/migration/migrateStaffAccountsToParty";


export async function GET() {

  try {

    const result =
      await migrateStaffAccountsToParty();


    return NextResponse.json({
      success:true,
      count:result.length,
      result,
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
