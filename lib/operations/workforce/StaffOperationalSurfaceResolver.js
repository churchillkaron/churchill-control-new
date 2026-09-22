function clean(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalize(value) {
  return clean(value)
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(value, words) {
  const text = ` ${normalize(value)} `;
  return words.some((word) => text.includes(` ${normalize(word)} `));
}

function industryText(organization = {}) {
  return [
    organization.industry,
    organization.industry_code,
    organization.organization_type,
    organization.business_type,
    organization.sector,
    organization.vertical,
  ].filter(Boolean).join(" ");
}

function staffText(staff = {}, role = null) {
  return [
    role,
    staff.role,
    staff.position,
    staff.department,
    staff.metadata?.role,
    staff.metadata?.position,
    staff.metadata?.department,
  ].filter(Boolean).join(" ");
}

function workspace(organizationId, route) {
  const id = encodeURIComponent(String(organizationId || ""));
  return `/workspace/${id}${route}`;
}

export function resolveStaffOperationalSurface({
  organizationId,
  organization,
  staff,
  role,
} = {}) {
  if (!organizationId) {
    return {
      id: "my-day",
      label: "My Day",
      description: "Open assigned work for today.",
      href: "/staff/my-day",
      kind: "fallback",
    };
  }

  const job = staffText(staff, role);
  const industry = industryText(organization);
  const combined = `${job} ${industry}`;

  if (includesAny(job, ["owner", "administrator", "admin", "general manager", "manager", "supervisor", "director", "operations manager"])) {
    return {
      id: "operations-control",
      label: "Operations Control",
      description: "Open the broader operating control center.",
      href: workspace(organizationId, "/operations"),
      kind: "manager",
    };
  }

  if (includesAny(job, ["waiter", "server", "floor staff", "service staff"]) && includesAny(industry, ["restaurant", "bar", "cafe", "nightclub", "venue"])) {
    return {
      id: "waiter-pos",
      label: "Order / Waiter POS",
      description: "Open tables, seats and customer orders.",
      href: workspace(organizationId, "/operations/pos?view=waiter"),
      kind: "frontline",
    };
  }

  if (includesAny(job, ["chef", "cook", "kitchen", "kitchen staff", "expo", "expeditor", "dishwasher"])) {
    return {
      id: "kitchen",
      label: "Kitchen",
      description: "Open active production and kitchen tickets.",
      href: workspace(organizationId, "/operations/kitchen"),
      kind: "frontline",
    };
  }

  if (includesAny(job, ["housekeeper", "room attendant", "housekeeping"]) && includesAny(industry, ["hotel", "resort", "hostel", "accommodation", "lodging", "guesthouse"])) {
    return {
      id: "housekeeping",
      label: "Housekeeping",
      description: "Open room turnover, cleaning and readiness work.",
      href: workspace(organizationId, "/operations/housekeeping"),
      kind: "frontline",
    };
  }

  if (includesAny(job, ["front desk", "receptionist", "reception", "guest service", "concierge"]) && includesAny(industry, ["hotel", "resort", "hostel", "accommodation"])) {
    return {
      id: "front-desk",
      label: "Front Desk",
      description: "Open arrivals, stays, guests and front-desk work.",
      href: workspace(organizationId, "/operations/front-desk"),
      kind: "frontline",
    };
  }

  if (includesAny(job, ["night auditor", "night audit"])) {
    return {
      id: "night-audit",
      label: "Night Audit",
      description: "Open governed end-of-day hotel operations.",
      href: workspace(organizationId, "/operations/night-audit"),
      kind: "frontline",
    };
  }

  if (includesAny(job, ["bartender", "bar staff", "barback", "club staff"]) && includesAny(industry, ["bar", "pub", "nightclub", "venue", "entertainment"])) {
    return {
      id: "bar-pos",
      label: "Bar POS",
      description: "Open active orders, checkout and bar service execution.",
      href: workspace(organizationId, "/operations/pos"),
      kind: "frontline",
    };
  }

  if (includesAny(job, ["bartender", "bar staff", "barback", "host", "hostess", "venue staff", "event staff"]) && includesAny(industry, ["restaurant", "bar", "pub", "nightclub", "venue", "entertainment"])) {
    return {
      id: "venue-service",
      label: includesAny(job, ["bartender", "bar staff", "barback"]) ? "Bar / POS" : "Venue Work",
      description: "Open live service, selling and venue execution.",
      href: workspace(organizationId, includesAny(job, ["bartender", "bar staff", "barback"]) ? "/operations/pos" : "/operations/venue"),
      kind: "frontline",
    };
  }

  if (includesAny(job, ["nurse", "doctor", "physician", "medical assistant", "clinical assistant", "care assistant", "dental assistant", "dentist", "pharmacist"]) && includesAny(industry, ["healthcare", "hospital", "clinic", "medical", "dental"])) {
    return {
      id: "healthcare-work",
      label: "Patient Flow",
      description: "Open healthcare operational flow and assigned service work.",
      href: workspace(organizationId, "/operations/healthcare"),
      kind: "frontline",
    };
  }

  if (includesAny(job, ["veterinarian", "veterinary surgeon", "vet nurse", "veterinary nurse", "vet assistant", "veterinary assistant", "animal care assistant", "kennel attendant", "animal attendant"]) && includesAny(industry, ["veterinary", "vet", "animal", "pet"])) {
    return {
      id: "veterinary-work",
      label: "Animal Care Work",
      description: "Open assigned animal-care, intake, room and handoff work.",
      href: workspace(organizationId, "/operations/work-items"),
      kind: "frontline",
    };
  }

  if (includesAny(job, ["personal trainer", "trainer", "fitness instructor", "gym instructor", "coach", "sports coach", "class instructor", "recreation attendant"]) && includesAny(industry, ["gym", "fitness", "sports", "recreation", "health club"])) {
    return {
      id: "fitness-work",
      label: "Sessions & Classes",
      description: "Open assigned sessions, classes and facility work.",
      href: workspace(organizationId, "/operations/work-items"),
      kind: "frontline",
    };
  }

  if (includesAny(job, ["gym receptionist", "fitness receptionist", "club receptionist", "member services", "membership desk"]) && includesAny(industry, ["gym", "fitness", "sports", "recreation", "health club"])) {
    return {
      id: "fitness-checkin",
      label: "Check-in Desk",
      description: "Open member arrival and active service queue.",
      href: workspace(organizationId, "/operations/queue-entries"),
      kind: "frontline",
    };
  }

  if (includesAny(job, ["childcare worker", "daycare worker", "early childhood educator", "preschool teacher", "nursery practitioner", "nursery assistant", "childcare assistant"]) && includesAny(industry, ["childcare", "daycare", "preschool", "creche", "early childhood"])) {
    return {
      id: "childcare-work",
      label: "Childcare Day",
      description: "Open assigned room, activity, supervision and handoff work.",
      href: workspace(organizationId, "/operations/work-items"),
      kind: "frontline",
    };
  }

  if (includesAny(job, ["cleaner", "cleaning technician", "janitor", "janitorial worker", "housekeeper", "cleaning operative", "cleaning supervisor"]) && includesAny(industry, ["cleaning", "janitorial", "contract cleaning", "commercial cleaning", "facility cleaning"])) {
    return {
      id: "cleaning-work",
      label: "Cleaning Work",
      description: "Open assigned site cleaning, checklist and completion-evidence work.",
      href: workspace(organizationId, "/operations/work-items"),
      kind: "frontline",
    };
  }

  if (includesAny(job, ["accountant", "bookkeeper", "auditor", "tax preparer", "tax accountant", "accounts assistant", "accounting assistant"]) && includesAny(industry, ["accounting", "bookkeeping", "tax", "audit", "accountancy"])) {
    return {
      id: "client-accounting-work",
      label: "Client Work",
      description: "Open assigned accounting, close, review and evidence work.",
      href: "/staff/my-day",
      kind: "frontline",
    };
  }

  if (includesAny(job, ["designer", "creative", "copywriter", "editor", "producer", "production coordinator", "media buyer", "campaign specialist"]) && includesAny(industry, ["agency", "creative", "marketing", "media", "advertising", "design"])) {
    return {
      id: "agency-work",
      label: "Client Delivery",
      description: "Open assigned briefs, production, approvals and delivery work.",
      href: "/staff/my-day",
      kind: "frontline",
    };
  }

  if (includesAny(job, ["booking agent", "talent agent", "booking coordinator", "artist coordinator", "tour coordinator", "artist assistant"])) {
    return {
      id: "booking-work",
      label: "Booking Work",
      description: "Open holds, offers, confirmations, advancing and show work.",
      href: workspace(organizationId, "/operations/industry/artist-agency"),
      kind: "frontline",
    };
  }

  if (includesAny(job, ["car wash attendant", "wash attendant", "detailer", "car detailer", "vehicle detailer"])) {
    return {
      id: "car-wash-work",
      label: "Vehicle Queue",
      description: "Open assigned wash/detail work and vehicle flow.",
      href: workspace(organizationId, "/operations/work-items"),
      kind: "frontline",
    };
  }

  if (includesAny(job, ["rental agent", "rental associate", "fleet coordinator", "fleet assistant", "vehicle handover", "rental coordinator"]) && includesAny(industry, ["rental", "fleet", "vehicle hire", "equipment hire"])) {
    return {
      id: "rental-work",
      label: "Rental & Fleet Work",
      description: "Open reservations, handovers, returns and fleet readiness work.",
      href: workspace(organizationId, "/operations/industry/rental-fleet"),
      kind: "frontline",
    };
  }

  if (includesAny(job, ["consultant", "analyst", "paralegal", "case worker", "professional assistant", "client service specialist"]) && includesAny(industry, ["professional", "consulting", "legal", "advisory"])) {
    return {
      id: "professional-work",
      label: "Client Work",
      description: "Open assigned client, case, review and delivery work.",
      href: "/staff/my-day",
      kind: "frontline",
    };
  }

  if (includesAny(job, ["facilities technician", "facility technician", "maintenance engineer", "building engineer", "maintenance worker"]) && includesAny(industry, ["facilities", "facility", "building services"])) {
    return {
      id: "facilities-work",
      label: "Facilities Work",
      description: "Open maintenance, inspection and facility service work.",
      href: workspace(organizationId, "/operations/industry/facilities"),
      kind: "frontline",
    };
  }

  if (includesAny(job, ["cashier", "retail associate", "sales associate", "shop assistant"])) {
    return {
      id: "pos",
      label: "POS",
      description: "Open selling, checkout and receipt operations.",
      href: workspace(organizationId, "/operations/pos"),
      kind: "frontline",
    };
  }

  if (includesAny(job, ["construction worker", "site worker", "labourer", "laborer", "carpenter", "electrician", "plumber", "welder", "site technician"])) {
    return {
      id: "site-work",
      label: "Site Work",
      description: "Open assigned construction, inspection and completion work.",
      href: "/staff/my-day",
      kind: "frontline",
    };
  }

  if (includesAny(combined, ["mechanic", "automotive technician", "service technician", "garage technician", "workshop technician"])) {
    return {
      id: "workshop-jobs",
      label: "Workshop Jobs",
      description: "Open assigned vehicle repair and workshop work.",
      href: workspace(organizationId, "/operations/work-items"),
      kind: "frontline",
    };
  }

  if (includesAny(job, ["teacher", "educator", "teaching assistant", "school staff", "tutor", "instructor"])) {
    return {
      id: "school-work",
      label: "School Day",
      description: "Open today’s classes, supervision and assigned school work.",
      href: workspace(organizationId, "/operations/industry/education"),
      kind: "frontline",
    };
  }

  if (includesAny(job, ["driver", "courier", "delivery driver", "dispatcher", "transport operator"])) {
    return {
      id: "transport-work",
      label: includesAny(job, ["dispatcher"]) ? "Dispatch" : "Transport Work",
      description: includesAny(job, ["dispatcher"])
        ? "Open the live dispatch board."
        : "Open assigned transport and delivery work.",
      href: workspace(organizationId, includesAny(job, ["dispatcher"]) ? "/operations/dispatch" : "/operations/work-items"),
      kind: "frontline",
    };
  }

  if (includesAny(job, ["security guard", "guard", "security officer", "patrol officer"])) {
    return {
      id: "security-work",
      label: "Security Work",
      description: "Open patrol, post and incident work.",
      href: workspace(organizationId, "/operations/industry/security"),
      kind: "frontline",
    };
  }

  if (includesAny(job, ["property technician", "building technician", "maintenance technician", "caretaker", "property officer", "facility technician"]) && includesAny(industry, ["property", "condominium", "condo", "building", "estate"])) {
    return {
      id: "property-work",
      label: "Property Work",
      description: "Open assigned property maintenance, inspection and service work.",
      href: workspace(organizationId, "/operations/work-items"),
      kind: "frontline",
    };
  }

  if (includesAny(job, ["farm worker", "farmhand", "field worker", "agricultural worker", "farm operator", "tractor operator", "grower", "livestock worker", "aquaculture worker"])) {
    return {
      id: "farm-work",
      label: "Farm Work",
      description: "Open assigned field, farm-cycle and inspection work.",
      href: workspace(organizationId, "/operations/operational-runs"),
      kind: "frontline",
    };
  }

  if (includesAny(job, ["warehouse operator", "warehouse worker", "picker", "packer", "pick pack", "receiving clerk", "goods receiver", "forklift operator", "inventory handler", "storekeeper"])) {
    return {
      id: "warehouse-work",
      label: "Warehouse Work",
      description: "Open receiving, movement, picking, packing and staging work.",
      href: workspace(organizationId, "/operations/work-items"),
      kind: "frontline",
    };
  }

  if (includesAny(job, ["factory operator", "machine operator", "production operator", "production worker", "assembler"])) {
    return {
      id: "production-work",
      label: "Production Work",
      description: "Open active production runs and assigned work.",
      href: workspace(organizationId, "/operations/operational-runs"),
      kind: "frontline",
    };
  }

  if (includesAny(job, ["cleaner", "cleaning technician", "pest technician", "field technician", "hvac technician", "inspector", "installer", "service engineer"])) {
    return {
      id: "field-work",
      label: "Field Work",
      description: "Open assigned service work and evidence.",
      href: "/staff/my-day",
      kind: "frontline",
    };
  }

  if (includesAny(industry, ["salon", "spa", "beauty", "barber"]) && includesAny(job, ["stylist", "therapist", "barber", "beautician", "nail technician", "massage therapist"])) {
    return {
      id: "service-appointments",
      label: "Today’s Services",
      description: "Open assigned appointments and client services.",
      href: workspace(organizationId, "/operations/work-items"),
      kind: "frontline",
    };
  }

  return {
    id: "my-day",
    label: "My Day",
    description: "Open assigned work for today.",
    href: "/staff/my-day",
    kind: "fallback",
  };
}

export default resolveStaffOperationalSurface;
