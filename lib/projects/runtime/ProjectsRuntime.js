import { createOperatorAuthenticatedRouteReadCapability } from "@/lib/operator/runtime/OperatorAuthenticatedRouteReadCapability";

function projectsRead() {
  return createOperatorAuthenticatedRouteReadCapability({
    domain: "projects", capability: "projects", action: "read",
    description: "Read the current organization/entity-scoped project command center, including active projects, deadlines, overdue work and planning exceptions.",
    endpoint: "/api/workspace/projects/command-center",
    tags: ["projects", "project", "status", "deadlines", "command-center"],
  });
}

export const ProjectsRuntime = {
  domain: "projects", name: "Projects", version: "1.0.0",
  capabilities: { projects: {
    read: async () => (await import("@/lib/projects/runtime/ProjectVerificationReadCapability")).createProjectVerificationReadCapability(),
    create: async () => (await import("@/lib/projects/runtime/ProjectsOperatorCapability")).createProjectsCreateCapability(),
  }},
  workflows: {}, documents: {},
};

export default ProjectsRuntime;
