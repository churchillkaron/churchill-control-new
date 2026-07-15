import BaseLookupProvider from "../BaseLookupProvider";
import {
  ProjectRepository,
} from "@/lib/finance/projects/repositories/ProjectRepository";

class ProjectLookup extends BaseLookupProvider {

  async getOptions({
    context,
  }) {

    const rows =
      await ProjectRepository.list({

        organizationId:
          context.organizationId,

        entityId:
          context.entityId,

      });

    return rows.map(row => ({

      value:
        row.id,

      label:
        row.name ||
        row.project_name ||
        row.code,

      code:
        row.code || "",

      description:
        row.description || "",

      raw:
        row,

    }));

  }

}

export default new ProjectLookup();
