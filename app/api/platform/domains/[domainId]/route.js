import { NextResponse } from "next/server";
import { DomainRegistry } from "@/lib/domain-registry";

export async function GET(
  request,
  { params }
) {
  const domain =
    DomainRegistry.getDomain(
      params.domainId
    );

  if (!domain) {
    return NextResponse.json(
      {
        success: false,
        error: "DOMAIN_NOT_FOUND",
      },
      {
        status: 404,
      }
    );
  }

  return NextResponse.json({
    success: true,
    domain,
    boundedContexts:
      DomainRegistry.getBoundedContexts(params.domainId),
    documents:
      DomainRegistry.getDocuments(params.domainId),
    aggregates:
      DomainRegistry.getAggregates(params.domainId),
    capabilities:
      DomainRegistry.getCapabilities(params.domainId),
    workflows:
      DomainRegistry.getWorkflows(params.domainId),
    events:
      DomainRegistry.getEvents(params.domainId),
    reports:
      DomainRegistry.getReports(params.domainId),
  });
}
