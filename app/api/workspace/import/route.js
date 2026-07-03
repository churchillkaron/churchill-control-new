export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export async function POST(req){

  try{

    const form =
      await req.formData();

    const file =
      form.get("file");

    const moduleKey =
      form.get("module");

    const organizationId =
      form.get("organizationId");

    if(!file){

      return NextResponse.json({

        success:false,
        error:"No file uploaded.",

      },{status:400});

    }

    const registry={

      customers:
        "/api/customers/import",

      vendors:
        "/api/finance/vendors/import",

      "legal-entities":
        "/api/finance/legal-entities/import",

      "cost-centers":
        "/api/finance/cost-centers/import",

      "bank-accounts":
        "/api/finance/bank-accounts/import",

    };

    const endpoint=
      registry[moduleKey];

    if(!endpoint){

      return NextResponse.json({

        success:false,
        error:`Import not configured for ${moduleKey}`,

      },{status:400});

    }

    const forward=
      new FormData();

    forward.append("file",file);
    forward.append("organizationId",organizationId);

    const response=
      await fetch(

        `${process.env.NEXT_PUBLIC_APP_URL}${endpoint}`,

        {

          method:"POST",

          body:forward,

        }

      );

    const json=
      await response.json();

    return NextResponse.json(json);

  }catch(e){

    return NextResponse.json({

      success:false,
      error:e.message,

    },{status:500});

  }

}
