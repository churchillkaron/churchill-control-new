export const dynamic="force-dynamic";

import {NextResponse} from "next/server";

import {
CreativeJobRuntime,
} from "@/lib/creative/jobs/runtime/CreativeJobRuntime";

export async function GET(){

return NextResponse.json({

success:true,

jobs:
await CreativeJobRuntime.list(),

});

}

export async function POST(req){

const body=
await req.json();

return NextResponse.json({

success:true,

job:
await CreativeJobRuntime.create(body),

});

}
