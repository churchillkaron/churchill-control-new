import { getDomains } from "@/lib/domain-registry";

export async function GET() {
  return Response.json({
    domains: getDomains?.() || {}
  });
}
