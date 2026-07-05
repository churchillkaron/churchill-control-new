export const dynamic="force-dynamic";

import {NextResponse} from "next/server";

import {
CreativeBrandRuntime,
} from "@/lib/creative/brand/runtime/CreativeBrandRuntime";

import {
requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

export async function GET(req){

const {searchParams}=new URL(req.url);

const organizationId=
searchParams.get("organizationId");

const creativeProjectId=
searchParams.get("creativeProjectId");

const access=
await requireOrganizationAccess({
organizationId,
});

if(!access.success)
return NextResponse.json(
access,
{status:access.status},
);

return NextResponse.json({

success:true,

brands:
await CreativeBrandRuntime.list({

organization_id:
organizationId,

creative_project_id:
creativeProjectId,

}),

});

}

export async function POST(req){

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

return NextResponse.json({

success:true,

brand:
await CreativeBrandRuntime.create({

...body,

organization_id:
organizationId,

}),

});

}
