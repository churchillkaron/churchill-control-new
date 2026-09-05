const ORGANIZATION_CLASSIFICATION_FIELDS = Object.freeze([
  "organization_type",
  "type",
  "industry",
  "industry_code",
  "business_type",
  "business_model",
  "sector",
  "vertical",
  "solution",
  "solution_code",
  "installed_solution",
  "installed_solutions",
  "solutions",
  "capability_packages",
  "name",
]);

const SOLUTION_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "restaurant",
    priority: 10,
    aliases: Object.freeze([
      "restaurant",
      "bar",
      "pub",
      "cafe",
      "coffee-shop",
      "food-service",
      "food-and-beverage",
      "f-and-b",
    ]),
    eyebrow: "Installed operational solution",
    title: "Restaurant Operations",
    description: "Run service from floor and ordering through kitchen production, payment and shift control.",
    items: Object.freeze([
      Object.freeze({ id: "restaurant-command", label: "Restaurant Control", description: "Live restaurant command workspace and service overview.", icon: "command", route: "/workspace/:organizationId/operations/restaurant" }),
      Object.freeze({ id: "stationary-pos", label: "Stationary POS", description: "Sell, manage orders, take payment, issue receipts, control cash and shifts, and coordinate fulfillment from one workspace.", icon: "pos", route: "/workspace/:organizationId/operations/pos" }),
      Object.freeze({ id: "mobile-service", label: "Mobile Service", description: "Take orders and manage guest service from the floor using the restaurant service adapter.", icon: "service", route: "/workspace/:organizationId/operations/pos?view=service" }),
      Object.freeze({ id: "tables", label: "Tables", description: "Open tables, seats and active guest service.", icon: "tables", route: "/workspace/:organizationId/operations/tables" }),
      Object.freeze({ id: "kitchen", label: "Kitchen", description: "Run kitchen tickets, preparation and production state.", icon: "production", route: "/workspace/:organizationId/operations/kitchen" }),
      Object.freeze({ id: "expo", label: "Expo", description: "Coordinate ready items, assembly and service handoff.", icon: "handoff", route: "/workspace/:organizationId/operations/kitchen/expo" }),
    ]),
  }),
  Object.freeze({
    id: "hotel",
    priority: 20,
    aliases: Object.freeze([
      "hotel",
      "resort",
      "accommodation",
      "lodging",
      "guest-house",
      "guesthouse",
    ]),
    eyebrow: "Installed operational solution",
    title: "Hotel Operations",
    description: "Run the complete property operation from reservations and guest stays through group business, offers, rooms, distribution, revenue control and governed end-of-day.",
    items: Object.freeze([
      Object.freeze({ id: "hotel-command", label: "Hotel Control", description: "Open the exception-first property operating overview and live control tower.", icon: "command", route: "/workspace/:organizationId/operations/hotel" }),
      Object.freeze({ id: "front-desk", label: "Front Desk", description: "Work arrivals, in-house guests and departures with governed check-in and checkout controls.", icon: "frontdesk", route: "/workspace/:organizationId/operations/front-desk" }),
      Object.freeze({ id: "reservations", label: "Reservations", description: "Create and review bookings, availability and upcoming stays.", icon: "reservations", route: "/workspace/:organizationId/operations/reservations" }),
      Object.freeze({ id: "groups", label: "Groups & Allotments", description: "Manage group profiles, dated room-type blocks, negotiated rates, pickup and rooming-list linkage.", icon: "reservations", route: "/workspace/:organizationId/operations/group-reservations" }),
      Object.freeze({ id: "guest-stays", label: "Guests & Stays", description: "Manage guest profiles, room assignment and moves, digital arrival, folios, deposits and stay enhancements in one record.", icon: "records", route: "/workspace/:organizationId/operations/stay-control" }),
      Object.freeze({ id: "offers", label: "Offers & Upsells", description: "Publish governed stay enhancements that post accepted value into the guest folio.", icon: "payments", route: "/workspace/:organizationId/operations/hotel-offers" }),
      Object.freeze({ id: "housekeeping", label: "Housekeeping", description: "Coordinate room status, cleaning, turnover and readiness.", icon: "housekeeping", route: "/workspace/:organizationId/operations/housekeeping" }),
      Object.freeze({ id: "channels-rates", label: "Channels & Rates", description: "Control rate plans, inventory, restrictions and governed distribution to connected booking channels.", icon: "inventory", route: "/workspace/:organizationId/operations/channel-manager" }),
      Object.freeze({ id: "revenue", label: "Revenue", description: "Review forward occupancy, ADR, RevPAR and property-level room revenue outlook.", icon: "payments", route: "/workspace/:organizationId/operations/hotel-revenue" }),
      Object.freeze({ id: "night-audit", label: "Night Audit", description: "Close the hotel business date only after operational and folio preflight blockers are resolved.", icon: "records", route: "/workspace/:organizationId/operations/night-audit" }),
      Object.freeze({ id: "maintenance", label: "Maintenance", description: "Track property issues, repairs and operational downtime.", icon: "maintenance", route: "/workspace/:organizationId/operations/maintenance" }),
      Object.freeze({ id: "concierge", label: "Guest Requests", description: "Manage guest promises, concierge requests and service coordination.", icon: "concierge", route: "/workspace/:organizationId/operations/concierge" }),
      Object.freeze({ id: "hotel-setup", label: "Hotel Setup", description: "Configure properties, governed room inventory and legacy room property binding.", icon: "rooms", route: "/workspace/:organizationId/operations/hotel-setup" }),
    ]),
  }),
  Object.freeze({
    id: "retail",
    priority: 30,
    aliases: Object.freeze([
      "retail",
      "shop",
      "store",
      "boutique",
      "supermarket",
    ]),
    eyebrow: "Installed operational solution",
    title: "Retail Operations",
    description: "Run selling, checkout, payment, receipts, shifts and inventory execution.",
    items: Object.freeze([
      Object.freeze({ id: "retail-command", label: "Retail Control", description: "Open the retail operating workspace.", icon: "command", route: "/workspace/:organizationId/operations/retail" }),
      Object.freeze({ id: "stationary-pos", label: "Stationary POS", description: "Sell, manage orders, take payment, issue receipts, control cash and shifts, and coordinate fulfillment from one workspace.", icon: "pos", route: "/workspace/:organizationId/operations/pos" }),
      Object.freeze({ id: "inventory", label: "Inventory", description: "Review stock position, alerts and movement.", icon: "inventory", route: "/workspace/:organizationId/supply-chain/inventory" }),
    ]),
  }),
  Object.freeze({
    id: "healthcare",
    priority: 40,
    aliases: Object.freeze([
      "healthcare",
      "hospital",
      "clinic",
      "medical",
      "dental",
    ]),
    eyebrow: "Installed operational solution",
    title: "Healthcare Operations",
    description: "Coordinate patient flow, appointments, admissions, beds, pharmacy and clinical support operations.",
    items: Object.freeze([
      Object.freeze({ id: "healthcare-command", label: "Healthcare Control", description: "Open the healthcare operating dashboard.", icon: "command", route: "/workspace/:organizationId/operations/healthcare" }),
      Object.freeze({ id: "appointments", label: "Appointments", description: "Manage scheduled patient service and clinical windows.", icon: "reservations", route: "/workspace/:organizationId/healthcare/appointments" }),
      Object.freeze({ id: "admissions", label: "Admissions", description: "Coordinate patient admission and discharge workflows.", icon: "frontdesk", route: "/workspace/:organizationId/healthcare/admissions" }),
      Object.freeze({ id: "beds", label: "Beds & Wards", description: "Monitor capacity, occupancy and ward readiness.", icon: "rooms", route: "/workspace/:organizationId/healthcare/beds" }),
      Object.freeze({ id: "pharmacy", label: "Pharmacy", description: "Run pharmacy service and medication inventory.", icon: "inventory", route: "/workspace/:organizationId/healthcare/pharmacy" }),
      Object.freeze({ id: "medical-records", label: "Medical Records", description: "Open controlled patient record workflows.", icon: "records", route: "/workspace/:organizationId/healthcare/medical-records" }),
      Object.freeze({ id: "billing", label: "Patient Billing", description: "Review healthcare billing and payment workflows.", icon: "payments", route: "/workspace/:organizationId/healthcare/billing" }),
      Object.freeze({ id: "staff", label: "Clinical Staff", description: "Review healthcare staff and operational coverage.", icon: "staff", route: "/workspace/:organizationId/healthcare/staff" }),
    ]),
  }),
  Object.freeze({
    id: "construction",
    priority: 50,
    aliases: Object.freeze([
      "construction",
      "contractor",
      "engineering",
      "building",
    ]),
    eyebrow: "Installed operational solution",
    title: "Construction Operations",
    description: "Coordinate project execution, field work, dispatch, incidents, resources and completion evidence.",
    items: Object.freeze([
      Object.freeze({ id: "construction-command", label: "Project Operations", description: "Open the construction operating workspace.", icon: "command", route: "/workspace/:organizationId/operations/project-execution" }),
      Object.freeze({ id: "work-orders", label: "Work Orders", description: "Authorise and control accountable field work.", icon: "orders", route: "/workspace/:organizationId/operations/work-orders" }),
      Object.freeze({ id: "dispatch", label: "Dispatch", description: "Dispatch work to eligible field resources.", icon: "dispatch", route: "/workspace/:organizationId/operations/dispatch" }),
      Object.freeze({ id: "assignments", label: "Assignments", description: "Coordinate responsibility across active work.", icon: "staff", route: "/workspace/:organizationId/operations/assignments" }),
      Object.freeze({ id: "incidents", label: "Incidents", description: "Capture and resolve field disruption and risk.", icon: "incidents", route: "/workspace/:organizationId/operations/incidents" }),
      Object.freeze({ id: "completion", label: "Completion Evidence", description: "Capture and validate proof of completed work.", icon: "records", route: "/workspace/:organizationId/operations/completion-evidence" }),
    ]),
  }),
  Object.freeze({
    id: "pest-control",
    priority: 60,
    aliases: Object.freeze([
      "pest-control",
      "pestcontrol",
      "pest-management",
    ]),
    eyebrow: "Installed operational solution",
    title: "Field Service Operations",
    description: "Coordinate bookings, dispatch, technicians, service execution, evidence and follow-up.",
    items: Object.freeze([
      Object.freeze({ id: "field-command", label: "Service Control", description: "Open the field-service operating workspace.", icon: "command", route: "/workspace/:organizationId/operations/field-service" }),
      Object.freeze({ id: "work-orders", label: "Service Orders", description: "Authorise and track customer service work.", icon: "orders", route: "/workspace/:organizationId/operations/work-orders" }),
      Object.freeze({ id: "appointments", label: "Appointments", description: "Manage committed service windows.", icon: "reservations", route: "/workspace/:organizationId/operations/appointment-windows" }),
      Object.freeze({ id: "dispatch", label: "Dispatch", description: "Dispatch work to available field resources.", icon: "dispatch", route: "/workspace/:organizationId/operations/dispatch" }),
      Object.freeze({ id: "assignments", label: "Technician Assignments", description: "Coordinate responsibility for active service work.", icon: "staff", route: "/workspace/:organizationId/operations/assignments" }),
      Object.freeze({ id: "evidence", label: "Service Evidence", description: "Capture proof, completion and customer sign-off.", icon: "records", route: "/workspace/:organizationId/operations/completion-evidence" }),
    ]),
  }),
  Object.freeze({
    id: "manufacturing",
    priority: 65,
    aliases: Object.freeze([
      "manufacturing",
      "manufacturer",
      "factory",
      "fabrication",
      "assembly-line",
      "discrete-manufacturing",
      "process-manufacturing",
    ]),
    eyebrow: "Installed operational solution",
    title: "Manufacturing Operations",
    description: "Coordinate work orders, production runs, station execution, quality, downtime and completion.",
    items: Object.freeze([
      Object.freeze({ id: "manufacturing-command", label: "Manufacturing Control", description: "Open the manufacturing operating workspace.", icon: "command", route: "/workspace/:organizationId/operations/manufacturing" }),
      Object.freeze({ id: "work-orders", label: "Work Orders", description: "Authorise and control accountable production work.", icon: "orders", route: "/workspace/:organizationId/operations/work-orders" }),
      Object.freeze({ id: "operational-runs", label: "Production Runs", description: "Coordinate repeatable production batches, rounds and cycles.", icon: "production", route: "/workspace/:organizationId/operations/operational-runs" }),
      Object.freeze({ id: "work-centres", label: "Work Centres", description: "Manage stations, lines and equipment capacity.", icon: "production", route: "/workspace/:organizationId/operations/work-centres" }),
      Object.freeze({ id: "quality-checks", label: "Quality Checks", description: "Execute in-process and final quality checks.", icon: "records", route: "/workspace/:organizationId/operations/quality-checks" }),
      Object.freeze({ id: "resource-downtime", label: "Downtime", description: "Record and resolve equipment and resource downtime.", icon: "maintenance", route: "/workspace/:organizationId/operations/resource-downtime" }),
      Object.freeze({ id: "completion", label: "Completion Evidence", description: "Capture and validate proof of completed production work.", icon: "records", route: "/workspace/:organizationId/operations/completion-evidence" }),
      Object.freeze({ id: "material-usage", label: "Material Usage", description: "Issue and consume materials against production.", icon: "inventory", route: "/workspace/:organizationId/supply-chain/production/usage" }),
    ]),
  }),
  Object.freeze({
    id: "entertainment",
    priority: 70,
    aliases: Object.freeze([
      "entertainment",
      "venue",
      "nightclub",
      "event-venue",
    ]),
    eyebrow: "Installed operational solution",
    title: "Venue Operations",
    description: "Run venue service, selling, shifts, incidents and live operational coordination.",
    items: Object.freeze([
      Object.freeze({ id: "venue-command", label: "Venue Control", description: "Open the venue operating workspace.", icon: "command", route: "/workspace/:organizationId/operations/venue" }),
      Object.freeze({ id: "stationary-pos", label: "Stationary POS", description: "Sell, manage orders, take payment, issue receipts, control cash and shifts, and coordinate fulfillment from one workspace.", icon: "pos", route: "/workspace/:organizationId/operations/pos" }),
      Object.freeze({ id: "incidents", label: "Incidents", description: "Capture and resolve live venue incidents.", icon: "incidents", route: "/workspace/:organizationId/operations/incidents" }),
      Object.freeze({ id: "work-queue", label: "Work Queue", description: "Review waiting and unassigned venue work.", icon: "dispatch", route: "/workspace/:organizationId/operations/queue-entries" }),
    ]),
  }),
]);

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function collectClassificationValues(value, target = []) {
  if (value == null) return target;

  if (Array.isArray(value)) {
    for (const item of value) collectClassificationValues(item, target);
    return target;
  }

  if (typeof value === "object") {
    for (const [key, nestedValue] of Object.entries(value)) {
      target.push(key);
      collectClassificationValues(nestedValue, target);
    }
    return target;
  }

  target.push(value);
  return target;
}

