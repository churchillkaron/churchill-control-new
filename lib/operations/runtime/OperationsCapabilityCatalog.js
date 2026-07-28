const LIFECYCLES = Object.freeze({
  master: Object.freeze({
    commands: ["create", "update", "activate", "deactivate", "archive"],
    events: ["created", "updated", "activated", "deactivated", "archived"],
  }),
  document: Object.freeze({
    commands: ["create", "update", "submit", "approve", "cancel", "reopen"],
    events: ["created", "updated", "submitted", "approved", "cancelled", "reopened"],
  }),
  execution: Object.freeze({
    commands: ["create", "assign", "release", "start", "pause", "complete", "cancel", "reopen"],
    events: ["created", "assigned", "released", "started", "paused", "completed", "cancelled", "reopened"],
  }),
  planning: Object.freeze({
    commands: ["create", "update", "publish", "revise", "cancel", "archive"],
    events: ["created", "updated", "published", "revised", "cancelled", "archived"],
  }),
  control: Object.freeze({
    commands: ["create", "assess", "assign", "resolve", "close", "reopen"],
    events: ["created", "assessed", "assigned", "resolved", "closed", "reopened"],
  }),
  evidence: Object.freeze({
    commands: ["record", "validate", "reject", "supersede", "void"],
    events: ["recorded", "validated", "rejected", "superseded", "voided"],
  }),
});

const defineCapability = ({
  id,
  name,
  group,
  description,
  lifecycle = "master",
  commands,
  events,
  readOnly = false,
  recordType = "master-data",
  owner = "operations",
  consumes = [],
  boundary,
}) => {
  const lifecycleDefinition = LIFECYCLES[lifecycle] || LIFECYCLES.master;

  return Object.freeze({
    id,
    name,
    group,
    description,
    lifecycle,
    commands: Object.freeze([...(commands || lifecycleDefinition.commands)]),
    events: Object.freeze([...(events || lifecycleDefinition.events)]),
    readOnly,
    recordType,
    owner,
    consumes: Object.freeze([...consumes]),
    boundary: boundary || null,
  });
};

