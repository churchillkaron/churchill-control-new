
      "use client";
import { supabase } from "@/lib/shared/supabase/client";
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
  const [productionLogs, setProductionLogs] = useState([]);
  const [salesItems, setSalesItems] = useState([]);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      setLoading(true);

      const { data: historyData } = await supabase
        .from("history")
        .select("*")
        .order("created_at", { ascending: true });

      setHistory(historyData || []);

      const { data: invoiceData } = await supabase
        .from("invoices")
        .select("*")
        .order("created_at", { ascending: false });

      setInvoices(invoiceData || []);

      const { data: productionData } = await supabase
        .from("production_logs")
        .select("*");

      setProductionLogs(productionData || []);

      const { data: salesData } = await supabase
        .from("daily_sales_items")
        .select("*");

      setSalesItems(salesData || []);
    } catch (err) {
      console.error(err);
    }

    setLoading(false);
  };

  // --------------------------------------------------
  // DERIVED DATA
  // --------------------------------------------------
  const salaryQueue = approvals
.filter((a) => a.status === "pending_accounting")    
.map((a) => ({
      id: a.id,
      vendor: "Salary",
      amount: 0,
      category: "Salary",
      department: "",
      status: a.status,
      source_type: "salary",
    }));

  const normalizedAccountingQueue = useMemo(() => {
  return invoices
    .filter((i) => i.status === "pending_accounting")
      .map((i) => ({
        ...i,
        source_type: "invoice_api",
      }));
  }, [invoices]);

  const normalizedApprovedInvoices = useMemo(() => {
    return invoices.filter((i) => i.status === "approved");
  }, [invoices]);
