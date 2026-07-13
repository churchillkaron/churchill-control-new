export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  getManagementReport,
} from "@/lib/finance/reporting/reports/getManagementReport";


export async function GET(req){

  try{

    const { searchParams } =
      new URL(req.url);


    const result =
      await getManagementReport({

        organizationId:
          searchParams.get("organizationId"),

        startDate:
          searchParams.get("startDate"),

        endDate:
          searchParams.get("endDate"),

      });


    return NextResponse.json({
      success:true,
      report:result,
      rows:[result],
    });


  }catch(error){

    return NextResponse.json({
      success:false,
      error:error.message,
    },{
      status:500,
    });

  }

}
