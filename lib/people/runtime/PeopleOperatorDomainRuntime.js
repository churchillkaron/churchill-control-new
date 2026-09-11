import { createOperatorAuthenticatedRouteReadCapability } from "@/lib/operator/runtime/OperatorAuthenticatedRouteReadCapability";

function peopleDirectoryRead() {
  return createOperatorAuthenticatedRouteReadCapability({
    domain: "people", capability: "employees", action: "read",
    description: "Read the authenticated organization employee directory and current employment assignments. The People API enforces management-role access.",
    endpoint: "/api/people/directory",
    tags: ["people", "employees", "directory", "employment"],
  });
}

export const PeopleOperatorDomainRuntime = {
  domain: "people", name: "People", version: "1.0.0",
  capabilities: { employees: {
    read: async () => (await import("@/lib/people/runtime/PeopleEmployeeVerificationReadCapability")).createPeopleEmployeeVerificationReadCapability(),
    create: async () => (await import("@/lib/people/runtime/PeopleOperatorCapability")).createPeopleEmployeeCreateCapability(),
  }},
};

export default PeopleOperatorDomainRuntime;
