import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { createOrganization } from "@/lib/organizations/createOrganization";

export async function createAccountingClient({
  accountingFirmId,
  clientName,
  tenantId,
  templateId,

  legalName = null,
  industry = null,
  address = null,
  country = "Thailand",

  contactName = null,
  contactEmail = null,
  contactPhone = null,
  position = null,
  whatsapp = null,

  taxId = null,
  vatNumber = null,

  assignedAccountantId = null,
  assignedAccountantName = null,
  assignedReviewerId = null,
  assignedReviewerName = null,

  monthlyFee = 0,
  billingDay = 1,
  servicePackage = "Standard",

  bookkeepingEnabled = true,
  vatEnabled = true,
  payrollEnabled = false,
  taxEnabled = true,
  reportingEnabled = true,
  auditEnabled = false,

  vatFrequency = "MONTHLY",
  payrollFrequency = "MONTHLY",
  accountingStandard = "TFRS",
  yearEndDate = null,

  contractStartDate = null,
  renewalDate = null,
}) {

  const organization =
    await createOrganization({
      name: clientName,
      organizationType: "client_company",
      tenantId,
      templateId,
    });

  await supabaseAdmin
    .from("organizations")
    .update({
      legal_name: legalName,
      industry,
      address,
      country,
      organization_status: "ACTIVE",
    })
    .eq("id", organization.id);

  const relationship =
    await supabaseAdmin
      .from("organization_relationships")
      .insert({
        source_organization_id: accountingFirmId,
        target_organization_id: organization.id,
        relationship_type: "accounting_provider",
        status: "ACTIVE",
      })
      .select()
      .single();

  if (relationship.error) {
    throw relationship.error;
  }

  const profile =
    await supabaseAdmin
      .from("accounting_client_profiles")
      .insert({
        organization_id: organization.id,
        accounting_firm_id: accountingFirmId,
        assigned_accountant_id:
          assignedAccountantId ||
          "195662f5-496d-4a34-b49e-ce7c5bb31824",
        assigned_accountant_name:
          assignedAccountantName ||
          "Patric",
        assigned_reviewer_id:
          assignedReviewerId ||
          "195662f5-496d-4a34-b49e-ce7c5bb31824",
        assigned_reviewer_name:
          assignedReviewerName ||
          "Patric",
        contact_name: contactName,
        contact_email: contactEmail,
        contact_phone: contactPhone,
        position,
        whatsapp,
        tax_id: taxId,
        vat_number: vatNumber,
        status: "ACTIVE",
      })
      .select()
      .single();

  if (profile.error) {
    throw profile.error;
  }

  const engagement =
    await supabaseAdmin
      .from("accounting_engagements")
      .insert({
        organization_id: organization.id,
        accounting_firm_id: accountingFirmId,
        monthly_fee: monthlyFee,
        billing_day: billingDay,
        service_package: servicePackage,
        bookkeeping_enabled: bookkeepingEnabled,
        vat_enabled: vatEnabled,
        payroll_enabled: payrollEnabled,
        tax_enabled: taxEnabled,
        reporting_enabled: reportingEnabled,
        audit_enabled: auditEnabled,
        vat_frequency: vatFrequency,
        payroll_frequency: payrollFrequency,
        accounting_standard: accountingStandard,
        year_end_date: yearEndDate || null,
        contract_start_date: contractStartDate || null,
        renewal_date: renewalDate || null,
        status: "ACTIVE",
      })
      .select()
      .single();

  if (engagement.error) {
    throw engagement.error;
  }

  return {
    organization,
    relationship: relationship.data,
    profile: profile.data,
    engagement: engagement.data,
  };
}
