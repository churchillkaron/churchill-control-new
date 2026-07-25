import {
  createResearchReport,
} from "../documents/ResearchReport";
import {
  buildResearchPlan,
} from "../reasoning/ResearchDirector";
import * as Repository from "../repositories/ResearchRepository";

export async function runResearch(
  project = {},
  brief = {},
  reasoningProvider,
) {
  if (!project.organization_id) throw new Error("organization_id required");
  if (!project.id) throw new Error("creative_project_id required");
  if (!reasoningProvider?.run) throw new Error("reasoning provider required");

  const plan = await buildResearchPlan(project, brief);
  const result = await reasoningProvider.run({ project, brief, plan });
  const document = createResearchReport({
    organization_id: project.organization_id,
    creative_project_id: project.id,
    creative_brief_id: brief.id || null,
    ...(result || {}),
    metadata: {
      ...(result?.metadata || {}),
      research_plan: plan,
    },
  });

  return Repository.create(document);
}

export const ResearchRuntime = {
  runResearch,

  async list(input = {}) {
    return Repository.list(input);
  },

  async get(id) {
    return Repository.get(id);
  },

  async create(input = {}) {
    return Repository.create(createResearchReport(input));
  },

  async update(id, values = {}) {
    return Repository.update(id, values);
  },

  async resolve(input = {}, permissions = []) {
    const items = await this.list(input);
    const current = items[0] || null;
    return {
      current,
      items,
      commands: ["create", "update", "runResearch"],
      status: current ? "ready" : "not_started",
      permissions,
    };
  },
};
