import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const { resolveStaffOperationalSurface } = await import(
  pathToFileURL(path.resolve("lib/operations/workforce/StaffOperationalSurfaceResolver.js"))
);

const organizationId = "org-123";

function route({ role, position, department, industry }) {
  return resolveStaffOperationalSurface({
    organizationId,
    role,
    staff: { role, position, department },
    organization: { industry },
  });
}

test("restaurant waiter opens waiter POS", () => {
  const result = route({ role: "staff", position: "Waiter", industry: "restaurant" });
  assert.equal(result.id, "waiter-pos");
  assert.equal(result.href, "/workspace/org-123/operations/pos?view=waiter");
});

test("kitchen staff open kitchen execution", () => {
  assert.equal(route({ position: "Chef", industry: "restaurant" }).href, "/workspace/org-123/operations/kitchen");
});

test("hotel room attendant opens housekeeping", () => {
  assert.equal(route({ position: "Room Attendant", industry: "hotel" }).href, "/workspace/org-123/operations/housekeeping");
});

test("hotel receptionist opens front desk", () => {
  assert.equal(route({ position: "Receptionist", industry: "hotel" }).href, "/workspace/org-123/operations/front-desk");
});

test("mechanic opens workshop work items", () => {
  assert.equal(route({ position: "Mechanic", industry: "automotive" }).href, "/workspace/org-123/operations/work-items");
});

test("teacher opens education operations", () => {
  assert.equal(route({ position: "Teacher", industry: "school" }).href, "/workspace/org-123/operations/industry/education");
});

test("driver gets assigned transport work while dispatcher gets dispatch", () => {
  assert.equal(route({ position: "Driver", industry: "logistics" }).href, "/workspace/org-123/operations/work-items");
  assert.equal(route({ position: "Dispatcher", industry: "logistics" }).href, "/workspace/org-123/operations/dispatch");
});

test("security guard opens security work", () => {
  assert.equal(route({ position: "Security Guard", industry: "security" }).href, "/workspace/org-123/operations/industry/security");
});

test("manager opens broader operations control", () => {
  assert.equal(route({ role: "manager", industry: "restaurant" }).href, "/workspace/org-123/operations");
});

test("unknown frontline role safely falls back to My Day", () => {
  const result = route({ position: "Specialist", industry: "aquaculture" });
  assert.equal(result.id, "my-day");
  assert.equal(result.href, "/staff/my-day");
});

test("property technician opens assigned property work", () => {
  const result = route({ position: "Property Technician", industry: "property-management" });
  assert.equal(result.id, "property-work");
  assert.equal(result.href, "/workspace/org-123/operations/work-items");
});

test("farm worker opens agriculture operational runs", () => {
  const result = route({ position: "Farm Worker", industry: "agriculture" });
  assert.equal(result.id, "farm-work");
  assert.equal(result.href, "/workspace/org-123/operations/operational-runs");
});

test("warehouse picker opens warehouse execution work", () => {
  const result = route({ position: "Picker", industry: "warehouse" });
  assert.equal(result.id, "warehouse-work");
  assert.equal(result.href, "/workspace/org-123/operations/work-items");
});

test("bar staff opens bar POS", () => {
  const result = route({ position: "Bartender", industry: "nightclub" });
  assert.equal(result.id, "bar-pos");
  assert.equal(result.href, "/workspace/org-123/operations/pos");
});

test("construction trade uses governed Staff My Day", () => {
  const result = route({ position: "Electrician", industry: "construction" });
  assert.equal(result.id, "site-work");
  assert.equal(result.href, "/staff/my-day");
});

test("accounting staff gets client-work execution", () => {
  const result = route({ position: "Bookkeeper", industry: "accounting-firm" });
  assert.equal(result.id, "client-accounting-work");
  assert.equal(result.href, "/staff/my-day");
});

test("creative agency staff gets client-delivery execution", () => {
  const result = route({ position: "Graphic Designer", industry: "creative-agency" });
  assert.equal(result.id, "agency-work");
  assert.equal(result.href, "/staff/my-day");
});

test("artist booking staff opens booking desk", () => {
  const result = route({ position: "Booking Coordinator", industry: "artist-agency" });
  assert.equal(result.id, "booking-work");
  assert.equal(result.href, "/workspace/org-123/operations/industry/artist-agency");
});

test("car wash staff opens vehicle work", () => {
  const result = route({ position: "Car Detailer", industry: "car-wash" });
  assert.equal(result.id, "car-wash-work");
  assert.equal(result.href, "/workspace/org-123/operations/work-items");
});

test("rental staff opens rental fleet operations", () => {
  const result = route({ position: "Rental Agent", industry: "rental-fleet" });
  assert.equal(result.id, "rental-work");
  assert.equal(result.href, "/workspace/org-123/operations/industry/rental-fleet");
});

test("professional services staff uses governed Staff My Day", () => {
  const result = route({ position: "Paralegal", industry: "professional-services" });
  assert.equal(result.id, "professional-work");
  assert.equal(result.href, "/staff/my-day");
});

test("healthcare nurse opens patient-flow operations", () => {
  const result = route({ position: "Nurse", industry: "clinic" });
  assert.equal(result.id, "healthcare-work");
  assert.equal(result.href, "/workspace/org-123/operations/healthcare");
});

test("facilities technician opens facilities control", () => {
  const result = route({ position: "Facilities Technician", industry: "facilities-management" });
  assert.equal(result.id, "facilities-work");
  assert.equal(result.href, "/workspace/org-123/operations/industry/facilities");
});

test("veterinary assistant opens animal-care work", () => {
  const result = route({ position: "Veterinary Assistant", industry: "vet-clinic" });
  assert.equal(result.id, "veterinary-work");
  assert.equal(result.href, "/workspace/org-123/operations/work-items");
});

test("fitness trainer opens assigned session work", () => {
  const result = route({ position: "Personal Trainer", industry: "gym" });
  assert.equal(result.id, "fitness-work");
  assert.equal(result.href, "/workspace/org-123/operations/work-items");
});

test("fitness member services opens check-in queue", () => {
  const result = route({ position: "Member Services", industry: "fitness-center" });
  assert.equal(result.id, "fitness-checkin");
  assert.equal(result.href, "/workspace/org-123/operations/queue-entries");
});

test("childcare worker opens childcare execution", () => {
  const result = route({ position: "Childcare Worker", industry: "daycare" });
  assert.equal(result.id, "childcare-work");
  assert.equal(result.href, "/workspace/org-123/operations/work-items");
});

test("cleaning company housekeeper does not route to hotel housekeeping", () => {
  const result = route({ position: "Housekeeper", industry: "commercial-cleaning" });
  assert.equal(result.id, "cleaning-work");
  assert.equal(result.href, "/workspace/org-123/operations/work-items");
});