const normalizedPendingManagerInvoices = useMemo(() => {
  return invoices
    .filter((i) => i.status === "pending_manager")
    .map((i) => ({
      ...i,
      source_type: "invoice_api",
    }));
}, [invoices]);
const normalizedRejectedInvoices = useMemo(() => {
  return invoices
    .filter((i) => i.status === "rejected")
    .map((i) => ({
      ...i,
      source_type: "invoice_api",
    }));
}, [invoices]);
  // --------------------------------------------------
  // FINANCIAL METRICS
  // --------------------------------------------------
  const totalRevenue = (salesItems || []).reduce(
    (sum, item) => sum + (item.price || 0) * (item.quantity || 0),
    0
  );

  const totalExpenses = (normalizedApprovedInvoices || []).reduce(
    (sum, e) => sum + (e.amount || 0),
    0
  );

  const totalCOGS = (productionLogs || []).reduce(
    (sum, p) => sum + (p.total_cost || 0),
    0
  );

  const totalSalary = (salaryQueue || []).reduce(
    (sum, s) => sum + (s.amount || 0),
    0
  );

  const netProfit =
    totalRevenue - totalExpenses - totalCOGS - totalSalary;

  const margin =
    totalRevenue > 0
      ? ((netProfit / totalRevenue) * 100).toFixed(2)
      : 0;

  // --------------------------------------------------
  // TOP EXPENSES
  // --------------------------------------------------
  const topExpenses = useMemo(() => {
    const grouped = {};

    (normalizedApprovedInvoices || []).forEach((inv) => {
      const key = inv.vendor || "Unknown";
      grouped[key] = (grouped[key] || 0) + (inv.amount || 0);
    });

    return Object.entries(grouped)
      .map(([vendor, total]) => ({ vendor, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [normalizedApprovedInvoices]);

  // --------------------------------------------------
  // ALERT SYSTEM
  // --------------------------------------------------
  const alerts = [];

  if (totalRevenue === 0) {
    alerts.push({ type: "CRITICAL", msg: "No revenue detected" });
  }

  if (netProfit < 0) {
    alerts.push({ type: "CRITICAL", msg: "You are losing money" });
  }

  if (margin < 30) {
    alerts.push({ type: "WARNING", msg: "Low profit margin" });
  }

  if (totalExpenses > totalRevenue * 0.7) {
    alerts.push({ type: "WARNING", msg: "Expenses too high" });
  }

  if (topExpenses[0]?.total > totalRevenue * 0.3) {
    alerts.push({
      type: "WARNING",
      msg: `High cost from ${topExpenses[0].vendor}`,
    });
  }

  let alert = "GOOD";

  if (alerts.some((a) => a.type === "CRITICAL")) {
    alert = "CRITICAL";
  } else if (alerts.some((a) => a.type === "WARNING")) {
    alert = "WARNING";
  }

  // --------------------------------------------------
  // EXTRA
  // --------------------------------------------------
  const totalPendingAccountingValue = (normalizedAccountingQueue || []).reduce(
    (sum, inv) => sum + (inv.amount || 0),
    0
  );

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

  // --------------------------------------------------
  // ACTIONS
  // --------------------------------------------------
  

  const finalizeAccountingApproval = async (item, action) => {

  try {

    setActionLoading(
      `${item.id}-${action}`
    );

    const endpoint =
      action === "rejected"
        ? "/api/approvals/reject"
        : "/api/approvals/process";

    const response =
      await fetch(

        endpoint,

        {

          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({

            entityType:
              "invoice",

            entityId:
              item.id,

            currentStatus:
              item.status,

            role:
              "accounting",

            actedBy:
              null,

            notes:
              "Accounting approval",

            reason:
              "Rejected by accounting",

          }),

        }

      );

    const result =
      await response.json();

    if (!result.success) {

      alert(
        result.error
      );

      return;

    }

    await fetchAll();

  } finally {

    setActionLoading("");

  }

};
const openInvoicePreview = (invoice) => {
  if (!invoice?.image_url) return;

  setPreviewItem({
    type: "image",
    url: invoice.image_url,
    title: invoice.vendor || "Invoice",
    subtitle: `${invoice.amount || 0} THB`,
  });
};
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

  const categoryExpenses = Object.values(

  (normalizedApprovedInvoices || []).reduce(

    (acc, item) => {

      const category =
        item.category || "Other";

      if (!acc[category]) {

        acc[category] = {
          category,
          total: 0,
        };

      }

      acc[category].total +=
        Number(item.amount || 0);

      return acc;

    },

    {}

  )

);

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

    {/* METRICS */}
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      <MetricCard title="Revenue" value={`${totalRevenue.toLocaleString()} THB`} />
      <MetricCard title="Expenses" value={`${totalExpenses.toLocaleString()} THB`} />
      <MetricCard title="COGS" value={`${totalCOGS.toLocaleString()} THB`} />
      <MetricCard title="Salary" value={`${totalSalary.toLocaleString()} THB`} />
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

    {/* STATUS */}
    <div
      className={`text-lg ${
        alert === "CRITICAL"
          ? "text-red-500"
          : alert === "WARNING"
          ? "text-yellow-400"
          : "text-green-400"
      }`}
    >
      Status: {alert}
    </div>

    {/* ALERTS */}
    {alerts.length > 0 && (
      <div className="mt-2 space-y-1">
        {alerts.map((a, i) => (
          <div
            key={i}
            className={`text-sm ${
              a.type === "CRITICAL"
                ? "text-red-500"
                : "text-yellow-400"
            }`}
          >
            ⚠ {a.msg}
          </div>
        ))}
      </div>
    )}

  </div>
)}

{/* ===== OUTSIDE OVERVIEW ===== */}

{activeTab === "overview" && (
  <>
    <Panel title="Profit Breakdown">
      <div className="space-y-3">
        <div className="flex justify-between border-b border-white/10 pb-2">
          <span>Revenue</span>
          <span className="text-green-400">
            {totalRevenue.toLocaleString()} THB
          </span>
        </div>

        <div className="flex justify-between border-b border-white/10 pb-2">
          <span>Expenses</span>
          <span className="text-red-400">
            -{totalExpenses.toLocaleString()} THB
          </span>
        </div>

        <div className="flex justify-between border-b border-white/10 pb-2">
          <span>COGS</span>
          <span className="text-red-400">
            -{totalCOGS.toLocaleString()} THB
          </span>
        </div>

        <div className="flex justify-between border-b border-white/10 pb-2">
          <span>Salary</span>
          <span className="text-red-400">
            -{totalSalary.toLocaleString()} THB
          </span>
        </div>

        <div className="flex justify-between pt-2 text-lg font-bold">
          <span>Net Profit</span>
          <span className={netProfit >= 0 ? "text-green-400" : "text-red-400"}>
            {netProfit.toLocaleString()} THB
          </span>
        </div>
      </div>
    </Panel>

    <Panel title="Top Cost Leaks">
      {topExpenses.length === 0 ? (
        <Empty text="No expense data" />
      ) : (
        <div className="space-y-3">
          {topExpenses.map((item) => (
            <div
              key={item.vendor}
              className="flex justify-between border-b border-white/10 pb-2"
            >
              <span>{item.vendor}</span>
              <span className="text-red-400">
                {item.total.toLocaleString()} THB
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>

    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <Panel title="Accounting Queue Snapshot">
        ...
      </Panel>

      <Panel title="Department Expense Snapshot">
        ...
      </Panel>
    </div>
  </>
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
<Panel title="Pending Accounting Governance">      
  {normalizedAccountingQueue.length === 0 ? (
<Empty text="No invoices in accounting workflow queue" />      
  ) : (
        <div className="space-y-4">
          {normalizedAccountingQueue.map((inv) => (
            <div
  key={`${inv.source_type}-${inv.id}`}
  onClick={() => openInvoicePreview(inv)}
  className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-white/10 pb-3 cursor-pointer hover:bg-white/5 p-2 rounded"
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
                    : " Send To Owner"}
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
                    <AuditLine label="Pending accounting invoices" value={normalizedAccountingQueue.length} />
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