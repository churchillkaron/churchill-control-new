const profile = (value) => Object.freeze({
  ...value,
  capabilityIds: Object.freeze([...(value.capabilityIds || [])]),
  primaryActions: Object.freeze([...(value.primaryActions || [])].map(Object.freeze)),
  stages: Object.freeze([...(value.stages || [])].map((stage) => Object.freeze({
    ...stage,
    capabilityIds: Object.freeze([...(stage.capabilityIds || [])]),
  }))),
  tools: Object.freeze([...(value.tools || [])].map(Object.freeze)),
});

export const OPERATIONS_INDUSTRY_PROFILES = Object.freeze({
  retail: profile({
    id: "retail",
    eyebrow: "Retail Operations",
    title: "Retail Control",
    description: "Sell, fulfill and resolve store work from one operating view. Transaction execution stays in POS while inventory, customer, commercial and finance truth remain with their canonical owners.",
    capabilityIds: [
      "order-capture", "checkout", "receipts", "cash-control", "fulfillment-dispatch",
      "queue-entries", "work-items", "assignments", "incidents", "exceptions-holds",
    ],
    primaryActions: [
      { id: "sell", label: "Start selling", route: "/operations/pos" },
      { id: "inventory", label: "Check inventory", route: "/supply-chain/inventory" },
      { id: "customers", label: "Customers", route: "/commercial/customers" },
    ],
    stages: [
      { id: "sale", label: "Sell", description: "Basket and customer sale", capabilityIds: ["order-capture"], route: "/operations/pos" },
      { id: "settle", label: "Settle", description: "Payment and receipt", capabilityIds: ["checkout", "receipts"], route: "/operations/pos" },
      { id: "fulfill", label: "Fulfill", description: "Pickup or delivery handoff", capabilityIds: ["fulfillment-dispatch"], route: "/operations/fulfillment-dispatch" },
      { id: "exceptions", label: "Resolve exceptions", description: "Holds, incidents and waiting work", capabilityIds: ["exceptions-holds", "incidents", "queue-entries"], route: "/operations/queue-entries" },
    ],
    tools: [
      { id: "orders", label: "Orders", description: "Review transaction history and open orders", route: "/operations/pos?view=orders" },
      { id: "receipts", label: "Receipts", description: "Receipt history and reissue", route: "/operations/pos?view=receipts" },
      { id: "cash", label: "Cash control", description: "Drawer and shift reconciliation", route: "/operations/pos?view=cash-control" },
      { id: "inventory", label: "Inventory", description: "Stock, movement and replenishment", route: "/supply-chain/inventory" },
      { id: "commercial", label: "Commercial", description: "Pricing, campaigns and customers", route: "/commercial" },
      { id: "finance", label: "Finance", description: "Accounting and settlement control", route: "/finance" },
    ],
    boundary: "Operations owns transaction execution and fulfillment. Supply Chain owns stock; Commercial owns customer and pricing truth; Finance owns accounting and settlement records.",
  }),

  fieldService: profile({
    id: "field-service",
    eyebrow: "Field Service Operations",
    title: "Service Control",
    description: "Run the technician day as one service lifecycle: committed visit → dispatch → perform work → capture evidence → resolve follow-up. Recurring service definitions remain configurable rather than industry hardcoded.",
    capabilityIds: [
      "work-orders", "appointment-windows", "dispatch", "assignments", "queue-entries",
      "work-items", "completion-evidence", "checklists", "incidents", "exceptions-holds",
      "escalations", "corrective-actions",
    ],
    primaryActions: [
      { id: "dispatch", label: "Open dispatch board", route: "/operations/dispatch" },
      { id: "orders", label: "Service orders", route: "/operations/work-orders" },
      { id: "appointments", label: "Appointments", route: "/operations/appointment-windows" },
    ],
    stages: [
      { id: "committed", label: "Committed", description: "Approved service work and appointment windows", capabilityIds: ["work-orders", "appointment-windows"], route: "/operations/work-orders" },
      { id: "dispatch", label: "Dispatch", description: "Assign and release work", capabilityIds: ["dispatch", "assignments", "queue-entries"], route: "/operations/dispatch" },
      { id: "execute", label: "On site", description: "Active technician execution", capabilityIds: ["work-items", "checklists"], route: "/operations/work-items" },
      { id: "prove", label: "Complete & prove", description: "Evidence and acknowledgement", capabilityIds: ["completion-evidence"], route: "/operations/completion-evidence" },
      { id: "followup", label: "Follow-up", description: "Exceptions, escalation and corrective action", capabilityIds: ["exceptions-holds", "incidents", "escalations", "corrective-actions"], route: "/operations/exceptions-holds" },
    ],
    tools: [
      { id: "plans", label: "Service plans", description: "Recurring customer commitments", route: "/operations/field-service/service-plans" },
      { id: "templates", label: "Execution protocols", description: "Dynamic inspection and evidence templates", route: "/operations/field-service/execution-templates" },
      { id: "reports", label: "Service reports", description: "Completed work and customer-safe evidence", route: "/operations/field-service/service-reports" },
      { id: "queue", label: "Service queue", description: "Waiting and unassigned service work", route: "/operations/queue-entries" },
      { id: "evidence", label: "Completion evidence", description: "Proof of service and sign-off", route: "/operations/completion-evidence" },
      { id: "incidents", label: "Incidents", description: "Field disruption and recovery", route: "/operations/incidents" },
    ],
    boundary: "Operations owns service execution, dispatch, responsibility and evidence. Service/Commercial own customer commitments; People owns workforce authority; Supply Chain owns materials; Finance owns billing and accounting.",
  }),

  construction: profile({
    id: "construction",
    eyebrow: "Project & Field Operations",
    title: "Field Execution Control",
    description: "Move authorized field work from ready-to-start through dispatch, execution, inspection and completion evidence without turning project, procurement or finance data into Operations duplicates.",
    capabilityIds: [
      "work-orders", "queue-entries", "dispatch", "assignments", "work-items", "checklists",
      "completion-evidence", "incidents", "exceptions-holds", "corrective-actions", "quality-checks",
    ],
    primaryActions: [
      { id: "work", label: "Open field work", route: "/operations/work-orders" },
      { id: "dispatch", label: "Dispatch", route: "/operations/dispatch" },
      { id: "incidents", label: "Report incident", route: "/operations/incidents" },
    ],
    stages: [
      { id: "ready", label: "Ready", description: "Authorized work waiting for execution", capabilityIds: ["work-orders", "queue-entries"], route: "/operations/work-orders" },
      { id: "assigned", label: "Assigned", description: "Dispatched field responsibility", capabilityIds: ["dispatch", "assignments"], route: "/operations/dispatch" },
      { id: "execute", label: "Execute", description: "Active field work and procedures", capabilityIds: ["work-items", "checklists"], route: "/operations/work-items" },
      { id: "inspect", label: "Inspect", description: "Quality and exception resolution", capabilityIds: ["quality-checks", "exceptions-holds", "corrective-actions"], route: "/operations/quality-checks" },
      { id: "complete", label: "Complete", description: "Evidence-backed completion", capabilityIds: ["completion-evidence"], route: "/operations/completion-evidence" },
    ],
    tools: [
      { id: "assignments", label: "Assignments", description: "Accountable responsibility", route: "/operations/assignments" },
      { id: "queue", label: "Work queue", description: "Waiting field demand", route: "/operations/queue-entries" },
      { id: "quality", label: "Quality checks", description: "Inspection and release", route: "/operations/quality-checks" },
      { id: "incidents", label: "Incidents", description: "Safety and operating disruption", route: "/operations/incidents" },
      { id: "projects", label: "Projects", description: "Scope, milestones and project governance", route: "/projects" },
      { id: "materials", label: "Supply Chain", description: "Procurement and material availability", route: "/supply-chain" },
    ],
    boundary: "Operations owns accountable field execution. Projects and Commercial own scope and commitments; Supply Chain owns procurement/materials; Finance owns budgets, accounting and settlement.",
  }),

  manufacturing: profile({
    id: "manufacturing",
    eyebrow: "Manufacturing Operations",
    title: "Production Control",
    description: "Run production by exception: release work, execute at work centres, watch quality and downtime, prove completion, then hand material and costing truth to their canonical domains.",
    capabilityIds: [
      "work-orders", "operational-runs", "work-centres", "assignments", "work-items",
      "quality-checks", "quality-inspections", "resource-downtime", "exceptions-holds",
      "corrective-actions", "completion-evidence", "queue-entries",
    ],
    primaryActions: [
      { id: "runs", label: "Production runs", route: "/operations/operational-runs" },
      { id: "work", label: "Work orders", route: "/operations/work-orders" },
      { id: "quality", label: "Quality", route: "/operations/quality-checks" },
    ],
    stages: [
      { id: "release", label: "Release", description: "Authorized production demand", capabilityIds: ["work-orders", "queue-entries"], route: "/operations/work-orders" },
      { id: "run", label: "Run", description: "Active batches and station execution", capabilityIds: ["operational-runs", "work-items", "assignments"], route: "/operations/operational-runs" },
      { id: "quality", label: "Quality", description: "In-process and final checks", capabilityIds: ["quality-checks", "quality-inspections"], route: "/operations/quality-checks" },
      { id: "exceptions", label: "Downtime & holds", description: "Constraints requiring intervention", capabilityIds: ["resource-downtime", "exceptions-holds", "corrective-actions"], route: "/operations/resource-downtime" },
      { id: "complete", label: "Complete", description: "Evidence-backed production completion", capabilityIds: ["completion-evidence"], route: "/operations/completion-evidence" },
    ],
    tools: [
      { id: "centres", label: "Work centres", description: "Stations, lines and equipment capacity", route: "/operations/work-centres" },
      { id: "usage", label: "Material usage", description: "Issue and consume production material", route: "/supply-chain/production/usage" },
      { id: "batches", label: "Output receipt", description: "Receive completed output into stock", route: "/supply-chain/production/batches" },
      { id: "waste", label: "Scrap & waste", description: "Record production losses", route: "/supply-chain/production/waste" },
      { id: "costing", label: "Production costing", description: "Cost and variance accounting", route: "/supply-chain/production/costing" },
      { id: "people", label: "Workforce", description: "Labour coverage and time", route: "/people" },
    ],
    boundary: "Operations owns execution, quality and downtime. Supply Chain owns material/output stock; People owns labour; Finance owns production accounting and variance.",
  }),

  venue: profile({
    id: "venue",
    eyebrow: "Venue Operations",
    title: "Live Venue Control",
    description: "Keep service moving during live trading: sell and settle in POS, route operational work, resolve incidents and preserve accountable handoffs without making event planning part of the execution kernel.",
    capabilityIds: [
      "order-capture", "checkout", "receipts", "cash-control", "queue-entries",
      "work-items", "assignments", "handoffs", "incidents", "escalations", "exceptions-holds",
    ],
    primaryActions: [
      { id: "pos", label: "Open POS", route: "/operations/pos" },
      { id: "queue", label: "Live work queue", route: "/operations/queue-entries" },
      { id: "incident", label: "Report incident", route: "/operations/incidents" },
    ],
    stages: [
      { id: "serve", label: "Serve", description: "Sales, payment and receipts", capabilityIds: ["order-capture", "checkout", "receipts"], route: "/operations/pos" },
      { id: "coordinate", label: "Coordinate", description: "Waiting work and assignments", capabilityIds: ["queue-entries", "assignments", "work-items"], route: "/operations/queue-entries" },
      { id: "handoff", label: "Handoff", description: "Ownership changes during live service", capabilityIds: ["handoffs"], route: "/operations/handoffs" },
      { id: "resolve", label: "Resolve", description: "Incidents, escalation and holds", capabilityIds: ["incidents", "escalations", "exceptions-holds"], route: "/operations/incidents" },
    ],
    tools: [
      { id: "cash", label: "Cash control", description: "Shift and drawer reconciliation", route: "/operations/pos?view=cash-control" },
      { id: "receipts", label: "Receipts", description: "Receipt history and reissue", route: "/operations/pos?view=receipts" },
      { id: "assignments", label: "Assignments", description: "Active responsibility", route: "/operations/assignments" },
      { id: "handoffs", label: "Handoffs", description: "Controlled ownership transfer", route: "/operations/handoffs" },
      { id: "incidents", label: "Incident log", description: "Disruption and recovery", route: "/operations/incidents" },
      { id: "commercial", label: "Commercial events", description: "Campaign and event planning", route: "/commercial" },
    ],
    boundary: "Operations owns live venue execution and incidents. Commercial owns event/campaign planning; Finance owns accounting; People owns workforce authority.",
  }),

  healthcare: profile({
    id: "healthcare",
    eyebrow: "Healthcare Operations",
    title: "Patient Flow Operations",
    description: "Coordinate operational patient flow without turning Operations into the clinical system of record. Clinical workflows remain owned by Healthcare; Operations manages neutral queues, assignments, incidents and service execution visibility.",
    capabilityIds: ["queue-entries", "assignments", "work-items", "handoffs", "incidents", "escalations", "exceptions-holds"],
    primaryActions: [
      { id: "dashboard", label: "Healthcare dashboard", route: "/healthcare/dashboard" },
      { id: "appointments", label: "Appointments", route: "/healthcare/appointments" },
      { id: "queue", label: "Operational queue", route: "/operations/queue-entries" },
    ],
    stages: [
      { id: "arrive", label: "Arrive & queue", description: "Clinical demand enters operational flow", capabilityIds: ["queue-entries"], route: "/operations/queue-entries" },
      { id: "assign", label: "Assign", description: "Accountable service responsibility", capabilityIds: ["assignments"], route: "/operations/assignments" },
      { id: "serve", label: "Coordinate service", description: "Non-clinical execution and handoff", capabilityIds: ["work-items", "handoffs"], route: "/operations/work-items" },
      { id: "resolve", label: "Resolve disruption", description: "Operational incidents and escalations", capabilityIds: ["incidents", "escalations", "exceptions-holds"], route: "/operations/incidents" },
    ],
    tools: [
      { id: "admissions", label: "Admissions", description: "Healthcare-owned admission/discharge", route: "/healthcare/admissions" },
      { id: "beds", label: "Beds & wards", description: "Healthcare-owned capacity state", route: "/healthcare/beds" },
      { id: "pharmacy", label: "Pharmacy", description: "Healthcare-owned medication workflow", route: "/healthcare/pharmacy" },
      { id: "records", label: "Medical records", description: "Controlled clinical records", route: "/healthcare/medical-records" },
      { id: "incidents", label: "Operational incidents", description: "Non-clinical disruption coordination", route: "/operations/incidents" },
      { id: "assignments", label: "Operational assignments", description: "Neutral accountability", route: "/operations/assignments" },
    ],
    boundary: "Healthcare remains authoritative for patients, appointments, admissions, beds, clinical records, pharmacy and clinical decisions. Operations coordinates non-clinical execution only.",
  }),
});

export function getOperationsIndustryProfile(id) {
  return OPERATIONS_INDUSTRY_PROFILES[id] || null;
}

export default OPERATIONS_INDUSTRY_PROFILES;
