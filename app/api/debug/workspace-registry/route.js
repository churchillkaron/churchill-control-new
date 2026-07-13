import { NextResponse } from "next/server";

import {
  getWorkspaceGroups,
} from "@/lib/platform/registry/erpRegistry";


export async function GET() {

  return NextResponse.json(
    getWorkspaceGroups("supply-chain")
      .map(group => ({
        group: group.name,
        items: group.items.map(
          item => item.name
        ),
      }))
  );

}
