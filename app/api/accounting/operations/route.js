export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { loadAccountingClients } from "@/lib/accounting/loadAccountingClients";
import { getServerCurrentUser } from "@/lib/auth/getServerCurrentUser";
import { getOrganizationWorkspace } from "@/lib/organizations/getOrganizationWorkspace";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId");

    if (!organizationId) {
      return NextResponse.json({ success: false, error: "Missing organizationId" }, { status: 400 });
    }

    // ----- Get current logged-in staff -----
    const user = await getServerCurrentUser();
    if (!user?.email) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const workspace = await getOrganizationWorkspace({ userEmail: user.email, organizationId });
    const staff = workspace?.access?.staff || {};
    const role = (workspace?.access?.role || "STAFF").toUpperCase();
    const staffId = staff?.id;

    const isOwner = ["OWNER","SUPER_ADMIN","PARTNER","ADMIN"].includes(role);

    // Load all clients for this firm
    const clients = await loadAccountingClients({ organizationId });

    // Filter clients dynamically based on staff
    let filteredClients = clients;
    if (!isOwner && staffId) {
      filteredClients = clients.filter(client => {
        const profile = client.profile || {};
        return (
          profile.assigned_accountant_id === staffId ||
          profile.assigned_reviewer_id === staffId
        );
      });
    }

    // Compute operations metrics
    const activeClients = filteredClients.filter(c => c?.profile?.status === "ACTIVE" || c?.status === "active");
    const monthlyRevenue = filteredClients.reduce((sum, c) => sum + Number(c?.engagement?.monthly_fee || 0), 0);
    const taxClients = filteredClients.filter(c => c?.engagement?.tax_enabled || c?.engagement?.vat_enabled);
    const payrollClients = filteredClients.filter(c => c?.engagement?.payroll_enabled);
    const unassignedClients = filteredClients.filter(c => !c?.profile?.assigned_accountant_id || !c?.profile?.assigned_reviewer_id);

    const teamMap = {};
    filteredClients.forEach(c => {
      const profile = c.profile || {};
      const accountant = profile.assigned_accountant_name || "Unassigned";
      if (!teamMap[accountant]) {
        teamMap[accountant] = { name: accountant, clients: 0, tax: 0, payroll: 0 };
      }
      teamMap[accountant].clients += 1;
      if (c?.engagement?.tax_enabled || c?.engagement?.vat_enabled) teamMap[accountant].tax += 1;
      if (c?.engagement?.payroll_enabled) teamMap[accountant].payroll += 1;
    });

    const operations = {
      totalClients: filteredClients.length,
      activeClients: activeClients.length,
      monthlyRevenue,
      taxDeadlines: taxClients.length,
      payrollRuns: payrollClients.length,
      complianceAlerts: unassignedClients.length,
      team: Object.values(teamMap),
    };

    const workQueue = [
      { title: "Missing client documents", count: 0, tone: "neutral" },
      { title: "VAT filings due", count: taxClients.length, tone: "warning" },
      { title: "Payroll runs due", count: payrollClients.length, tone: "warning" },
      { title: "Clients missing assignment", count: unassignedClients.length, tone: "danger" },
    ];

    return NextResponse.json({ success: true, operations, clients: filteredClients, workQueue });

  } catch (error) {
    console.error("ACCOUNTING OPERATIONS ERROR", error);
    return NextResponse.json({ success: false, error: error?.message || "Failed to load accounting operations" }, { status: 500 });
  }
}
