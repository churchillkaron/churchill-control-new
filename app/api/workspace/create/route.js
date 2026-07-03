import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { CREATE_REPOSITORIES } from "@/lib/workspace/engines/createRepositoryMap";

export async function POST(request){

  try{

    const body = await request.json();

    const repository =
      CREATE_REPOSITORIES[body.module];

    if(!repository){

      return NextResponse.json({

        success:false,
        error:"Unknown module.",

      },{status:400});

    }

    const payload = {

      ...(body.values||{}),

      organization_id:
        body.organization_id,

      created_at:
        new Date().toISOString(),

    };

    const {data,error} =
      await supabaseAdmin
        .from(repository.table)
        .insert(payload)
        .select()
        .single();

    if(error){

      return NextResponse.json({

        success:false,
        error:error.message,

      },{status:400});

    }

    return NextResponse.json({

      success:true,

      record:data,

    });

  }catch(e){

    return NextResponse.json({

      success:false,
      error:e.message,

    },{status:500});

  }

}