const CAPABILITIES = [
  // Work intake and execution
  ["work-requests", "Work Requests", "execution", "Capture and qualify neutral requests for operational work before commitment.", "document"],
  ["work-orders", "Work Orders", "execution", "Authorise, scope and control operational work requiring accountable execution.", "execution"],
  ["work-items", "Work Items", "execution", "Create, assign, progress, complete and audit neutral units of operational work.", "execution"],
  ["work-packages", "Work Packages", "execution", "Group related work into controlled executable packages with shared outcomes and dependencies.", "execution"],
  ["work-steps", "Work Steps", "execution", "Define and execute ordered steps within operational work.", "execution"],
  ["activities", "Activities", "execution", "Record the operational activities performed against work, runs and resources.", "evidence"],
  ["operational-runs", "Operational Runs", "execution", "Coordinate repeatable batches, rounds, cycles and other industry-neutral runs.", "execution"],
  ["run-templates", "Run Templates", "execution", "Define reusable structures for operational runs without industry assumptions.", "master"],
  ["recurring-work", "Recurring Work", "execution", "Generate work from effective-dated recurrence rules and templates.", "planning"],
  ["ad-hoc-work", "Ad-hoc Work", "execution", "Control urgent or unplanned work without bypassing governance and audit.", "execution"],
  ["work-dependencies", "Work Dependencies", "execution", "Maintain predecessor, successor, blocking and synchronisation relationships between work.", "master"],
  ["work-classifications", "Work Classifications", "execution", "Configure neutral work types, categories, reasons and service classes.", "master"],
  ["work-priorities", "Work Priorities", "execution", "Configure priority schemes and apply prioritisation consistently.", "master"],
  ["work-status-control", "Work Status Control", "execution", "Govern allowed lifecycle transitions for operational records.", "master"],
  ["work-history", "Work History", "execution", "Present the immutable lifecycle and activity history of operational work.", "master", { readOnly: true, recordType: "intelligence" }],

  // Planning and scheduling: work scheduling only, not employment rostering
  ["operational-plans", "Operational Plans", "planning", "Create coordinated operational plans across work, resources, locations and time windows.", "planning"],
  ["workload-planning", "Workload Planning", "planning", "Translate committed and forecast work into time-phased operational workload.", "planning"],
  ["capacity-planning", "Capacity Planning", "planning", "Compare workload with available non-workforce and workforce-derived capacity.", "planning", { consumes: ["people.workforce-availability"] }],
  ["resource-planning", "Resource Planning", "planning", "Plan the operational use of eligible workforce references, equipment, devices and work centres.", "planning", { consumes: ["people.workforce-availability", "people.qualifications"] }],
  ["work-schedules", "Work Schedules", "planning", "Schedule operational work and execution windows; employment rosters remain in People.", "planning", { consumes: ["people.rosters", "people.leave", "people.workforce-availability"], boundary: "Does not own employee shifts, leave, attendance or payroll time." }],
  ["schedules", "Schedules", "planning", "Compatibility surface for operational work schedules and non-workforce resource schedules.", "planning", { boundary: "Never authoritative for employee rosters." }],
  ["resource-schedules", "Resource Schedules", "planning", "Schedule equipment, devices, vehicles, spaces and other non-workforce operational resources.", "planning"],
  ["work-centre-schedules", "Work Centre Schedules", "planning", "Schedule operating windows, loads and planned downtime for work centres.", "planning"],
  ["appointment-windows", "Appointment Windows", "planning", "Manage bookable or committed operational service windows independent of industry.", "planning"],
  ["schedule-constraints", "Schedule Constraints", "planning", "Configure dependencies, blackout periods, limits and timing constraints used by planners.", "master"],
  ["schedule-conflicts", "Schedule Conflicts", "planning", "Detect, assess and resolve conflicting work, resource and timing commitments.", "control"],
  ["planning-scenarios", "Planning Scenarios", "planning", "Model alternative workload, capacity and scheduling decisions before publication.", "planning"],
  ["operational-calendars", "Operational Calendars", "planning", "Define business operating windows, closures and non-workforce resource calendars.", "master", { consumes: ["people.work-calendars"], boundary: "Employee contractual calendars remain in People." }],
  ["demand-signals", "Demand Signals", "planning", "Ingest neutral demand signals from owning domains for operational planning.", "evidence", { consumes: ["commercial", "supply-chain", "projects", "industry-domains"] }],

  // Orchestration, queues and dispatch
  ["queues", "Queues", "orchestration", "Prioritise and route pending work according to configurable policies.", "master"],
  ["queue-policies", "Queue Policies", "orchestration", "Configure admission, priority, ageing, throttling and routing rules for queues.", "master"],
  ["queue-entries", "Queue Entries", "orchestration", "Control the lifecycle and ordering of work waiting in operational queues.", "execution"],
  ["dispatch", "Dispatch", "orchestration", "Dispatch work to eligible resources, devices or work centres.", "execution", { consumes: ["people.workforce-availability", "people.qualifications"] }],
  ["dispatch-boards", "Dispatch Boards", "orchestration", "Provide a live operational surface for planned, dispatched and unassigned work.", "master", { readOnly: true, recordType: "intelligence" }],
  ["dispatch-rules", "Dispatch Rules", "orchestration", "Configure automatic and assisted dispatch decisions.", "master"],
  ["routing", "Operational Routing", "orchestration", "Determine sequence and path across locations, work centres or execution stages.", "planning"],
  ["work-distribution", "Work Distribution", "orchestration", "Distribute work across eligible resources and execution nodes.", "execution"],
  ["load-balancing", "Load Balancing", "orchestration", "Rebalance queued and assigned work across available capacity.", "execution"],
  ["assignments", "Assignments", "orchestration", "Control operational responsibility and participation while referencing People as workforce authority.", "execution", { consumes: ["people.workers", "people.teams", "people.qualifications"] }],
  ["assignment-rules", "Assignment Rules", "orchestration", "Configure eligibility, segregation, load and priority rules for assignments.", "master", { consumes: ["people.qualifications"] }],
  ["handoffs", "Handoffs", "orchestration", "Transfer responsibility, custody and operational context between execution parties or work centres.", "execution"],
  ["coordination-cases", "Coordination Cases", "orchestration", "Coordinate multi-party operational situations that span several work records.", "control"],
  ["execution-dependencies", "Execution Dependencies", "orchestration", "Monitor and enforce runtime dependencies between active work records.", "control"],

  // Operational resources. Workforce master data remains in People.
  ["resources", "Operational Resources", "resources", "Maintain references to workforce plus Operations-owned equipment, devices, spaces and other execution resources.", "master", { consumes: ["people.workers", "people.teams"], boundary: "Does not own employee records, contracts, rosters, leave, attendance or payroll." }],
  ["resource-types", "Resource Types", "resources", "Configure neutral operational resource classifications and capabilities.", "master"],
  ["resource-groups", "Resource Groups", "resources", "Group operational resources for planning, dispatch and reporting.", "master"],
  ["work-centres", "Work Centres", "resources", "Represent physical, virtual or mobile centres where operational work is executed.", "master"],
  ["operational-locations", "Operational Locations", "resources", "Maintain execution locations and their operational relationships without duplicating legal-entity or property masters.", "master", { consumes: ["administration.locations"] }],
  ["equipment", "Operational Equipment", "resources", "Register equipment used directly in operations while preserving links to the owning asset master.", "master", { consumes: ["assets.equipment"] }],
  ["devices", "Operational Devices", "resources", "Register devices, terminals and connected endpoints participating in execution.", "master", { consumes: ["administration.devices"] }],
  ["resource-capabilities", "Resource Capabilities", "resources", "Define what non-workforce resources and work centres are operationally capable of performing.", "master"],
  ["resource-availability", "Resource Availability", "resources", "Maintain availability for equipment, devices, vehicles, spaces and work centres only.", "planning", { boundary: "Employee availability is authoritative in People." }],
  ["availability", "Availability", "resources", "Compatibility surface for non-workforce resource availability and People-derived workforce availability.", "planning", { consumes: ["people.workforce-availability"], boundary: "Never writes employee availability." }],
  ["resource-reservations", "Resource Reservations", "resources", "Reserve and release operational resources against planned or active work.", "execution"],
  ["capacity-profiles", "Capacity Profiles", "resources", "Define effective-dated capacity for work centres and non-workforce resources.", "master"],
  ["capacity-reservations", "Capacity Reservations", "resources", "Reserve, consume and release operational capacity.", "execution"],
  ["resource-downtime", "Resource Downtime", "resources", "Record planned and unplanned downtime for non-workforce resources and work centres.", "control"],
  ["resource-constraints", "Resource Constraints", "resources", "Define operational limitations applied during planning, assignment and execution.", "master"],
  ["skills-qualifications", "Workforce Eligibility", "resources", "Read People-owned skills, certifications and qualifications for operational eligibility decisions.", "master", { readOnly: true, consumes: ["people.skills", "people.qualifications", "people.certifications"], boundary: "Operations never grants, suspends, expires or revokes employee qualifications." }],

  // Procedures, policies and controlled execution
  ["procedures", "Procedures", "control", "Publish and govern standard operating procedures with version control.", "master"],
  ["procedure-versions", "Procedure Versions", "control", "Control effective, superseded and retired procedure versions.", "master"],
  ["standard-work", "Standard Work", "control", "Define repeatable standard methods, expected sequence and control points.", "master"],
  ["work-instructions", "Work Instructions", "control", "Provide contextual instructions attached to work types, steps and resources.", "master"],
  ["checklist-templates", "Checklist Templates", "control", "Define reusable checklist structures, validation rules and evidence requirements.", "master"],
  ["checklists", "Checklists", "control", "Execute controlled checklists and preserve completion state.", "execution"],
  ["operational-forms", "Operational Forms", "control", "Define dynamic forms used to capture structured operational evidence and decisions.", "master"],
  ["completion-evidence", "Completion Evidence", "control", "Capture, validate and retain proof of operational completion.", "evidence"],
  ["sign-offs", "Operational Sign-offs", "control", "Capture accountable acknowledgements and completion sign-offs.", "evidence"],
  ["operational-approvals", "Operational Approvals", "control", "Route and record approvals required during operational execution.", "document"],
  ["operational-policies", "Operational Policies", "control", "Define effective-dated rules governing routing, execution, escalation and completion.", "master"],
  ["execution-rules", "Execution Rules", "control", "Configure runtime conditions, validations and allowed interventions.", "master"],
  ["hold-rules", "Hold Rules", "control", "Configure conditions that automatically or manually place work on hold.", "master"],
  ["release-controls", "Release Controls", "control", "Govern release of planned work into executable state.", "master"],
  ["operational-permits", "Operational Permits", "control", "Control temporary permissions required for specified work, locations or resources.", "document", { consumes: ["compliance"] }],
  ["policy-exceptions", "Policy Exceptions", "control", "Request, approve and monitor controlled exceptions to operational policy.", "document"],

  // Incident, exception and continuity management
  ["incidents", "Incidents", "resilience", "Capture, triage, investigate, resolve and review operational incidents.", "control"],
  ["incident-triage", "Incident Triage", "resilience", "Assess severity, impact, ownership and immediate containment requirements.", "control"],
  ["investigations", "Investigations", "resilience", "Conduct structured operational investigations and preserve findings.", "control"],
  ["root-cause-analysis", "Root Cause Analysis", "resilience", "Identify causal factors and systemic contributors to operational failures.", "control"],
  ["corrective-actions", "Corrective Actions", "resilience", "Plan and verify actions that correct detected operational problems.", "execution"],
  ["preventive-actions", "Preventive Actions", "resilience", "Plan and verify actions intended to prevent recurrence or future failure.", "execution"],
  ["exceptions-holds", "Exceptions & Holds", "resilience", "Raise, isolate, investigate and release work affected by exceptions.", "control"],
  ["escalations", "Escalations", "resilience", "Escalate operational risk, delay, quality failure or unowned work through policy.", "control"],
  ["service-interruptions", "Service Interruptions", "resilience", "Record and coordinate interruptions affecting operational delivery.", "control"],
  ["recovery-actions", "Recovery Actions", "resilience", "Coordinate restoration, backlog recovery and controlled return to normal operations.", "execution"],
  ["continuity-plans", "Operational Continuity Plans", "resilience", "Maintain executable continuity and fallback plans for operational disruption.", "planning"],
  ["emergency-actions", "Emergency Actions", "resilience", "Provide governed rapid-response actions for urgent operational conditions.", "execution"],
  ["operational-risks", "Operational Risks", "resilience", "Identify and monitor operational execution risks while linking to enterprise risk authority.", "control", { consumes: ["compliance.enterprise-risk"] }],

  // Quality execution
  ["quality-plans", "Quality Plans", "quality", "Define operational quality controls, checkpoints, methods and evidence requirements.", "planning"],
  ["quality-inspections", "Quality Inspections", "quality", "Perform neutral operational inspections against configured requirements.", "execution"],
  ["quality-checks", "Quality Checks", "quality", "Execute lightweight in-process or completion quality validations.", "execution"],
  ["sampling-plans", "Sampling Plans", "quality", "Configure operational sampling methods and acceptance rules.", "master"],
  ["non-conformances", "Non-conformances", "quality", "Record, contain and resolve failure to meet operational requirements.", "control"],
  ["defects", "Defects", "quality", "Record and classify defects found during execution or inspection.", "control"],
  ["rework", "Rework", "quality", "Authorise, execute and verify corrective operational work.", "execution"],
  ["quality-decisions", "Quality Decisions", "quality", "Record pass, fail, reject, hold, concession and release decisions.", "document"],
  ["quality-evidence", "Quality Evidence", "quality", "Capture and validate evidence supporting operational quality decisions.", "evidence"],
  ["operational-audits", "Operational Audits", "quality", "Plan and execute audits of operational adherence and control effectiveness.", "control", { consumes: ["compliance"] }],
  ["control-tests", "Control Tests", "quality", "Execute repeatable tests of operational controls and preserve outcomes.", "execution"],

  // Service levels and performance
  ["service-levels", "Service Levels", "performance", "Define operational response, completion, availability and quality commitments.", "master"],
  ["service-level-calendars", "Service-level Calendars", "performance", "Define the calendars and pause rules used to calculate operational commitments.", "master"],
  ["service-level-breaches", "Service-level Breaches", "performance", "Detect, acknowledge, investigate and resolve breached commitments.", "control"],
  ["operational-kpis", "Operational KPIs", "performance", "Define neutral operational performance measures and targets.", "master"],
  ["productivity", "Productivity", "performance", "Measure output relative to consumed operational effort and capacity.", "master", { readOnly: true, recordType: "intelligence" }],
  ["throughput", "Throughput", "performance", "Measure completed operational flow over time.", "master", { readOnly: true, recordType: "intelligence" }],
  ["cycle-time", "Cycle Time", "performance", "Measure elapsed execution time across configured lifecycle boundaries.", "master", { readOnly: true, recordType: "intelligence" }],
  ["lead-time", "Lead Time", "performance", "Measure elapsed time from request or commitment to completion.", "master", { readOnly: true, recordType: "intelligence" }],
  ["wait-time", "Wait Time", "performance", "Measure time spent waiting in queues, holds or dependencies.", "master", { readOnly: true, recordType: "intelligence" }],
  ["backlog", "Backlog", "performance", "Measure and analyse incomplete committed operational work.", "master", { readOnly: true, recordType: "intelligence" }],
  ["work-ageing", "Work Ageing", "performance", "Analyse ageing and stagnation of open operational records.", "master", { readOnly: true, recordType: "intelligence" }],
  ["resource-utilisation", "Resource Utilisation", "performance", "Measure planned, reserved, active, idle and unavailable resource time.", "master", { readOnly: true, recordType: "intelligence", consumes: ["people.time-actuals"] }],
  ["performance-scorecards", "Performance Scorecards", "performance", "Present configurable operational targets, actuals, trends and exceptions.", "master", { readOnly: true, recordType: "intelligence" }],

  // Operational intelligence and command
  ["operational-events", "Operational Events", "intelligence", "Provide the immutable operational event stream used for coordination, audit and analytics.", "master", { readOnly: true, recordType: "intelligence" }],
  ["monitoring", "Live Monitoring", "intelligence", "Observe current operational state, exceptions, thresholds and health signals.", "master", { readOnly: true, recordType: "intelligence" }],
  ["alerts", "Operational Alerts", "intelligence", "Create, route, acknowledge and resolve operational alerts.", "control"],
  ["thresholds", "Operational Thresholds", "intelligence", "Configure threshold conditions used by monitoring and alerts.", "master"],
  ["situation-boards", "Situation Boards", "intelligence", "Present a coordinated view of active situations, impacts and response actions.", "master", { readOnly: true, recordType: "intelligence" }],
  ["bottleneck-analysis", "Bottleneck Analysis", "intelligence", "Identify constrained stages, queues, resources and dependencies.", "master", { readOnly: true, recordType: "intelligence" }],
  ["operational-forecasting", "Operational Forecasting", "intelligence", "Forecast workload, throughput, delay and capacity risk from operational signals.", "planning"],
  ["interventions", "Operational Interventions", "intelligence", "Authorise and execute controlled cross-capability intervention actions.", "document"],
  ["operational-timeline", "Operational Timeline", "intelligence", "Present a cross-capability chronological view of work, decisions, evidence and events.", "master", { readOnly: true, recordType: "intelligence" }],
  ["audit-trail", "Operational Audit Trail", "intelligence", "Expose immutable actor, command, state-change and evidence history.", "master", { readOnly: true, recordType: "intelligence" }],
  ["command-centre", "Command Centre", "intelligence", "Present the cross-capability operational picture and governed intervention surface.", "master", { readOnly: true, recordType: "intelligence" }],
];

