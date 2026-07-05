export const dynamic="force-dynamic";

import {NextResponse} from "next/server";

import {
CreativeProviderExecutor,
} from "@/lib/creative/providers/runtime/CreativeProviderExecutor";

export async function POST(){

const results=
await CreativeProviderExecutor.processAll();

return NextResponse.json({

success:true,

results,

});

}
