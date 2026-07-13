import {
  createAssignmentRecord,
} from "./createAssignment";


export async function assignRecord({

  organizationId,

  sourceType,

  sourceId,

  assignedPartyId,

  assignedTeamId = null,

  assignmentType = "MANUAL",

  assignedBy = null,

}) {

  return createAssignmentRecord({

    organizationId,

    sourceType,

    sourceId,

    assignedPartyId,

    assignedTeamId,

    assignmentType,

    assignedBy,

  });

}
