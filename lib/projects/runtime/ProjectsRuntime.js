import { createProjectsCreateCapability } from "@/lib/projects/runtime/ProjectsOperatorCapability";

export const ProjectsRuntime = {
  domain: "projects",
  name: "Projects",
  version: "1.0.0",
  capabilities: {
    projects: {
      create: async () => createProjectsCreateCapability(),
    },
  },
  workflows: {},
  documents: {},
};

export default ProjectsRuntime;
