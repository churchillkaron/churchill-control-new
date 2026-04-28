"use client";
import { supabase } from "@/lib/supabase";
import { useEffect, useMemo, useState } from "react";


const TABS = [
  "overview",
  "revenue",
  "expenses",
  "cashflow",
  "invoices",
  "salary",
  "payroll",
  "payout",
  "department",
  "profit",
  "reports",
  "audit",
];

export default function AccountingPage() {
  const [history, setHistory] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [previewItem, setPreviewItem] = useState(null);
  const [actionLoading, setActionLoading] = useState("");
  const [approvals, setApprovals] = useState([]);

useEffect(() => {
  fetchAll();
}, []);

const fetchAll = async () => {
  try {
    setLoading(true);

    const { data: invoiceData, error } = await supabase
      .from("invoices")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("INVOICE ERROR:", error);
    }

    setInvoices(invoiceData || []);
    console.log("INVOICES:", invoiceData);

  } catch (err) {
    console.error("FETCH ERROR:", err);
  }

  setLoading(false);
};

  const latestDay = history[history.length - 1] || {};
const salaryQueue = approvals
  .filter((a) => a.status === "approved_manager")
  .map((a) => ({
    id: a.id,
    vendor: "Salary",
    amount: 0,
    category: "Salary",
    department: "",
    image_url: null,
    status: a.status,
    source_type: "salary",
    staff_id: a.staff_id,
  }));
  // --------------------------------------------------
  // HELPERS
  // --------------------------------------------------
  const getInvoicePreviewUrl = (invoice) => {
  return (
    invoice?.image_url ||
    invoice?.receipt_url ||
    invoice?.file_url ||
    invoice?.document_url ||
    invoice?.url ||
    null
  );
};

  const getInvoicePreviewType = (invoice) => {
    const url = getInvoicePreviewUrl(invoice);
    if (!url) return null;
    return url.toLowerCase().endsWith(".pdf") ? "pdf" : "image";
  };

  const openInvoicePreview = (invoice) => {
    const url = getInvoicePreviewUrl(invoice);
    if (!url) return;

    setPreviewItem({
      type: getInvoicePreviewType(invoice),
      url,
      title: invoice.vendor || "Invoice Preview",
      subtitle: invoice.amount ? `${invoice.amount} THB` : "Invoice",
    });
  };

  // --------------------------------------------------
  // INVOICES
  // --------------------------------------------------
  const apiApprovedExpenses = useMemo(() => {
    return invoices.filter((i) => i.status === "approved");
  }, [invoices]);

  const apiAccountingQueue = useMemo(() => {
    return invoices.filter((i) => i.status === "approved_manager");
  }, [invoices]);

  const apiPendingManager = useMemo(() => {
    return invoices.filter((i) => i.status === "pending_approval");
  }, [invoices]);

  const apiRejected = useMemo(() => {
    return invoices.filter((i) => i.status === "rejected");
  }, [invoices]);

  // --------------------------------------------------
  // STAFF-UPLOADED INVOICE ASSETS
  // --------------------------------------------------
  const assetInvoicesApprovedManager = useMemo(() => {
    return assets.filter(
      (a) => a.category === "invoice" && a.status === "approved_manager"
    );
  }, [assets]);

  const assetInvoicesApproved = useMemo(() => {
    return assets.filter(
      (a) => a.category === "invoice" && a.status === "approved"
    );
  }, [assets]);

  const assetInvoicesPending = useMemo(() => {
    return assets.filter(
      (a) => a.category === "invoice" && a.status === "pending_approval"
    );
  }, [assets]);

  const assetInvoicesRejected = useMemo(() => {
    return assets.filter(
      (a) => a.category === "invoice" && a.status === "rejected"
    );
  }, [assets]);

  const normalizedAccountingQueue = useMemo(() => {
  return invoices
    .filter((i) => i.status === "approved_manager")
    .map((i) => ({
      ...i,
      source_type: "invoice_api",
    }));
}, [invoices]);


  const normalizedApprovedInvoices = useMemo(() => {
    const apiItems = apiApprovedExpenses.map((i) => ({
      ...i,
      source_type: "invoice_api",
    }));

    const assetItems = assetInvoicesApproved.map((a) => ({
      id: a.id,
      vendor: a.note || "Staff Upload",
      amount: 0,
      category: "Staff Invoice",
      department: a.department || "",
      image_url: a.url,
      status: a.status,
      source_type: "asset_invoice",
    }));

    return [...apiItems, ...assetItems];
  }, [apiApprovedExpenses, assetInvoicesApproved]);

  const normalizedRejectedInvoices = useMemo(() => {
    const apiItems = apiRejected.map((i) => ({
      ...i,
      source_type: "invoice_api",
    }));

    const assetItems = assetInvoicesRejected.map((a) => ({
      id: a.id,
      vendor: a.note || "Staff Upload",
      amount: 0,
      category: "Staff Invoice",
      department: a.department || "",
      image_url: a.url,
      status: a.status,
      source_type: "asset_invoice",
    }));

    return [...apiItems, ...assetItems];
  }, [apiRejected, assetInvoicesRejected]);

  const normalizedPendingManagerInvoices = useMemo(() => {
    const apiItems = apiPendingManager.map((i) => ({
      ...i,
      source_type: "invoice_api",
    }));

    const assetItems = assetInvoicesPending.map((a) => ({
      id: a.id,
      vendor: a.note || "Staff Upload",
      amount: 0,
      category: "Staff Invoice",
      department: a.department || "",
      image_url: a.url,
      status: a.status,
      source_type: "asset_invoice",
    }));

    return [...apiItems, ...assetItems];
  }, [apiPendingManager, assetInvoicesPending]);

  // --------------------------------------------------
  // FINANCIAL METRICS
  // --------------------------------------------------
  const totalRevenue = latestDay?.revenue || 0;

  const totalExpenses = normalizedApprovedInvoices.reduce(
    (sum, e) => sum + (e.amount || 0),
    0
  );

  const netProfit = totalRevenue - totalExpenses;

  const departmentExpenses = useMemo(() => {
    const grouped = {};

    normalizedApprovedInvoices.forEach((inv) => {
      const key = inv.department || "Unassigned";
      grouped[key] = (grouped[key] || 0) + (inv.amount || 0);
    });

    return Object.entries(grouped).map(([department, total]) => ({
      department,
      total,
    }));
  }, [normalizedApprovedInvoices]);

  const categoryExpenses = useMemo(() => {
    const grouped = {};

    normalizedApprovedInvoices.forEach((inv) => {
      const key = inv.category || "Uncategorized";
      grouped[key] = (grouped[key] || 0) + (inv.amount || 0);
    });

    return Object.entries(grouped).map(([category, total]) => ({
      category,
      total,
    }));
  }, [normalizedApprovedInvoices]);

  const totalPendingAccountingValue = normalizedAccountingQueue.reduce(
    (sum, inv) => sum + (inv.amount || 0),
    0
  );

  // --------------------------------------------------
  // ACTIONS
  // --------------------------------------------------
  const updateInvoiceStatus = async (id, status) => {
    await fetch("/api/invoices/update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id, status }),
    });
  };

  const updateAssetStatus = async (id, status) => {
    await fetch("/api/assets/update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id, status }),
    });
  };

  const finalizeAccountingApproval = async (item, status) => {
    try {
      setActionLoading(`${item.source_type}-${item.id}-${status}`);

      if (item.source_type === "salary") {
  await supabase
    .from("approval_rejections")
    .update({ status: status === "approved" ? "final_approved" : "rejected_manager" })
    .eq("id", item.id);

} else if (item.source_type === "asset_invoice") {
  await updateAssetStatus(item.id, status);

} else {
  await updateInvoiceStatus(item.id, status);
}
      await fetchAll();
    } finally {
      setActionLoading("");
    }
  };

  return (
  
      <div className="min-h-screen text-white p-6 max-w-7xl mx-auto space-y-8">

        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">Accounting</h1>
            <p className="text-gray-400 text-sm">
              Financial control center and future accounting command system
            </p>
          </div>

          <button
            onClick={fetchAll}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-sm"
          >
            Refresh
          </button>
        </div>

        {/* NAV */}
        <div className="flex gap-3 overflow-x-auto pb-2">
  {TABS.map((tab) => {
    const isAccountingTab = tab === "ai-invoices";
    const count = normalizedAccountingQueue.length;

    return (
      <button
        key={tab}
        onClick={() => setActiveTab(tab)}
        className={`px-4 py-2 rounded-xl text-sm whitespace-nowrap ${
          activeTab === tab
            ? "bg-orange-500 text-black"
            : "bg-white/10 text-gray-300"
        }`}
      >
        {tab}

        {isAccountingTab && count > 0 && (
          <span className="ml-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
            {count}
          </span>
        )}
      </button>
    );
  })}
</div>

        {loading ? (
          <div className="text-white/50">Loading...</div>
        ) : (
          <>
            {/* OVERVIEW */}
            {activeTab === "overview" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <MetricCard
                    title="Revenue"
                    value={`${totalRevenue.toLocaleString()} THB`}
                  />
                  <MetricCard
                    title="Expenses"
                    value={`${totalExpenses.toLocaleString()} THB`}
                  />
                  <MetricCard
                    title="Net Profit"
                    value={`${netProfit.toLocaleString()} THB`}
                    valueClass={netProfit >= 0 ? "text-green-400" : "text-red-400"}
                  />
                  <MetricCard
                    title="Pending Accounting Queue"
                    value={`${normalizedAccountingQueue.length}`}
                    subtitle={`${totalPendingAccountingValue.toLocaleString()} THB pending`}
                  />
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  <Panel title="Accounting Queue Snapshot">
                    {normalizedAccountingQueue.length === 0 ? (
                      <Empty text="No invoices waiting for accounting" />
                    ) : (
                      <div className="space-y-3">
                        {normalizedAccountingQueue.slice(0, 6).map((inv) => (
                          <div
                            key={`${inv.source_type}-${inv.id}`}
                            className="flex justify-between items-center border-b border-white/10 pb-2"
                          >
                            <div>
                              <div>{inv.vendor}</div>
                              <div className="text-xs text-white/40">
                                {inv.category} {inv.department ? `(${inv.department})` : ""}
                              </div>
                            </div>
                            <div className="text-sm">{inv.amount || 0} THB</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Panel>

                  <Panel title="Department Expense Snapshot">
                    {departmentExpenses.length === 0 ? (
                      <Empty text="No approved expenses yet" />
                    ) : (
                      <div className="space-y-3">
                        {departmentExpenses.map((item) => (
                          <div
                            key={item.department}
                            className="flex justify-between border-b border-white/10 pb-2"
                          >
                            <span>{item.department}</span>
                            <span>{item.total.toLocaleString()} THB</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </Panel>
                </div>
              </div>
            )}

            {/* REVENUE */}
            {activeTab === "revenue" && (
              <Panel title="Revenue View">
                <div className="text-4xl">{totalRevenue.toLocaleString()} THB</div>
                <div className="text-white/40 mt-2">
                  Latest saved revenue from history
                </div>
              </Panel>
            )}

            {/* EXPENSES */}
            {activeTab === "expenses" && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <Panel title="Approved Expenses">
                  {normalizedApprovedInvoices.length === 0 ? (
                    <Empty text="No approved expenses" />
                  ) : (
                    <div className="space-y-3">
                      {normalizedApprovedInvoices.map((e) => (
                        <div
                          key={`${e.source_type}-${e.id}`}
                          className="flex justify-between items-center border-b border-white/10 pb-2"
                        >
                          <div>
                            <div>{e.vendor}</div>
                            <div className="text-xs text-white/40">
                              {e.category} {e.department ? `(${e.department})` : ""}
                            </div>
                          </div>
                          <div>{e.amount || 0} THB</div>
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>

                <Panel title="Expense by Category">
                  {categoryExpenses.length === 0 ? (
                    <Empty text="No approved expense categories yet" />
                  ) : (
                    <div className="space-y-3">
                      {categoryExpenses.map((item) => (
                        <div
                          key={item.category}
                          className="flex justify-between border-b border-white/10 pb-2"
                        >
                          <span>{item.category}</span>
                          <span>{item.total.toLocaleString()} THB</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>
              </div>
            )}

            {/* CASHFLOW */}
            {activeTab === "cashflow" && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <MetricCard title="Cash In" value={`${totalRevenue.toLocaleString()} THB`} />
                <MetricCard title="Cash Out" value={`${totalExpenses.toLocaleString()} THB`} />
                <MetricCard
                  title="Net Flow"
                  value={`${netProfit.toLocaleString()} THB`}
                  valueClass={netProfit >= 0 ? "text-green-400" : "text-red-400"}
                />
              </div>
            )}

            {/* INVOICES */}
{activeTab === "invoices" && (
  <div className="space-y-6">

    {/* MANAGER PENDING */}
    <Panel title="Manager Pending">
      {normalizedPendingManagerInvoices.length === 0 ? (
        <Empty text="No invoices pending manager approval" />
      ) : (
        <div className="space-y-3">
          {normalizedPendingManagerInvoices.map((inv) => (
            <div
              key={`${inv.source_type}-${inv.id}`}
              className="flex justify-between items-center border-b border-white/10 pb-2"
            >
              <div>
                <div>{inv.vendor}</div>
                <div className="text-xs text-white/40">
                  {inv.category} {inv.department ? `(${inv.department})` : ""}
                </div>
              </div>

              <div className="flex gap-2 items-center">
                {getInvoicePreviewUrl(inv) && (
                  <button
                    onClick={() => openInvoicePreview(inv)}
                    className="px-3 py-1 rounded bg-white/10 text-sm"
                  >
                    Preview
                  </button>
                )}
                <span className="text-yellow-400 text-sm">Pending Manager</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>

    {/* ACCOUNTING APPROVAL */}
    <Panel title="Pending Accounting Approval">
      {normalizedAccountingQueue.length === 0 ? (
        <Empty text="No invoices awaiting accounting approval" />
      ) : (
        <div className="space-y-4">
          {normalizedAccountingQueue.map((inv) => (
            <div
              key={`${inv.source_type}-${inv.id}`}
              className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-white/10 pb-3"
            >
              <div>
                <div className="text-lg">{inv.vendor}</div>
                <div className="text-sm text-white/50">
                  {inv.category} {inv.department ? `(${inv.department})` : ""}
                </div>

                <div className="text-xs text-white/30 mt-1">
                  Source: {
                    inv.source_type === "asset_invoice"
                      ? "Staff Upload"
                      : "Invoice System"
                  }
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {getInvoicePreviewUrl(inv) && (
                  <button
                    onClick={() => openInvoicePreview(inv)}
                    className="bg-white/10 px-3 py-1 rounded text-sm"
                  >
                    Preview
                  </button>
                )}

                <button
                  onClick={() => finalizeAccountingApproval(inv, "approved")}
                  disabled={actionLoading === `${inv.source_type}-${inv.id}-approved`}
                  className="bg-green-500 px-3 py-1 rounded text-sm text-black disabled:opacity-50"
                >
                  {actionLoading === `${inv.source_type}-${inv.id}-approved`
                    ? "Approving..."
                    : "Final Approve"}
                </button>

                <button
                  onClick={() => finalizeAccountingApproval(inv, "rejected")}
                  disabled={actionLoading === `${inv.source_type}-${inv.id}-rejected`}
                  className="bg-red-500 px-3 py-1 rounded text-sm disabled:opacity-50"
                >
                  {actionLoading === `${inv.source_type}-${inv.id}-rejected`
                    ? "Rejecting..."
                    : "Reject"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>

    {/* REJECTED */}
    <Panel title="Rejected Invoices">
      {normalizedRejectedInvoices.length === 0 ? (
        <Empty text="No rejected invoices" />
      ) : (
        <div className="space-y-3">
          {normalizedRejectedInvoices.map((inv) => (
            <div
              key={`${inv.source_type}-${inv.id}`}
              className="flex justify-between items-center border-b border-white/10 pb-2"
            >
              <div>
                <div>{inv.vendor}</div>
                <div className="text-xs text-white/40">
                  {inv.category} {inv.department ? `(${inv.department})` : ""}
                </div>
              </div>

              <span className="text-red-400 text-sm">Rejected</span>
            </div>
          ))}
        </div>
      )}
    </Panel>

  </div>
)}
{/* SALARY */}
{activeTab === "salary" && (
  <Panel title="Salary Approvals">
    {salaryQueue.length === 0 ? (
      <Empty text="No salary approvals" />
    ) : (
      <div className="space-y-3">
        {salaryQueue.map((s) => (
          <div
            key={s.id}
            className="flex justify-between items-center border-b border-white/10 pb-2"
          >
            <div>Salary – {s.staff_id}</div>

            <div className="flex gap-2">
              <button
                className="bg-green-500 px-3 py-1 rounded text-sm text-black"
              >
                Approve
              </button>

              <button
                className="bg-red-500 px-3 py-1 rounded text-sm"
              >
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    )}
  </Panel>
)}
            {/* PAYROLL */}
            {activeTab === "payroll" && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <Panel title="Payroll Center">
                  <Empty text="Connect salary approvals, monthly payroll calculations, and attendance deductions here." />
                </Panel>
                <Panel title="Payroll Controls">
                  <Empty text="Add salary confirmation, bonus engine, lateness deductions, and export workflow here." />
                </Panel>
              </div>
            )}

            {/* PAYOUT */}
            {activeTab === "payout" && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <Panel title="Payout Control">
                  <Empty text="Connect service charge allocation, department payout, and staff-level distributions here." />
                </Panel>
                <Panel title="Payout Verification">
                  <Empty text="Add final confirmation, release logs, and accounting reconciliation here." />
                </Panel>
              </div>
            )}

            {/* DEPARTMENT */}
            {activeTab === "department" && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <Panel title="Expense by Department">
                  {departmentExpenses.length === 0 ? (
                    <Empty text="No department expense data yet" />
                  ) : (
                    <div className="space-y-3">
                      {departmentExpenses.map((item) => (
                        <div
                          key={item.department}
                          className="flex justify-between border-b border-white/10 pb-2"
                        >
                          <span>{item.department}</span>
                          <span>{item.total.toLocaleString()} THB</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>

                <Panel title="Department Controls">
                  <Empty text="Add department budgets, alerts, limits, and manager responsibility mapping here." />
                </Panel>
              </div>
            )}

            {/* PROFIT */}
            {activeTab === "profit" && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <MetricCard title="Revenue" value={`${totalRevenue.toLocaleString()} THB`} />
                <MetricCard title="Expenses" value={`${totalExpenses.toLocaleString()} THB`} />
                <MetricCard
                  title="Profit"
                  value={`${netProfit.toLocaleString()} THB`}
                  valueClass={netProfit >= 0 ? "text-green-400" : "text-red-400"}
                />
              </div>
            )}

            {/* REPORTS */}
            {activeTab === "reports" && (
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <Panel title="Daily Report">
                  <Empty text="Add daily financial summary, shift close result, invoice totals, and department breakdown here." />
                </Panel>
                <Panel title="Weekly Report">
                  <Empty text="Add weekly trends, expense category summary, and payroll movement here." />
                </Panel>
                <Panel title="Monthly Report">
                  <Empty text="Add monthly profit/loss, payroll totals, service charge totals, and export functions here." />
                </Panel>
              </div>
            )}

            {/* AUDIT */}
            {activeTab === "audit" && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <Panel title="Approval Audit Trail">
                  <div className="space-y-3">
                    <AuditLine label="Manager-approved invoices" value={normalizedAccountingQueue.length} />
                    <AuditLine label="Final-approved invoices" value={normalizedApprovedInvoices.length} />
                    <AuditLine label="Rejected invoices" value={normalizedRejectedInvoices.length} />
                  </div>
                </Panel>

                <Panel title="System Integrity">
                  <div className="space-y-3">
                    <AuditLine label="History days loaded" value={history.length} />
                    <AuditLine label="Invoice records loaded" value={invoices.length} />
                    <AuditLine label="Asset records loaded" value={assets.length} />
                  </div>
                </Panel>
              </div>
            )}
          </>
        )}

        {/* PREVIEW MODAL */}
        {previewItem && (
          <div
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setPreviewItem(null)}
          >
            <div
              className="w-full max-w-6xl max-h-[95vh] rounded-3xl overflow-hidden border border-white/10 bg-black/80 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                <div>
                  <div className="font-medium">{previewItem.title}</div>
                  {previewItem.subtitle ? (
                    <div className="text-sm text-white/50">
                      {previewItem.subtitle}
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={previewItem.url}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-sm"
                  >
                    Open Original
                  </a>
                  <button
                    onClick={() => setPreviewItem(null)}
                    className="px-3 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-sm"
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="p-4 flex items-center justify-center bg-black min-h-[60vh] max-h-[85vh] overflow-auto">
                {previewItem.type === "pdf" ? (
                  <iframe
                    src={previewItem.url}
                    title="PDF Preview"
                    className="w-full h-[80vh] rounded-2xl bg-white"
                  />
                ) : (
                  <img
                    src={previewItem.url}
                    alt="Preview"
                    className="max-w-full max-h-[80vh] rounded-2xl object-contain"
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>

  );
}

function MetricCard({ title, value, subtitle, valueClass = "text-white" }) {
  return (
    <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
      <p className="text-gray-400 text-sm">{title}</p>
      <h2 className={`text-2xl mt-2 ${valueClass}`}>{value}</h2>
      {subtitle ? <p className="text-xs text-white/35 mt-2">{subtitle}</p> : null}
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div className="bg-white/5 p-6 rounded-2xl border border-white/10">
      <h2 className="text-xl mb-4">{title}</h2>
      {children}
    </div>
  );
}

function Empty({ text }) {
  return <p className="text-gray-400">{text}</p>;
}

function AuditLine({ label, value }) {
  return (
    <div className="flex justify-between border-b border-white/10 pb-2">
      <span className="text-white/70">{label}</span>
      <span>{value}</span>
    </div>
  );
}