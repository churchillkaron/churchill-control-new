import { NextResponse } from "next/server";
import { DocumentRegistry } from "@/lib/document-registry";

export async function GET(
  request,
  { params }
) {
  const document =
    DocumentRegistry.get(
      params.documentId
    );

  if (!document) {
    return NextResponse.json(
      {
        success: false,
        error: "DOCUMENT_NOT_FOUND",
      },
      {
        status: 404,
      }
    );
  }

  return NextResponse.json({
    success: true,
    document,
  });
}
