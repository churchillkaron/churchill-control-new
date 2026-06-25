import { NextResponse } from "next/server";
import { DocumentRegistry } from "@/lib/document-registry";

export async function GET() {
  return NextResponse.json({
    success: true,
    documents: DocumentRegistry.all(),
  });
}
