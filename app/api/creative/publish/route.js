export const dynamic="force-dynamic";

import {NextResponse} from "next/server";

import {
CreativePublishRuntime,
} from "@/lib/creative/publishing/workflows/CreativePublishRuntime";

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

const result=
await CreativePublishRuntime.publish({

organization_id:
organizationId,

creative_project_id:
body.creative_project_id,

channels:
body.channels||[],

});

return NextResponse.json({

success:true,

result,

});

}

catch(error){

return NextResponse.json({

success:false,

error:error.message,

},{status:500});

}

}
