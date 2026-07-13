import { NextResponse } from "next/server";

import {
  resolveDetailReadModel,
} from "@/lib/platform/read-model/resolveDetailReadModel";


export async function POST(req) {

  try {

    const body =
      await req.json();


    const rows =
      body.rows || [];


    const resolved =
      await Promise.all(
        rows.map(
          row =>
            resolveDetailReadModel({
              row,
            })
        )
      );


    return NextResponse.json({
      success:true,
      rows:resolved,
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
