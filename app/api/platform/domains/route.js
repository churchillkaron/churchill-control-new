import { NextResponse } from "next/server";
import { DomainRegistry } from "@/lib/domain-registry";

export async function GET() {
  const domains =
    DomainRegistry.getDomains();

  return NextResponse.json({
    success: true,
    domains,
  });
}
