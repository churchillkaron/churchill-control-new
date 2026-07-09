import { NextResponse } from "next/server";
import { ERP_REGISTRY } from "@/lib/platform/registry/erpRegistry";

function findWorkspace(node, id) {
  if (!node) return null;

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findWorkspace(item, id);
      if (found) return found;
    }
    return null;
  }

  if (typeof node !== "object") return null;

  if (node.id === id && node.type === "business-workspace") {
    return node;
  }

  for (const value of Object.values(node)) {
    const found = findWorkspace(value, id);
    if (found) return found;
  }

  return null;
}

export async function POST(req) {
  try {
    const body = await req.json();

    const workspace =
      findWorkspace(
        ERP_REGISTRY,
        body.workspace
      );

    if (!workspace) {
      return NextResponse.json(
        {
          success: false,
          error: "Workspace not found."
        },
        {
          status: 404
        }
      );
    }

    const reports =
      workspace.reports ||
      workspace.ui?.reports ||
      [];

    return NextResponse.json({
      success: true,

      workspace: workspace.id,
      workspaceName: workspace.name,

      availableReports: reports,

      request: body,

      generatedAt:
        new Date().toISOString()
    });

  } catch (err) {

    return NextResponse.json(
      {
        success: false,
        error: err.message
      },
      {
        status: 500
      }
    );

  }
}
