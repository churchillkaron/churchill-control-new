export const dynamic="force-dynamic";

import {NextResponse} from "next/server";

import {
CreativeRenderRuntime,
} from "@/lib/creative/rendering/workflows/CreativeRenderRuntime";

import {
requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

export async function POST(req){

try{

const body=
await req.json();

const organizationId=
body.organization_id||
body.organizationId;

const access=
await requireOrganizationAccess({
organizationId,
});

if(!access.success)
return NextResponse.json(
access,
{status:access.status},
);

const render=
await CreativeRenderRuntime.renderProject({

organization_id:
organizationId,

creative_project_id:
body.creative_project_id,

strategy:
body.strategy||
"cost_optimized",

});

return NextResponse.json({

success:true,

render,

});

}

catch(error){

return NextResponse.json({

success:false,

error:error.message,

},{status:500});

}

}
