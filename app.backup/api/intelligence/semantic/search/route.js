import { NextResponse } from "next/server";

import generateEmbeddings from "@/lib/intelligence/openai/generateEmbeddings";

import searchMemory from "@/lib/intelligence/semantic/searchMemory";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const embedding =
      await generateEmbeddings(
        body.query
      );

    if (
      !embedding.success
    ) {

      return NextResponse.json(
        embedding,
        {
          status: 500,
        }
      );
    }

    const result =
      await searchMemory({
        tenant_id:
          body.tenant_id,
        embedding:
          embedding.embedding,
      });

    return NextResponse.json(
      result
    );

  } catch (error) {

    return NextResponse.json(
      {
        success: false,
        error:
          error.message,
      },
      {
        status: 500,
      }
    );
  }
}
