export function createAssignment({

  organizationId,

  sourceType,

  sourceId,

  assignedPartyId = null,

  assignedTeamId = null,

  assignmentType = "MANUAL",

  assignedBy = null,

}) {

  return {

    organization_id:
      organizationId,

    source_type:
      sourceType,

    source_id:
      sourceId,

    assigned_party_id:
      assignedPartyId,

    assigned_team_id:
      assignedTeamId,

    assignment_type:
      assignmentType,

    status:
      "ACTIVE",

    assigned_by:
      assignedBy,

    assigned_at:
      new Date().toISOString(),

  };

}
