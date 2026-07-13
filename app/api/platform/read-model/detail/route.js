import { NextResponse } from "next/server";

import {
  resolveDetailReadModel,
} from "@/lib/platform/read-model/resolveDetailReadModel";


export async function POST(req) {

  try {

    const body =
      await req.json();


    const row =
      await resolveDetailReadModel({
        row:
          body.row,
      });


    return NextResponse.json({
      success:true,
      row,
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