function organizationClassificationTokens(organization) {
  const values = [];

  for (const field of ORGANIZATION_CLASSIFICATION_FIELDS) {
    collectClassificationValues(organization?.[field], values);
  }

  const normalizedValues = values
    .map(normalize)
    .filter(Boolean);

  const tokens = new Set(normalizedValues);

  for (const value of normalizedValues) {
    for (const part of value.split("-")) {
      if (part) tokens.add(part);
    }
  }

  return tokens;
}

function matchesSolution(tokens, solution) {
  return solution.aliases.some((alias) => {
    const normalizedAlias = normalize(alias);
    if (tokens.has(normalizedAlias)) return true;

    for (const token of tokens) {
      if (token.includes(normalizedAlias) || normalizedAlias.includes(token)) {
        return true;
      }
    }

    return false;
  });
}

function resolveRoute(route, organizationId) {
  return String(route || "").replace(
    ":organizationId",
    encodeURIComponent(String(organizationId || "")),
  );
}

export function resolveOrganizationOperationalSolutions({
  organization,
  organizationId,
} = {}) {
  if (!organizationId) return [];

  const tokens = organizationClassificationTokens(organization || {});

  return SOLUTION_DEFINITIONS
    .filter((solution) => matchesSolution(tokens, solution))
    .sort((a, b) => a.priority - b.priority)
    .map((solution) => ({
      id: solution.id,
      eyebrow: solution.eyebrow,
      title: solution.title,
      description: solution.description,
      items: solution.items.map((item) => ({
        ...item,
        href: resolveRoute(item.route, organizationId),
      })),
    }));
}

export function getOperationalSolutionDefinitions() {
  return SOLUTION_DEFINITIONS;
}

export default Object.freeze({
  resolveOrganizationOperationalSolutions,
  getOperationalSolutionDefinitions,
});
