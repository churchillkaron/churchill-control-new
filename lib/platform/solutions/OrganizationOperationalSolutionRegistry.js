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

export const SOLUTION_DEFINITIONS = Object.freeze([
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
    id: "field-service",
    priority: 59,
    aliases: Object.freeze([
      "field-service", "cleaning", "commercial-cleaning", "residential-cleaning",
      "hvac", "air-conditioning", "aircon-service", "inspection", "inspection-service",
      "equipment-service", "appliance-service", "repair-service", "mobile-service",
      "technician-service", "maintenance-service", "installation-service",
    ]),
    eyebrow: "Installed operational solution",
    title: "Field Service Operations",
    description: "Coordinate customer bookings, service orders, dispatch, technician execution, evidence and follow-up.",
    items: Object.freeze([
      Object.freeze({ id: "field-service-command", label: "Service Control", description: "Open the field-service operating workspace.", icon: "command", route: "/workspace/:organizationId/operations/industry/field-service" }),
      Object.freeze({ id: "work-orders", label: "Service Orders", description: "Authorise and track accountable customer service work.", icon: "orders", route: "/workspace/:organizationId/operations/work-orders" }),
      Object.freeze({ id: "appointments", label: "Appointments", description: "Manage committed service windows.", icon: "reservations", route: "/workspace/:organizationId/operations/appointment-windows" }),
      Object.freeze({ id: "dispatch", label: "Dispatch", description: "Dispatch work to available field resources.", icon: "dispatch", route: "/workspace/:organizationId/operations/dispatch" }),
      Object.freeze({ id: "evidence", label: "Completion Evidence", description: "Capture proof, completion and customer sign-off.", icon: "records", route: "/workspace/:organizationId/operations/completion-evidence" }),
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
    id: "education",
    priority: 66,
    aliases: Object.freeze([
      "education", "school", "academy", "college", "university", "kindergarten",
      "nursery-school", "training-centre", "training-center", "learning-centre", "learning-center",
    ]),
    eyebrow: "Installed operational solution",
    title: "Education Operations",
    description: "Coordinate the school day, timetable execution, rooms, staff responsibility, handoffs and safeguarding incidents.",
    items: Object.freeze([
      Object.freeze({ id: "education-command", label: "School Day Control", description: "Open the education operating workspace.", icon: "command", route: "/workspace/:organizationId/operations/industry/education" }),
      Object.freeze({ id: "schedule", label: "Timetable Operations", description: "Coordinate classes, activities and operating windows.", icon: "reservations", route: "/workspace/:organizationId/operations/work-schedules" }),
      Object.freeze({ id: "rooms", label: "Rooms & Spaces", description: "Reserve classrooms, labs and shared spaces.", icon: "rooms", route: "/workspace/:organizationId/operations/resource-reservations" }),
      Object.freeze({ id: "incidents", label: "Safeguarding & Incidents", description: "Capture, triage and escalate operational incidents.", icon: "incidents", route: "/workspace/:organizationId/operations/incidents" }),
    ]),
  }),
  Object.freeze({
    id: "automotive",
    priority: 67,
    aliases: Object.freeze([
      "automotive", "mechanic", "garage", "workshop", "auto-repair", "car-repair",
      "vehicle-service", "auto-service", "motorcycle-repair", "body-shop", "service-centre", "service-center",
    ]),
    eyebrow: "Installed operational solution",
    title: "Automotive Service Operations",
    description: "Run vehicle intake, diagnosis, bay assignment, repair, quality inspection and customer handover.",
    items: Object.freeze([
      Object.freeze({ id: "automotive-command", label: "Workshop Control", description: "Open the automotive workshop operating workspace.", icon: "command", route: "/workspace/:organizationId/operations/industry/automotive" }),
      Object.freeze({ id: "intake", label: "Vehicle Intake", description: "Capture concerns and authorize workshop work.", icon: "orders", route: "/workspace/:organizationId/operations/work-requests" }),
      Object.freeze({ id: "jobs", label: "Workshop Jobs", description: "Control active repairs and accountable work.", icon: "orders", route: "/workspace/:organizationId/operations/work-orders" }),
      Object.freeze({ id: "inspection", label: "Quality Inspection", description: "Inspect, hold and release completed work.", icon: "records", route: "/workspace/:organizationId/operations/quality-inspections" }),
    ]),
  }),
  Object.freeze({
    id: "logistics",
    priority: 69,
    aliases: Object.freeze([
      "logistics", "transport", "transportation", "delivery", "courier", "freight",
      "shipping", "last-mile", "haulage",
    ]),
    eyebrow: "Installed operational solution",
    title: "Logistics Operations",
    description: "Plan loads, route work, dispatch resources, control custody handoffs and prove delivery.",
    items: Object.freeze([
      Object.freeze({ id: "logistics-command", label: "Transport Control", description: "Open transport and dispatch operations.", icon: "command", route: "/workspace/:organizationId/operations/industry/logistics" }),
      Object.freeze({ id: "dispatch", label: "Dispatch", description: "Assign and release transport work.", icon: "dispatch", route: "/workspace/:organizationId/operations/dispatch" }),
      Object.freeze({ id: "routing", label: "Routing", description: "Plan operational routes and sequence.", icon: "dispatch", route: "/workspace/:organizationId/operations/routing" }),
      Object.freeze({ id: "proof", label: "Delivery Evidence", description: "Capture delivery proof and handoff evidence.", icon: "records", route: "/workspace/:organizationId/operations/completion-evidence" }),
    ]),
  }),
  Object.freeze({
    id: "facilities",
    priority: 71,
    aliases: Object.freeze([
      "facilities", "facility-management", "facility-services", "maintenance", "fm",
      "plant-maintenance", "building-services",
    ]),
    eyebrow: "Installed operational solution",
    title: "Facilities Operations",
    description: "Run reactive requests, planned maintenance, inspections, contractors, equipment and service evidence.",
    items: Object.freeze([
      Object.freeze({ id: "facilities-command", label: "Facilities Control", description: "Open property and maintenance operations.", icon: "command", route: "/workspace/:organizationId/operations/industry/facilities" }),
      Object.freeze({ id: "requests", label: "Service Requests", description: "Capture operational facility demand.", icon: "orders", route: "/workspace/:organizationId/operations/work-requests" }),
      Object.freeze({ id: "maintenance", label: "Maintenance Work", description: "Authorize and control maintenance execution.", icon: "maintenance", route: "/workspace/:organizationId/operations/work-orders" }),
      Object.freeze({ id: "equipment", label: "Equipment", description: "Monitor operational equipment and downtime.", icon: "maintenance", route: "/workspace/:organizationId/operations/equipment" }),
    ]),
  }),
  Object.freeze({
    id: "professional-services",
    priority: 72,
    aliases: Object.freeze([
      "professional-services", "consulting", "consultancy", "legal", "law-firm", "advisory",
      "architecture", "design-firm", "engineering-consultancy",
    ]),
    eyebrow: "Installed operational solution",
    title: "Professional Services Operations",
    description: "Control client delivery from intake and staffing through approvals, evidence and SLA recovery.",
    items: Object.freeze([
      Object.freeze({ id: "services-command", label: "Client Delivery Control", description: "Open the professional-services operating workspace.", icon: "command", route: "/workspace/:organizationId/operations/industry/professional-services" }),
      Object.freeze({ id: "delivery", label: "Active Client Work", description: "Review and progress accountable delivery.", icon: "orders", route: "/workspace/:organizationId/operations/work-items" }),
      Object.freeze({ id: "approvals", label: "Approvals", description: "Control client and internal approvals.", icon: "records", route: "/workspace/:organizationId/operations/operational-approvals" }),
      Object.freeze({ id: "sla", label: "Service Levels", description: "Review commitments and breached service levels.", icon: "records", route: "/workspace/:organizationId/operations/service-level-breaches" }),
    ]),
  }),
  Object.freeze({
    id: "rental-fleet",
    priority: 73,
    aliases: Object.freeze([
      "rental", "car-rental", "vehicle-rental", "equipment-rental", "bike-rental", "marine-rental",
      "fleet", "fleet-management", "vehicle-fleet", "equipment-hire",
    ]),
    eyebrow: "Installed operational solution",
    title: "Rental & Fleet Operations",
    description: "Control availability, reservations, inspection, custody handoff, returns, damage evidence and maintenance.",
    items: Object.freeze([
      Object.freeze({ id: "rental-command", label: "Fleet & Handover Control", description: "Open rental and fleet operations.", icon: "command", route: "/workspace/:organizationId/operations/industry/rental-fleet" }),
      Object.freeze({ id: "availability", label: "Availability", description: "Review operational asset availability.", icon: "inventory", route: "/workspace/:organizationId/operations/resource-availability" }),
      Object.freeze({ id: "reservations", label: "Reservations", description: "Reserve vehicles or equipment.", icon: "reservations", route: "/workspace/:organizationId/operations/resource-reservations" }),
      Object.freeze({ id: "handover", label: "Handover & Return", description: "Control custody transfer and return evidence.", icon: "handoff", route: "/workspace/:organizationId/operations/handoffs" }),
    ]),
  }),
  Object.freeze({
    id: "salon-spa",
    priority: 74,
    aliases: Object.freeze([
      "salon", "spa", "beauty", "wellness", "hair-salon", "nail-salon",
      "massage", "barber", "barbershop", "aesthetic-clinic", "wellness-centre", "wellness-center",
    ]),
    eyebrow: "Installed operational solution",
    title: "Salon & Spa Operations",
    description: "Run appointments, staff/resource assignment, service delivery, checkout and rebooking.",
    items: Object.freeze([
      Object.freeze({ id: "salon-command", label: "Appointment & Service Control", description: "Open salon and spa operations.", icon: "command", route: "/workspace/:organizationId/operations/industry/salon-spa" }),
      Object.freeze({ id: "appointments", label: "Appointments", description: "Manage booked service windows.", icon: "reservations", route: "/workspace/:organizationId/operations/appointment-windows" }),
      Object.freeze({ id: "services", label: "Today’s Services", description: "Run active assigned client services.", icon: "service", route: "/workspace/:organizationId/operations/work-items" }),
      Object.freeze({ id: "checkout", label: "Checkout", description: "Take payment and issue receipts.", icon: "pos", route: "/workspace/:organizationId/operations/pos" }),
    ]),
  }),
  Object.freeze({
    id: "security",
    priority: 75,
    aliases: Object.freeze([
      "security", "guarding", "security-services", "security-company", "guard-service",
      "patrol", "manned-guarding", "loss-prevention",
    ]),
    eyebrow: "Installed operational solution",
    title: "Security Operations",
    description: "Run posts, patrols, incidents, escalation, shift handoff and evidence.",
    items: Object.freeze([
      Object.freeze({ id: "security-command", label: "Security Control", description: "Open security operations.", icon: "command", route: "/workspace/:organizationId/operations/industry/security" }),
      Object.freeze({ id: "patrols", label: "Patrols", description: "Run scheduled patrols and security rounds.", icon: "dispatch", route: "/workspace/:organizationId/operations/operational-runs" }),
      Object.freeze({ id: "incidents", label: "Incidents", description: "Triage and resolve security incidents.", icon: "incidents", route: "/workspace/:organizationId/operations/incidents" }),
      Object.freeze({ id: "handoffs", label: "Shift Handoffs", description: "Transfer accountability between shifts.", icon: "handoff", route: "/workspace/:organizationId/operations/handoffs" }),
    ]),
  }),
  Object.freeze({
    id: "accounting-practice",
    priority: 64,
    aliases: Object.freeze([
      "accounting-practice", "accounting-firm", "accounting-firms", "bookkeeping",
      "bookkeeper", "tax-practice", "tax-firm", "audit-firm", "accountancy",
    ]),
    eyebrow: "Installed operational solution",
    title: "Accounting Practice Operations",
    description: "Coordinate multi-client work, close calendars, evidence requests, review, approvals and delivery without duplicating client ledgers.",
    items: Object.freeze([
      Object.freeze({ id: "accounting-command", label: "Client Work & Close Control", description: "Open accounting-practice operations.", icon: "command", route: "/workspace/:organizationId/operations/industry/accounting-practice" }),
      Object.freeze({ id: "client-work", label: "Client Work", description: "Review active accounting and close work.", icon: "orders", route: "/workspace/:organizationId/operations/work-items" }),
      Object.freeze({ id: "review", label: "Review & Approvals", description: "Control review and sign-off.", icon: "records", route: "/workspace/:organizationId/operations/operational-approvals" }),
      Object.freeze({ id: "deadlines", label: "Close & Filing Calendar", description: "Coordinate recurring deadlines and commitments.", icon: "reservations", route: "/workspace/:organizationId/operations/work-schedules" }),
    ]),
  }),
  Object.freeze({
    id: "agency",
    priority: 65,
    aliases: Object.freeze([
      "agency", "creative-agency", "marketing-agency", "digital-agency",
      "production-company", "media-agency", "advertising-agency", "design-agency",
    ]),
    eyebrow: "Installed operational solution",
    title: "Agency Operations",
    description: "Run briefs, client delivery, production, approvals and deadlines across project and creative work.",
    items: Object.freeze([
      Object.freeze({ id: "agency-command", label: "Client Delivery & Production Control", description: "Open agency operations.", icon: "command", route: "/workspace/:organizationId/operations/industry/agency" }),
      Object.freeze({ id: "delivery", label: "Active Client Delivery", description: "Review active accountable work.", icon: "orders", route: "/workspace/:organizationId/operations/work-items" }),
      Object.freeze({ id: "approvals", label: "Client Approvals", description: "Run internal and customer approval gates.", icon: "records", route: "/workspace/:organizationId/operations/operational-approvals" }),
      Object.freeze({ id: "creative", label: "Creative Production", description: "Open Avantiqo Creative production.", icon: "command", route: "/workspace/:organizationId/creative" }),
    ]),
  }),
  Object.freeze({
    id: "food-production",
    priority: 65,
    aliases: Object.freeze([
      "food-production", "central-kitchen", "commissary", "bakery", "food-manufacturing",
      "food-manufacturer", "food-factory", "catering-production",
    ]),
    eyebrow: "Installed operational solution",
    title: "Food Production Operations",
    description: "Coordinate production runs, quality and completion while recipes, inventory and costing remain canonical in Supply Chain.",
    items: Object.freeze([
      Object.freeze({ id: "food-production-command", label: "Production & Quality Control", description: "Open food production operations.", icon: "command", route: "/workspace/:organizationId/operations/industry/food-production" }),
      Object.freeze({ id: "runs", label: "Production Runs", description: "Control active production execution.", icon: "orders", route: "/workspace/:organizationId/operations/operational-runs" }),
      Object.freeze({ id: "quality", label: "Quality Control", description: "Review inspections, holds and corrective action.", icon: "records", route: "/workspace/:organizationId/operations/quality-checks" }),
      Object.freeze({ id: "batches", label: "Recipes & Batches", description: "Open canonical production truth.", icon: "inventory", route: "/workspace/:organizationId/supply-chain/production" }),
    ]),
  }),
  Object.freeze({
    id: "car-wash",
    priority: 65,
    aliases: Object.freeze([
      "car-wash", "carwash", "auto-wash", "vehicle-wash", "detailing",
      "auto-detailing", "car-detailing", "vehicle-detailing",
    ]),
    eyebrow: "Installed operational solution",
    title: "Car Wash Operations",
    description: "Run vehicle intake, queue, bay assignment, service execution, inspection, checkout and handover.",
    items: Object.freeze([
      Object.freeze({ id: "carwash-command", label: "Vehicle Queue & Bay Control", description: "Open car-wash operations.", icon: "command", route: "/workspace/:organizationId/operations/industry/car-wash" }),
      Object.freeze({ id: "intake", label: "Vehicle Intake", description: "Capture vehicle and selected service.", icon: "orders", route: "/workspace/:organizationId/operations/work-requests" }),
      Object.freeze({ id: "queue", label: "Live Queue", description: "Control waiting vehicles and bay flow.", icon: "dispatch", route: "/workspace/:organizationId/operations/queue-entries" }),
      Object.freeze({ id: "checkout", label: "Checkout", description: "Take payment and issue receipts.", icon: "pos", route: "/workspace/:organizationId/operations/pos" }),
    ]),
  }),
  Object.freeze({
    id: "artist-agency",
    priority: 68,
    aliases: Object.freeze([
      "artist-agency",
      "booking-agency",
      "talent-agency",
      "music-agency",
      "artist-management",
      "cole-ley",
    ]),
    eyebrow: "Installed operational solution",
    title: "Artist Agency Operations",
    description: "Run opportunities, holds, offers, contracts, confirmations, advancing, routing and settlement handoff from one booking record.",
    items: Object.freeze([
      Object.freeze({ id: "artist-agency-command", label: "Booking Desk", description: "Run the artist booking pipeline, holds, contracts, routing and show execution.", icon: "command", route: "/workspace/:organizationId/operations/industry/artist-agency" }),
    ]),
  }),

  Object.freeze({
    id: "property-management",
    priority: 69,
    aliases: Object.freeze([
      "property-management", "property-manager", "property-services", "property", "building-management",
      "condominium", "condo-management", "strata-management", "estate-management",
      "commercial-property", "residential-property",
    ]),
    eyebrow: "Installed operational solution",
    title: "Property Management Operations",
    description: "Coordinate tenant and property requests, maintenance, inspections, contractors, service levels and completion evidence.",
    items: Object.freeze([
      Object.freeze({ id: "property-command", label: "Property Operations", description: "Open property and facility service control.", icon: "command", route: "/workspace/:organizationId/operations/industry/property-management" }),
      Object.freeze({ id: "requests", label: "Property Requests", description: "Capture tenant, owner and property service demand.", icon: "orders", route: "/workspace/:organizationId/operations/work-requests" }),
      Object.freeze({ id: "maintenance", label: "Maintenance Work", description: "Authorize and coordinate accountable property work.", icon: "maintenance", route: "/workspace/:organizationId/operations/work-orders" }),
      Object.freeze({ id: "inspections", label: "Inspections", description: "Run property and completion inspections.", icon: "records", route: "/workspace/:organizationId/operations/quality-inspections" }),
    ]),
  }),
  Object.freeze({
    id: "agriculture",
    priority: 69,
    aliases: Object.freeze([
      "agriculture", "farm", "farming", "horticulture", "plantation", "livestock",
      "aquaculture", "agri-business", "agribusiness",
    ]),
    eyebrow: "Installed operational solution",
    title: "Agriculture Operations",
    description: "Coordinate farm cycles, field work, equipment, inspections, evidence and exception recovery.",
    items: Object.freeze([
      Object.freeze({ id: "agriculture-command", label: "Farm Operations", description: "Open farm and production-cycle control.", icon: "command", route: "/workspace/:organizationId/operations/industry/agriculture" }),
      Object.freeze({ id: "runs", label: "Operational Cycles", description: "Run field, crop, livestock or production cycles.", icon: "production", route: "/workspace/:organizationId/operations/operational-runs" }),
      Object.freeze({ id: "work", label: "Field Work", description: "Coordinate assigned operational work.", icon: "orders", route: "/workspace/:organizationId/operations/work-items" }),
      Object.freeze({ id: "quality", label: "Inspection & Quality", description: "Inspect output, conditions and completion.", icon: "records", route: "/workspace/:organizationId/operations/quality-inspections" }),
    ]),
  }),
  Object.freeze({
    id: "warehouse-distribution",
    priority: 69,
    aliases: Object.freeze([
      "warehouse", "warehousing", "warehouse-distribution", "distribution", "distribution-center",
      "distribution-centre", "fulfillment", "fulfilment", "fulfillment-center", "fulfilment-centre",
      "3pl", "third-party-logistics",
    ]),
    eyebrow: "Installed operational solution",
    title: "Warehouse & Distribution Operations",
    description: "Coordinate receiving, internal movement, picking, packing, staging, dispatch and warehouse exceptions.",
    items: Object.freeze([
      Object.freeze({ id: "warehouse-command", label: "Warehouse Flow", description: "Open warehouse execution control.", icon: "command", route: "/workspace/:organizationId/operations/industry/warehouse-distribution" }),
      Object.freeze({ id: "queue", label: "Warehouse Queue", description: "Control inbound, replenishment and fulfillment work.", icon: "dispatch", route: "/workspace/:organizationId/operations/queue-entries" }),
      Object.freeze({ id: "work", label: "Active Warehouse Work", description: "Coordinate picking, packing and internal movement.", icon: "orders", route: "/workspace/:organizationId/operations/work-items" }),
      Object.freeze({ id: "inventory", label: "Inventory", description: "Open canonical stock and warehouse truth.", icon: "inventory", route: "/workspace/:organizationId/supply-chain/inventory" }),
    ]),
  }),

  Object.freeze({
    id: "veterinary",
    priority: 69,
    aliases: Object.freeze([
      "veterinary", "vet", "vet-clinic", "veterinary-clinic", "animal-hospital",
      "animal-care", "pet-care", "pet-clinic", "animal-clinic",
    ]),
    eyebrow: "Installed operational solution",
    title: "Veterinary & Animal Care Operations",
    description: "Coordinate appointments, intake, animal-care work, rooms, equipment, handoffs and operational evidence.",
    items: Object.freeze([
      Object.freeze({ id: "vet-command", label: "Veterinary Operations", description: "Open veterinary service-flow control.", icon: "command", route: "/workspace/:organizationId/operations/industry/veterinary" }),
      Object.freeze({ id: "appointments", label: "Appointments", description: "Plan committed animal-care service windows.", icon: "reservations", route: "/workspace/:organizationId/operations/appointment-windows" }),
      Object.freeze({ id: "queue", label: "Patient Queue", description: "Coordinate intake and service flow.", icon: "dispatch", route: "/workspace/:organizationId/operations/queue-entries" }),
      Object.freeze({ id: "work", label: "Animal-care Work", description: "Run assigned treatment and care work.", icon: "orders", route: "/workspace/:organizationId/operations/work-items" }),
    ]),
  }),
  Object.freeze({
    id: "fitness-recreation",
    priority: 69,
    aliases: Object.freeze([
      "gym", "fitness", "fitness-center", "fitness-centre", "health-club", "sports-club",
      "recreation", "recreation-center", "recreation-centre", "sports-center", "sports-centre",
    ]),
    eyebrow: "Installed operational solution",
    title: "Fitness & Recreation Operations",
    description: "Coordinate classes, sessions, trainer work, check-ins, spaces, equipment and service exceptions.",
    items: Object.freeze([
      Object.freeze({ id: "fitness-command", label: "Fitness Operations", description: "Open fitness and recreation service control.", icon: "command", route: "/workspace/:organizationId/operations/industry/fitness-recreation" }),
      Object.freeze({ id: "schedule", label: "Classes & Sessions", description: "Plan operational class and session windows.", icon: "reservations", route: "/workspace/:organizationId/operations/work-schedules" }),
      Object.freeze({ id: "checkin", label: "Check-in Queue", description: "Coordinate arrivals and active service flow.", icon: "dispatch", route: "/workspace/:organizationId/operations/queue-entries" }),
      Object.freeze({ id: "resources", label: "Spaces & Equipment", description: "Control studios, courts and operational resources.", icon: "maintenance", route: "/workspace/:organizationId/operations/resources" }),
    ]),
  }),
  Object.freeze({
    id: "childcare",
    priority: 69,
    aliases: Object.freeze([
      "childcare", "daycare", "day-care", "child-care", "preschool", "creche",
      "early-childhood", "early-childhood-center", "early-childhood-centre",
    ]),
    eyebrow: "Installed operational solution",
    title: "Childcare & Daycare Operations",
    description: "Coordinate arrival, room work, activities, controlled handoffs, safety checks and operational incidents.",
    items: Object.freeze([
      Object.freeze({ id: "childcare-command", label: "Childcare Operations", description: "Open childcare day-flow control.", icon: "command", route: "/workspace/:organizationId/operations/industry/childcare" }),
      Object.freeze({ id: "day-flow", label: "Day Flow", description: "Coordinate arrival, room flow and pickup handoff.", icon: "dispatch", route: "/workspace/:organizationId/operations/queue-entries" }),
      Object.freeze({ id: "room-work", label: "Rooms & Activities", description: "Run assigned room and activity work.", icon: "orders", route: "/workspace/:organizationId/operations/work-items" }),
      Object.freeze({ id: "safety", label: "Safety & Incidents", description: "Capture checks and operational safety exceptions.", icon: "incidents", route: "/workspace/:organizationId/operations/incidents" }),
    ]),
  }),
  Object.freeze({
    id: "cleaning-services",
    priority: 69,
    aliases: Object.freeze([
      "cleaning-services", "cleaning-company", "janitorial", "janitorial-services",
      "facility-cleaning", "contract-cleaning", "housekeeping-services",
    ]),
    eyebrow: "Installed operational solution",
    title: "Cleaning & Janitorial Operations",
    description: "Coordinate recurring and ad-hoc cleaning, schedules, routing, checklists, inspections and proof of completion.",
    items: Object.freeze([
      Object.freeze({ id: "cleaning-command", label: "Cleaning Operations", description: "Open cleaning service control.", icon: "command", route: "/workspace/:organizationId/operations/industry/cleaning-services" }),
      Object.freeze({ id: "work", label: "Cleaning Work", description: "Run assigned site and room cleaning work.", icon: "orders", route: "/workspace/:organizationId/operations/work-items" }),
      Object.freeze({ id: "schedule", label: "Cleaning Schedule", description: "Plan recurring and ad-hoc cleaning windows.", icon: "reservations", route: "/workspace/:organizationId/operations/work-schedules" }),
      Object.freeze({ id: "quality", label: "Inspection & Proof", description: "Inspect work and retain completion evidence.", icon: "records", route: "/workspace/:organizationId/operations/quality-inspections" }),
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

function organizationClassification(organization) {
  const values = [];

  for (const field of ORGANIZATION_CLASSIFICATION_FIELDS) {
    collectClassificationValues(organization?.[field], values);
  }

  const normalizedValues = new Set(
    values
      .map(normalize)
      .filter(Boolean),
  );

  const tokens = new Set(normalizedValues);
  for (const value of normalizedValues) {
    for (const part of value.split("-")) {
      if (part) tokens.add(part);
    }
  }

  return { normalizedValues, tokens };
}

function exactSolutionMatch(normalizedValues, solution) {
  return solution.aliases.some((alias) => normalizedValues.has(normalize(alias)));
}

function fuzzySolutionMatch(tokens, solution) {
  return solution.aliases.some((alias) => {
    const normalizedAlias = normalize(alias);
    if (!normalizedAlias) return false;
    if (tokens.has(normalizedAlias)) return true;

    for (const token of tokens) {
      if (token.length >= normalizedAlias.length && token.includes(normalizedAlias)) {
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

  const classification = organizationClassification(organization || {});
  const exactMatches = SOLUTION_DEFINITIONS.filter((solution) =>
    exactSolutionMatch(classification.normalizedValues, solution)
  );
  const candidateSolutions = exactMatches.length
    ? exactMatches
    : SOLUTION_DEFINITIONS.filter((solution) =>
        fuzzySolutionMatch(classification.tokens, solution)
      );

  const matched = candidateSolutions
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

  if (matched.length) return matched;

  return [{
    id: "general-operations",
    eyebrow: "Adaptive operational solution",
    title: "Business Operations",
    description: "A complete governed operating workspace is available even before a dedicated industry pack is installed.",
    items: [
      {
        id: "general-command",
        label: "Business Operations Control",
        description: "Run work, scheduling, responsibility, quality, incidents and evidence.",
        icon: "command",
        href: resolveRoute("/workspace/:organizationId/operations/industry/general-operations", organizationId),
      },
      {
        id: "work-orders",
        label: "Work Orders",
        description: "Authorize and control accountable operational work.",
        icon: "orders",
        href: resolveRoute("/workspace/:organizationId/operations/work-orders", organizationId),
      },
      {
        id: "schedule",
        label: "Work Schedule",
        description: "Plan work and operating windows.",
        icon: "reservations",
        href: resolveRoute("/workspace/:organizationId/operations/work-schedules", organizationId),
      },
      {
        id: "incidents",
        label: "Incidents",
        description: "Capture and recover operational disruption.",
        icon: "incidents",
        href: resolveRoute("/workspace/:organizationId/operations/incidents", organizationId),
      },
    ],
  }];
}

export function getOperationalSolutionDefinitions() {
  return SOLUTION_DEFINITIONS;
}

export default Object.freeze({
  resolveOrganizationOperationalSolutions,
  getOperationalSolutionDefinitions,
});
