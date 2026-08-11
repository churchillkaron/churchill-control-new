import { getErpDomains } from "@/lib/platform/registry/erpRegistry";

export async function GET() {
  return Response.json({
    success: true,
    domains: getErpDomains(),
  });
}