export const OPERATIONS_CAPABILITY_CATALOG = Object.freeze(
  CAPABILITIES.map(([
    id,
    name,
    group,
    description,
    lifecycle,
    options = {},
  ]) => defineCapability({
    id,
    name,
    group,
    description,
    lifecycle,
    ...options,
  })),
);

export const OPERATIONS_CAPABILITIES_BY_ID = Object.freeze(
  Object.fromEntries(
    OPERATIONS_CAPABILITY_CATALOG.map((capability) => [capability.id, capability]),
  ),
);

export const OPERATIONS_CAPABILITY_GROUPS = Object.freeze(
  OPERATIONS_CAPABILITY_CATALOG.reduce((groups, capability) => {
    if (!groups[capability.group]) groups[capability.group] = [];
    groups[capability.group].push(capability);
    return groups;
  }, {}),
);

export function getOperationsCapability(capabilityId) {
  return OPERATIONS_CAPABILITIES_BY_ID[capabilityId] || null;
}

export function getOperationsCapabilitiesByGroup(group) {
  return OPERATIONS_CAPABILITY_GROUPS[group] || [];
}

export function isOperationsCapabilityWritable(capabilityId) {
  const capability = getOperationsCapability(capabilityId);
  return Boolean(capability && !capability.readOnly);
}

export default OPERATIONS_CAPABILITY_CATALOG;
