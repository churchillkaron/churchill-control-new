import { createPeopleEmployeeCreateCapability } from "@/lib/people/runtime/PeopleOperatorCapability";

export const PeopleOperatorDomainRuntime = {
  domain: "people",
  name: "People",
  version: "1.0.0",
  capabilities: {
    employees: {
      create: async () => createPeopleEmployeeCreateCapability(),
    },
  },
};

export default PeopleOperatorDomainRuntime;
