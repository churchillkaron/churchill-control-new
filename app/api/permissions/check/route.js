import { NextResponse } from "next/server";
import { checkPermission } from "@/lib/platform/administration/identity/runtime/IdentityRuntime";

export async function POST(req) {
  try {
    const body = await req.json();

    const result = await checkPermission(body);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        allowed: false,
        error: error.message,
      },
      {
        status: 500,
      }
    );
  }
}
