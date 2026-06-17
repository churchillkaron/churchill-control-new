"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function Input({ label, value, setValue, type = "text" }) {
  return (
    <div>
      <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-white/35">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full rounded-2xl border border-white/10 bg-black/30 p-4 text-white outline-none"
      />
    </div>
  );
}

function Toggle({ label, value, setValue }) {
  return (
    <button
      type="button"
      onClick={() => setValue(!value)}
      className={`rounded-2xl border px-4 py-3 text-sm ${
        value
          ? "border-violet-500/40 bg-violet-500/20 text-violet-100"
          : "border-white/10 bg-black/30 text-white/45"
      }`}
    >
      {label}
    </button>
  );
}

export default function CreateAccountingClientPage() {
  const router = useRouter();

  const searchParams =
    useSearchParams();

  const accountingFirmId =
    searchParams.get("accountingFirmId");

  const tenantId =
    searchParams.get("tenantId");

  const [clientName, setClientName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [industry, setIndustry] = useState("restaurant");
  const [address, setAddress] = useState("");
  const [country, setCountry] = useState("Thailand");

  const [contactName, setContactName] = useState("");
  const [position, setPosition] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");

  const [taxId, setTaxId] = useState("");
  const [vatNumber, setVatNumber] = useState("");

  const [assignedAccountantName, setAssignedAccountantName] = useState("");
  const [assignedReviewerName, setAssignedReviewerName] = useState("");

  const [monthlyFee, setMonthlyFee] = useState("");
  const [billingDay, setBillingDay] = useState("1");
  const [servicePackage, setServicePackage] = useState("Standard");

  const [bookkeepingEnabled, setBookkeepingEnabled] = useState(true);
  const [vatEnabled, setVatEnabled] = useState(true);
  const [payrollEnabled, setPayrollEnabled] = useState(false);
  const [taxEnabled, setTaxEnabled] = useState(true);
  const [reportingEnabled, setReportingEnabled] = useState(true);
  const [auditEnabled, setAuditEnabled] = useState(false);

  const [vatFrequency, setVatFrequency] = useState("MONTHLY");
  const [payrollFrequency, setPayrollFrequency] = useState("MONTHLY");
  const [accountingStandard, setAccountingStandard] = useState("TFRS");
  const [yearEndDate, setYearEndDate] = useState("");
  const [contractStartDate, setContractStartDate] = useState("");
  const [renewalDate, setRenewalDate] = useState("");

  const [loading, setLoading] = useState(false);

  async function createClient() {
    if (!accountingFirmId) {

      alert(
        "No active accounting organization selected"
      );

      return;

    }

    try {
      setLoading(true);

      const response = await fetch("/api/accounting/clients/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          accountingFirmId:

          tenantId,

          clientName,
          legalName,
          industry,
          address,
          country,

          contactName,
          position,
          contactEmail,
          contactPhone,
          whatsapp,

          taxId,
          vatNumber,

          assignedAccountantName,
          assignedReviewerName,

          monthlyFee: Number(monthlyFee || 0),
          billingDay: Number(billingDay || 1),
          servicePackage,

          bookkeepingEnabled,
          vatEnabled,
          payrollEnabled,
          taxEnabled,
          reportingEnabled,
          auditEnabled,

          vatFrequency,
          payrollFrequency,
          accountingStandard,
          yearEndDate,
          contractStartDate,
          renewalDate,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        alert(result.error);
        return;
      }

      router.push(
        `/workspace/${accountingFirmId}`
      );
      router.refresh();
    } catch (error) {
      console.error(error);
      alert("Failed to create client");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#030712] p-8 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.35em] text-violet-300">
            WR Accounting Onboarding
          </p>
          <h1 className="mt-4 text-5xl font-light">
            Create Accounting Client
          </h1>
        </div>

        <div className="space-y-8 rounded-[36px] border border-white/10 bg-white/[0.035] p-8">
          <section>
            <h2 className="mb-5 text-2xl font-light">Company</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <Input label="Trading Name" value={clientName} setValue={setClientName} />
              <Input label="Legal Name" value={legalName} setValue={setLegalName} />
              <Input label="Industry" value={industry} setValue={setIndustry} />
              <Input label="Tax ID" value={taxId} setValue={setTaxId} />
              <Input label="VAT Number" value={vatNumber} setValue={setVatNumber} />
              <Input label="Country" value={country} setValue={setCountry} />
              <div className="md:col-span-2">
                <Input label="Address" value={address} setValue={setAddress} />
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-5 text-2xl font-light">Contact</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <Input label="Contact Name" value={contactName} setValue={setContactName} />
              <Input label="Position" value={position} setValue={setPosition} />
              <Input label="Email" value={contactEmail} setValue={setContactEmail} />
              <Input label="Phone" value={contactPhone} setValue={setContactPhone} />
              <Input label="Line / WhatsApp" value={whatsapp} setValue={setWhatsapp} />
            </div>
          </section>

          <section>
            <h2 className="mb-5 text-2xl font-light">Engagement</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <Input label="Assigned Accountant" value={assignedAccountantName} setValue={setAssignedAccountantName} />
              <Input label="Assigned Reviewer" value={assignedReviewerName} setValue={setAssignedReviewerName} />
              <Input label="Monthly Fee (THB)" value={monthlyFee} setValue={setMonthlyFee} type="number" />
              <Input label="Billing Day (1-31)" value={billingDay} setValue={setBillingDay} type="number" />
              <Input label="Service Package" value={servicePackage} setValue={setServicePackage} />
              <Input label="Contract Start Date" value={contractStartDate} setValue={setContractStartDate} type="date" />
              <Input label="Renewal Date" value={renewalDate} setValue={setRenewalDate} type="date" />
            </div>
          </section>

          <section>
            <h2 className="mb-5 text-2xl font-light">Services</h2>
            <div className="flex flex-wrap gap-3">
              <Toggle label="Bookkeeping" value={bookkeepingEnabled} setValue={setBookkeepingEnabled} />
              <Toggle label="VAT Filing" value={vatEnabled} setValue={setVatEnabled} />
              <Toggle label="Payroll" value={payrollEnabled} setValue={setPayrollEnabled} />
              <Toggle label="Corporate Tax" value={taxEnabled} setValue={setTaxEnabled} />
              <Toggle label="Reporting" value={reportingEnabled} setValue={setReportingEnabled} />
              <Toggle label="Audit Support" value={auditEnabled} setValue={setAuditEnabled} />
            </div>
          </section>

          <section>
            <h2 className="mb-5 text-2xl font-light">Compliance</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <Input label="VAT Frequency" value={vatFrequency} setValue={setVatFrequency} />
              <Input label="Payroll Frequency" value={payrollFrequency} setValue={setPayrollFrequency} />
              <Input label="Accounting Standard" value={accountingStandard} setValue={setAccountingStandard} />
              <Input label="Year End Date" value={yearEndDate} setValue={setYearEndDate} type="date" />
            </div>
          </section>

          <div className="flex justify-end">
            <button
              onClick={createClient}
              disabled={loading || !clientName}
              className="rounded-2xl bg-violet-600 px-8 py-4 text-white disabled:opacity-40"
            >
              {loading ? "Creating..." : "Create Client"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
